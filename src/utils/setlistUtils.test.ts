import { describe, expect, it } from 'vitest';
import type { JoinedProject, JoinedSetlist, Setlist, SetlistSong, Song } from '../types';
import { duplicateSection } from '../lib/songEditing';
import {
  getJoinedProjectSetlists,
  dedupeJoinedSetlists,
  insertNewSetlistSectionsAfterSources,
  resolveSetlistSongCapo,
  pickAvailableSetlist,
  pickAvailableSetlistSongId,
  reorderSetlistSongs,
  reorderSetlistSectionOrder,
  applySetlistSongOverrides
} from './setlistUtils';

const previousSong: Song = {
  title: 'Setlist',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [
    { id: 'verse', title: 'Verse', bars: [{ id: 'v1', chords: ['C'] }, { id: 'v2', chords: ['F'] }] },
    { id: 'chorus', title: 'Chorus', bars: [{ id: 'c1', chords: ['G'] }] },
    { id: 'bridge', title: 'Bridge', bars: [{ id: 'b1', chords: ['Am'] }] }
  ]
};

const makeSetlistSong = (id: string, order: number): SetlistSong => ({
  id,
  setlistId: 'setlist-1',
  songId: `song-${id}`,
  order,
  sectionOrder: []
});

const setlistSongs = [
  makeSetlistSong('item-a', 0),
  makeSetlistSong('item-b', 1),
  makeSetlistSong('item-c', 2)
];

const makeSetlist = (id: string, songs: SetlistSong[] = setlistSongs): Setlist => ({
  id,
  name: id,
  displayMode: 'chord-movable-key',
  createdAt: 1,
  updatedAt: 1,
  songs
});

describe('shared setlist display identity', () => {
  it('excludes owned identities including grouped or archived lists without changing their sharing data', () => {
    const owned = [{ ...makeSetlist('owned'), projectId: 'project', archived: true }];
    const duplicate: JoinedSetlist = { ...owned[0], isJoined: true };
    const external: JoinedSetlist = { ...makeSetlist('external'), isJoined: true };
    const candidates = [duplicate, external];
    expect(dedupeJoinedSetlists(candidates, owned)).toEqual([external]);
    expect(candidates).toEqual([duplicate, external]);
    expect(owned[0].archived).toBe(true);
  });
  it('keeps genuinely different shared lists with the same name', () => {
    const owned = { ...makeSetlist('own'), name: '聚會一' };
    const shared: JoinedSetlist = { ...makeSetlist('other'), name: '聚會一', isJoined: true };
    expect(dedupeJoinedSetlists([shared], [owned])).toEqual([shared]);
  });
  it('deduplicates direct and project share search results by ID while retaining the first complete snapshot', () => {
    const shared: JoinedSetlist = { ...makeSetlist('shared'), isJoined: true };
    const result = dedupeJoinedSetlists([shared, { ...shared }, shared], []);
    expect(result).toHaveLength(1); expect(result[0]).toBe(shared);
  });
  it('can defer a directly shared list to its existing project-folder entry', () => {
    const shared: JoinedSetlist = { ...makeSetlist('shared'), projectId: 'project', isJoined: true };
    expect(dedupeJoinedSetlists([shared], getJoinedProjectSetlists([{ setlists: [shared] }]))).toEqual([]);
  });
});

describe('setlist song order editing', () => {
  it('moves a dragged song to the touched target index and reindexes every row', () => {
    const movedDown = reorderSetlistSongs(setlistSongs, 'item-a', 'item-c');
    expect(movedDown.map((item) => item.id)).toEqual(['item-b', 'item-c', 'item-a']);
    expect(movedDown.map((item) => item.order)).toEqual([0, 1, 2]);

    const movedUp = reorderSetlistSongs(setlistSongs, 'item-c', 'item-a');
    expect(movedUp.map((item) => item.id)).toEqual(['item-c', 'item-a', 'item-b']);
    expect(movedUp.map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it('leaves the original song order untouched when either row is missing', () => {
    expect(reorderSetlistSongs(setlistSongs, 'missing', 'item-a')).toBe(setlistSongs);
    expect(reorderSetlistSongs(setlistSongs, 'item-a', 'missing')).toBe(setlistSongs);
    expect(reorderSetlistSongs(setlistSongs, 'item-a', 'item-a')).toBe(setlistSongs);
  });
});

describe('setlist selection restore', () => {
  it('prefers a matching stored setlist across owned, joined, and joined project setlists', () => {
    const owned = makeSetlist('owned');
    const joined: JoinedSetlist = { ...makeSetlist('joined'), isJoined: true };
    const joinedProjectSetlist = makeSetlist('project-setlist');
    const joinedProject: JoinedProject = {
      id: 'project',
      name: 'Project',
      isJoined: true,
      role: 'manager',
      createdAt: 1,
      updatedAt: 1,
      setlists: [joinedProjectSetlist]
    };

    expect(pickAvailableSetlist([owned], [joined], [joinedProject], ['joined'])?.id).toBe('joined');
    expect(pickAvailableSetlist([owned], [joined], [joinedProject], ['project-setlist'])?.id).toBe('project-setlist');
    expect(pickAvailableSetlist([owned], [joined], [joinedProject], ['missing'])?.id).toBe('owned');
    expect(getJoinedProjectSetlists([joinedProject])).toEqual([{ ...joinedProjectSetlist, isJoined: true }]);
  });

  it('restores the stored setlist song when it still exists', () => {
    const setlist = makeSetlist('owned');

    expect(pickAvailableSetlistSongId(setlist, ['item-b'])).toBe('item-b');
    expect(pickAvailableSetlistSongId(setlist, ['missing'])).toBe('item-a');
    expect(pickAvailableSetlistSongId(null, ['item-b'])).toBeNull();
  });
});

describe('setlist capo resolution', () => {
  const sourceSong: Song = {
    title: 'Capo Source',
    originalKey: 'C',
    currentKey: 'Eb',
    timeSignature: '4/4',
    capo: 3,
    sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'v1', chords: ['Eb'] }] }]
  };
  const setlist = makeSetlist('capo-setlist');

  it('uses shared capo values only when shared capo resolution is enabled', () => {
    const setlistSong = { ...makeSetlistSong('capo-item', 0), overrideKey: 'Eb' as const, capo: 5 };

    expect(resolveSetlistSongCapo(setlistSong, sourceSong, false, { includeSharedCapo: true })).toBe(5);
    expect(resolveSetlistSongCapo(setlistSong, sourceSong, false, { includeSharedCapo: false })).toBe(0);
  });

  it('lets personal capo override shared and source capo values', () => {
    const setlistSong = {
      ...makeSetlistSong('capo-item', 0),
      overrideKey: 'Eb' as const,
      capo: 5,
      personalCapoOverride: 2
    };

    expect(resolveSetlistSongCapo(setlistSong, sourceSong, false, { includeSharedCapo: false })).toBe(2);
  });

  it('keeps guitarist mode as a personal overlay when no personal capo is set', () => {
    const setlistSong = { ...makeSetlistSong('capo-item', 0), overrideKey: 'Eb' as const, capo: 5 };

    expect(resolveSetlistSongCapo(setlistSong, sourceSong, true, { includeSharedCapo: false })).toBe(1);
    expect(applySetlistSongOverrides(
      sourceSong,
      setlist,
      setlistSong,
      false,
      { includeSharedCapo: false }
    ).capo).toBe(0);
  });
});

describe('setlist section order editing', () => {
  it('moves only the ordered section ids', () => {
    expect(reorderSetlistSectionOrder(
      ['chorus', 'verse', 'bridge'],
      'bridge',
      'chorus',
      'before'
    )).toEqual(['bridge', 'chorus', 'verse']);
  });

  it('inserts a split section immediately after its source in a custom order', () => {
    const nextSong: Song = {
      ...previousSong,
      sections: [
        { ...previousSong.sections[0], bars: [{ id: 'v1', chords: ['C'] }] },
        { id: 'verse-2', title: '', bars: [{ id: 'v2', chords: ['F'] }] },
        previousSong.sections[1],
        previousSong.sections[2]
      ]
    };
    expect(insertNewSetlistSectionsAfterSources(
      ['chorus', 'verse', 'bridge'],
      previousSong,
      nextSong
    )).toEqual(['chorus', 'verse', 'verse-2', 'bridge']);
  });

  it('inserts a duplicated section immediately after its source in a custom order', () => {
    const duplicated = duplicateSection(previousSong, 'verse');
    expect(duplicated.created).toBe(true);

    expect(insertNewSetlistSectionsAfterSources(
      ['chorus', 'verse', 'bridge'],
      previousSong,
      duplicated.song
    )).toEqual(['chorus', 'verse', duplicated.sectionId, 'bridge']);
  });
});
