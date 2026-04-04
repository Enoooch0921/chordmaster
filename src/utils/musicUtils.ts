/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Key } from '../types';

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_ALIASES: Record<string, string> = {
  Cb: 'B',
  Fb: 'E',
  'E#': 'F',
  'B#': 'C'
};

export const ALL_KEYS: Key[] = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'Bb', 'B'
];

const DEFAULT_SECTION_COLOR = {
  bg: 'bg-indigo-50',
  border: 'border-indigo-100',
  text: 'text-indigo-700',
  accent: 'indigo'
};

const SEQUENTIAL_SECTION_COLORS = [
  {
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    text: 'text-blue-700',
    accent: 'blue'
  },
  {
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    text: 'text-emerald-700',
    accent: 'emerald'
  },
  {
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    text: 'text-amber-700',
    accent: 'amber'
  },
  {
    bg: 'bg-rose-50',
    border: 'border-rose-100',
    text: 'text-rose-700',
    accent: 'rose'
  },
  DEFAULT_SECTION_COLOR,
  {
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    text: 'text-slate-600',
    accent: 'slate'
  }
] as const;

function getNoteIndex(note: string): number {
  const normalizedNote = NOTE_ALIASES[note] || note;
  const sharpIndex = NOTES_SHARP.indexOf(normalizedNote);
  if (sharpIndex !== -1) return sharpIndex;
  return NOTES_FLAT.indexOf(normalizedNote);
}

function shouldPreferFlats(key: string): boolean {
  const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  return flatKeys.includes(key);
}

function shouldPreferSharps(key: string): boolean {
  const sharpKeys = ['C', 'C#', 'D', 'E', 'F#', 'G', 'G#', 'A', 'B'];
  return sharpKeys.includes(key);
}

function getNoteFromIndex(index: number, preferFlats: boolean = false): string {
  const normalizedIndex = ((index % 12) + 12) % 12;
  return preferFlats ? NOTES_FLAT[normalizedIndex] : NOTES_SHARP[normalizedIndex];
}

export function normalizeChordEnharmonic(chord: string): string {
  if (!chord || chord === '%' || chord === '/') {
    return chord;
  }

  if (chord.includes('/')) {
    const [base, bass] = chord.split('/');
    if (base && bass) {
      return `${normalizeChordEnharmonic(base)}/${normalizeChordEnharmonic(bass)}`;
    }
  }

  const match = chord.match(/^([A-G])([#b]?)(.*)$/);
  if (!match) {
    return chord;
  }

  const [, note, accidental, rest] = match;
  const normalizedRoot = NOTE_ALIASES[`${note}${accidental}`] || `${note}${accidental}`;
  return normalizedRoot + rest;
}

export function getTransposeOffset(fromKey: Key, toKey: Key): number {
  const fromIndex = getNoteIndex(fromKey);
  const toIndex = getNoteIndex(toKey);
  if (fromIndex === -1 || toIndex === -1) return 0;
  return toIndex - fromIndex;
}

export function transposeKey(key: Key, steps: number): Key {
  const keyIndex = getNoteIndex(key);
  if (keyIndex === -1) return key;
  const nextIndex = ((keyIndex + steps) % 12 + 12) % 12;
  const nextKey = getNoteFromIndex(nextIndex, shouldPreferFlats(key) && !shouldPreferSharps(key));
  return nextKey as Key;
}

export function transposeKeyPreferFlats(key: Key, steps: number): Key {
  const keyIndex = getNoteIndex(key);
  if (keyIndex === -1) return key;
  const nextIndex = ((keyIndex + steps) % 12 + 12) % 12;
  return getNoteFromIndex(nextIndex, true) as Key;
}

export function transposeChord(chord: string, offset: number, targetKey?: Key): string {
  if (!chord || chord === '%' || chord === '/') return chord;
  const normalizedOffset = ((offset % 12) + 12) % 12;
  if (normalizedOffset === 0) {
    return normalizeChordEnharmonic(chord);
  }

  // Handle slash chords like E/G#
  if (chord.includes('/')) {
    const [base, bass] = chord.split('/');
    if (base && bass) {
      return `${transposeChord(base, offset, targetKey)}/${transposeChord(bass, offset, targetKey)}`;
    }
  }

  // Extract the root note (e.g., "C#", "Eb", "G")
  let root = '';
  let rest = '';

  if (chord.length > 1 && (chord[1] === '#' || chord[1] === 'b')) {
    root = chord.substring(0, 2);
    rest = chord.substring(2);
  } else {
    root = chord.substring(0, 1);
    rest = chord.substring(1);
  }

  const rootIndex = getNoteIndex(root);
  if (rootIndex === -1) return chord; // Not a valid note, return as is

  const preferFlats = targetKey ? shouldPreferFlats(targetKey) : root.includes('b');
  const newRoot = getNoteFromIndex(rootIndex + offset, preferFlats);
  return normalizeChordEnharmonic(newRoot + rest);
}

function normalizeSequentialSectionToken(title: string): string {
  return title
    .trim()
    .replace(/^[\s([{\uFF08\u3010]+/, '')
    .replace(/[\s)\]}\uFF09\u3011.:：-]+$/, '');
}

function getAlphabeticSequenceIndex(token: string): number | null {
  if (!/^[a-z]+$/i.test(token)) return null;

  return token
    .toUpperCase()
    .split('')
    .reduce((acc, char) => (acc * 26) + (char.charCodeAt(0) - 64), 0) - 1;
}

function getSequentialSectionColor(title: string) {
  const token = normalizeSequentialSectionToken(title);
  if (!token) return null;

  const numericValue = token.match(/^\d+$/) ? Number.parseInt(token, 10) : Number.NaN;
  const alphaValue = Number.isNaN(numericValue) ? getAlphabeticSequenceIndex(token) : null;

  let sequenceIndex: number | null = null;
  if (!Number.isNaN(numericValue)) {
    sequenceIndex = Math.max(0, numericValue - 1);
  } else if (alphaValue !== null && alphaValue >= 0) {
    sequenceIndex = alphaValue;
  }

  if (sequenceIndex === null) return null;
  return SEQUENTIAL_SECTION_COLORS[sequenceIndex % SEQUENTIAL_SECTION_COLORS.length];
}

export function getSectionColor(title: string, useColors: boolean = true) {
  const t = title.toLowerCase();
  const isPreChorus = t.includes('pre-chorus') || t.includes('pre chorus');
  const isPostChorus = t.includes('post-chorus') || t.includes('post chorus');
  const isCountIn = t.includes('count-in') || t.includes('count in') || t.includes('countoff') || t.includes('count-off') || t.includes('count off');
  const isRefrain = t.includes('refrain');
  const isRap = t.includes('rap');
  const isTurnaround = t.includes('turnaround');
  const isBreakdown = t.includes('breakdown');
  
  if (!useColors) {
    return {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-600',
      accent: 'indigo'
    };
  }

  if (t.includes('intro') || t.includes('solo') || t.includes('間奏') || t.includes('interlude') || t.includes('outro') || t.includes('instrumental') || t.includes('ending')) {
    return {
      bg: 'bg-slate-100',
      border: 'border-slate-200',
      text: 'text-slate-600',
      accent: 'slate'
    };
  }
  if (isPreChorus) {
    return {
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      text: 'text-emerald-700',
      accent: 'emerald'
    };
  }
  if (t.includes('verse')) {
    return {
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      text: 'text-blue-700',
      accent: 'blue'
    };
  }
  if (isRefrain) {
    return {
      bg: 'bg-fuchsia-50',
      border: 'border-fuchsia-100',
      text: 'text-fuchsia-700',
      accent: 'fuchsia'
    };
  }
  if (t.includes('chorus') || isPostChorus) {
    return {
      bg: 'bg-rose-50',
      border: 'border-rose-100',
      text: 'text-rose-700',
      accent: 'rose'
    };
  }
  if (isTurnaround) {
    return {
      bg: 'bg-cyan-50',
      border: 'border-cyan-100',
      text: 'text-cyan-700',
      accent: 'cyan'
    };
  }
  if (isBreakdown) {
    return {
      bg: 'bg-violet-50',
      border: 'border-violet-100',
      text: 'text-violet-700',
      accent: 'violet'
    };
  }
  if (t.includes('bridge')) {
    return {
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      text: 'text-amber-700',
      accent: 'amber'
    };
  }
  if (isCountIn || isRap) {
    return {
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
      text: 'text-indigo-700',
      accent: 'indigo'
    };
  }

  const sequentialColor = getSequentialSectionColor(title);
  if (sequentialColor) {
    return sequentialColor;
  }

  return DEFAULT_SECTION_COLOR;
}

export function getNashvilleNumber(chord: string, key: Key): string {
  if (!chord || chord === '%' || chord === '/') return chord;

  // Handle slash chords like E/G#
  if (chord.includes('/')) {
    const [base, bass] = chord.split('/');
    if (base && bass) {
      return `${getNashvilleNumber(base, key)}/${getNashvilleNumber(bass, key)}`;
    }
  }

  // Extract the root note (e.g., "C#", "Eb", "G")
  let root = '';
  let rest = '';

  if (chord.length > 1 && (chord[1] === '#' || chord[1] === 'b')) {
    root = chord.substring(0, 2);
    rest = chord.substring(2);
  } else {
    root = chord.substring(0, 1);
    rest = chord.substring(1);
  }

  const rootIndex = getNoteIndex(root);
  const keyIndex = getNoteIndex(key);
  if (rootIndex === -1 || keyIndex === -1) return chord;

  // Calculate the degree (1-7)
  const degree = ((rootIndex - keyIndex + 12) % 12);
  
  // Mapping of semitones from key root to Nashville numbers
  const degreeMap: Record<number, string> = {
    0: '1',
    1: 'b2',
    2: '2',
    3: 'b3',
    4: '3',
    5: '4',
    6: 'b5',
    7: '5',
    8: 'b6',
    9: '6',
    10: 'b7',
    11: '7'
  };

  const number = degreeMap[degree] || '?';
  
  // Nashville numbers often use lowercase 'm' for minor, but we can keep the 'rest' part
  // e.g. Am -> 6m, G7 -> 57
  return number + rest;
}

export function parseNashvilleToChord(input: string, key: Key): string {
  if (!input || input === '%' || input === '/') return input;

  // Handle slash chords
  if (input.includes('/')) {
    const [base, bass] = input.split('/');
    if (base && bass) {
      return `${parseNashvilleToChord(base, key)}/${parseNashvilleToChord(bass, key)}`;
    }
  }

  // Support both b6dim7 and 6bdim7 styles.
  const match = input.match(/^([b#]?)([1-7])([#b]?)(.*)$/);
  if (!match) return input; // Not a Nashville number, return as is

  const [, prefixAccidental, degreeStr, suffixAccidental, rest] = match;
  const accidental = prefixAccidental || suffixAccidental;
  const degree = parseInt(degreeStr);
  
  // Semitones for major scale degrees
  const majorScaleMap: Record<number, number> = {
    1: 0,
    2: 2,
    3: 4,
    4: 5,
    5: 7,
    6: 9,
    7: 11
  };

  let semitones = majorScaleMap[degree] || 0;
  if (accidental === 'b') semitones -= 1;
  if (accidental === '#') semitones += 1;

  const keyIndex = getNoteIndex(key);
  if (keyIndex === -1) return input;

  // Preserve the accidental intent from Nashville notation:
  // b7 in C should become Bb, not A#; #4 should become F#, not Gb.
  const preferFlats = accidental === 'b'
    ? true
    : accidental === '#'
      ? false
      : ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(key);
  
  const root = getNoteFromIndex(keyIndex + semitones, preferFlats);

  return normalizeChordEnharmonic(root + rest);
}

export function isNashville(chord: string): boolean {
  if (!chord || chord === '%' || chord === '/') return false;
  return /^([b#]?)([1-7])([#b]?)/.test(chord);
}

export function getPlayKey(targetKey: Key, capo: number): Key {
  const targetIndex = getNoteIndex(targetKey);
  if (targetIndex === -1) return targetKey;
  
  // Play Key = Target Key - Capo
  const playIndex = (targetIndex - (capo % 12) + 12) % 12;
  const preferFlats = shouldPreferFlats(targetKey);
  return getNoteFromIndex(playIndex, preferFlats) as Key;
}
