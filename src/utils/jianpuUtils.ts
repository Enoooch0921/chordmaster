import { Key } from '../types';
import { parseTimeSignature } from './rhythmUtils';

export type JianpuDuration = 'quarter' | 'eighth' | 'sixteenth';
/**
 * Signed octave shift relative to the middle octave: 0 = mid, +n = n octaves up,
 * -n = n octaves down. Stored/rendered without a hard cap so fixed-do (absolute)
 * charts can round-trip multiple octaves; the relative side is clamped to ±2 via
 * `clampRelativeOctave` (see `absoluteJianpuPartsToRelative` and the editor).
 */
export type JianpuOctave = number;
export type JianpuAccidental = '' | '#' | 'b';

/** Relative jianpu notation shows at most 2 octave dots above/below a digit. */
export const MAX_RELATIVE_OCTAVE_SHIFT = 2;

export const clampRelativeOctave = (shift: number): JianpuOctave =>
  Math.max(-MAX_RELATIVE_OCTAVE_SHIFT, Math.min(MAX_RELATIVE_OCTAVE_SHIFT, Math.trunc(shift)));

export interface JianpuInputMode {
  duration: JianpuDuration;
  octave: JianpuOctave;
  dotted: boolean;
  triplet: boolean;
  accidental: JianpuAccidental;
}

export interface JianpuNoteRange {
  start: number;
  end: number;
  text: string;
  accidental: string;
  pitch: string;
  dotted: boolean;
  triplet: boolean;
  slurStart: boolean;
  slurEnd: boolean;
  duration: JianpuDuration;
  octave: JianpuOctave;
}

export interface JianpuPlaceholderRange {
  start: number;
  end: number;
  text: string;
  duration: JianpuDuration;
  dotted: boolean;
  triplet: boolean;
}

const JIANPU_NOTE_REGEX = /\(*[#b^_=]*[+-]?[0-7-][',]*[=_]*t?\.*\)*/g;
const JIANPU_NOTE_CORE_REGEX = /^([#b^_=]*)([+-]?)([0-7-])([',]*)([=_]*)(t?)(\.*)$/;
const JIANPU_PLACEHOLDER_REGEX = /[qesQESx]/g;
const PLACEHOLDER_MAP: Record<string, { duration: JianpuDuration; dotted: boolean; triplet: boolean }> = {
  q: { duration: 'quarter', dotted: false, triplet: false },
  e: { duration: 'eighth', dotted: false, triplet: false },
  s: { duration: 'sixteenth', dotted: false, triplet: false },
  Q: { duration: 'quarter', dotted: true, triplet: false },
  E: { duration: 'eighth', dotted: true, triplet: false },
  S: { duration: 'sixteenth', dotted: true, triplet: false },
  x: { duration: 'sixteenth', dotted: false, triplet: true }
};

const RELATIVE_MAJOR_SCALE_OFFSETS: Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', number> = {
  '1': 0,
  '2': 2,
  '3': 4,
  '4': 5,
  '5': 7,
  '6': 9,
  '7': 11
};

const KEY_TO_SEMITONE_INDEX: Record<Key, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11
};

const FLAT_KEYS = new Set<Key>(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);

const FIXED_DO_SHARP_MAP = [
  { pitch: '1', accidental: '' },
  { pitch: '1', accidental: '#' },
  { pitch: '2', accidental: '' },
  { pitch: '2', accidental: '#' },
  { pitch: '3', accidental: '' },
  { pitch: '4', accidental: '' },
  { pitch: '4', accidental: '#' },
  { pitch: '5', accidental: '' },
  { pitch: '5', accidental: '#' },
  { pitch: '6', accidental: '' },
  { pitch: '6', accidental: '#' },
  { pitch: '7', accidental: '' }
] as const;

const FIXED_DO_FLAT_MAP = [
  { pitch: '1', accidental: '' },
  { pitch: '2', accidental: 'b' },
  { pitch: '2', accidental: '' },
  { pitch: '3', accidental: 'b' },
  { pitch: '3', accidental: '' },
  { pitch: '4', accidental: '' },
  { pitch: '5', accidental: 'b' },
  { pitch: '5', accidental: '' },
  { pitch: '6', accidental: 'b' },
  { pitch: '6', accidental: '' },
  { pitch: '7', accidental: 'b' },
  { pitch: '7', accidental: '' }
] as const;

const DURATION_MARKERS: Record<JianpuDuration, string> = {
  quarter: '',
  eighth: '_',
  sixteenth: '='
};

export function getJianpuDurationUnits(duration: JianpuDuration, dotted = false, triplet = false): number {
  const baseUnits = duration === 'quarter'
    ? 4
    : duration === 'eighth'
      ? 2
      : 1;

  if (triplet) {
    return (baseUnits * 2) / 3;
  }

  return baseUnits + (dotted ? baseUnits / 2 : 0);
}

function getOctaveFromParts(prefix: string, octaveMarks: string): JianpuOctave {
  // Count the octave dots so multi-octave (absolute) notation survives parsing;
  // relative clamping happens later, not here.
  const normalized = `${prefix === '+' ? "'" : prefix === '-' ? ',' : ''}${octaveMarks}`;
  const highs = (normalized.match(/'/g) ?? []).length;
  const lows = (normalized.match(/,/g) ?? []).length;
  return highs - lows;
}

function getDurationFromParts(durationMarks: string): JianpuDuration {
  if (durationMarks.includes('=')) return 'sixteenth';
  if (durationMarks.includes('_')) return 'eighth';
  return 'quarter';
}

function buildOctaveMarks(octave: JianpuOctave, pitch: string): string {
  // `octave` is the signed shift, so this is the same as the absolute builder.
  return buildAbsoluteOctaveMarks(octave, pitch);
}

function buildAccidentalPrefix(accidental: string, pitch: string): string {
  if (pitch === '0' || pitch === '-') return '';
  return accidental;
}

function buildAbsoluteOctaveMarks(octaveShift: number, pitch: string): string {
  if (pitch === '0' || pitch === '-') return '';
  if (octaveShift > 0) return "'".repeat(octaveShift);
  if (octaveShift < 0) return ",".repeat(Math.abs(octaveShift));
  return '';
}

export function getCanonicalJianpuBeatTokens(notation: string | undefined, timeSignature: string): string[] {
  const { beats } = parseTimeSignature(timeSignature);
  const normalized = notation?.replace(/\s+/g, ' ').trim() || '';
  const rawTokens = normalized.includes('|')
    ? normalized.split('|').map((token) => token.trim())
    : normalized
      ? normalized.split(' ').map((token) => token.trim())
      : [];

  return Array.from({ length: beats }, (_, index) => rawTokens[index] || '');
}

export function serializeJianpuBeatTokens(tokens: string[], trimTrailingEmpty = false): string {
  if (!trimTrailingEmpty) {
    return tokens.join(' | ');
  }

  const lastNonEmptyIndex = tokens.reduce((last, token, index) => (token.trim() ? index : last), -1);
  if (lastNonEmptyIndex === -1) return '';
  return tokens.slice(0, lastNonEmptyIndex + 1).join(' | ');
}

export function getCanonicalJianpuNotation(
  notation: string | undefined,
  timeSignature: string,
  trimTrailingEmpty = false
): string {
  return serializeJianpuBeatTokens(getCanonicalJianpuBeatTokens(notation, timeSignature), trimTrailingEmpty);
}

export function findJianpuNoteRanges(value: string): JianpuNoteRange[] {
  return Array.from(value.matchAll(JIANPU_NOTE_REGEX))
    .map((match) => {
      const text = match[0];
      const core = text.replace(/[()]/g, '');
      const parsed = core.match(JIANPU_NOTE_CORE_REGEX);
      if (!parsed) return null;

      const [, accidental, octavePrefix, pitch, octaveMarks, durationMarks, tripletMarker, dots] = parsed;
      const triplet = Boolean(tripletMarker) && !durationMarks.includes('=');

      return {
        start: match.index || 0,
        end: (match.index || 0) + text.length,
        text,
        accidental,
        pitch,
        dotted: !triplet && dots.length > 0,
        triplet,
        slurStart: text.startsWith('('),
        slurEnd: text.endsWith(')'),
        duration: getDurationFromParts(durationMarks),
        octave: getOctaveFromParts(octavePrefix, octaveMarks)
      };
    })
    .filter((note): note is JianpuNoteRange => Boolean(note));
}

export function findJianpuPlaceholderRanges(value: string): JianpuPlaceholderRange[] {
  return Array.from(value.matchAll(JIANPU_PLACEHOLDER_REGEX))
    .map((match) => {
      const text = match[0];
      const mapped = PLACEHOLDER_MAP[text];
      if (!mapped) return null;

      return {
        start: match.index || 0,
        end: (match.index || 0) + text.length,
        text,
        duration: mapped.duration,
        dotted: mapped.dotted,
        triplet: mapped.triplet
      };
    })
    .filter((placeholder): placeholder is JianpuPlaceholderRange => Boolean(placeholder));
}

export function findNearestJianpuNoteRange(value: string, caret: number, preferPrevious = false): JianpuNoteRange | null {
  const notes = findJianpuNoteRanges(value);
  if (notes.length === 0) return null;

  const containing = notes.find((note) => caret > note.start && caret < note.end);
  if (containing) return containing;

  const previous = [...notes].reverse().find((note) => note.end <= caret) || null;
  const next = notes.find((note) => note.start >= caret) || null;

  if (preferPrevious) return previous || next;
  if (!previous) return next;
  if (!next) return previous;

  const previousDistance = Math.abs(caret - previous.end);
  const nextDistance = Math.abs(next.start - caret);
  return previousDistance <= nextDistance ? previous : next;
}

export function replaceJianpuRange(value: string, start: number, end: number, replacement: string): string {
  return value.slice(0, start) + replacement + value.slice(end);
}

export function buildJianpuNoteFromMode(pitch: string, mode: JianpuInputMode): string {
  const triplet = mode.triplet && mode.duration !== 'sixteenth';
  return `${buildAccidentalPrefix(mode.accidental, pitch)}${pitch}${buildOctaveMarks(mode.octave, pitch)}${DURATION_MARKERS[mode.duration]}${triplet ? 't' : ''}${mode.dotted && !triplet ? '.' : ''}`;
}

export function buildJianpuPlaceholderFromUnits(units: number): string {
  if (units <= 0.001) return '';
  if (Math.abs(units - Math.round(units)) <= 0.001) {
    return 's'.repeat(Math.round(units));
  }
  let thirdUnits = Math.max(0, Math.round(units * 3));
  let placeholder = '';

  while (thirdUnits > 0) {
    if (thirdUnits >= 12) {
      placeholder += 'q';
      thirdUnits -= 12;
    } else if (thirdUnits >= 6 && thirdUnits - 6 !== 1) {
      placeholder += 'e';
      thirdUnits -= 6;
    } else if (thirdUnits % 3 === 0) {
      placeholder += 's';
      thirdUnits -= 3;
    } else {
      placeholder += 'x';
      thirdUnits -= 2;
    }
  }

  return placeholder;
}

export function buildJianpuPlaceholder(duration: JianpuDuration, dotted = false, triplet = false): string {
  return buildJianpuPlaceholderFromUnits(getJianpuDurationUnits(duration, dotted, triplet)) || 's';
}

export function rebuildJianpuNote(note: JianpuNoteRange, overrides: Partial<Pick<JianpuNoteRange, 'accidental' | 'pitch' | 'dotted' | 'triplet' | 'slurStart' | 'slurEnd' | 'duration' | 'octave'>>): string {
  const accidental = overrides.accidental ?? note.accidental;
  const pitch = overrides.pitch ?? note.pitch;
  const duration = overrides.duration ?? note.duration;
  const triplet = duration !== 'sixteenth' && (overrides.triplet ?? note.triplet);
  const dotted = !triplet && (overrides.dotted ?? note.dotted);
  const slurStart = overrides.slurStart ?? note.slurStart;
  const slurEnd = overrides.slurEnd ?? note.slurEnd;
  const octave = overrides.octave ?? note.octave;

  return `${slurStart ? '(' : ''}${buildAccidentalPrefix(accidental, pitch)}${pitch}${buildOctaveMarks(octave, pitch)}${DURATION_MARKERS[duration]}${triplet ? 't' : ''}${dotted ? '.' : ''}${slurEnd ? ')' : ''}`;
}

export function convertRelativeJianpuToAbsoluteNotation(notation: string | undefined, key: Key): string | undefined {
  if (!notation?.trim() || notation.trim() === '-') {
    return notation;
  }

  const tonicSemitone = KEY_TO_SEMITONE_INDEX[key];
  const preferFlats = FLAT_KEYS.has(key);
  const noteRanges = findJianpuNoteRanges(notation);

  if (noteRanges.length === 0) {
    return notation;
  }

  let nextNotation = notation;

  [...noteRanges].reverse().forEach((note) => {
    if (!/^[1-7]$/.test(note.pitch)) {
      return;
    }

    const scaleOffset = RELATIVE_MAJOR_SCALE_OFFSETS[note.pitch as keyof typeof RELATIVE_MAJOR_SCALE_OFFSETS];
    const accidentalOffset = note.accidental.includes('b')
      ? -1
      : note.accidental.includes('#')
        ? 1
        : 0;
    const relativeOctaveShift = note.octave * 12;
    const absoluteMidi = 60 + tonicSemitone + scaleOffset + accidentalOffset + relativeOctaveShift;
    const semitoneClass = ((absoluteMidi - 60) % 12 + 12) % 12;
    const absoluteOctaveShift = Math.floor((absoluteMidi - 60) / 12);
    const fixedDoNote = (preferFlats ? FIXED_DO_FLAT_MAP : FIXED_DO_SHARP_MAP)[semitoneClass];
    const replacement = `${note.slurStart ? '(' : ''}${fixedDoNote.accidental}${fixedDoNote.pitch}${buildAbsoluteOctaveMarks(absoluteOctaveShift, fixedDoNote.pitch)}${DURATION_MARKERS[note.duration]}${note.triplet ? 't' : ''}${note.dotted && !note.triplet ? '.' : ''}${note.slurEnd ? ')' : ''}`;

    nextNotation = replaceJianpuRange(nextNotation, note.start, note.end, replacement);
  });

  return nextNotation;
}

/**
 * Inverse of `convertRelativeJianpuToAbsoluteNotation` for a single keypad note.
 *
 * When the editor shows absolute (fixed-do, 1=C) jianpu, the number the user taps
 * is an absolute pitch. Storage is always relative (movable-do), so we translate
 * the tapped absolute pitch+accidental+octave back into the relative degree that
 * renders as exactly that absolute note. Round-trips with the forward converter:
 * the absolute display of the returned relative note equals what the user typed.
 *
 * Rests / sustains (`0`, `-`) carry no pitch and pass through untouched.
 */
export function absoluteJianpuPartsToRelative(
  pitch: string,
  accidental: JianpuAccidental,
  octave: JianpuOctave,
  key: Key
): { pitch: string; accidental: JianpuAccidental; octave: JianpuOctave } {
  if (!/^[1-7]$/.test(pitch)) {
    return { pitch, accidental, octave };
  }

  const tonicSemitone = KEY_TO_SEMITONE_INDEX[key];
  // Fixed-do uses the same major-scale offsets as movable-do, with 1 = C.
  const absoluteScaleOffset = RELATIVE_MAJOR_SCALE_OFFSETS[pitch as keyof typeof RELATIVE_MAJOR_SCALE_OFFSETS];
  const accidentalOffset = accidental === 'b' ? -1 : accidental === '#' ? 1 : 0;
  const absoluteOctaveShift = octave * 12;

  const relativeSemitone = absoluteScaleOffset + accidentalOffset + absoluteOctaveShift - tonicSemitone;
  const relativeClass = ((relativeSemitone % 12) + 12) % 12;
  const relativeOctaveShift = Math.floor(relativeSemitone / 12);

  // Spell the relative degree per the user's accidental intent (# stays sharp,
  // b stays flat), falling back to the key's preference for natural input.
  const preferFlats = accidental === 'b'
    ? true
    : accidental === '#'
      ? false
      : FLAT_KEYS.has(key);
  const relativeNote = (preferFlats ? FIXED_DO_FLAT_MAP : FIXED_DO_SHARP_MAP)[relativeClass];

  // Relative notation shows at most ±2 octave dots; clamp the rare out-of-range case.
  const relativeOctave = clampRelativeOctave(relativeOctaveShift);

  return {
    pitch: relativeNote.pitch,
    accidental: relativeNote.accidental as JianpuAccidental,
    octave: relativeOctave
  };
}

// Whole-notation inverse of convertRelativeJianpuToAbsoluteNotation: read each
// note as an absolute (fixed-do) pitch and rewrite it as the relative degree in
// `key`, preserving placeholders, slurs, durations, and dots. Used when the user
// flips the jianpu input mode and wants the on-screen numbers kept (reinterpreted)
// rather than visually shifted.
export function convertAbsoluteJianpuToRelativeNotation(notation: string | undefined, key: Key): string | undefined {
  if (!notation?.trim() || notation.trim() === '-') {
    return notation;
  }

  const noteRanges = findJianpuNoteRanges(notation);
  if (noteRanges.length === 0) {
    return notation;
  }

  let nextNotation = notation;

  [...noteRanges].reverse().forEach((note) => {
    if (!/^[1-7]$/.test(note.pitch)) {
      return;
    }

    const accidental: JianpuAccidental = note.accidental.includes('b')
      ? 'b'
      : note.accidental.includes('#')
        ? '#'
        : '';
    const relative = absoluteJianpuPartsToRelative(note.pitch, accidental, note.octave, key);
    const replacement = rebuildJianpuNote(note, {
      pitch: relative.pitch,
      accidental: relative.accidental,
      octave: relative.octave
    });

    nextNotation = replaceJianpuRange(nextNotation, note.start, note.end, replacement);
  });

  return nextNotation;
}
