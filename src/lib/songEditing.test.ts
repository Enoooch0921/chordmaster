import { describe, expect, it } from 'vitest';
import type { Bar, Key, Song } from '../types';
import { getChordDisplaySlots, getTwoChordSplitSlotIndex } from '../utils/chordSlots';
import { getTransposeOffset, parseNashvilleToChord, transposeChord } from '../utils/musicUtils';
import {
  clearChordAtBeatSlot,
  convertDisplayedChordToStoredChord,
  deleteBar,
  duplicateBar,
  getChordBeatSlots,
  insertBar,
  parseChordBarText,
  serializeChordBeatSlots,
  setChordAtBeatSlot,
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
      error: '此小節最多可放 4 個和弦，目前輸入 5 個。'
    });
  });
});

describe('bar commands', () => {
  it('keeps repeat end and final bar mutually exclusive', () => {
    const song = makeSong({ chords: [], repeatEnd: true });
    const edited = updateEditableBarFields(song, { sectionId: 'section-1', barId: 'bar-1' }, { finalBar: true });
    expect(edited.sections[0].bars[0]).toMatchObject({ finalBar: true, repeatEnd: false });
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
});
