import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import LyricsSheet from './LyricsSheet';
import LyricsBook from './LyricsBook';
import { DEFAULT_LYRICS_BOOK_SETTINGS } from '../utils/lyricsBook';
import * as measurement from '../utils/lyricsMeasurement';

const song: Song = { title: '雙語對齊', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [], lyricsDoc: {
  chinese: '', displayLanguage: 'bilingual', blocks: [{ id: 'verse', marker: 'Verse 1', english: 'A long English sentence that can wrap onto several visual lines\nNext sentence\nLast sentence', chinese: '「第一句」。\n第二句！\n第三句。' }],
} };
const settings = { ...DEFAULT_LYRICS_BOOK_SETTINGS, language: 'bilingual' as const };

describe.each(['sheet', 'book'] as const)('%s bilingual line layout', kind => {
  const show = (options: { reading?: boolean; exportMode?: boolean; current?: Song; onChange?: (...args: unknown[]) => void } = {}) => {
    const current = options.current ?? song;
    return render(kind === 'sheet'
      ? <LyricsSheet song={current} language="zh" reading={options.reading} exportMode={options.exportMode} onChange={options.onChange} />
      : <LyricsBook title="聚會" entries={[{ id: 'entry', song: current }]} language="zh" settings={settings} reading={options.reading} exportMode={options.exportMode} onSongChange={options.onChange} />);
  };
  it.each([true, false])('uses one shared grid row per original sentence (reading=%s)', reading => {
    const { container } = show({ reading, exportMode: !reading });
    const pairs = container.querySelectorAll('[data-lyrics-pair]');
    expect(pairs).toHaveLength(3);
    expect(pairs[0].children[0]).toHaveAttribute('data-lyrics-language', 'english');
    expect(pairs[0].children[1]).toHaveAttribute('data-lyrics-language', 'chinese');
    expect(pairs[0].children[0]).toHaveTextContent('A long English sentence that can wrap onto several visual lines');
    expect(pairs[0].children[1]).toHaveTextContent('第一句');
    expect(pairs[1].children[0]).toHaveTextContent('Next sentence');
    expect(pairs[1].children[1]).toHaveTextContent('第二句');
    expect(pairs[0]).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', alignItems: 'start', breakInside: 'avoid' });
  });
  it('keeps the same original pair on the next page when English wraps much more than Chinese', () => {
    const realMeasure = measurement.measureLyricsText;
    vi.spyOn(measurement, 'measureLyricsText').mockImplementation((element, text, lineHeight) => {
      const rows = realMeasure(element, text, lineHeight);
      if (text.startsWith('A long')) return rows.map((row, index) => ({ ...row, height: index < 2 ? 600 : lineHeight }));
      return rows;
    });
    const { container } = show({ exportMode: true });
    const pages = container.querySelectorAll('[data-print-page]');
    expect(pages).toHaveLength(2);
    expect(pages[0].querySelectorAll('[data-lyrics-pair]')).toHaveLength(1);
    expect(pages[1].querySelector('[data-lyrics-pair="1"]')).toHaveTextContent('Next sentence第二句');
    expect(pages[1].querySelector('[data-lyrics-pair="2"]')).toHaveTextContent('Last sentence第三句');
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('edits one source sentence without adding wrap newlines or changing either neighboring line or Chinese', () => {
    const onChange = vi.fn();
    show({ reading: true, onChange });
    const label = kind === 'sheet' ? '英文歌詞 Verse 1 · 第2行' : '雙語對齊 · Verse 1 · 英文 · 第2行';
    fireEvent.click(screen.getByRole('button', { name: label }));
    const input = screen.getByRole('textbox', { name: label });
    expect(input).toHaveValue('Next sentence');
    fireEvent.change(input, { target: { value: 'Updated sentence' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    const doc = kind === 'sheet' ? onChange.mock.calls[0][0].lyricsDoc : onChange.mock.calls[0][1];
    expect(doc.blocks[0].english).toBe(song.lyricsDoc!.blocks![0].english.replace('Next sentence', 'Updated sentence'));
    expect(doc.blocks[0].chinese).toBe(song.lyricsDoc!.blocks![0].chinese);
    if (kind === 'book') expect(onChange.mock.calls[0][0]).toBe('entry');
  });
  it('does not persist display punctuation removal when an edit is cancelled', () => {
    const onChange = vi.fn();
    show({ onChange });
    const label = kind === 'sheet' ? '中文歌詞 Verse 1 · 第1行' : '雙語對齊 · Verse 1 · 中文 · 第1行';
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: label }), { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('edits a quoted Chinese line as a whole without leaving its hidden opening quote behind', () => {
    const onChange = vi.fn();
    const current = { ...song, lyricsDoc: { ...song.lyricsDoc!, blocks: [{ ...song.lyricsDoc!.blocks![0], chinese: '「第一句」。\n「第二句」！\n第三句。' }] } };
    show({ current, onChange });
    const label = kind === 'sheet' ? '中文歌詞 Verse 1 · 第2行' : '雙語對齊 · Verse 1 · 中文 · 第2行';
    fireEvent.click(screen.getByRole('button', { name: label }));
    const input = screen.getByRole('textbox', { name: label });
    fireEvent.change(input, { target: { value: '新的句子' } });
    fireEvent.blur(input);
    const doc = kind === 'sheet' ? onChange.mock.calls[0][0].lyricsDoc : onChange.mock.calls[0][1];
    expect(doc.blocks[0].chinese).toBe('「第一句」。\n新的句子\n第三句。');
    expect(doc.blocks[0].english).toBe(current.lyricsDoc.blocks[0].english);
  });
  it('retains unmatched final sentences instead of deleting text or padding the stored translation', () => {
    const current = { ...song, lyricsDoc: { ...song.lyricsDoc!, blocks: [{ ...song.lyricsDoc!.blocks![0], chinese: '唯一一句' }] } };
    const onChange = vi.fn();
    const { container } = show({ current, onChange });
    const pairs = container.querySelectorAll('[data-lyrics-pair]');
    expect(pairs).toHaveLength(3);
    expect(pairs[2].children[0]).toHaveTextContent('Last sentence');
    expect(pairs[2].children[1]).toBeEmptyDOMElement();
    expect(onChange).not.toHaveBeenCalled();
  });
});
