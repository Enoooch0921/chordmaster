import { describe, expect, it } from 'vitest';
import type { Setlist, StoredSong } from '../types';
import { adoptChartEditTimes, getChartEditedAt, getSetlistChartEditedAt, stampChartEdits } from './chartRevision';
import { historySignature } from './workspaceHistory';

const song: StoredSong = { id: 'song', title: '常常喜樂', originalKey: 'C', currentKey: 'C', updatedAt: 100,
  sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }], timeSignature: '4/4' };
const list: Setlist = { id: 'list', name: '主日', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 200,
  songs: [{ id: 'entry', songId: song.id, setlistId: 'list', songData: song, order: 0, sectionOrder: ['verse'] }] };
const saved = () => JSON.parse(JSON.stringify({ songs: [song], setlists: [list] })) as { songs: StoredSong[]; setlists: Setlist[] };

describe('saved score edit dates', () => {
  it('retains dates for viewing, re-saving, and setlist metadata/key/order changes', () => {
    const baseline = saved(), next = saved();
    next.setlists[0].name = '週日聚會'; next.setlists[0].updatedAt = 999;
    next.setlists[0].songs[0].overrideKey = 'D';
    const result = stampChartEdits(next, baseline, 500);
    expect(getChartEditedAt(result.songs[0])).toBe(100);
    expect(getSetlistChartEditedAt(result.setlists[0], 'entry', result.songs)).toBe(100);
  });
  it('stamps only edited scores, independently for library and setlist copies', () => {
    const baseline = saved(), next = saved();
    next.setlists[0].songs[0].songData!.sections[0].bars[0].chords = ['G'];
    const result = stampChartEdits(next, baseline, 500);
    expect(getChartEditedAt(result.songs[0])).toBe(100);
    expect(getSetlistChartEditedAt(result.setlists[0], 'entry', result.songs)).toBe(500);
    expect(getSetlistChartEditedAt(baseline.setlists[0], 'entry', baseline.songs)).toBe(100);
    expect(next.setlists[0].songs[0].songData!.lastEditedAt).toBeUndefined();
  });
  it('does not invent today’s date for undated legacy arrangements', () => {
    const legacy = saved();
    legacy.setlists[0].songs[0].songData = { ...song, title: '獨立編曲' };
    delete (legacy.setlists[0].songs[0].songData as Partial<StoredSong>).updatedAt;
    expect(getSetlistChartEditedAt(legacy.setlists[0], 'entry', legacy.songs)).toBeNull();
    const invalid: StoredSong = { ...song, updatedAt: NaN };
    expect(getChartEditedAt(invalid)).toBeNull();
  });
  it('retains a successful date when another save brings an unchanged older in-memory snapshot', () => {
    const baseline = saved(), input = saved();
    input.songs[0].tempo = 90;
    const first = stampChartEdits(input, baseline, 500);
    const later = stampChartEdits(input, first, 900);
    expect(later.songs[0].lastEditedAt).toBe(500);
    expect(later.songs[0].tempo).toBe(90);
  });
  it('adopts a successful save’s date without replacing concurrent edits or creating history conflicts', () => {
    const baseline = saved(), input = saved(); input.songs[0].tempo = 90;
    const result = stampChartEdits(input, baseline, 500);
    const current = structuredClone(input); current.setlists[0].songs[0].songData!.title = '繼續編輯';
    const adopted = adoptChartEditTimes(current, input, result);
    expect(adopted.songs[0].lastEditedAt).toBe(500);
    expect(adopted.setlists[0].songs[0].songData!.title).toBe('繼續編輯');
    expect(historySignature(adopted.songs[0])).toBe(historySignature(input.songs[0]));
    expect(getChartEditedAt(baseline.songs[0])).toBe(100);
  });
});
