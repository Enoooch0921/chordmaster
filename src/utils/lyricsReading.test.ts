import { describe, expect, it } from 'vitest';
import { paginateReading, paginateReadingColumns, readingColumnCandidates, readingPhrases, readingPhraseTail, prepareReadingSections } from './lyricsReading';

describe('whole-song reading pagination', () => {
  for (const height of [140, 360, 620, 900]) for (const columns of [1, 2, 3]) for (const scale of [1, 1.5, 2]) {
    it(`retains every source row once, in order at ${height}px / ${columns} columns / ${scale} size`, () => {
      const sections = [4, 12, 3, 28, 1].map((count, index) => ({ index, header: 26, lines: Array.from({ length: count }, () => 30 * scale) }));
      const pages = paginateReading(sections, height, columns);
      const actual = pages.flat(2).flatMap(part => Array.from({ length: part.end - part.start }, (_, i) => `${part.section}:${part.start + i}`));
      expect(actual).toEqual(sections.flatMap(s => s.lines.map((_, i) => `${s.index}:${i}`)));
      for (const column of pages.flat()) {
        const used = column.reduce((sum, part) => sum + sections[part.section].header + sections[part.section].lines.slice(part.start, part.end).reduce((a, b) => a + b, 0), 0) + Math.max(0, column.length - 1) * 16;
        expect(used).toBeLessThanOrEqual(height);
      }
    });
  }
  it('honors explicit page breaks and retains an oversized sentence', () => {
    const pages = paginateReading([{ index: 0, header: 26, lines: [32] }, { index: 1, header: 26, lines: [1000], pageBreakBefore: true }], 400, 3);
    expect(pages).toHaveLength(2);
    expect(pages[1][0]).toEqual([{ section: 1, start: 0, end: 1, continued: false }]);
  });
  it('preserves English labels, sung fields and paired sentence boundaries without mutating sources', () => {
    const blocks = [
      { id: 'v2', marker: 'Verse 2', chinese: '甲\n乙', english: 'A\nB', singingLineLanguages: ['english', 'chinese'] as ('english' | 'chinese')[] },
      { id: 'v1', marker: 'Verse 1', chinese: '', english: 'English sung line', singingLanguage: 'english' as const },
    ];
    const original = structuredClone(blocks);
    const main = prepareReadingSections(blocks, 'chinese');
    expect(main.map(s => s.label)).toEqual(['Verse 1', 'Verse 2']);
    expect(main.flatMap(s => s.rows.flatMap(row => row.map(line => line.text)))).toEqual(['English sung line', 'A', '乙']);
    const bilingual = prepareReadingSections(blocks, 'bilingual');
    expect(bilingual[1].rows.map(row => row.map(line => line.text))).toEqual([['A', '甲'], ['B', '乙']]);
    const mixed = prepareReadingSections(blocks, 'mixed');
    expect(mixed[1].rows.map(row => row.map(line => line.text))).toEqual([['A', '甲'], ['乙', 'B']]);
    expect(blocks).toEqual(original);
  });
});


describe('fixed-size flexible columns and phrase breaks', () => {
  it.each([1, 2, 3])('keeps source order and uses the geometry of each of %i unequal columns', columns => {
    const measures = Array.from({ length: columns }, (_, col) => [4, 11, 3, 19].map((count, index) => ({ index, header: 26, lines: Array.from({ length: count }, (_, row) => 30 * (1 + (row + col) % 3)) })));
    const pages = paginateReadingColumns(measures, 300);
    expect(pages.flat(2).flatMap(part => Array.from({ length: part.end - part.start }, (_, row) => `${part.section}:${part.start + row}`)))
      .toEqual(measures[0].flatMap(section => section.lines.map((_, row) => `${section.index}:${row}`)));
    pages.forEach(page => page.forEach((column, col) => {
      const used = column.reduce((sum, part) => sum + measures[col][part.section].header + measures[col][part.section].lines.slice(part.start, part.end).reduce((a, b) => a + b, 0), 0) + Math.max(0, column.length - 1) * 16;
      expect(used).toBeLessThanOrEqual(300);
    }));
  });
  it('respects a page break when unequal columns have already used the first column', () => {
    const measure = [{ index: 0, header: 26, lines: [40] }, { index: 1, header: 26, lines: [60, 60], pageBreakBefore: true }];
    const pages = paginateReadingColumns([measure, measure], 300);
    expect(pages).toHaveLength(2);
    expect(pages[1][0][0]).toMatchObject({ section: 1, start: 0, end: 2 });
  });
  it('uses only bounded widths that fit the available canvas', () => {
    for (const widths of readingColumnCandidates(736, 2)) {
      expect(widths.reduce((a, b) => a + b, 0) + 28 * (widths.length - 1)).toBeCloseTo(736);
      expect(Math.max(...widths) / Math.min(...widths)).toBeLessThanOrEqual(1.51);
    }
  });
  it.each(['起初神的靈運行 在眾水之上', '  不要留下 一個 上  ', "And it looks like healing is headed our way", '沒有空格也要完整保留在同一行', '最後同在。', '祢❤️ 與我同在'])('keeps every original character while protecting the meaningful tail: %s', source => {
    const phrases = readingPhrases(source);
    expect(phrases.join('')).toBe(source);
    for (const phrase of phrases.filter(part => /\S/u.test(part))) {
      const [body, tail] = readingPhraseTail(phrase);
      expect(body + tail).toBe(phrase);
    }
    if (source.includes('一個 上')) expect(readingPhraseTail(phrases.filter(part => /\S/u.test(part)).at(-1)!)[1]).toBe('個 上');
    if (source === '最後同在。') expect(readingPhraseTail(source)[1]).toBe('同在。');
  });
});
