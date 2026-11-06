import { describe, expect, it } from 'vitest';
import type { JoinedProject, JoinedSetlist, Setlist, SetlistSong, Song } from '../types';
import { duplicateSection, getSongTimeSignatureStates } from '../lib/songEditing';
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

    expect(resolveSetlistSongCapo(setlistSong, sourceSong, { includeSharedCapo: true })).toBe(5);
    expect(resolveSetlistSongCapo(setlistSong, sourceSong, { includeSharedCapo: false })).toBe(0);
  });

  it('lets personal capo override shared and source capo values', () => {
    const setlistSong = {
      ...makeSetlistSong('capo-item', 0),
      overrideKey: 'Eb' as const,
      capo: 5,
      personalCapoOverride: 2
    };

    expect(resolveSetlistSongCapo(setlistSong, sourceSong, { includeSharedCapo: false })).toBe(2);
  });

  it('does not invent a capo from the song key when no personal capo is set', () => {
    const setlistSong = { ...makeSetlistSong('capo-item', 0), overrideKey: 'Eb' as const, capo: 5 };

    expect(resolveSetlistSongCapo(setlistSong, sourceSong, { includeSharedCapo: false })).toBe(0);
    expect(applySetlistSongOverrides(
      sourceSong,
      setlist,
      setlistSong,
      { includeSharedCapo: false }
    ).capo).toBe(0);
  });

  it('applies the optional guitarist overlay while preserving explicit positive capo and source data', () => {
    const entry = { ...makeSetlistSong('guitar', 0), overrideKey: 'Eb' as const, capo: 5 };
    const options = { includeSharedCapo: false, guitaristMode: true };
    expect(applySetlistSongOverrides(sourceSong, setlist, entry, options).capo).toBe(1);
    expect(resolveSetlistSongCapo({ ...entry, personalCapoOverride: 2 }, sourceSong, options)).toBe(2);
    expect(resolveSetlistSongCapo({ ...entry, overrideKey: 'C' }, sourceSong, options)).toBe(0);
    expect(entry.capo).toBe(5);
    expect(sourceSong.capo).toBe(3);
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

describe('setlist meter context', () => {
  const source: Song = {
    title: 'Temporary bridge meter', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
    sections: [
      { id: 'chorus', title: 'Chorus', bars: [{ id: 'c1', chords: ['C', '', '', 'G'] }, { id: 'c2', chords: ['F'] }] },
      { id: 'tag', title: 'Tag', bars: [{ id: 't1', chords: ['C'] }] },
      { id: 'bridge', title: 'Bridge', bars: [{ id: 'b1', chords: ['Am'] }, { id: 'b2', chords: ['F'], timeSignature: '2/4' }] }
    ]
  };
  it('restores the original chorus meter after a reordered bridge without changing source or arrangement data', () => {
    const entry = { ...makeSetlistSong('meter', 0), sectionOrder: ['missing', 'bridge', 'chorus', 'tag'] };
    const snapshot = structuredClone([source, entry]);
    const preview = applySetlistSongOverrides(source, makeSetlist('meter'), entry);
    expect(preview.sections.map(section => section.id)).toEqual(['bridge', 'chorus', 'tag']);
    expect(preview.sections[0].bars[1].timeSignature).toBe('2/4');
    expect(preview.sections[1].bars[0].timeSignature).toBe('4/4');
    expect(preview.sections[1].bars[1].timeSignature).toBeUndefined();
    expect(getSongTimeSignatureStates(preview).barActiveTimeSignatures).toEqual([['4/4', '2/4'], ['4/4', '4/4'], ['4/4']]);
    expect([source, entry]).toEqual(snapshot);
  });
  it('preserves intentional inherited meter changes and supplies context when preceding sections are omitted', () => {
    const song: Song = { ...source, sections: [
      { id: 'verse', title: 'Verse', bars: [{ id: 'v1', chords: ['C'], timeSignature: '3/4' }] },
      { id: 'chorus', title: 'Chorus', bars: [{ id: 'c1', chords: ['F'] }] }
    ] };
    const full = applySetlistSongOverrides(song, makeSetlist('meter'), { ...makeSetlistSong('meter', 0), sectionOrder: [] });
    expect(full.sections).toEqual(song.sections);
    const excerpt = applySetlistSongOverrides(song, makeSetlist('meter'), { ...makeSetlistSong('meter', 0), sectionOrder: ['chorus'] });
    expect(excerpt.sections[0].bars[0].timeSignature).toBe('3/4');
    expect(song.sections[1].bars[0].timeSignature).toBeUndefined();
  });
  it('keeps a pickup complement short and restores the following full measure after a reordered meter', () => {
    const song = structuredClone(source);
    song.sections[0].bars[0] = { id: 'partial', chords: ['C'], timeSignature: '3/4', partialMeasure: true };
    const preview = applySetlistSongOverrides(song, makeSetlist('meter'), { ...makeSetlistSong('meter', 0), sectionOrder: ['bridge', 'chorus'] });
    expect(preview.sections[1].bars[0]).toMatchObject({ timeSignature: '3/4', partialMeasure: true });
    expect(getSongTimeSignatureStates(preview).barActiveTimeSignatures[1]).toEqual(['3/4', '4/4']);
  });
});
