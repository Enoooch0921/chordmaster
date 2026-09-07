import type { LyricsFragment, LyricsPage } from './lyricsDocument';

export interface MeasuredBookBlock {
  id: string;
  rowCount: number;
  lineHeight: number;
  headingHeight: number;
  // The gathering and song titles belong only to the first fragment.
  titleHeight: number;
  pageBreakBefore?: boolean;
}

/** A gathering is one continuous two-column document. Song boundaries do not
 * consume a new page; titles always travel with their first line of lyrics. */
export function paginateLyricsBook(blocks: MeasuredBookBlock[], capacity: number, columns = 2): LyricsPage[] {
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
      if (used && capacity - used < overhead + block.lineHeight) advance();
      const available = Math.max(1, Math.floor((capacity - used - overhead) / block.lineHeight));
      const end = Math.min(block.rowCount, start + available);
      const fragment: LyricsFragment = { blockId: block.id, start, end, continued: start > 0 };
      pages[pages.length - 1].columns[column].push(fragment);
      used += overhead + (end - start) * block.lineHeight;
      start = end;
      if (start < block.rowCount) advance();
    }
  }
  return pages;
}

export interface LyricsBookSettings {
  fontSize: number;
  lineHeight: number;
  font: 'kaiti' | 'sans';
  language: 'chinese' | 'english' | 'bilingual';
}
export const DEFAULT_LYRICS_BOOK_SETTINGS: LyricsBookSettings = {
  fontSize: 16 * 4 / 3,
  lineHeight: 30 / 16,
  font: 'kaiti',
  language: 'chinese',
};
export const LYRICS_BOOK_FONT = '"Aptos", "KaiTi", "Kaiti TC", "BiauKai", "DFKai-SB", serif';
