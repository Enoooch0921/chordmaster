import { Key } from '../types';
import { parseTimeSignature } from './rhythmUtils';

export type JianpuDuration = 'quarter' | 'eighth' | 'sixteenth';
export type JianpuOctave = 'low' | 'mid' | 'high';
export type JianpuAccidental = '' | '#' | 'b';

export interface JianpuInputMode {
  duration: JianpuDuration;
  octave: JianpuOctave;
  dotted: boolean;
  accidental: JianpuAccidental;
}

export interface JianpuNoteRange {
  start: number;
  end: number;
  text: string;
  accidental: string;
  pitch: string;
  dotted: boolean;
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
}

const JIANPU_NOTE_REGEX = /\(*[#b^_=]*[+-]?[0-7-][',]*[=_]*\.*\)*/g;
const JIANPU_NOTE_CORE_REGEX = /^([#b^_=]*)([+-]?)([0-7-])([',]*)([=_]*)(\.*)$/;
const JIANPU_PLACEHOLDER_REGEX = /[qesQES]/g;
const PLACEHOLDER_MAP: Record<string, { duration: JianpuDuration; dotted: boolean }> = {
  q: { duration: 'quarter', dotted: false },
  e: { duration: 'eighth', dotted: false },
  s: { duration: 'sixteenth', dotted: false },
  Q: { duration: 'quarter', dotted: true },
  E: { duration: 'eighth', dotted: true },
  S: { duration: 'sixteenth', dotted: true }
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

function getOctaveFromParts(prefix: string, octaveMarks: string): JianpuOctave {
  const normalized = `${prefix === '+' ? "'" : prefix === '-' ? ',' : ''}${octaveMarks}`;
  if (normalized.includes("'")) return 'high';
  if (normalized.includes(',')) return 'low';
  return 'mid';
}

function getDurationFromParts(durationMarks: string): JianpuDuration {
  if (durationMarks.includes('=')) return 'sixteenth';
  if (durationMarks.includes('_')) return 'eighth';
  return 'quarter';
}

function buildOctaveMarks(octave: JianpuOctave, pitch: string): string {
  if (pitch === '0' || pitch === '-') return '';
  if (octave === 'high') return "'";
  if (octave === 'low') return ',';
  return '';
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

      const [, accidental, octavePrefix, pitch, octaveMarks, durationMarks, dots] = parsed;

      return {
        start: match.index || 0,
        end: (match.index || 0) + text.length,
        text,
        accidental,
        pitch,
        dotted: dots.length > 0,
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
        dotted: mapped.dotted
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
  return `${buildAccidentalPrefix(mode.accidental, pitch)}${pitch}${buildOctaveMarks(mode.octave, pitch)}${DURATION_MARKERS[mode.duration]}${mode.dotted ? '.' : ''}`;
}

export function buildJianpuPlaceholder(duration: JianpuDuration, dotted = false): string {
  const units = duration === 'quarter'
    ? 4
    : duration === 'eighth'
      ? 2
      : 1;
  const totalUnits = units + (dotted ? units / 2 : 0);
  return 's'.repeat(Math.max(1, Math.round(totalUnits)));
}

export function rebuildJianpuNote(note: JianpuNoteRange, overrides: Partial<Pick<JianpuNoteRange, 'accidental' | 'pitch' | 'dotted' | 'slurStart' | 'slurEnd' | 'duration' | 'octave'>>): string {
  const accidental = overrides.accidental ?? note.accidental;
  const pitch = overrides.pitch ?? note.pitch;
  const dotted = overrides.dotted ?? note.dotted;
  const slurStart = overrides.slurStart ?? note.slurStart;
  const slurEnd = overrides.slurEnd ?? note.slurEnd;
  const duration = overrides.duration ?? note.duration;
  const octave = overrides.octave ?? note.octave;

  return `${slurStart ? '(' : ''}${buildAccidentalPrefix(accidental, pitch)}${pitch}${buildOctaveMarks(octave, pitch)}${DURATION_MARKERS[duration]}${dotted ? '.' : ''}${slurEnd ? ')' : ''}`;
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
    const relativeOctaveShift = note.octave === 'high'
      ? 12
      : note.octave === 'low'
        ? -12
        : 0;
    const absoluteMidi = 60 + tonicSemitone + scaleOffset + accidentalOffset + relativeOctaveShift;
    const semitoneClass = ((absoluteMidi - 60) % 12 + 12) % 12;
    const absoluteOctaveShift = Math.floor((absoluteMidi - 60) / 12);
    const fixedDoNote = (preferFlats ? FIXED_DO_FLAT_MAP : FIXED_DO_SHARP_MAP)[semitoneClass];
    const replacement = `${note.slurStart ? '(' : ''}${fixedDoNote.accidental}${fixedDoNote.pitch}${buildAbsoluteOctaveMarks(absoluteOctaveShift, fixedDoNote.pitch)}${DURATION_MARKERS[note.duration]}${note.dotted ? '.' : ''}${note.slurEnd ? ')' : ''}`;

    nextNotation = replaceJianpuRange(nextNotation, note.start, note.end, replacement);
  });

  return nextNotation;
}
