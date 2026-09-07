import { describe, expect, it } from 'vitest';
import { getLyricsLanguage, importLyrics, paginateLyrics, updateLyricsBlocks } from './lyricsDocument';

describe('lyrics document compatibility and pairing', () => {
  it('matches markers without shifting a chorus when a translation is missing', () => {
    const blocks = importLyrics('1. 主歌一\n\n2. 主歌二\n\n※ 副歌', '1. Verse one\n\n※ Chorus');
    expect(blocks.map(block => block.english)).toEqual(['Verse one', '', 'Chorus']);
    expect(blocks[1].needsPairingReview).toBe(true);
  });
  it('keeps unmatched English instead of losing text or making an incorrect pair', () => {
    const blocks = importLyrics('1. 中文', '※ English');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].english).toBe('');
    expect(blocks[1].english).toBe('English');
  });
  it('preserves repeated marked sections in occurrence order', () => {
    expect(importLyrics('※ 甲\n\n※ 乙', '※ A\n\n※ B').map(block => block.english)).toEqual(['A', 'B']);
  });
  it('flags unmarked positional pairs for review', () => {
    expect(importLyrics('中文', 'English')[0].needsPairingReview).toBe(true);
  });
  it('supports English-only documents without an empty Chinese column', () => {
    expect(getLyricsLanguage({ chinese: '', english: 'Only English' })).toBe('english');
    expect(importLyrics('', 'Only English')[0].english).toBe('Only English');
  });
  it('retains bilingual relationships and page breaks while keeping legacy bodies', () => {
    const blocks = importLyrics('1. 歌詞', '1. Lyrics');
    blocks[0].pageBreakBefore = true;
    const doc = updateLyricsBlocks({ chinese: '', fontSize: 20 }, blocks);
    expect(doc.chinese).toBe('[Verse 1]\n歌詞');
    expect(doc.english).toBe('[Verse 1]\nLyrics');
    expect(doc.blocks?.[0].pageBreakBefore).toBe(true);
    expect(doc.fontSize).toBe(20);
  });
});

describe('measured lyrics pagination', () => {
  it('keeps normal sections together, filling the left column before the right', () => {
    const pages = paginateLyrics([{ id: 'a', heights: [40, 40] }, { id: 'b', heights: [40, 40] }], 140, 2);
    expect(pages).toHaveLength(1);
    expect(pages[0].columns.map(column => column.map(fragment => fragment.blockId))).toEqual([['a'], ['b']]);
  });
  it('splits an oversized section without dropping or duplicating lines', () => {
    const pages = paginateLyrics([{ id: 'long', heights: Array(100).fill(30) }], 300, 2);
    const fragments = pages.flatMap(page => page.columns.flat());
    expect(pages.length).toBeGreaterThan(1);
    expect(fragments.flatMap(fragment => Array.from({ length: fragment.end - fragment.start }, (_, i) => fragment.start + i))).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });
  it('makes a manual break start a new page, not just the next column', () => {
    const pages = paginateLyrics([{ id: 'a', heights: [30] }, { id: 'b', heights: [30], pageBreakBefore: true }], 300, 2);
    expect(pages).toHaveLength(2);
    expect(pages[1].columns[0][0].blockId).toBe('b');
    expect(pages[0].columns[1]).toEqual([]);
  });
  it('does not introduce an empty first page for a leading break', () => {
    expect(paginateLyrics([{ id: 'a', heights: [30], pageBreakBefore: true }], 300, 2)).toHaveLength(1);
  });
});
