import type { Bar, Key } from '../types';
import { isNashville, transposeChord } from './musicUtils';

/** Ordered source lines without any inferred duration or attack time. Empty [] retains the block type. */
export function normalizeUnmeteredChordLines(value: unknown): string[][] | undefined {
  if (!Array.isArray(value) || !value.every(line => Array.isArray(line) && line.every(chord => typeof chord === 'string'))) return undefined;
  return value.map(line => line.map(chord => chord.trim()).filter(Boolean)).filter(line => line.length);
}
export const hasUnmeteredChords = (bar?: Bar | null) => Array.isArray(bar?.unmeteredChordLines);
export const parseUnmeteredChordText = (text: string) => text.split(/\r?\n/).map(line => line.trim().split(/\s+/).filter(Boolean)).filter(line => line.length);
export const unmeteredChordText = (lines: string[][]) => lines.map(line => line.join(' ')).join('\n');
export function transposeUnmeteredChordLines(lines: Bar['unmeteredChordLines'], offset: number, toKey: Key, fromKey: Key) {
  return lines?.map(line => line.map(chord => isNashville(chord.trim()) ? chord : transposeChord(chord, offset, toKey, false, fromKey)));
}
