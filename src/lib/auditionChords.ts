import type { Key } from '../types';
import { getParenthesizedChordInner, isNashville, normalizeChordQualityAliases } from '../utils/musicUtils';
import { convertStoredChordToDisplayedChord } from './songEditing';

// Each entry describes the tones above the root. Extensions keep their upper register.
const qualities: Record<string, number[]> = {
  '': [0, 4, 7], maj: [0, 4, 7], m: [0, 3, 7], '5': [0, 7],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
  sus: [0, 5, 7], sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus': [0, 5, 7, 10],
  '7sus4': [0, 5, 7, 10], '7sus2': [0, 2, 7, 10],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '6/9': [0, 4, 7, 9, 14],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], mMaj7: [0, 3, 7, 11],
  '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14],
  '11': [0, 4, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 21], m13: [0, 3, 7, 10, 14, 21],
  add2: [0, 2, 4, 7], add4: [0, 4, 5, 7], add9: [0, 4, 7, 14], add11: [0, 4, 7, 17],
  '7b5': [0, 4, 6, 10], '7#5': [0, 4, 8, 10], '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15], '7#11': [0, 4, 7, 10, 18], '7b13': [0, 4, 7, 10, 20],
  alt: [0, 4, 8, 10, 13], '7alt': [0, 4, 8, 10, 13],
};

function pitchClass(note: string) {
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[note[0]];
  return (natural + (note[1] === '#' ? 1 : note[1] === 'b' ? -1 : 0) + 12) % 12;
}

export type Harmony = { notes: number[] } | { issue: 'key' | 'unsupported'; token: string };
export function resolveAuditionChord(token: string, storedKey: Key, concertKey: Key, unknownKey: boolean): Harmony {
  const cleaned = token.trim().replace(/[<>^~]+$/, '');
  const inner = getParenthesizedChordInner(cleaned) ?? cleaned;
  const normalized = normalizeChordQualityAliases(inner.replace(/[<>^~]+$/, '').replace(/\s*\/\s*/g, '/'))
    .replaceAll('♭', 'b').replaceAll('♯', '#');
  // A standalone slash bass changes the left hand under the preceding harmony.
  if (/^\/(?:[A-G][#b]?|[#b]?[1-7][#b]?)$/.test(normalized)) {
    const bass = resolveAuditionChord(normalized.slice(1), storedKey, concertKey, unknownKey);
    return 'notes' in bass ? { notes: [bass.notes[0]] } : bass;
  }
  // Split only a *note* after the final slash, leaving the 6/9 quality intact.
  const match = /^([A-G][b#]?|[b#]?[1-7][b#]?)([^/]*(?:\/9)?)(?:\/([A-G][b#]?|[b#]?[1-7][b#]?))?$/.exec(normalized);
  if (!match) return { issue: 'unsupported', token };
  const [, rootSymbol, suffix, bassSymbol] = match;
  if (unknownKey && (isNashville(rootSymbol) || isNashville(bassSymbol ?? ''))) return { issue: 'key', token };
  const concertNote = (symbol: string) => convertStoredChordToDisplayedChord({
    chord: symbol, storageMode: isNashville(symbol) ? 'nashville' : 'letters',
    outputMode: 'letters', storedKey, displayedKey: concertKey
  });
  const quality = suffix.trim().replace(/\(([^()]+)\)$/, '$1').replace(/^2$/, 'add2')
    .replace(/^(?:ø7?|Ø7?)$/, 'm7b5').replace(/^°/, 'dim').replace(/^\+/, 'aug')
    .replace(/^[△Δ](7|9)?$/, (_, extension) => 'maj' + (extension ?? '7'))
    .replace(/^M(?=7|9)/, 'maj').replace(/^min/, 'm').replace(/^mmaj/, 'mMaj');
  if (!Object.hasOwn(qualities, quality)) return { issue: 'unsupported', token };
  const root = pitchClass(concertNote(rootSymbol));
  // F#2..F3 keeps G → B → C ascending, the right hand stays above the bass.
  const bass = 42 + (pitchClass(concertNote(bassSymbol ?? rootSymbol)) + 6) % 12;
  const upper = 54 + (root + 6) % 12;
  return { notes: [bass, ...qualities[quality].map(interval => upper + interval)] };
}
