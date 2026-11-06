import type { LyricsBlock, LyricsDoc } from '../types';
import { parseLyricsBody, type LyricSection } from './lyricsFormat';
import { lyricsSectionLabel } from './lyricsSections';

export type LyricsLanguage = 'chinese' | 'english' | 'bilingual' | 'mixed';
export type LyricsField = 'chinese' | 'english';
export const hasSungLineLanguages = (block: LyricsBlock) => Array.isArray(block.singingLineLanguages) && block.singingLineLanguages.some(field => field === 'chinese' || field === 'english');
export const getLyricsPairLayout = (block: LyricsBlock, display: LyricsLanguage) => display === 'mixed' ? 'mixed' : display === 'chinese' && hasSungLineLanguages(block) ? 'sung' : 'columns';

// The main (legacy "chinese") view follows explicit performance instructions.
// Never infer the sung language from an empty translation or an English title.
export function getLyricsFields(block: LyricsBlock, display: LyricsLanguage): LyricsField[] {
  if (display === 'bilingual' || display === 'mixed' || (display === 'chinese' && hasSungLineLanguages(block))) return ['english', 'chinese'];
  const sung = block.singingLanguage;
  if (display === 'chinese' && (sung === 'chinese' || sung === 'english') && block[sung].trim()) return [sung];
  return [display];
}

export function mainLyricsLabel(blocks: LyricsBlock[], language: 'zh' | 'en'): string {
  return blocks.some(block => (block.singingLanguage === 'english' || (hasSungLineLanguages(block) && block.singingLineLanguages!.includes('english'))) && block.english.trim())
    ? (language === 'zh' ? '原稿唱詞' : 'Sung lyrics')
    : (language === 'zh' ? '中文' : 'Chinese');
}
export const newLyricsBlock = (): LyricsBlock => ({ id: crypto.randomUUID(), marker: '', chinese: '', english: '' });
const markerKey = (section: LyricSection) => lyricsSectionLabel(section.marker);

// Match explicit section labels first. Unmatched translations remain independent
// instead of silently shifting every following verse/chorus by one position.
export function importLyrics(chinese: string, english = '', previous: LyricsBlock[] = []): LyricsBlock[] {
  const zh = parseLyricsBody(chinese);
  const en = parseLyricsBody(english);
  const used = new Set<number>();
  const bilingual = zh.length > 0 && en.length > 0;
  const blocks = zh.map((section, index) => {
    const key = markerKey(section);
    let match = key ? en.findIndex((candidate, i) => !used.has(i) && markerKey(candidate) === key) : -1;
    if (!key && zh.length === en.length && !en[index]?.marker && !used.has(index)) match = index;
    if (match >= 0) used.add(match);
    return {
      id: `legacy-zh-${index}`, marker: section.marker, chinese: section.lines.join('\n'),
      english: match >= 0 ? en[match].lines.join('\n') : '',
      needsPairingReview: bilingual && (match < 0 || !key),
    };
  });
  en.forEach((section, index) => {
    if (!used.has(index)) blocks.push({
      id: `legacy-en-${index}`, marker: section.marker, chinese: '', english: section.lines.join('\n'),
      needsPairingReview: bilingual,
    });
  });
  return blocks.map(block => {
    const key = lyricsSectionLabel(block.marker);
    const matches = previous.filter(candidate => lyricsSectionLabel(candidate.marker) === key);
    // Retain source instructions only for an unambiguous existing section.
    // A paste with repeated/removed headings must not transfer instructions to another verse.
    const prior = key && matches.length === 1 && blocks.filter(candidate => lyricsSectionLabel(candidate.marker) === key).length === 1 ? matches[0] : undefined;
    const sung = prior?.singingLanguage;
    return prior ? { ...block, id: prior.id, pageBreakBefore: prior.pageBreakBefore,
      singingLanguage: (sung === 'chinese' || sung === 'english') && block[sung].trim() ? sung : undefined,
      singingLineLanguages: prior.singingLineLanguages,
    } : previous.length ? { ...block, id: crypto.randomUUID() } : block;
  });
}

export function getLyricsBlocks(doc?: LyricsDoc): LyricsBlock[] {
  return doc?.blocks ?? importLyrics(doc?.chinese ?? '', doc?.english ?? '');
}

// Keep the legacy bodies populated for existing sharing/import clients.
export function updateLyricsBlocks(doc: LyricsDoc | undefined, blocks: LyricsBlock[]): LyricsDoc {
  const serialize = (field: 'chinese' | 'english') => blocks
    .filter(block => block[field].trim())
    .map(block => `${block.marker ? `[${lyricsSectionLabel(block.marker)}]\n` : ''}${block[field]}`).join('\n\n');
  return { ...doc, blocks, chinese: serialize('chinese'), english: serialize('english') };
}

export function getLyricsLanguage(doc?: LyricsDoc): LyricsLanguage {
  return doc?.displayLanguage ?? (doc?.english?.trim() ? (doc.chinese?.trim() ? 'bilingual' : 'english') : 'chinese');
}

export interface LyricsFragment {
  blockId: string;
  start: number;
  end: number;
  continued: boolean;
}
export interface LyricsPage { columns: LyricsFragment[][] }
export interface MeasuredLyricsBlock { id: string; heights: number[]; pageBreakBefore?: boolean; headingHeight?: number }

// Heights are measured from actual wrapped lines in the browser. Oversized
// sections continue on the next column/page; ordinary sections stay together.
export function paginateLyrics(blocks: MeasuredLyricsBlock[], capacity: number, columns: number): LyricsPage[] {
  const pages: LyricsPage[] = [{ columns: Array.from({ length: columns }, () => []) }];
  let column = 0;
  let used = 0;
  const next = (page = false) => {
    if (page || column + 1 >= columns) {
      pages.push({ columns: Array.from({ length: columns }, () => []) });
      column = 0;
    } else column += 1;
    used = 0;
  };
  for (const block of blocks) {
    const overhead = 16 + (block.headingHeight ?? 0);
    if (block.pageBreakBefore && (used > 0 || column > 0)) next(true);
    const total = block.heights.reduce((sum, height) => sum + height, 0) + overhead;
    if (used > 0 && total <= capacity && used + total > capacity) next();
    let start = 0;
    while (start < block.heights.length) {
      if (used > 0 && used + block.heights[start] + overhead > capacity) next();
      let end = start;
      let height = overhead;
      while (end < block.heights.length && used + height + block.heights[end] <= capacity) {
        height += block.heights[end++];
      }
      // A single extraordinary line still renders in a growing page, never hidden.
      if (end === start) height += block.heights[end++];
      pages[pages.length - 1].columns[column].push({ blockId: block.id, start, end, continued: start > 0 });
      used += height;
      start = end;
      if (start < block.heights.length) next();
    }
  }
  return pages;
}
