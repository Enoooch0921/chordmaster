import type { Song } from '../types';

export const PERFORMANCE_CACHE_ENTRY_LIMIT = 8;
export const PERFORMANCE_CACHE_BAR_LIMIT = 512;

type Entry = { item: { id: string }; song: Pick<Song, 'sections'> };

/** Prepare the upcoming set, rather than stopping two songs ahead. Bound the
 * retained DOM by both entries and score size; always keep the active song and
 * its immediate neighbors, even when a single unusually long chart exceeds the
 * optional lookahead budget. */
export function getPerformanceCacheIds(entries: readonly Entry[], currentId: string): string[] {
  const index = entries.findIndex(entry => entry.item.id === currentId);
  if (index < 0) return [];
  const priority = [index, index + 1, index - 1];
  for (let i = index + 2; i < entries.length; i++) priority.push(i);
  for (let i = index - 2; i >= 0; i--) priority.push(i);
  const result: string[] = [];
  let bars = 0;
  for (const i of priority) {
    const entry = entries[i];
    if (!entry) continue;
    const cost = entry.song.sections.reduce((sum, section) => sum + section.bars.length, 0);
    if (Math.abs(i - index) > 1
      && (result.length >= PERFORMANCE_CACHE_ENTRY_LIMIT || bars + cost > PERFORMANCE_CACHE_BAR_LIMIT)) continue;
    result.push(entry.item.id);
    bars += cost;
  }
  return result;
}
