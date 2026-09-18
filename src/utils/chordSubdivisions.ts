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
    if (!Number.isInteger(entry.beat) || entry.beat < 0 || entry.beat >= 32 || !offset || !canOffsetChord(chord) || /[<>\s]/.test(chord)) continue;
    const position = entry.beat + offset;
    if (seen.has(position)) continue;
    seen.add(position);
    result.push({ beat: entry.beat, offset, chord });
  }
  return result.length ? result.sort((a,b) => a.beat+a.offset-b.beat-b.offset) : undefined;
}

export function getChordEvents(bar: Bar, beats: number) {
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
