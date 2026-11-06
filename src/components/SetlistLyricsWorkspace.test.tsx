import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import { DEFAULT_LYRICS_BOOK_SETTINGS } from '../utils/lyricsBook';
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
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('setlist lyrics reading workspace', () => {
  it('removes only the repeated gathering heading from reading and restores saved reading preferences', () => {
    const first = render(<Harness/>);
    expect(first.container.querySelector('[data-book-title]')).toBeNull();
    expect(first.container.querySelectorAll('[data-book-song-title]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '放大歌詞' }));
    first.unmount();
    const second = render(<Harness/>);
    expect(screen.getByLabelText('目前字級')).toHaveTextContent('26');
    fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
    expect(second.container.querySelector('[data-book-title]')).toHaveTextContent('聚會歌單');
    expect(second.container.querySelector('[data-print-page]')).toHaveStyle({ fontSize: `${DEFAULT_LYRICS_BOOK_SETTINGS.fontSize}px` });
  });

  it('opens a focus-contained reading viewport, retains navigation, and restores the reading position on Escape', () => {
    render(<Harness onSongChange={vi.fn()}/>);
    screen.getByLabelText('歌詞內容').scrollTop = 320;
    fireEvent.click(screen.getByRole('button', { name: '專注閱讀' }));
    const dialog = screen.getByRole('dialog', { name: '專注閱讀歌詞' });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.queryByRole('button', { name: '列印排版' })).toBeNull();
    expect(screen.queryByRole('button', { name: '編輯' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: '下一首' })).toBeEnabled();
    expect(screen.getByLabelText('歌詞內容').scrollTop).toBe(320);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('button', { name: '離開專注閱讀' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('歌詞內容').scrollTop).toBe(320);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('highlights the section at the reading position and acknowledges an explicit section jump', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { container } = render(<Harness items={[{ id: 'first-entry', song: { ...song, lyricsDoc: { chinese: '[Verse 1]\n主歌\n\n[Chorus]\n副歌\n\n[Bridge]\n橋段' } } }]}/>);
    const root = screen.getByLabelText('歌詞內容');
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 500 } as DOMRect);
    vi.spyOn(container.querySelector('[data-setlist-preview-song-id]')!, 'getBoundingClientRect').mockImplementation(() => ({ top: 100 - root.scrollTop, bottom: 1900 - root.scrollTop } as DOMRect));
    Array.from(container.querySelectorAll('[data-book-block]')).forEach((block, index) => {
      vi.spyOn(block, 'getBoundingClientRect').mockImplementation(() => ({ top: 100 + index * 600 - root.scrollTop, bottom: 700 + index * 600 - root.scrollTop, height: 600 } as DOMRect));
    });
    root.scrollTop = 600;
    fireEvent.wheel(root);
    fireEvent.scroll(root);
    act(() => frame?.(0));
    expect(screen.getByRole('button', { name: 'Chorus' })).toHaveAttribute('aria-current', 'location');
    expect(root.scrollTop).toBe(600);
    fireEvent.click(screen.getByRole('button', { name: 'Verse 1' }));
    expect(screen.getByRole('button', { name: 'Verse 1' })).toHaveAttribute('aria-current', 'location');
  });
  it('keeps reading read-only even for editors, and routes explicit edits by repeated entry identity', () => {
    const onSongChange = vi.fn();
    render(<Harness onSongChange={onSongChange}/>);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '同一首歌 · Verse 1 · 中文' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '下一首' }));
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
    fireEvent.click(screen.getByRole('button', { name: '放大歌詞' }));
    expect(screen.getByLabelText('目前字級')).toHaveTextContent('26');
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }));
    fireEvent.change(screen.getByRole('combobox', { name: '歌詞語言' }), { target: { value: 'mixed' } });
    expect(onPrintSettingsChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
    expect(screen.getByRole('combobox', { name: 'A4 版面' })).toHaveValue('readable');
    expect(container.querySelector('[data-print-page]')).toHaveStyle({ fontSize: `${DEFAULT_LYRICS_BOOK_SETTINGS.fontSize}px` });
    expect(screen.getByRole('button', { name: '匯出 A4 易讀版' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: 'compact' } });
    expect(onPrintSettingsChange).toHaveBeenCalledWith({ ...DEFAULT_LYRICS_BOOK_SETTINGS, layout: 'compact' });
    fireEvent.click(screen.getByRole('button', { name: '閱讀' }));
    expect(screen.getByLabelText('目前字級')).toHaveTextContent('26');
  });

  it('restores reading offset after print and after font reflow using a block anchor', () => {
    const { container } = render(<Harness/>);
    const root = screen.getByLabelText('歌詞內容');
    const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 400, width: 400, height, x: 0, y: top, toJSON: () => ({}) });
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect(100, 400));
    for (const [index, block] of Array.from(container.querySelectorAll<HTMLElement>('[data-book-block]')).entries()) {
      vi.spyOn(block, 'getBoundingClientRect').mockImplementation(() => {
        const size = parseFloat(container.querySelector<HTMLElement>('[data-lyrics-reading]')!.style.fontSize) / 24;
        return rect(100 + index * 600 * size - root.scrollTop, 600 * size);
      });
    }
    root.scrollTop = 650;
    fireEvent.click(screen.getByRole('button', { name: '放大歌詞' }));
    expect(root.scrollTop).toBe(700);
    fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
    expect(root.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '閱讀' }));
    // New DOM has no measured geometry in jsdom; fallback remains the saved offset.
    expect(root.scrollTop).toBe(700);
  });

  it('tracks the largest visible song without jumping when its selection is reported', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const onSelectSong = vi.fn();
    const { container } = render(<Harness onSelectSong={onSelectSong}/>);
    const root = screen.getByLabelText('歌詞內容');
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 400 } as DOMRect);
    const songs = Array.from(container.querySelectorAll<HTMLElement>('[data-setlist-preview-song-id]'));
    vi.spyOn(songs[0], 'getBoundingClientRect').mockReturnValue({ top: -500, bottom: 100 } as DOMRect);
    vi.spyOn(songs[1], 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 700 } as DOMRect);
    root.scrollTop = 500;
    fireEvent.wheel(root);
    fireEvent.scroll(root);
    act(() => frame?.(0));
    expect(onSelectSong).toHaveBeenCalledWith('repeat-entry');
    expect(root.scrollTop).toBe(500);
    expect(screen.getByRole('combobox', { name: '目前歌曲' })).toHaveValue('repeat-entry');
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
    expect(screen.getByRole('button', { name: '下一首' })).toBeDisabled();
    expect(within(screen.getByRole('combobox', { name: '目前歌曲' })).getByRole('option')).toHaveTextContent('尚無歌曲');
  });
});
