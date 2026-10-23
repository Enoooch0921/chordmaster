import type { Bar, ChordPassVariant, Key } from '../types';
import { normalizeBarChords } from './barUtils';
import { getChordEvents, normalizeChordSubdivisions, transposeChordSubdivisions } from './chordSubdivisions';
import { isNashville, transposeChord } from './musicUtils';

export function normalizeChordPassVariants(value: unknown): ChordPassVariant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const passes = new Set<number>();
  const variants: ChordPassVariant[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<ChordPassVariant>;
    if (!Number.isInteger(entry.pass) || entry.pass! < 2 || passes.has(entry.pass!)) continue;
    if (!Array.isArray(entry.chords) || !entry.chords.every(chord => typeof chord === 'string')) continue;
    passes.add(entry.pass!);
    const chordSubdivisions = normalizeChordSubdivisions(entry.chordSubdivisions);
    variants.push({
      pass: entry.pass!,
      chords: normalizeBarChords(entry.chords),
      ...(chordSubdivisions ? { chordSubdivisions } : {})
    });
  }
  return variants.length ? variants.sort((a, b) => a.pass - b.pass) : undefined;
}

/** Resolve only the harmony. Never infer a repeat route or duplicate a measure. */
export function selectChordPass(bar: Bar, pass: number): Bar {
  if (!Number.isInteger(pass) || pass < 2) return bar;
  const variant = bar.chordPassVariants?.find(entry => entry.pass === pass);
  return variant ? { ...bar, chords: variant.chords, chordMarks: undefined, chordSubdivisions: variant.chordSubdivisions } : bar;
}

export function getChordPassEvents(bar: Bar, beats: number, pass: number) {
  return getChordEvents(selectChordPass(bar, pass), beats);
}

export function transposeChordPassVariants(variants: Bar['chordPassVariants'], offset: number, toKey: Key, fromKey: Key): Bar['chordPassVariants'] {
  return variants?.map(variant => ({
    ...variant,
    chords: variant.chords.map(chord => isNashville(chord.trim()) ? chord : transposeChord(chord, offset, toKey, false, fromKey)),
    ...(variant.chordSubdivisions ? { chordSubdivisions: transposeChordSubdivisions(variant.chordSubdivisions, offset, toKey, fromKey) } : {})
  }));
}
