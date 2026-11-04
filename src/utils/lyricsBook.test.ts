import { describe, expect, it } from 'vitest';
import { paginateLyricsBook, type MeasuredBookBlock } from './lyricsBook';
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

describe('readable gathering pagination', () => {
  const block = (id: string, songId: string, lines: number, titleHeight = 0): MeasuredBookBlock => ({
    id, songId, rowCount: lines, lineHeight: 20, titleHeight, headingHeight: 10,
  });
  const paginate = (blocks: MeasuredBookBlock[], columns = 2) => paginateLyricsBook(blocks, 200, columns, 'readable');

  it('moves a complete song to the next column instead of separating its chorus', () => {
    const pages = paginate([block('previous', 'a', 4, 20), block('verse', 'b', 2, 20), block('chorus', 'b', 3)]);
    expect(pages).toHaveLength(1);
    expect(pages[0].columns.map(column => column.map(fragment => fragment.blockId))).toEqual([['previous'], ['verse', 'chorus']]);
  });

  it('keeps short songs together in the same column when there is room', () => {
    const pages = paginate([block('a', 'a', 2, 20), block('b', 'b', 2, 20)]);
    expect(pages[0].columns[0].map(fragment => fragment.blockId)).toEqual(['a', 'b']);
  });

  it('reserves a new page when a long song fits there but not in the remaining columns', () => {
    const pages = paginate([block('previous', 'a', 5, 20), block('verse', 'b', 6, 20), block('chorus', 'b', 6)]);
    expect(pages).toHaveLength(2);
    expect(pages[0].columns.map(column => column.map(fragment => fragment.blockId))).toEqual([['previous'], []]);
    expect(pages[1].columns.map(column => column.map(fragment => fragment.blockId))).toEqual([['verse'], ['chorus']]);
  });

  it('uses both columns of the current page if the complete song can stay there', () => {
    const pages = paginate([block('previous', 'a', 1, 20), block('verse', 'b', 4, 20), block('chorus', 'b', 5)]);
    expect(pages).toHaveLength(1);
    expect(pages[0].columns.map(column => column.map(fragment => fragment.blockId))).toEqual([['previous', 'verse'], ['chorus']]);
    expect(pages[0].columns.flat().every(fragment => !fragment.continued)).toBe(true);
  });

  it('keeps a nearly full-column section whole when the song continues', () => {
    const pages = paginate([block('previous', 'a', 1), block('verse', 'b', 5, 20), block('chorus', 'b', 9)]);
    // The song reminder uses the top margin so this 190px section stays whole.
    const chorus = pages.flatMap(page => page.columns.flat()).filter(fragment => fragment.blockId === 'chorus');
    expect(chorus.map(fragment => [fragment.start, fragment.end])).toEqual([[0, 9]]);
  });

  it('honors explicit section page breaks, even within a short song', () => {
    const pages = paginate([{ ...block('verse', 'a', 2, 20), pageBreakBefore: true }, { ...block('chorus', 'a', 2), pageBreakBefore: true }]);
    expect(pages).toHaveLength(2);
    expect(pages.map(page => page.columns[0][0].blockId)).toEqual(['verse', 'chorus']);
  });

  it('keeps measured bilingual sections whole, including wrapped sentence pairs', () => {
    const pages = paginate([block('previous', 'a', 3), { ...block('paired', 'b', 2, 20), heights: [70, 80] }], 1);
    expect(pages).toHaveLength(2);
    expect(pages[1].columns[0]).toEqual([{ blockId: 'paired', start: 0, end: 2, continued: false }]);
  });

  it('preserves every row in an exceptionally tall section without adding a blank first page', () => {
    const pages = paginate([block('long', 'a', 30, 20)]);
    const fragments = pages.flatMap(page => page.columns.flat());
    expect(pages[0].columns[0]).not.toHaveLength(0);
    expect(fragments.flatMap(fragment => Array.from({ length: fragment.end - fragment.start }, (_, i) => fragment.start + i))).toEqual(Array.from({ length: 30 }, (_, i) => i));
    expect(fragments.filter(fragment => !fragment.continued)).toHaveLength(1);
  });

  it('treats repeated setlist entries as separate song occurrences', () => {
    const pages = paginate([block('first-verse', 'entry-1', 3, 20), block('repeat-verse', 'entry-2', 2, 20), block('repeat-chorus', 'entry-2', 3)]);
    expect(pages[0].columns.map(column => column.map(fragment => fragment.blockId))).toEqual([['first-verse'], ['repeat-verse', 'repeat-chorus']]);
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
