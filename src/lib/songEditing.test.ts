import { describe, expect, it } from 'vitest';
import type { Bar, Key, Song } from '../types';
import { getChordDisplaySlotOwnership, getChordDisplaySlots, getChordTokenBeatSpan, getTwoChordSplitSlotIndex } from '../utils/chordSlots';
import { getTransposeOffset, parseNashvilleToChord, transposeChord, transposeChordForDisplay } from '../utils/musicUtils';
import {
  clearChordAtBeatSlot,
  convertDisplayedChordToStoredChord,
  convertStoredChordToDisplayedChord,
  deleteBar,
  detectSectionChordInputMode,
  duplicateBar,
  duplicateSection,
  deleteSection,
  finalizeSectionTitleEdit,
  getChordStorageModeForTarget,
  getChordBeatSlots,
  getChordPlacementError,
  getMultiMeasureRestPlacementError,
  insertBar,
  normalizeChordTextInput,
  parseChordBarText,
  resolvePreviewChordSlotIndex,
  reorderSection,
  serializeChordBeatSlots,
  setChordAtBeatSlot,
  setMultiMeasureRestAtBar,
  splitSectionAtBar,
  mergeSectionToPrevious,
  updateSectionTitle,
  updateEditableBarFields
} from './songEditing';

const makeSong = (bar: Bar, timeSignature = '4/4'): Song => ({
  title: 'Test',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature,
  sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', ...bar }] }]
});

describe('chord beat slots', () => {
  it.each(['2/4', '3/4', '4/4', '6/8', '7/8'])('round-trips explicit slots in %s', (timeSignature) => {
    const beatCount = Number.parseInt(timeSignature, 10);
    const desired = Array.from({ length: beatCount }, (_, index) => (
      index === 0 ? 'C' : index === beatCount - 1 ? 'G/B' : ''
    ));
    const serialized = serializeChordBeatSlots(desired, beatCount);
    expect(getChordDisplaySlots(serialized, beatCount)).toEqual(desired);
  });

  it('keeps compact legacy two-chord automatic placement', () => {
    const split = getTwoChordSplitSlotIndex(4);
    const slots = getChordDisplaySlots(['C', 'G'], 4);
    expect(slots[0]).toBe('C');
    expect(slots[split]).toBe('G');
  });

  it('inserts into an empty beat and remaps chord annotations by beat', () => {
    const song = makeSong({
      chords: ['C', 'G'],
      chordMarks: { 1: { color: 'rose', special: true } }
    });
    const edited = setChordAtBeatSlot(song, {
      sectionId: 'section-1',
      barId: 'bar-1',
      slotIndex: 1
    }, 'Dm');
    const bar = edited.sections[0].bars[0];
    expect(getChordBeatSlots(bar, 4).map((slot) => slot.chord)).toEqual(['C', 'Dm', 'G', '']);
    expect(bar.chordMarks).toEqual({ 2: { color: 'rose', special: true } });
  });

  it('clears one beat without shifting later chords or marks', () => {
    const song = makeSong({
      chords: ['C', 'Dm', 'G', ''],
      chordMarks: { 2: { color: 'sky' } }
    });
    const edited = clearChordAtBeatSlot(song, {
      sectionId: 'section-1',
      barId: 'bar-1',
      slotIndex: 1
    });
    const bar = edited.sections[0].bars[0];
    expect(bar.chords).toEqual(['C', '', 'G', '']);
    expect(bar.chordMarks).toEqual({ 2: { color: 'sky' } });
  });

  it('rejects text input that exceeds the time-signature slot count', () => {
    expect(parseChordBarText('C Dm Em F G', 4)).toEqual({
      chords: [],
      error: '此小節最多可使用 4 拍，目前內容需要 5 拍。'
    });
  });
});

describe('multi-measure rest placement', () => {
  const firstBeat = { sectionId: 'section-1', barId: 'bar-1', slotIndex: 0 };

  it('writes the token at beat one of an empty bar', () => {
    const song = makeSong({ chords: [] });
    const result = setMultiMeasureRestAtBar(song, firstBeat, 4);
    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].chords).toEqual(['|4|', '', '', '']);
  });

  it('rejects non-first beats and bars containing any other chord', () => {
    const emptySong = makeSong({ chords: [] });
    expect(getMultiMeasureRestPlacementError(emptySong, { ...firstBeat, slotIndex: 1 })).toContain('第一拍');
    const occupiedSong = makeSong({ chords: ['C'] });
    const result = setMultiMeasureRestAtBar(occupiedSong, firstBeat, 4);
    expect(result.error).toContain('清空');
    expect(result.song).toBe(occupiedSong);
  });

  it('allows changing the count of an existing multi-measure rest', () => {
    const song = makeSong({ chords: ['|4|', '', '', ''] });
    expect(setMultiMeasureRestAtBar(song, firstBeat, 8).song.sections[0].bars[0].chords[0]).toBe('|8|');
  });
});

describe('preview beat targeting', () => {
  it('starts an empty bar at beat one regardless of the tapped area', () => {
    expect(resolvePreviewChordSlotIndex({ chords: [] }, 4, 3)).toBe(0);
  });

  it('maps either half-rest beat back to its first beat without covering the rest of the bar', () => {
    expect(resolvePreviewChordSlotIndex({ chords: ['0h', '', '', ''] }, 4, 1)).toBe(0);
    expect(resolvePreviewChordSlotIndex({ chords: ['0h', '', '', ''] }, 4, 3)).toBe(3);
  });

  it.each(['%', '0w', '|8|'])('maps every beat of %s to beat one', (token) => {
    expect(resolvePreviewChordSlotIndex({ chords: [token, '', '', ''] }, 4, 3)).toBe(0);
    expect(resolvePreviewChordSlotIndex({ chords: ['', '', token, ''] }, 4, 0)).toBe(0);
  });

  it('does not redirect an empty beat to an ordinary chord', () => {
    expect(resolvePreviewChordSlotIndex({ chords: ['C', '', '', ''] }, 4, 3)).toBe(3);
  });
});

describe('bar commands', () => {
  it('keeps repeat end and final bar mutually exclusive', () => {
    const song = makeSong({ chords: [], repeatEnd: true });
    const edited = updateEditableBarFields(song, { sectionId: 'section-1', barId: 'bar-1' }, { finalBar: true });
    expect(edited.sections[0].bars[0]).toMatchObject({ finalBar: true, repeatEnd: false });
  });

  it('allows repeat start and repeat end on the same bar', () => {
    const song = makeSong({ chords: [], repeatStart: true });
    const edited = updateEditableBarFields(song, { sectionId: 'section-1', barId: 'bar-1' }, { repeatEnd: true });
    expect(edited.sections[0].bars[0]).toMatchObject({ repeatStart: true, repeatEnd: true, finalBar: false });
  });

  it('inserts, duplicates, and deletes bars immutably', () => {
    const song = makeSong({ chords: ['C'] });
    const inserted = insertBar(song, { sectionId: 'section-1', barId: 'bar-1' }, 'after', { id: 'bar-2', chords: [] });
    const duplicated = duplicateBar(inserted, { sectionId: 'section-1', barId: 'bar-1' });
    const duplicateId = duplicated.sections[0].bars[1].id;
    expect(duplicateId).not.toBe('bar-1');
    expect(duplicated.sections[0].bars).toHaveLength(3);
    expect(deleteBar(duplicated, { sectionId: 'section-1', barId: duplicateId! }).sections[0].bars).toHaveLength(2);
    expect(song.sections[0].bars).toHaveLength(1);
  });
});

describe('special-token beat ownership', () => {
  it.each(['2/4', '3/4', '4/4', '6/8', '7/8'])('makes %% own the full %s measure', (timeSignature) => {
    const beatCount = Number.parseInt(timeSignature, 10);
    expect(getChordTokenBeatSpan('%', beatCount)).toBe(beatCount);
    const ownership = getChordDisplaySlotOwnership(['%', ...Array.from({ length: beatCount - 1 }, () => '')], beatCount);
    expect(ownership).toHaveLength(beatCount);
    expect(ownership.every((slot) => slot?.ownerSlotIndex === 0 && slot.span === beatCount)).toBe(true);
  });

  it.each(['2/4', '3/4', '4/4', '6/8', '7/8'])('keeps 0h at exactly two preview beats in %s', (timeSignature) => {
    const beatCount = Number.parseInt(timeSignature, 10);
    expect(getChordTokenBeatSpan('0h', beatCount)).toBe(2);
    const ownership = getChordDisplaySlotOwnership(['0h', ...Array.from({ length: beatCount - 1 }, () => '')], beatCount);
    expect(ownership[0]).toMatchObject({ ownerSlotIndex: 0, span: 2, covered: false });
    expect(ownership[1]).toMatchObject({ ownerSlotIndex: 0, span: 2, covered: true });
    if (beatCount > 2) expect(ownership[2]).toBeNull();
  });

  it('rejects a half rest on the final beat', () => {
    const song = makeSong({ chords: ['C', '', '', ''] });
    const target = { sectionId: 'section-1', barId: 'bar-1', slotIndex: 3 };
    expect(getChordPlacementError(song, target, '0h')).toContain('連續兩拍');
    expect(setChordAtBeatSlot(song, target, '0h')).toBe(song);
  });

  it('clears covered chord content and its mark when inserting 0h', () => {
    const song = makeSong({
      chords: ['C', 'Dm', 'G', ''],
      chordMarks: { 0: { color: 'sky' }, 1: { color: 'rose' }, 2: { color: 'amber' } }
    });
    const edited = setChordAtBeatSlot(song, { sectionId: 'section-1', barId: 'bar-1', slotIndex: 0 }, '0h');
    expect(edited.sections[0].bars[0].chords).toEqual(['0h', '', 'G', '']);
    expect(edited.sections[0].bars[0].chordMarks).toEqual({
      0: { color: 'sky' },
      2: { color: 'amber' }
    });
  });

  it('forces a percent token to beat one and removes every other chord slot', () => {
    const song = makeSong({ chords: ['C', 'Dm', 'G', 'Am'], chordMarks: { 0: { color: 'rose' }, 2: { color: 'sky' } } });
    const edited = setChordAtBeatSlot(song, { sectionId: 'section-1', barId: 'bar-1', slotIndex: 3 }, '%');
    expect(edited.sections[0].bars[0].chords).toEqual(['%', '', '', '']);
    expect(edited.sections[0].bars[0].chordMarks).toBeUndefined();
    expect(parseChordBarText('% C', 4).error).toContain('不能和其他和弦');
  });
});

describe('section commands', () => {
  const sectionSong: Song = {
    title: 'Sections',
    originalKey: 'C',
    currentKey: 'C',
    timeSignature: '4/4',
    sections: [
      {
        id: 'section-a',
        title: 'Verse',
        bars: [
          { id: 'bar-a1', chords: ['C'] },
          { id: 'bar-a2', chords: ['F'] },
          { id: 'bar-a3', chords: ['G'] }
        ]
      }
    ]
  };

  it('splits at any non-first bar while preserving every bar id', () => {
    const result = splitSectionAtBar(sectionSong, { sectionId: 'section-a', barId: 'bar-a2' });
    expect(result.created).toBe(true);
    expect(result.sectionId).not.toBe('section-a');
    expect(result.song.sections.map((section) => section.bars.map((bar) => bar.id))).toEqual([
      ['bar-a1'],
      ['bar-a2', 'bar-a3']
    ]);
    expect(result.song.sections[1]).toMatchObject({ title: '' });
  });

  it('does not split the first bar and updates a section title by id', () => {
    const result = splitSectionAtBar(sectionSong, { sectionId: 'section-a', barId: 'bar-a1' });
    expect(result.created).toBe(false);
    expect(result.song).toBe(sectionSong);
    expect(updateSectionTitle(sectionSong, 'section-a', 'Chorus').sections[0].title).toBe('Chorus');
  });

  it('merges a transposed section while preserving its relative musical function', () => {
    const song: Song = {
      title: 'Merge', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
      sections: [
        { id: 'a', title: 'A', bars: [{ id: 'a1', chords: ['C'] }] },
        { id: 'b', title: 'B', keyChangeTo: 'D', bars: [{ id: 'b1', chords: ['D', '1', '0h'], riff: '1 2 3 4' }] },
        { id: 'c', title: 'C', bars: [{ id: 'c1', chords: ['D'] }] },
        { id: 'd', title: 'D', keyChangeTo: 'E', bars: [{ id: 'd1', chords: ['E'] }] }
      ]
    };
    const merged = mergeSectionToPrevious(song, 'b').song;
    expect(merged.sections.map((section) => section.id)).toEqual(['a', 'c', 'd']);
    expect(merged.sections[0].bars[1]).toMatchObject({ id: 'b1', chords: ['C', '1', '0h'], riff: '1 2 3 4' });
    expect(merged.sections[1].bars[0].chords).toEqual(['C']);
    expect(merged.sections[2]).toMatchObject({ id: 'd', keyChangeTo: 'E' });
    expect(merged.sections[2].bars[0].chords).toEqual(['E']);
  });

  it('reorders full sections and keeps all bars and ids together', () => {
    const split = splitSectionAtBar(sectionSong, { sectionId: 'section-a', barId: 'bar-a2' }).song;
    const secondId = split.sections[1].id!;
    const reordered = reorderSection(split, secondId, 'section-a', 'before');
    expect(reordered.sections.map((section) => section.id)).toEqual([secondId, 'section-a']);
    expect(reordered.sections[0].bars.map((bar) => bar.id)).toEqual(['bar-a2', 'bar-a3']);
  });

  it('duplicates a full section after the source with fresh section and bar ids', () => {
    const original = structuredClone(sectionSong);
    const result = duplicateSection(sectionSong, 'section-a');

    expect(result.created).toBe(true);
    expect(result.song.sections).toHaveLength(2);
    expect(result.song.sections[1]).toMatchObject({ title: 'Verse' });
    expect(result.song.sections[1].id).not.toBe('section-a');
    expect(result.song.sections[1].bars.map((bar) => bar.id)).not.toEqual(
      sectionSong.sections[0].bars.map((bar) => bar.id)
    );
    expect(result.song.sections[1].bars.map((bar) => bar.chords)).toEqual(
      sectionSong.sections[0].bars.map((bar) => bar.chords)
    );
    expect(sectionSong).toEqual(original);
  });

  it('keeps the inherited key when duplicating or deleting a key-change section', () => {
    const song: Song = {
      title: 'Key sections', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
      sections: [
        { id: 'a', title: 'Verse', bars: [{ id: 'a1', chords: ['C'] }] },
        { id: 'b', title: 'Bridge', keyChangeTo: 'D', bars: [{ id: 'b1', chords: ['D'] }] },
        { id: 'c', title: 'Chorus', bars: [{ id: 'c1', chords: ['D'] }] }
      ]
    };

    const duplicated = duplicateSection(song, 'b').song;
    expect(duplicated.sections[2].keyChangeTo).toBeUndefined();
    expect(duplicated.sections[2].bars[0].chords).toEqual(['D']);

    const deleted = deleteSection(song, 'b');
    expect(deleted.sections.map((section) => section.id)).toEqual(['a', 'c']);
    expect(deleted.sections[1].keyChangeTo).toBe('D');
    expect(deleted.sections[1].bars[0].chords).toEqual(['D']);
  });

  it('merges only a previously named non-first section when its title is cleared', () => {
    const base: Song = {
      ...sectionSong,
      sections: [
        sectionSong.sections[0],
        { id: 'section-b', title: 'Chorus', bars: [{ id: 'bar-b1', chords: ['G'] }] }
      ]
    };
    const merged = finalizeSectionTitleEdit({ baseSong: base, draftSong: base, sectionId: 'section-b', title: '   ' });
    expect(merged.sections).toHaveLength(1);
    expect(merged.sections[0].bars.map((bar) => bar.id)).toEqual(['bar-a1', 'bar-a2', 'bar-a3', 'bar-b1']);

    const restoredFirst = finalizeSectionTitleEdit({ baseSong: base, draftSong: base, sectionId: 'section-a', title: '' });
    expect(restoredFirst.sections[0].title).toBe('Verse');
  });

  it('keeps a newly split or originally blank section when its title stays blank', () => {
    const split = splitSectionAtBar(sectionSong, { sectionId: 'section-a', barId: 'bar-a2' });
    const finishedSplit = finalizeSectionTitleEdit({
      baseSong: sectionSong,
      draftSong: split.song,
      sectionId: split.sectionId,
      title: ''
    });
    expect(finishedSplit.sections).toHaveLength(2);

    const blankBase: Song = {
      ...sectionSong,
      sections: [{ ...sectionSong.sections[0], title: '' }]
    };
    expect(finalizeSectionTitleEdit({
      baseSong: blankBase,
      draftSong: blankBase,
      sectionId: 'section-a',
      title: ''
    }).sections).toHaveLength(1);
  });
});

describe('edit what you see conversion', () => {
  const displayStoredAgain = (stored: string, storedKey: Key, displayedKey: Key) => (
    transposeChord(stored, getTransposeOffset(storedKey, displayedKey), displayedKey, false, storedKey)
  );

  it('inverse-converts a displayed letter chord to the section storage key', () => {
    const stored = convertDisplayedChordToStoredChord({
      input: 'F',
      inputMode: 'letters',
      storageMode: 'letters',
      displayedKey: 'D',
      storedKey: 'C'
    });
    expect(displayStoredAgain(stored, 'C', 'D')).toBe('F');
  });

  it('round-trips slash bass chords', () => {
    const stored = convertDisplayedChordToStoredChord({
      input: 'D/F#',
      inputMode: 'letters',
      storageMode: 'letters',
      displayedKey: 'D',
      storedKey: 'C'
    });
    expect(stored).toBe('C/E');
    expect(displayStoredAgain(stored, 'C', 'D')).toBe('D/F#');
  });

  it.each(['Cb', 'Fb', 'B#', 'E#'])('preserves the explicit %s spelling when no transposition is needed', (chord) => {
    const stored = convertDisplayedChordToStoredChord({
      input: chord,
      inputMode: 'letters',
      storageMode: 'letters',
      displayedKey: 'C',
      storedKey: 'C'
    });
    expect(stored).toBe(chord);
    expect(convertStoredChordToDisplayedChord({
      chord: stored,
      storageMode: 'letters',
      outputMode: 'letters',
      storedKey: 'C',
      displayedKey: 'C'
    })).toBe(chord);
    expect(transposeChordForDisplay(chord, 0, 'C', 'C')).toBe(chord);
  });

  it('still respells an enharmonic key change with a zero semitone offset', () => {
    expect(transposeChordForDisplay('C#', 0, 'Db', 'C#')).toBe('Db');
  });

  it('preserves Nashville storage while accepting the displayed chord', () => {
    const stored = convertDisplayedChordToStoredChord({
      input: 'D/F#',
      inputMode: 'letters',
      storageMode: 'nashville',
      displayedKey: 'D',
      storedKey: 'C'
    });
    expect(stored).toBe('1/3');
    expect(displayStoredAgain(parseNashvilleToChord(stored, 'C'), 'C', 'D')).toBe('D/F#');
  });

  it('renders stored Nashville chords in either input keyboard without rewriting storage', () => {
    expect(convertStoredChordToDisplayedChord({
      chord: '1/3',
      storageMode: 'nashville',
      outputMode: 'letters',
      storedKey: 'C',
      displayedKey: 'D'
    })).toBe('D/F#');
    expect(convertStoredChordToDisplayedChord({
      chord: '1/3',
      storageMode: 'nashville',
      outputMode: 'nashville',
      storedKey: 'C',
      displayedKey: 'D'
    })).toBe('1/3');
  });
});

describe('preview chord input mode', () => {
  it.each([
    ['bb', 'Bb'],
    ['c#', 'C#'],
    ['ebm7', 'Ebm7'],
    ['bb/db', 'Bb/Db'],
    ['cMystery', 'CMystery']
  ])('normalizes letter roots in %s without rewriting quality text', (input, expected) => {
    expect(normalizeChordTextInput(input, 'letters')).toBe(expected);
  });

  it('leaves Nashville input unchanged', () => {
    expect(normalizeChordTextInput('b3m7', 'nashville')).toBe('b3m7');
  });

  it('uses the selected occupied slot format in a mixed section', () => {
    const mixedSong = makeSong({ chords: ['1', '', 'C#m', ''] });
    expect(detectSectionChordInputMode(mixedSong.sections[0])).toBe('letters');
    expect(getChordStorageModeForTarget(mixedSong, {
      sectionId: 'section-1', barId: 'bar-1', slotIndex: 0
    })).toBe('nashville');
    expect(getChordStorageModeForTarget(mixedSong, {
      sectionId: 'section-1', barId: 'bar-1', slotIndex: 2
    })).toBe('letters');
  });
});
