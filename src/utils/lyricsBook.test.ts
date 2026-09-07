import { describe, expect, it } from 'vitest';
import { paginateLyricsBook } from './lyricsBook';
import { formatLyricsForDisplay } from './lyricsDisplay';

describe('lyrics without punctuation', () => {
  it('removes punctuation without creating new line breaks', () => {
    expect(formatLyricsForDisplay('相片裡兒時的模樣，記錄著年少的時光，\n曾經在你我的心中。\n啊～').text).toBe('相片裡兒時的模樣 記錄著年少的時光\n曾經在你我的心中\n啊');
  });
  it('preserves existing spaces, blank lines and deliberate line breaks', () => {
    const source = '第一句  第二句\n\n  第三句\n';
    expect(formatLyricsForDisplay(source).text).toBe(source);
  });
  it('preserves English contractions and removes punctuation used for pauses', () => {
    expect(formatLyricsForDisplay("I'm here, I’m ready!\n（再一次）").text).toBe("I'm here I’m ready\n再一次");
  });
  it('maps a displayed continuation back to its original source range', () => {
    const source = '「第一句」，第二句。\n第三句！';
    const formatted = formatLyricsForDisplay(source);
    const start = formatted.text.indexOf('第二句');
    const end = start + '第二句\n'.length;
    expect(source.slice(0, formatted.offsets[start]) + '更新\n' + source.slice(formatted.offsets[end])).toBe('「第一句」，更新\n第三句！');
  });
});

describe('continuous gathering pagination', () => {
  it('lets the next song share the same column', () => {
    const pages = paginateLyricsBook([
      { id: 'song-a', rowCount: 2, lineHeight: 20, titleHeight: 20, headingHeight: 0 },
      { id: 'song-b', rowCount: 2, lineHeight: 20, titleHeight: 20, headingHeight: 0 },
    ], 160);
    expect(pages).toHaveLength(1);
    expect(pages[0].columns[0].map(fragment => fragment.blockId)).toEqual(['song-a', 'song-b']);
  });
  it('moves a song title and its first lyric together to the next column', () => {
    const pages = paginateLyricsBook([
      { id: 'a', rowCount: 4, lineHeight: 20, titleHeight: 0, headingHeight: 0 },
      { id: 'b', rowCount: 2, lineHeight: 20, titleHeight: 20, headingHeight: 0 },
    ], 100);
    expect(pages[0].columns[0].map(fragment => fragment.blockId)).toEqual(['a']);
    expect(pages[0].columns[1][0]).toMatchObject({ blockId: 'b', start: 0, continued: false });
  });
  it('flows through columns and pages without repeating song titles or losing rows', () => {
    const pages = paginateLyricsBook([{ id: 'long', rowCount: 20, lineHeight: 20, titleHeight: 20, headingHeight: 0 }], 100);
    const fragments = pages.flatMap(page => page.columns.flat());
    expect(pages).toHaveLength(3);
    expect(fragments.map(fragment => fragment.end - fragment.start)).toEqual([4, 5, 5, 5, 1]);
    expect(fragments.filter(fragment => !fragment.continued)).toHaveLength(1);
    expect(fragments.flatMap(fragment => Array.from({ length: fragment.end - fragment.start }, (_, i) => fragment.start + i))).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
  it('honors explicit new-page breaks without creating an initial blank page', () => {
    const pages = paginateLyricsBook(['a', 'b'].map(id => ({ id, rowCount: 1, lineHeight: 20, titleHeight: 20, headingHeight: 0, pageBreakBefore: true })), 100);
    expect(pages).toHaveLength(2);
    expect(pages.map(page => page.columns[0][0].blockId)).toEqual(['a', 'b']);
  });
});
