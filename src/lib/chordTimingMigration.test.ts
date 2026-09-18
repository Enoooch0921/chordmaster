import { beforeEach, describe, expect, it } from 'vitest';
import type { SharedResourcePayload, Song, StoredSong, Setlist } from '../types';
import { migrateChordTimingArrows } from './chordTimingMigration';
import { normalizeSharedSongs } from './sharedSongNormalization';
import {
  loadLocalWorkspaceSnapshot, loadPendingSync, normalizeSongBars,
  persistLocalWorkspaceSnapshot, savePendingSync, SONG_LIBRARY_STORAGE_KEY
} from './workspace';

const legacySong = (): StoredSong => ({
  id: 'legacy', title: 'Original', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  updatedAt: 123, createdAt: 100,
  lyricsDoc: { chinese: '歌詞 <保留> 原文' },
  sections: [{ id: 'section', title: 'Verse <原文>', bars: [{
    id: 'bar', chords: ['C<^~', 'G/B>~', '1m7<', '%'],
    annotation: '<不要交換文字>', rhythm: 'q q q q', riff: '1 | 2 | 3 | 4',
    chordMarks: { 0: { special: true } }
  }] }]
});
const chords = (song: Song) => song.sections[0].bars[0].chords;
const expected = ['C>^~', 'G/B<~', '1m7>', '%'];

describe('chord timing format migration', () => {
  beforeEach(() => window.localStorage.clear());

  it('swaps only legacy chord suffixes without mutating the source or editorial metadata', () => {
    const source = legacySong();
    const before = structuredClone(source);
    const migrated = migrateChordTimingArrows(source);
    expect(chords(migrated)).toEqual(expected);
    expect(migrated.chordTimingVersion).toBe(2);
    const restored = {
      ...migrated, chordTimingVersion: undefined,
      sections: migrated.sections.map((section) => ({
        ...section, bars: section.bars.map((bar) => ({ ...bar, chords: chords(source) }))
      }))
    };
    expect(restored).toEqual({ ...source, chordTimingVersion: undefined });
    expect(source).toEqual(before);
    expect(chords(migrateChordTimingArrows({ ...source, chordTimingVersion: 1 }))).toEqual(expected);
  });

  it('does not exchange current songs, including after editing, normalization and JSON reimport', () => {
    const current = { ...legacySong(), chordTimingVersion: 2 as const };
    expect(migrateChordTimingArrows(current)).toBe(current);
    expect(chords(normalizeSongBars(current))).toEqual(chords(current));
    const migrated = normalizeSongBars(legacySong());
    migrated.sections[0].bars[0].chords[0] = 'Dm<';
    const imported = normalizeSongBars(JSON.parse(JSON.stringify(migrated)));
    expect(chords(imported)).toEqual(['Dm<', ...expected.slice(1)]);
    expect(normalizeSongBars(imported)).toEqual(imported);
    expect(imported.updatedAt).toBe(123);
  });

  it('migrates a legacy library, setlist copies and pending sync, then stays stable after saving', () => {
    const source = legacySong();
    window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify([source]));
    expect(chords(loadLocalWorkspaceSnapshot().songs[0])).toEqual(expected);
    const setlist: Setlist = {
      id: 'setlist', name: 'Setlist', displayMode: 'chord-movable-key', createdAt: 100, updatedAt: 123,
      songs: [{ id: 'item', setlistId: 'setlist', songId: source.id, order: 0, sectionOrder: [], songData: source }]
    };
    persistLocalWorkspaceSnapshot([source], [setlist]);
    const first = loadLocalWorkspaceSnapshot();
    expect(chords(first.songs[0])).toEqual(expected);
    expect(chords(first.setlists[0].songs[0].songData!)).toEqual(expected);
    persistLocalWorkspaceSnapshot(first.songs, first.setlists);
    const second = loadLocalWorkspaceSnapshot();
    expect(second.songs).toEqual(first.songs);
    expect(second.setlists).toEqual(first.setlists);
    savePendingSync({ songs: [source], setlists: [setlist], projects: [], savedAt: 123 });
    const pending = loadPendingSync()!;
    expect(chords(pending.songs[0])).toEqual(expected);
    expect(chords(pending.setlists[0].songs[0].songData!)).toEqual(expected);
    savePendingSync(pending);
    expect(loadPendingSync()).toEqual(pending);
  });

  it('normalizes malformed chord arrays before migration', () => {
    const raw = legacySong();
    raw.sections[0].bars[0].chords = ['C<', null, 4, 'G>'] as unknown as string[];
    expect(chords(normalizeSongBars(raw))).toEqual(['C>', 'G<']);
  });

  it('preserves directions in every public share shape, including nested projects', () => {
    const item = { id: 'shared-song', title: 'Shared', song: legacySong() };
    const setlist = { id: 'setlist', name: 'Setlist', displayMode: 'chord-movable-key' as const, songs: [item] };
    const payload: SharedResourcePayload = {
      resourceType: 'project', song: item, songBundle: { id: 'bundle', songs: [item] },
      setlist, project: { id: 'project', name: 'Project', setlists: [setlist] }
    };
    const normalized = normalizeSharedSongs(payload);
    for (const song of [normalized.song!.song, normalized.songBundle!.songs[0].song,
      normalized.setlist!.songs[0].song, normalized.project!.setlists[0].songs[0].song]) {
      expect(chords(song)).toEqual(expected);
      expect(song.chordTimingVersion).toBe(2);
    }
    expect(normalizeSharedSongs(normalized)).toEqual(normalized);
    expect(chords(payload.song!.song)).toEqual(chords(legacySong()));
  });
});
