import { describe, expect, it } from 'vitest';
import { pairLyricsLines, replaceLyricsLine } from './lyricsPairing';
import { paginateLyrics } from './lyricsDocument';
import { paginateLyricsBook } from './lyricsBook';

describe('bilingual source-line pairing', () => {
  it('adds both wrapped language heights in mixed view and keeps absent translations compact', () => {
    const pairs = pairLyricsLines({ chinese: '中文\n下一句', english: 'Long English\nNext' }, {
      chinese: [{ start: 0, end: 3, height: 20 }, { start: 3, end: 6, height: 20 }],
      english: [{ start: 0, end: 5, height: 20 }, { start: 5, end: 13, height: 20 }, { start: 13, end: 17, height: 20 }],
    }, 20, 'mixed');
    expect(pairs.map(pair => pair.height)).toEqual([60, 40]);
    expect(pairLyricsLines({ chinese: '中文\n下一句', english: '' }, {}, 20, 'mixed').map(pair => pair.height)).toEqual([20, 20]);
    expect(pairLyricsLines({ chinese: '', english: '' }, {}, 20, 'mixed')).toEqual([{ chinese: { start: 0, end: 0 }, height: 20 }]);
  });
  it('replaces a quoted source line without leaving orphaned hidden punctuation or changing adjacent CRLF lines', () => {
    const source = '「第一句」。\r\n「第二句」！\r\n第三句。';
    expect(replaceLyricsLine(source, 1, '新句子')).toBe('「第一句」。\r\n新句子\r\n第三句。');
    expect(replaceLyricsLine(source, 4, '不應補行')).toBe(source);
  });
  it('keeps soft wraps in one pair and uses the taller side for each sentence', () => {
    const pairs = pairLyricsLines({ english: 'Long English\nNext', chinese: '中文\n下一句' }, {
      english: [{ start: 0, end: 5, height: 20 }, { start: 5, end: 13, height: 20 }, { start: 13, end: 17, height: 20 }],
      chinese: [{ start: 0, end: 3, height: 20 }, { start: 3, end: 4, height: 20 }, { start: 4, end: 6, height: 20 }],
    }, 20);
    expect(pairs).toEqual([
      { english: { start: 0, end: 12 }, chinese: { start: 0, end: 2 }, height: 40 },
      { english: { start: 13, end: 17 }, chinese: { start: 3, end: 6 }, height: 40 },
    ]);
  });
  it('retains deliberate empty lines, trailing breaks and unequal sentence counts without inventing translations', () => {
    const text = { english: 'One\n\nThree\n', chinese: '一\n\n三' };
    const pairs = pairLyricsLines(text, {}, 20);
    expect(pairs).toHaveLength(4);
    expect(pairs.map(pair => pair.height)).toEqual([20, 20, 20, 20]);
    expect(pairs[1]).toEqual({ english: { start: 4, end: 4 }, chinese: { start: 2, end: 2 }, height: 20 });
    expect(pairs[3].chinese).toBeUndefined();
    expect(pairs.map(pair => pair.english && text.english.slice(pair.english.start, pair.english.end)).join('\n')).toBe(text.english);
  });
  it('moves complete pairs across both sheet and book pages', () => {
    const heights = [40, 60, 20];
    const sheet = paginateLyrics([{ id: 'verse', heights }], 100, 1);
    const book = paginateLyricsBook([{ id: 'verse', heights, rowCount: 3, lineHeight: 20, headingHeight: 16, titleHeight: 0 }], 100, 1);
    for (const pages of [sheet, book]) {
      expect(pages.map(page => page.columns[0].map(({ start, end }) => [start, end]))).toEqual([[[0, 1]], [[1, 3]]]);
    }
  });
  it('preserves an oversized pair intact and does not hang or drop the next sentence', () => {
    const pages = paginateLyricsBook([{ id: 'long', heights: [200, 20], rowCount: 2, lineHeight: 20, headingHeight: 0, titleHeight: 20 }], 100, 1);
    expect(pages.map(page => page.columns[0].map(({ start, end }) => [start, end]))).toEqual([[[0, 1]], [[1, 2]]]);
  });
});
