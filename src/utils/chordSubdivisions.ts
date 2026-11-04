import { hasUnmeteredChords } from './unmeteredChords';
import type { Bar, ChordSubdivision, Key } from '../types';
import { getChordDisplaySlotEntries, getChordDisplaySlotOwnership } from './chordSlots';
import { canOffsetChord, getChordBeatOffset, normalizeChordBeatOffset, chordBeatPositionLabel } from './chordBeatOffsets';
import { isNashville, transposeChord } from './musicUtils';

export function normalizeChordSubdivisions(value: unknown): ChordSubdivision[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<number>();
  const result: ChordSubdivision[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const offset = normalizeChordBeatOffset(entry.offset);
    const chord = typeof entry.chord === 'string' ? entry.chord.trim() : '';
    const eighthRest = chord === '0_' && offset === 0.5;
    if (!Number.isInteger(entry.beat) || entry.beat < 0 || entry.beat >= 32 || !offset || (!eighthRest && !canOffsetChord(chord)) || /[<>\s]/.test(chord)) continue;
    const position = entry.beat + offset;
    if (seen.has(position)) continue;
    seen.add(position);
    result.push({ beat: entry.beat, offset, chord });
  }
  return result.length ? result.sort((a,b) => a.beat+a.offset-b.beat-b.offset) : undefined;
}

export function getChordEvents(bar: Bar, beats: number) {
  if (hasUnmeteredChords(bar) || bar.chordTimingUnspecified) return [];
  const primary = getChordDisplaySlotOwnership(bar.chords, beats).flatMap((entry, beat) => {
    if (!entry || entry.covered) return [];
    const offset = getChordBeatOffset(bar, entry.rawIndex) ?? 0;
    return [{ beat, offset, chord: entry.chord, rawIndex: entry.rawIndex, subdivisionIndex: null as number | null }];
  });
  const extra = (bar.chordSubdivisions ?? []).map((entry, subdivisionIndex) => ({ ...entry, rawIndex: null as number | null, subdivisionIndex }));
  return [...primary, ...extra].sort((a,b) => a.beat+a.offset-b.beat-b.offset);
}

export const chordEventLabel = (beat: number, offset: number) => chordBeatPositionLabel(beat, offset);

export function availableSubdivisionPositions(bar: Bar, beats: number, ignoredIndex?: number) {
  if (bar.chordTimingUnspecified || hasUnmeteredChords(bar)) return [];
  const occupied = new Set(getChordEvents(bar, beats).filter(e => e.subdivisionIndex !== ignoredIndex).map(e => e.beat+e.offset));
  const ownership = getChordDisplaySlotOwnership(bar.chords, beats);
  return Array.from({length:beats},(_,beat) => ([.25,.5,.75] as const).flatMap(offset => {
    const token = ownership[beat]?.chord.trim();
    return occupied.has(beat+offset) || (token && /^(?:0|%|\|)/.test(token)) ? [] : [{beat,offset}];
  })).flat();
}

/** Chord rests / repeat symbols replace all harmony in their covered beats. */
export function reconcileChordSubdivisions(bar: Bar, beats: number) {
  const ownership = getChordDisplaySlotOwnership(bar.chords, beats);
  const entries = getChordDisplaySlotEntries(bar.chords, beats);
  const next = bar.chordSubdivisions?.filter(e => {
    const token = ownership[e.beat]?.chord.trim();
    const primary = entries[e.beat];
    return !(token && /^(?:0|%|\|)/.test(token))
      && !(primary && getChordBeatOffset(bar,primary.rawIndex) === e.offset);
  });
  return next?.length ? next : undefined;
}

export function transposeChordSubdivisions(value: Bar['chordSubdivisions'], offset: number, toKey: Key, fromKey: Key) {
  return value?.map(e => ({...e, chord: isNashville(e.chord) ? e.chord : transposeChord(e.chord,offset,toKey,false,fromKey)}));
}

/** Read letter roots case-insensitively, consuming quality words and slash basses first.
 * A lowercase b immediately after a root remains a flat (gbm = Gbm).
 * Nashville digits are deliberately excluded: their extensions are ambiguous.
 */
export function splitDirectChordRun(value: string, includeSingle = false): string[] | null {
  let rest = value.trim();
  const chords: string[] = [];
  const readRoot = () => {
    const match = rest.match(/^([A-Ga-g])([#b]?)/);
    if (!match) return null;
    rest = rest.slice(match[0].length);
    return match[1].toUpperCase() + match[2];
  };
  const readQuality = () => {
    let quality = '';
    while (rest) {
      // Partial words support live typing of add/dim/maj without corrupting roots.
      const word = rest.match(/^(maj|min|dim|aug|add|sus|ma$|mi$|di$|au$|ad$|su$)/i);
      const token = word ?? rest.match(/^(?:m|M|[0-9]+|[#b][0-9]+|[()+°øΔ△^~><-])/);
      if (!token) break;
      quality += word ? token[0].toLowerCase() : token[0];
      rest = rest.slice(token[0].length);
    }
    return quality;
  };
  while (rest) {
    const root = readRoot();
    if (!root) return null;
    let chord = root + readQuality();
    if (rest.startsWith('/')) {
      rest = rest.slice(1);
      const bass = readRoot();
      if (bass) chord += '/' + bass + readQuality();
      else {
        const extension = rest.match(/^\d+/);
        if (!extension) return null;
        chord += '/' + extension[0];
        rest = rest.slice(extension[0].length);
      }
    }
    chords.push(chord);
    rest = rest.trimStart();
  }
  return chords.length > 1 || (includeSingle && chords.length === 1) ? chords : null;
}
