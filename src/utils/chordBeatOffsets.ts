import type { Bar, ChordMark } from '../types';
export const normalizeChordBeatOffset = (value: unknown): ChordMark['beatOffset'] =>
  value === 0.25 || value === 0.5 || value === 0.75 ? value : undefined;
export const canOffsetChord = (chord: string) => /^(?:[A-G]|[#b]?[1-7])/.test(chord.trim());
export const getChordBeatOffset = (bar: Bar, rawIndex: number) => {
  const chord = bar.chords[rawIndex] || '';
  return canOffsetChord(chord) && !/[<>]/.test(chord)
    ? normalizeChordBeatOffset(bar.chordMarks?.[rawIndex]?.beatOffset) : undefined;
};
export const chordBeatPositionLabel = (slotIndex: number, offset: number) =>
  `${slotIndex + 1}${offset === 0.25 ? 'e' : offset === 0.5 ? '&' : offset === 0.75 ? 'a' : ''}`;
export const setRawChordBeatOffset = (bar: Bar, rawIndex: number, value: number): Bar => {
  if (!Number.isInteger(rawIndex) || !canOffsetChord(bar.chords[rawIndex] || '')
      || (value !== 0 && normalizeChordBeatOffset(value) === undefined)) return bar;
  const chordMarks = { ...bar.chordMarks };
  const mark = { ...chordMarks[rawIndex] };
  const beatOffset = normalizeChordBeatOffset(value);
  if (beatOffset) mark.beatOffset = beatOffset; else delete mark.beatOffset;
  if (Object.values(mark).some(v => v !== undefined && v !== false)) chordMarks[rawIndex] = mark;
  else delete chordMarks[rawIndex];
  return { ...bar, chords: bar.chords.map((chord, index) => index === rawIndex && beatOffset ? chord.replace(/[<>]/g, '') : chord),
    chordMarks: Object.keys(chordMarks).length ? chordMarks : undefined };
};
