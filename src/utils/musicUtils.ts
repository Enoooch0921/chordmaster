/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Key } from '../types';

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const ALL_KEYS: Key[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'
];

const TRANSPOSE_KEYS: Key[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function getNoteIndex(note: string): number {
  const sharpIndex = NOTES_SHARP.indexOf(note);
  if (sharpIndex !== -1) return sharpIndex;
  return NOTES_FLAT.indexOf(note);
}

function shouldPreferFlats(key: string): boolean {
  const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  return flatKeys.includes(key);
}

function getNoteFromIndex(index: number, preferFlats: boolean = false): string {
  const normalizedIndex = ((index % 12) + 12) % 12;
  return preferFlats ? NOTES_FLAT[normalizedIndex] : NOTES_SHARP[normalizedIndex];
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
  return TRANSPOSE_KEYS[nextIndex];
}

export function transposeChord(chord: string, offset: number, targetKey?: Key): string {
  if (!chord || chord === '%' || chord === '/') return chord;

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
  return newRoot + rest;
}

export function getSectionColor(title: string, useColors: boolean = true) {
  const t = title.toLowerCase();
  
  if (!useColors) {
    return {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-600',
      accent: 'indigo'
    };
  }

  if (t.includes('intro') || t.includes('solo') || t.includes('間奏') || t.includes('interlude') || t.includes('breakdown') || t.includes('outro') || t.includes('instrumental') || t.includes('ending')) {
    return {
      bg: 'bg-slate-100',
      border: 'border-slate-200',
      text: 'text-slate-600',
      accent: 'slate'
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
  if (t.includes('chorus')) {
    return {
      bg: 'bg-rose-50',
      border: 'border-rose-100',
      text: 'text-rose-700',
      accent: 'rose'
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
  if (t.includes('pre')) {
    return {
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      text: 'text-emerald-700',
      accent: 'emerald'
    };
  }
  // Default
  return {
    bg: 'bg-indigo-50',
    border: 'border-indigo-100',
    text: 'text-indigo-700',
    accent: 'indigo'
  };
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

  // Regex to match Nashville number pattern: (b|#)?([1-7])(rest)
  const match = input.match(/^([b#]?)([1-7])(.*)$/);
  if (!match) return input; // Not a Nashville number, return as is

  const [, accidental, degreeStr, rest] = match;
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

  // Determine if we should prefer flats based on the key
  const preferFlats = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(key);
  
  const root = getNoteFromIndex(keyIndex + semitones, preferFlats);
  
  return root + rest;
}

export function isNashville(chord: string): boolean {
  if (!chord || chord === '%' || chord === '/') return false;
  return /^([b#]?)([1-7])/.test(chord);
}

export function getPlayKey(targetKey: Key, capo: number): Key {
  const targetIndex = getNoteIndex(targetKey);
  if (targetIndex === -1) return targetKey;
  
  // Play Key = Target Key - Capo
  const playIndex = (targetIndex - (capo % 12) + 12) % 12;
  const preferFlats = shouldPreferFlats(targetKey);
  return getNoteFromIndex(playIndex, preferFlats) as Key;
}
