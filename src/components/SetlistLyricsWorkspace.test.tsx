import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import { DEFAULT_LYRICS_BOOK_SETTINGS } from '../utils/lyricsBook';
import { mockLyricsReadingGeometry } from '../test/lyricsReadingGeometry';
import SetlistLyricsWorkspace, { type SetlistLyricsMode } from './SetlistLyricsWorkspace';

const song: Song = { title: '同一首歌', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [], lyricsDoc: { chinese: '[Verse 1]\n第一行\n第二行' } };
const entries = [{ id: 'first-entry', song }, { id: 'repeat-entry', song }];
function Harness({ onSongChange, onSelectSong = vi.fn(), onPrintSettingsChange = vi.fn(), empty = false, items = entries }: {
  onSongChange?: (id: string, lyrics: Song['lyricsDoc']) => void;
  onSelectSong?: (id: string) => void;
  onPrintSettingsChange?: (value: unknown) => void;
  empty?: boolean;
  items?: typeof entries;
}) {
  const [selectedId, setSelectedId] = React.useState('first-entry');
  const [mode, setMode] = React.useState<SetlistLyricsMode>('reading');
  const [printSettings, setPrintSettings] = React.useState(DEFAULT_LYRICS_BOOK_SETTINGS);
  return <SetlistLyricsWorkspace title="聚會歌單" entries={empty ? [] : items} language="zh" selectedId={selectedId} onSelectSong={id => { setSelectedId(id); onSelectSong(id); }} mode={mode} onModeChange={setMode} printSettings={printSettings} onPrintSettingsChange={settings => { setPrintSettings(settings); onPrintSettingsChange(settings); }} onSongChange={onSongChange} onExport={() => {}}/>;
}
beforeEach(() => { localStorage.clear(); mockLyricsReadingGeometry(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('setlist lyrics reading workspace', () => {
  it('includes source-confirmed English-only sections in main-language navigation', () => {
    const { container } = render(<Harness items={[{ id: 'first-entry', song: { ...song, lyricsDoc: { chinese: '', blocks: [
      { id: 'v', marker: 'Verse 1', chinese: '中文主歌', english: '' },
      { id: 'c', marker: 'Chorus', chinese: '', english: 'Sung chorus', singingLanguage: 'english' },
    ] } } }]}/>);
    fireEvent.click(screen.getByRole('button', { name: '跳到 Chorus' }));
    expect(screen.getByRole('heading', { name: 'Chorus' })).toBeInTheDocument();
    expect(container.querySelector('[data-reading-section="c"]')).toHaveTextContent('Sung chorus');
  });
  it('removes only the repeated gathering heading from reading and restores saved reading preferences', () => {
    const first = render(<Harness/>);
    expect(first.container.querySelector('[data-book-title]')).toBeNull();
    expect(first.container.querySelectorAll('.adaptive-lyrics-reader')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }));
    fireEvent.click(screen.getByRole('button', { name: '放大歌詞' }));
    first.unmount();
    const second = render(<Harness/>);
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }));
    expect(screen.getByLabelText('目前字級')).toHaveTextContent('26');
    fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
    expect(second.container.querySelector('[data-book-title]')).toHaveTextContent('聚會歌單');
    expect(second.container.querySelector('[data-print-page]')).toHaveStyle({ fontSize: `${DEFAULT_LYRICS_BOOK_SETTINGS.fontSize}px` });
  });

  it('opens a focus-contained reading viewport, retains navigation, and restores the reading position on Escape', () => {
    render(<Harness onSongChange={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button', { name: '專注閱讀' }));
    const dialog = screen.getByRole('dialog', { name: '專注閱讀歌詞' });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.queryByRole('button', { name: '列印排版' })).toBeNull();
    expect(screen.queryByRole('button', { name: '編輯' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: '跳到 Verse 1' })).toBeEnabled();
    expect(document.querySelector('[data-reading-song]')).toHaveAttribute('data-reading-song', 'first-entry');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('button', { name: '離開專注閱讀' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-reading-song]')).toHaveAttribute('data-reading-song', 'first-entry');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('keeps reading read-only even for editors, and routes explicit edits by repeated entry identity', () => {
    const onSongChange = vi.fn();
    render(<Harness onSongChange={onSongChange}/>);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '同一首歌 · Verse 1 · 中文' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: '目前歌曲' }), { target: { value: 'repeat-entry' } });
    expect(screen.getByRole('combobox', { name: '目前歌曲' })).toHaveValue('repeat-entry');
    fireEvent.click(screen.getByRole('button', { name: '編輯' }));
    expect(screen.queryByRole('button', { name: '切換 A4 排版' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '中文歌詞 Verse 1' }));
    const input = screen.getByRole('textbox', { name: '中文歌詞 Verse 1' });
    fireEvent.change(input, { target: { value: '只改第二次出現' } });
    fireEvent.blur(input);
    expect(onSongChange).toHaveBeenCalledWith('repeat-entry', expect.objectContaining({ chinese: '[Verse 1]\n只改第二次出現' }));
    fireEvent.click(screen.getByRole('button', { name: '完成編輯' }));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('preserves independent print settings when reading font and language change', () => {
    const onPrintSettingsChange = vi.fn();
    const { container } = render(<Harness onPrintSettingsChange={onPrintSettingsChange}/>);
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }));
    fireEvent.click(screen.getByRole('button', { name: '放大歌詞' }));
    expect(screen.getByLabelText('目前字級')).toHaveTextContent('26');
    fireEvent.change(screen.getByRole('combobox', { name: '歌詞語言' }), { target: { value: 'mixed' } });
    expect(onPrintSettingsChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
    expect(screen.getByRole('combobox', { name: 'A4 版面' })).toHaveValue('readable');
    expect(container.querySelector('[data-print-page]')).toHaveStyle({ fontSize: `${DEFAULT_LYRICS_BOOK_SETTINGS.fontSize}px` });
    expect(screen.getByRole('button', { name: '匯出 A4 易讀版' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: 'compact' } });
    expect(onPrintSettingsChange).toHaveBeenCalledWith({ ...DEFAULT_LYRICS_BOOK_SETTINGS, layout: 'compact' });
    fireEvent.click(screen.getByRole('button', { name: '閱讀' }));
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }));
    expect(screen.getByLabelText('目前字級')).toHaveTextContent('26');
  });

  it('keeps the selected source section through focus, print and font reflow', () => {
    const blocks = ['Verse 1', 'Chorus', 'Bridge'].map((marker, i) => ({ id: `section-${i}`, marker, chinese: Array.from({ length: 7 }, (_, n) => `${marker} 第${n}行`).join('\n'), english: '' }));
    const { container } = render(<Harness items={[{ id: 'first-entry', song: { ...song, lyricsDoc: { chinese: '', blocks } } }]}/>);
    fireEvent.click(screen.getByRole('button', { name: '跳到 Chorus' }));
    expect(container.querySelector('[data-reading-section="section-1"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '專注閱讀' }));
    expect(document.querySelector('[data-reading-section="section-1"]')).not.toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: '離開專注閱讀' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
    fireEvent.click(screen.getByRole('button', { name: '閱讀' }));
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }));
    fireEvent.click(screen.getByRole('button', { name: '放大歌詞' }));
    expect(container.querySelector('[data-reading-section="section-1"]')).not.toBeNull();
  });

  it('supports settings dismissal and offers no editing to viewers or an empty list', () => {
    const { rerender } = render(<Harness/>);
    expect(screen.queryByRole('button', { name: '編輯' })).toBeNull();
    const trigger = screen.getByRole('button', { name: '閱讀設定' });
    fireEvent.click(trigger);
    const font = screen.getByRole('combobox', { name: '歌詞字體' });
    font.focus();
    fireEvent.keyDown(font, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    rerender(<Harness empty onSongChange={vi.fn()}/>);
    expect(screen.getByRole('heading', { name: '歌單還沒有歌曲' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '編輯' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '下一首' })).toBeNull();
  });
});
