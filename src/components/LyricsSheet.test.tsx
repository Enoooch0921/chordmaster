import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import LyricsSheet from './LyricsSheet';

const song: Song = { title: '歌詞測試', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [], lyricsDoc: { chinese: '1. 原本歌詞\n第二行\n\n※ 副歌' } };
function Editable() {
  const [current, setCurrent] = React.useState(song);
  return <LyricsSheet song={current} language="zh" onChange={setCurrent} />;
}

describe('lyrics in-place editing', () => {
  it('edits directly inside the printable page and commits once on blur', () => {
    const onChange = vi.fn();
    render(<LyricsSheet song={song} language="zh" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '中文歌詞 Verse 1' }));
    const input = screen.getByRole('textbox', { name: '中文歌詞 Verse 1' });
    expect(input.closest('[data-print-page]')).not.toBeNull();
    fireEvent.change(input, { target: { value: '新的歌詞\n保留換行' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].lyricsDoc.chinese).toBe('[Verse 1]\n新的歌詞\n保留換行\n\n[Chorus]\n副歌');
  });
  it('preserves Chinese composition and lets Escape cancel after composition finishes', () => {
    const onChange = vi.fn();
    render(<LyricsSheet song={song} language="zh" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '中文歌詞 Verse 1' }));
    const input = screen.getByRole('textbox', { name: '中文歌詞 Verse 1' });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '中文輸入' } });
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(screen.getByRole('textbox', { name: '中文歌詞 Verse 1' })).toHaveValue('中文輸入');
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '中文歌詞 Verse 1' })).toHaveTextContent('原本歌詞');
  });
  it('replaces an existing section marker rather than stacking symbols', () => {
    render(<Editable />);
    fireEvent.click(screen.getByRole('button', { name: '中文歌詞 Verse 1' }));
    fireEvent.blur(screen.getByRole('textbox', { name: '中文歌詞 Verse 1' }));
    fireEvent.change(screen.getByLabelText('段落類型'), { target: { value: 'Bridge' } });
    expect(screen.getByRole('button', { name: '中文歌詞 Bridge' })).toHaveTextContent('原本歌詞');
    expect(screen.queryByRole('button', { name: '中文歌詞 Verse 1' })).toBeNull();
  });
  it('moves both languages together when reordering a section', () => {
    const bilingual = { ...song, lyricsDoc: { chinese: '1. 甲\n\n※ 乙', english: '1. A\n\n※ B' } };
    const onChange = vi.fn();
    render(<LyricsSheet song={bilingual} language="zh" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '中文歌詞 Verse 1' }));
    fireEvent.blur(screen.getByRole('textbox', { name: '中文歌詞 Verse 1' }));
    fireEvent.click(screen.getByRole('button', { name: '下移' }));
    expect(onChange.mock.calls[0][0].lyricsDoc.blocks.map((block: { english: string }) => block.english)).toEqual(['B', 'A']);
  });
  it('renders multiple export pages with no editor controls', () => {
    const longSong = { ...song, lyricsDoc: { chinese: `1. ${Array.from({ length: 200 }, (_, i) => `歌詞 ${i}`).join('\n')}` } };
    const { container } = render(<LyricsSheet song={longSong} language="zh" exportMode />);
    const pages = container.querySelectorAll('[data-print-page]');
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[pages.length - 1]).toHaveTextContent('歌詞 199');
    expect(screen.queryByRole('button')).toBeNull();
    expect(pages[0]).toHaveAttribute('data-export-page-total', String(pages.length));
  });
  it('allows read-only readers to change language without exposing editing', () => {
    render(<LyricsSheet song={{ ...song, lyricsDoc: { chinese: '中文', english: 'English' } }} language="zh" />);
    fireEvent.change(screen.getByLabelText('歌詞語言'), { target: { value: 'english' } });
    expect(screen.queryByRole('button', { name: '＋ 新增段落' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('shows understandable English headings for old numbered and symbolic sections', () => {
    const { container } = render(<LyricsSheet song={song} language="zh" exportMode />);
    const page = container.querySelector('[data-print-page]')!;
    expect(page.querySelector('h2')).toHaveTextContent('Verse 1');
    expect(page.textContent).toContain('Chorus');
    expect(page.textContent).not.toContain('※');
  });
  it('defaults to the reference sheets’ 14 pt lyrics and 22 pt baseline spacing', () => {
    const { container } = render(<LyricsSheet song={song} language="zh" exportMode />);
    const page = container.querySelector<HTMLElement>('[data-print-page]')!;
    expect(parseFloat(page.style.fontSize) * 0.75).toBeCloseTo(14);
    expect(parseFloat(page.style.fontSize) * parseFloat(page.style.lineHeight) * 0.75).toBeCloseTo(22);
  });
  it('shows punctuation-free phrases in single-song editing without changing the source on focus or cancel', () => {
    const onChange = vi.fn();
    const withPunctuation = { ...song, lyricsDoc: { chinese: '[Verse 1]\n「第一句」，第二句。\n第三句！' } };
    render(<LyricsSheet song={withPunctuation} language="zh" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '中文歌詞 Verse 1' }));
    const input = screen.getByRole('textbox', { name: '中文歌詞 Verse 1' });
    expect(input).toHaveValue('第一句 第二句\n第三句');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
  });

});
