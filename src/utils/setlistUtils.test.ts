import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import {
  insertNewSetlistSectionsAfterSources,
  reorderSetlistSectionOrder
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
});
