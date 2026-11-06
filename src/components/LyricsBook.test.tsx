import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import LyricsBook from './LyricsBook';
import { DEFAULT_LYRICS_BOOK_SETTINGS } from '../utils/lyricsBook';

const song: Song = { title: '第一首', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [], lyricsDoc: { chinese: '[Verse 1]\n第一行\n第二行' } };
const entries = [{ id: 'one', song }, { id: 'two', song: { ...song, title: '第二首' } }];

describe('continuous lyrics book', () => {
  it('keeps reading text locked and gives each whole song one navigation anchor', () => {
    const onSongChange = vi.fn();
    const { container } = render(<LyricsBook title="聚會" entries={entries} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} onSongChange={onSongChange} reading hideControls />);
    const anchors = container.querySelectorAll('[data-setlist-preview-song-id]');
    expect(anchors).toHaveLength(2);
    expect(anchors[1].tagName).toBe('SECTION');
    expect(anchors[1]).toHaveTextContent('第二行');
    fireEvent.click(anchors[1].querySelector('.lyrics-text')!);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(onSongChange).not.toHaveBeenCalled();
  });
  it('sorts lyrics within each song and renumbers titles when the setlist order changes', () => {
    const first = { id: 'one', song: { ...song, lyricsDoc: { chinese: '[Verse 1]\n一\n\n[Chorus]\n副\n\n[Verse 2]\n二' } } };
    const { container, rerender } = render(<LyricsBook title="聚會" entries={[first, entries[1]]} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} exportMode />);
    const page = () => container.querySelector('[data-print-page]')!;
    expect(Array.from(page().querySelectorAll('h3')).map(node => node.textContent)).toEqual(['Verse 1', 'Verse 2', 'Chorus', 'Verse 1']);
    expect(Array.from(page().querySelectorAll('[data-book-song-title]')).map(node => node.textContent)).toEqual(['1. 《第一首》', '2. 《第二首》']);
    rerender(<LyricsBook title="聚會" entries={[entries[1], first]} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} exportMode />);
    expect(Array.from(page().querySelectorAll('[data-book-song-title]')).map(node => node.textContent)).toEqual(['1. 《第二首》', '2. 《第一首》']);
  });
  it('exports consecutive songs together with one gathering title and no controls', () => {
    const { container } = render(<LyricsBook title="聚會一" entries={entries} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} exportMode />);
    const pages = container.querySelectorAll('[data-print-page]');
    expect(pages).toHaveLength(1);
    expect(pages[0].querySelectorAll('[data-book-title]')).toHaveLength(1);
    expect(pages[0].querySelectorAll('[data-book-song-title]')).toHaveLength(2);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('routes editing to the correct setlist item even when songs share legacy block IDs', () => {
    const onSongChange = vi.fn();
    render(<LyricsBook title="聚會一" entries={entries} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} onSongChange={onSongChange} />);
    fireEvent.click(screen.getByRole('button', { name: '第二首 · Verse 1 · 中文' }));
    const input = screen.getByRole('textbox', { name: '第二首 · Verse 1 · 中文' });
    fireEvent.change(input, { target: { value: '只修改第二首' } });
    fireEvent.blur(input);
    expect(onSongChange).toHaveBeenCalledTimes(1);
    expect(onSongChange.mock.calls[0][0]).toBe('two');
    expect(onSongChange.mock.calls[0][1].chinese).toBe('[Verse 1]\n只修改第二首');
  });
  it('keeps missing songs visible rather than silently dropping them from the gathering', () => {
    const { container } = render(<LyricsBook title="聚會一" entries={[{ id: 'missing', song: { ...song, lyricsDoc: undefined } }]} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} exportMode />);
    expect(container.querySelector('[data-print-page]')).toHaveTextContent('《第一首》尚無此語言歌詞');
  });

  it('defaults to the readable layout and lets readers choose the preserved compact layout', () => {
    const onSettingsChange = vi.fn();
    const onReadingChange = vi.fn();
    render(<LyricsBook title="聚會一" entries={entries} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} onSettingsChange={onSettingsChange} onReadingChange={onReadingChange} />);
    expect(screen.getByRole('button', { name: 'A4 易讀版' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'A4 省紙版' }));
    expect(onSettingsChange).toHaveBeenCalledWith({ ...DEFAULT_LYRICS_BOOK_SETTINGS, layout: 'compact' });
    expect(onReadingChange).toHaveBeenCalledWith(false);
  });

  it('keeps highlighted song names with title brackets when exporting the compact layout', () => {
    const { container } = render(<LyricsBook title="聚會一" entries={entries} language="zh" settings={{ ...DEFAULT_LYRICS_BOOK_SETTINGS, layout: 'compact' }} exportMode />);
    expect(container.querySelector('[data-print-page]')).toHaveTextContent('《第一首》');
    expect(container.querySelector('[data-book-layout]')).toHaveAttribute('data-book-layout', 'compact');
    expect(container.querySelector('[data-preview-only-control]:not([aria-hidden])')).toBeNull();
  });

  it('returns from reading view to the selected A4 layout', () => {
    const onReadingChange = vi.fn();
    const { container } = render(<LyricsBook title="聚會一" entries={entries} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} reading onReadingChange={onReadingChange} />);
    expect(screen.getByRole('button', { name: '大字閱讀' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-print-page]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'A4 易讀版' }));
    expect(onReadingChange).toHaveBeenCalledWith(false);
  });

  it('keeps whole sections without repeating the song title above a continuing column', () => {
    const longSong = { ...song, lyricsDoc: { chinese: `[Verse]\n${Array(18).fill('主歌一行').join('\n')}\n\n[Chorus]\n${Array(10).fill('副歌一行').join('\n')}` } };
    const { container } = render(<LyricsBook title="" entries={[{ id: 'long', song: longSong }]} language="zh" settings={DEFAULT_LYRICS_BOOK_SETTINGS} exportMode />);
    const page = container.querySelector('[data-print-page]')!;
    expect(container.querySelectorAll('[data-print-page]')).toHaveLength(1);
    expect(page.querySelectorAll('[data-book-block]')).toHaveLength(2);
    expect(page.querySelector('[data-book-continuation]')).toBeNull();
    expect(page).not.toHaveTextContent('(cont.)');
    expect(page.querySelectorAll('[data-book-song-title]')).toHaveLength(1);
  });
});
