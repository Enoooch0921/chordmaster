import type { LyricsTextRow } from './lyricsMeasurement';

export type LyricsField = 'english' | 'chinese';
export interface LyricsSourceLine { start: number; end: number }
export interface LyricsLinePair {
  english?: LyricsSourceLine;
  chinese?: LyricsSourceLine;
  height: number;
}

/** Replace the complete raw sentence, including hidden display punctuation.
 * Keeping separators separate preserves every untouched source line verbatim. */
export function replaceLyricsLine(source: string, index: number, value: string): string {
  const parts = source.split(/(\r\n|\r|\n)/);
  if (index < 0 || index * 2 >= parts.length) return source;
  parts[index * 2] = value.replace(/\r\n?/g, '\n');
  return parts.join('');
}

/** Hard breaks identify corresponding sentences. Browser wraps only increase
 * their shared height; they must never become extra translation rows. */
export function pairLyricsLines(
  text: Record<LyricsField, string>,
  measured: Partial<Record<LyricsField, LyricsTextRow[]>> = {},
  lineHeight = 1,
  layout: 'columns' | 'mixed' = 'columns',
): LyricsLinePair[] {
  if (layout === 'mixed' && !text.chinese && !text.english) {
    return [{ chinese: { start: 0, end: 0 }, height: lineHeight }];
  }
  const pairs: LyricsLinePair[] = [];
  for (const field of ['english', 'chinese'] as const) {
    // A missing translation takes no extra row in the mixed view. Deliberate
    // empty lines inside an existing translation still keep their source index.
    if (layout === 'mixed' && text[field] === '') continue;
    let offset = 0;
    let visualIndex = 0;
    const visualRows = measured[field] ?? [];
    text[field].split('\n').forEach((line, index) => {
      const end = offset + line.length;
      let height = 0;
      while (visualIndex < visualRows.length && visualRows[visualIndex].start <= end) {
        height += visualRows[visualIndex++].height;
      }
      const pair = pairs[index] ?? { height: layout === 'mixed' ? 0 : lineHeight };
      pair[field] = { start: offset, end };
      pair.height = layout === 'mixed'
        ? pair.height + Math.max(lineHeight, height)
        : Math.max(pair.height, height);
      pairs[index] = pair;
      offset = end + 1;
    });
  }
  return pairs;
}
