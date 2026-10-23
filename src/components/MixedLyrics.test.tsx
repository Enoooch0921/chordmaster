import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import LyricsSheet from './LyricsSheet';
import LyricsBook from './LyricsBook';
import { DEFAULT_LYRICS_BOOK_SETTINGS } from '../utils/lyricsBook';
import { getLyricsLanguage, updateLyricsBlocks } from '../utils/lyricsDocument';
import * as measurement from '../utils/lyricsMeasurement';

const song: Song = {
  title: '中英混合測試', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [],
  lyricsDoc: { chinese: '', displayLanguage: 'mixed', blocks: [{
    id: 'verse', marker: 'Verse 1', chinese: '第一句\n第二句\n第三句',
    english: 'First sentence with a long translation\nSecond sentence\nThird sentence',
  }] },
};

describe.each(['sheet', 'book'] as const)('%s mixed Chinese/English lyrics', kind => {
  const show = (options: { reading?: boolean; exportMode?: boolean; current?: Song; onChange?: (...args: unknown[]) => void } = {}) => {
    const current = options.current ?? song;
    return render(kind === 'sheet'
      ? <LyricsSheet song={current} language="zh" reading={options.reading ?? false} exportMode={options.exportMode} onChange={options.onChange} />
      : <LyricsBook title="主日" entries={[{ id: 'entry', song: current }]} language="zh"
        settings={{ ...DEFAULT_LYRICS_BOOK_SETTINGS, language: 'mixed' }} reading={options.reading}
        exportMode={options.exportMode} onSongChange={options.onChange} />);
  };

  it.each([true, false])('alternates Chinese then English in each pair (reading=%s)', reading => {
    const { container } = show({ reading, exportMode: !reading });
    const pairs = container.querySelectorAll('[data-lyrics-pair]');
    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toHaveStyle({ gridTemplateColumns: 'minmax(0, 1fr)', breakInside: 'avoid' });
    expect(pairs[0].children[0]).toHaveAttribute('data-lyrics-language', 'chinese');
    expect(pairs[0].children[1]).toHaveAttribute('data-lyrics-language', 'english');
    expect(pairs[0].textContent).toBe('第一句First sentence with a long translation');
    expect(pairs[1].textContent).toBe('第二句Second sentence');
    expect(container.querySelector('[data-lyrics-layout="mixed"]')).not.toBeNull();
    if (!reading) expect(container.querySelector('[data-print-page] > .grid')).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' });
  });

  it('moves both languages together between A4 columns/pages when translations wrap', () => {
    const realMeasure = measurement.measureLyricsText;
    vi.spyOn(measurement, 'measureLyricsText').mockImplementation((element, text, lineHeight) =>
      realMeasure(element, text, lineHeight).map(row => ({ ...row, height: 300 })));
    const { container } = show({ exportMode: true });
    const pages = container.querySelectorAll('[data-print-page]');
    expect(pages).toHaveLength(2);
    expect(pages[0].querySelectorAll('[data-lyrics-pair]')).toHaveLength(2);
    expect(pages[1].querySelector('[data-lyrics-pair="2"]')?.textContent).toBe('第三句Third sentence');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('preserves the raw languages and mixed view when editing one English sentence', () => {
    const onChange = vi.fn();
    show({ reading: true, onChange });
    const label = kind === 'sheet' ? '英文歌詞 Verse 1 · 第2行' : '中英混合測試 · Verse 1 · English · 第2行';
    fireEvent.click(screen.getByRole('button', { name: label }));
    const input = screen.getByRole('textbox', { name: label });
    fireEvent.change(input, { target: { value: 'Updated English' } });
    fireEvent.blur(input);
    const doc = kind === 'sheet' ? onChange.mock.calls[0][0].lyricsDoc : onChange.mock.calls[0][1];
    expect(doc.blocks[0].chinese).toBe(song.lyricsDoc!.blocks![0].chinese);
    expect(doc.blocks[0].english).toBe('First sentence with a long translation\nUpdated English\nThird sentence');
    expect(getLyricsLanguage(JSON.parse(JSON.stringify(updateLyricsBlocks(doc, doc.blocks))))).toBe('mixed');
  });

  it('keeps untranslated sentences without inserting empty translation rows', () => {
    const current = { ...song, lyricsDoc: { ...song.lyricsDoc!, blocks: [{ ...song.lyricsDoc!.blocks![0], english: '' }] } };
    const { container } = show({ current, exportMode: true });
    const pairs = container.querySelectorAll('[data-lyrics-pair]');
    expect(pairs).toHaveLength(3);
    expect(pairs[0].children).toHaveLength(1);
    expect(pairs[2].textContent).toBe('第三句');
  });

  it('offers mixed view alongside the existing bilingual option', () => {
    const onChange = vi.fn();
    show({ onChange });
    const select = screen.getByRole('combobox', { name: kind === 'sheet' ? '歌詞語言' : '歌單歌詞語言' });
    expect(select).toHaveValue('mixed');
    expect(screen.getByRole('option', { name: '中英對照' })).toHaveValue('bilingual');
    expect(screen.getByRole('option', { name: '中英混合（逐行）' })).toHaveValue('mixed');
  });
});
