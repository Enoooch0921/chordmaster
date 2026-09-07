import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import LyricsBook from './LyricsBook';
import { DEFAULT_LYRICS_BOOK_SETTINGS } from '../utils/lyricsBook';

const song: Song = { title: '第一首', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [], lyricsDoc: { chinese: '[Verse 1]\n第一行\n第二行' } };
const entries = [{ id: 'one', song }, { id: 'two', song: { ...song, title: '第二首' } }];

describe('continuous lyrics book', () => {
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
});
