import type { LyricsFragment, LyricsLanguage, LyricsPage } from './lyricsDocument';

export interface MeasuredBookBlock {
  id: string;
  songId?: string;
  rowCount: number;
  lineHeight: number;
  // Bilingual rows contain one source sentence pair, possibly several wraps.
  heights?: number[];
  headingHeight: number;
  // The gathering and song titles belong only to the first fragment.
  titleHeight: number;
  pageBreakBefore?: boolean;
}

/** A gathering is one continuous two-column document. Song boundaries do not
 * consume a new page; titles always travel with their first line of lyrics. */
export type LyricsBookLayout = 'readable' | 'compact';

export function paginateLyricsBook(blocks: MeasuredBookBlock[], capacity: number, columns = 2, layout: LyricsBookLayout = 'compact'): LyricsPage[] {
  if (layout === 'readable') return paginateReadableBook(blocks, capacity, columns);
  const pages: LyricsPage[] = [{ columns: Array.from({ length: columns }, () => []) }];
  let column = 0;
  let used = 0;
  const advance = (newPage = false) => {
    if (newPage || column === columns - 1) {
      pages.push({ columns: Array.from({ length: columns }, () => []) });
      column = 0;
    } else column++;
    used = 0;
  };
  for (const block of blocks) {
    if (block.pageBreakBefore && (used || column)) advance(true);
    let start = 0;
    while (start < block.rowCount) {
      const overhead = block.headingHeight + (start === 0 ? block.titleHeight : 0);
      const heightAt = (index: number) => block.heights?.[index] ?? block.lineHeight;
      if (used && capacity - used < overhead + heightAt(start)) advance();
      let end = start;
      let height = overhead;
      while (end < block.rowCount && used + height + heightAt(end) <= capacity) {
        height += heightAt(end++);
      }
      // An exceptionally tall pair gets a growing page, not a split translation.
      if (end === start) height += heightAt(end++);
      const fragment: LyricsFragment = { blockId: block.id, start, end, continued: start > 0 };
      pages[pages.length - 1].columns[column].push(fragment);
      used += height;
      start = end;
      if (start < block.rowCount) advance();
    }
  }
  return pages;
}

/** Keep a song in one column when possible; otherwise reserve enough of a
 * page for its complete sections. Only a section taller than an empty column
 * may split. Explicit page breaks always take precedence. */
function paginateReadableBook(blocks: MeasuredBookBlock[], capacity: number, columns: number): LyricsPage[] {
  const pages: LyricsPage[] = [{ columns: Array.from({ length: columns }, () => []) }];
  let column = 0;
  let used = 0;
  const advance = (newPage = false) => {
    if (newPage || column + 1 >= columns) {
      pages.push({ columns: Array.from({ length: columns }, () => []) });
      column = 0;
    } else column++;
    used = 0;
  };
  const rowHeight = (block: MeasuredBookBlock, index: number) => block.heights?.[index] ?? block.lineHeight;
  const bodyHeight = (block: MeasuredBookBlock) => Array.from({ length: block.rowCount }, (_, index) => rowHeight(block, index)).reduce((sum, height) => sum + height, 0);
  const groups: MeasuredBookBlock[][] = [];
  for (const block of blocks) {
    const previous = groups[groups.length - 1];
    if (previous && block.songId && previous[0].songId === block.songId) previous.push(block);
    else groups.push([block]);
  }
  // Song reminders live in the page's top margin and do not consume lyric space.
  const fits = (group: MeasuredBookBlock[], initialUsed: number, availableColumns: number) => {
    let height = initialUsed;
    let remaining = availableColumns;
    for (let index = 0; index < group.length; index++) {
      const block = group[index];
      if (index > 0 && block.pageBreakBefore) return false;
      const total = bodyHeight(block) + block.headingHeight + block.titleHeight;
      if (height + total > capacity) {
        if (!height || --remaining <= 0) return false;
        height = 0;
      }
      if (total > capacity) return false;
      height += total;
    }
    return true;
  };
  for (const group of groups) {
    if (group[0].pageBreakBefore && (used || column)) advance(true);
    if (used && fits(group, 0, 1) && !fits(group, used, 1)) advance();
    else if ((used || column) && !fits(group, used, columns - column) && fits(group, 0, columns)) advance(true);

    for (let index = 0; index < group.length; index++) {
      const block = group[index];
      if (block.pageBreakBefore && (used || column)) advance(true);
      const total = bodyHeight(block) + block.headingHeight + block.titleHeight;
      if (used && used + total > capacity) advance();
      let start = 0;
      while (start < block.rowCount) {
        const overhead = block.headingHeight + (start === 0 ? block.titleHeight : 0);
        let end = start;
        let height = overhead;
        while (end < block.rowCount && used + height + rowHeight(block, end) <= capacity) height += rowHeight(block, end++);
        // Never drop an oversized bilingual row or get stuck retrying it.
        if (end === start) height += rowHeight(block, end++);
        pages[pages.length - 1].columns[column].push({ blockId: block.id, start, end, continued: start > 0 });
        used += height;
        start = end;
        if (start < block.rowCount) advance();
      }
    }
  }
  return pages;
}

export interface LyricsBookSettings {
  fontSize: number;
  lineHeight: number;
  font: 'kaiti' | 'sans';
  language: LyricsLanguage;
  layout?: LyricsBookLayout;
}
export const DEFAULT_LYRICS_BOOK_SETTINGS: LyricsBookSettings = {
  fontSize: 16 * 4 / 3,
  lineHeight: 30 / 16,
  font: 'kaiti',
  language: 'chinese',
  layout: 'readable',
};
export const LYRICS_BOOK_FONT = '"Aptos", "KaiTi", "Kaiti TC", "BiauKai", "DFKai-SB", serif';
