import { describe, expect, it } from 'vitest';
import { lyricsSectionLabel } from './lyricsSections';
import { parseLyricsBody } from './lyricsFormat';
import { importLyrics, paginateLyrics } from './lyricsDocument';

describe('English lyrics section headings', () => {
  it('converts the reference files’ old symbols and verse numbers', () => {
    expect(['1.', '2、', '○', '※', '◎', '△'].map(lyricsSectionLabel)).toEqual(['Verse 1', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Bridge', 'Refrain']);
  });
  it('recognizes bracketed headings and merges redundant matching symbols', () => {
    const sections = parseLyricsBody('[Verse 1]\n\n第一行\n第二行\n[Pre-Chorus]\n○ 導歌\n[Chorus]\n※ 副歌\n[Bridge]\n◎ 橋段');
    expect(sections.map(section => section.marker)).toEqual(['Verse 1', 'Pre-Chorus', 'Chorus', 'Bridge']);
    expect(sections.map(section => section.lines)).toEqual([['第一行', '第二行'], ['導歌'], ['副歌'], ['橋段']]);
  });
  it('splits adjacent numbered verses even without an empty line', () => {
    expect(parseLyricsBody('1.第一段\n繼續\n2.第二段').map(section => section.lines)).toEqual([['第一段', '繼續'], ['第二段']]);
  });
  it('recognizes named headings without stripping lyric sentences', () => {
    const sections = parseLyricsBody('verse 2\nBridge over troubled water\nChorus: Sing together\n[Tag]\n最後一句');
    expect(sections.map(section => section.marker)).toEqual(['Verse 2', 'Chorus', 'Tag']);
    expect(sections[0].lines).toEqual(['Bridge over troubled water']);
    expect(sections[1].lines).toEqual(['Sing together']);
  });
  it('matches a named English heading with a legacy Chinese symbol', () => {
    const blocks = importLyrics('1. 中文\n\n※ 副歌', '[Verse 1]\nEnglish\n\n[Chorus]\nChorus words');
    expect(blocks.map(block => block.english)).toEqual(['English', 'Chorus words']);
    expect(blocks.every(block => !block.needsPairingReview)).toBe(true);
  });
  it('keeps a section heading with its first line instead of stranding it at a page bottom', () => {
    const pages = paginateLyrics([{ id: 'a', heights: [60] }, { id: 'b', heights: [30], headingHeight: 26 }], 130, 1);
    expect(pages).toHaveLength(2);
    expect(pages[1].columns[0][0].blockId).toBe('b');
  });
});
