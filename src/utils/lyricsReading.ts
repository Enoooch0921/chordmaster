import type { LyricsBlock } from '../types';
import { getLyricsFields, getLyricsPairLayout, type LyricsLanguage } from './lyricsDocument';
import { formatLyricsForDisplay } from './lyricsDisplay';
import { pairLyricsLines, type LyricsField } from './lyricsPairing';
import { lyricsSectionLabel, sortLyricsSections } from './lyricsSections';

export interface ReadingLine { field: LyricsField; text: string; index: number }
export interface ReadingSection {
  id: string; label: string; pageBreakBefore?: boolean;
  paired: boolean; rows: ReadingLine[][];
}
export interface ReadingAnchor { blockId: string; line: number }
export interface MeasuredReadingSection { index: number; header: number; lines: number[]; pageBreakBefore?: boolean }
export interface ReadingSegment { section: number; start: number; end: number; continued: boolean }
export type ReadingPage = ReadingSegment[][];

/** Source sentences (or corresponding sentence pairs) are indivisible page units. */
export function prepareReadingSections(blocks: LyricsBlock[], language: LyricsLanguage): ReadingSection[] {
  return sortLyricsSections(blocks).map(block => {
    const fields = getLyricsFields(block, language);
    const text = { chinese: formatLyricsForDisplay(block.chinese).text, english: formatLyricsForDisplay(block.english).text };
    const layout = getLyricsPairLayout(block, language);
    const paired = language === 'bilingual' || language === 'mixed' || layout === 'sung';
    const rows = paired ? pairLyricsLines(text, {}, 1, layout, { language: block.singingLanguage, lines: block.singingLineLanguages }).map((pair, index) => {
      const sung = block.singingLineLanguages?.[index] ?? block.singingLanguage ?? 'chinese';
      const order: LyricsField[] = layout === 'mixed' && sung === 'chinese' ? ['chinese', 'english'] : ['english', 'chinese'];
      return order.flatMap(field => pair[field] ? [{ field, text: text[field].slice(pair[field]!.start, pair[field]!.end), index }] : []);
    }) : text[fields[0]].split('\n').map((line, index) => [{ field: fields[0], text: line, index }]);
    return { id: block.id, label: lyricsSectionLabel(block.marker), pageBreakBefore: block.pageBreakBefore, paired: layout === 'columns' && paired, rows };
  }).filter(section => section.rows.some(row => row.some(line => line.text.trim())));
}

/** Original whitespace is the only inferred phrase boundary; source characters stay intact. */
export function readingPhrases(text: string): string[] {
  const parts = text.match(/\s+|\S+/gu) ?? [];
  const words = parts.map((part, index) => /\S/u.test(part) ? index : -1).filter(index => index >= 0);
  const last = words.at(-1), previous = words.at(-2);
  if (last !== undefined && previous !== undefined) {
    const final = parts[last];
    // Keep a final English word with its predecessor, and never strand a
    // one-character phrase after a source space (e.g. a separate Chinese 上).
    if (Array.from(final).length === 1 || (/^[\p{Script=Latin}\p{N}'’–-]+$/u.test(final) && /^[\p{Script=Latin}\p{N}'’–-]+$/u.test(parts[previous]))) {
      parts.splice(previous, last - previous + 1, parts.slice(previous, last + 1).join(''));
    }
  }
  return parts;
}

const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export function readingPhraseTail(phrase: string): [string, string] {
  const segments = graphemes ? Array.from(graphemes.segment(phrase), part => part.segment) : Array.from(phrase);
  let start = segments.length, meaningful = 0;
  while (start > 0 && meaningful < 2) {
    start--;
    if (/[\p{L}\p{N}\p{M}\p{Extended_Pictographic}]/u.test(segments[start])) meaningful++;
  }
  return [segments.slice(0, start).join(''), segments.slice(start).join('')];
}

/** Bounded asymmetric layouts; ties favor the equal-width candidate. */
export function readingColumnCandidates(width: number, maxColumns: number, gap = 28): number[][] {
  const result: number[][] = [];
  for (let count = maxColumns; count >= 1; count--) {
    const ratios = count === 3 ? [[1, 1, 1], [36, 32, 32], [32, 36, 32], [32, 32, 36], [40, 30, 30], [30, 40, 30], [30, 30, 40]]
      : count === 2 ? [[1, 1], [52, 48], [48, 52], [55, 45], [45, 55], [60, 40], [40, 60]] : [[1]];
    const available = width - gap * (count - 1);
    for (const ratio of ratios) {
      const sum = ratio.reduce((a, b) => a + b, 0);
      const widths = ratio.map(value => Math.round(available * value / sum * 100) / 100);
      widths[widths.length - 1] = available - widths.slice(0, -1).reduce((a, b) => a + b, 0);
      result.push(widths);
    }
  }
  return result;
}

/** Keep source rows/pairs intact while using the actual metrics of each column. */
export function paginateReadingColumns(measurements: MeasuredReadingSection[][], height: number, gap = 16): ReadingPage[] {
  if (!measurements.length) return [[[]]];
  height = Math.max(1, height);
  const columns = measurements.length, pages: ReadingPage[] = [[[]]];
  let column = 0, used = 0;
  const current = () => pages.at(-1)![column];
  const nextColumn = () => {
    column++;
    if (column === columns) { pages.push([[]]); column = 0; }
    else pages.at(-1)!.push([]);
    used = 0;
  };
  const room = () => height - used - (current().length ? gap : 0);
  for (let index = 0; index < measurements[0].length; index++) {
    if (!measurements[0][index].lines.length) continue;
    if (measurements[0][index].pageBreakBefore && pages.some(page => page.some(col => col.length))) {
      pages.push([[]]); column = 0; used = 0;
    }
    let start = 0;
    while (start < measurements[0][index].lines.length) {
      let block = measurements[column][index];
      const full = block.header + block.lines.reduce((sum, value) => sum + value, 0);
      if (current().length && ((start === 0 && full <= height && full > room()) || room() < block.header + block.lines[start])) {
        nextColumn(); block = measurements[column][index];
      }
      let end = start, occupied = block.header;
      while (end < block.lines.length && occupied + block.lines[end] <= room()) occupied += block.lines[end++];
      // An exceptional source row taller than the viewport stays scrollable.
      if (end === start) occupied += block.lines[end++];
      used += (current().length ? gap : 0) + occupied;
      current().push({ section: block.index, start, end, continued: start > 0 });
      start = end;
      if (start < block.lines.length) nextColumn();
    }
  }
  return pages;
}

export function paginateReading(sections: MeasuredReadingSection[], height: number, columns: number, gap = 16): ReadingPage[] {
  return paginateReadingColumns(Array.from({ length: Math.max(1, Math.floor(columns)) }, () => sections), height, gap);
}
