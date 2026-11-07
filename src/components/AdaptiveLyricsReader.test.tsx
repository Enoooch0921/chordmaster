import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdaptiveLyricsReader, { type LyricsReaderHandle } from './AdaptiveLyricsReader';
import PerformanceLyricsReader from './PerformanceLyricsReader';
import { DEFAULT_LYRICS_READING_SETTINGS } from '../hooks/useLyricsReadingPreferences';
import { mockLyricsReadingGeometry } from '../test/lyricsReadingGeometry';
import type { Song } from '../types';
const song: Song = { title: '長歌', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [], lyricsDoc: { chinese: '', blocks: [{ id: 'v', marker: 'Verse 1', chinese: Array.from({ length: 40 }, (_, i) => `歌詞 ${i}`).join('\n'), english: '' }] } };
let geometry: ReturnType<typeof mockLyricsReadingGeometry>;
beforeEach(() => { localStorage.clear(); geometry = mockLyricsReadingGeometry(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('jumps to a section with one press, selects it on the same page and keeps its anchor through reflow', async () => {
  const lyrics = { ...song, lyricsDoc: { chinese: '', blocks: [
    { id: 'v1', marker: 'Verse 1', chinese: '主歌第一段', english: '' },
    { id: 'v2', marker: 'Verse 2', chinese: '主歌第二段', english: '' },
    { id: 'c', marker: 'Chorus', chinese: '副歌第一句\n副歌第二句', english: '', pageBreakBefore: true },
  ] } };
  const anchors = vi.fn();
  const props = { song: lyrics, identity: 'sections', language: 'zh' as const, settings: DEFAULT_LYRICS_READING_SETTINGS, onAnchorChange: anchors };
  const { container, rerender } = render(<AdaptiveLyricsReader {...props}/>);
  expect(screen.queryByRole('button', { name: '下一頁' })).toBeNull();
  expect(screen.queryByRole('button', { name: '上一頁' })).toBeNull();
  expect(screen.queryByRole('combobox', { name: '跳到歌詞段落' })).toBeNull();
  expect(screen.getByRole('button', { name: '跳到 Verse 1' })).toHaveTextContent('V1');
  expect(screen.getByRole('button', { name: '跳到 Verse 2' })).toHaveTextContent('V2');
  fireEvent.click(screen.getByRole('button', { name: '跳到 Verse 2' }));
  expect(screen.getByRole('button', { name: '跳到 Verse 2' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '跳到 Verse 1' })).toHaveAttribute('aria-pressed', 'false');
  expect(anchors).toHaveBeenLastCalledWith({ blockId: 'v2', line: 0 });
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-page', '1');
  rerender(<AdaptiveLyricsReader {...props} settings={{ ...props.settings, fontSize: 28 }}/>);
  act(() => geometry.resize(1000, 600));
  await waitFor(() => expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-column-count', '2'));
  expect(screen.getByRole('button', { name: '跳到 Verse 2' })).toHaveAttribute('aria-pressed', 'true');
  expect(anchors).toHaveBeenLastCalledWith({ blockId: 'v2', line: 0 });
  fireEvent.click(screen.getByRole('button', { name: '跳到 Chorus' }));
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-page', '2');
  expect(container.querySelector('.alr-columns')).toHaveTextContent('副歌第一句');
  expect(screen.getByRole('button', { name: '跳到 Chorus' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(screen.getByLabelText('當頁歌詞'), { key: 'ArrowLeft' });
  expect(screen.getByRole('button', { name: '跳到 Verse 1' })).toHaveAttribute('aria-pressed', 'true');
});
it('preserves a source-line anchor through font changes and a tablet rotation', async () => {
  const props = { song, identity: 'entry', language: 'zh' as const, settings: DEFAULT_LYRICS_READING_SETTINGS };
  const { container, rerender } = render(<AdaptiveLyricsReader {...props}/>);
  fireEvent.keyDown(screen.getByLabelText('當頁歌詞'), { key: 'ArrowRight' });
  const id = container.querySelector('.alr-columns [data-source-line]')!.getAttribute('data-source-line');
  rerender(<AdaptiveLyricsReader {...props} settings={{ ...props.settings, fontSize: 28 }}/>);
  expect(container.querySelector(`.alr-columns [data-source-line="${id}"]`)).not.toBeNull();
  act(() => geometry.resize(1000, 600));
  await waitFor(() => expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-column-count', '2'));
  expect(container.querySelector(`.alr-columns [data-source-line="${id}"]`)).not.toBeNull();
  expect(Number(container.querySelector('.adaptive-lyrics-reader')!.getAttribute('data-font-size'))).toBe(28);
});

it('turns by touch swipe and half-screen taps without turning on scroll, pinch, selection or controls', () => {
  const { container } = render(<AdaptiveLyricsReader song={song} identity="touch" language="zh" settings={DEFAULT_LYRICS_READING_SETTINGS}/>);
  const reader = container.querySelector('.adaptive-lyrics-reader')!;
  const canvas = container.querySelector<HTMLElement>('.alr-canvas')!;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 16, width: 358 } as DOMRect);
  const point = (x: number, y = 300, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  const swipe = (x: number, y = 300) => {
    fireEvent.touchStart(canvas, { touches: [point(300)] });
    fireEvent.touchMove(canvas, { touches: [point(x, y)] });
    fireEvent.touchEnd(canvas, { touches: [], changedTouches: [point(x, y)] });
  };
  swipe(80);
  expect(reader).toHaveAttribute('data-reading-page', '2');
  // The browser's compatibility click must not turn a second page.
  fireEvent.click(canvas, { clientX: 300, detail: 1 });
  expect(reader).toHaveAttribute('data-reading-page', '2');
  fireEvent.pointerDown(canvas);
  fireEvent.click(canvas, { clientX: 50, detail: 1 });
  expect(reader).toHaveAttribute('data-reading-page', '1');
  swipe(290, 420);
  fireEvent.click(canvas, { clientX: 300, detail: 1 });
  expect(reader).toHaveAttribute('data-reading-page', '1');
  fireEvent.touchStart(canvas, { touches: [point(300), point(200, 300, 2)] });
  fireEvent.touchEnd(canvas, { touches: [], changedTouches: [point(80)] });
  fireEvent.click(canvas, { clientX: 300, detail: 1 });
  expect(reader).toHaveAttribute('data-reading-page', '1');
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(canvas.querySelector('.alr-line')!);
  selection.addRange(range);
  swipe(80);
  fireEvent.click(canvas, { clientX: 300, detail: 1 });
  expect(reader).toHaveAttribute('data-reading-page', '1');
  selection.removeAllRanges();
  fireEvent.click(screen.getByRole('button', { name: '跳到 Verse 1' }), { detail: 1 });
  expect(reader).toHaveAttribute('data-reading-page', '1');
  fireEvent.pointerDown(canvas);
  fireEvent.click(canvas, { clientX: 300, detail: 1 });
  expect(reader).toHaveAttribute('data-reading-page', '2');
});

it('uses leftover space only when splitting a section reduces the number of pages', () => {
  const lyrics = { ...song, lyricsDoc: { chinese: '', blocks: ['Verse 1', 'Chorus', 'Bridge'].map((marker, index) => ({
    id: `part-${index}`, marker, chinese: Array.from({ length: 5 }, (_, row) => `歌詞 ${row}`).join('\n'), english: '',
  })) } };
  const { container } = render(<AdaptiveLyricsReader song={lyrics} identity="packed" language="zh" settings={DEFAULT_LYRICS_READING_SETTINGS}/>);
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-page-count', '2');
  expect(container.querySelectorAll('.alr-columns .alr-block')).toHaveLength(2);
  fireEvent.keyDown(screen.getByLabelText('當頁歌詞'), { key: 'ArrowRight' });
  expect(container.querySelector('.alr-columns')).toHaveTextContent('Chorus(cont.)');
});
it('safely replaces a long song with a shorter song, even before measurement', () => {
  const { container, rerender } = render(<AdaptiveLyricsReader song={song} identity="long" language="zh" settings={DEFAULT_LYRICS_READING_SETTINGS}/>);
  fireEvent.keyDown(screen.getByLabelText('當頁歌詞'), { key: 'ArrowRight' });
  rerender(<AdaptiveLyricsReader song={{ ...song, title: '短歌', lyricsDoc: { chinese: '[Chorus]\n短歌詞' } }} identity="short" language="zh" settings={DEFAULT_LYRICS_READING_SETTINGS}/>);
  expect(container.querySelector('.alr-columns')).toHaveTextContent('短歌詞');
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-page', '1');
});
it('opens the previous song on its last page and uses entry identity for repeated songs', () => {
  const entries = [{ id: 'first', song }, { id: 'repeat', song }];
  const handle = React.createRef<LyricsReaderHandle>();
  function Harness() {
    const [id, setId] = React.useState('repeat');
    return <PerformanceLyricsReader ref={handle} entries={entries} selectedId={id} onSelectSong={setId} language="zh" preferenceKey="test"/>;
  }
  const { container } = render(<Harness/>);
  act(() => { handle.current!.previous(); });
  const reader = container.querySelector('.adaptive-lyrics-reader')!;
  expect(reader).toHaveAttribute('data-reading-song', 'first');
  expect(reader.getAttribute('data-reading-page')).toBe(reader.getAttribute('data-page-count'));
  act(() => { handle.current!.next(); });
  expect(reader.isConnected).toBe(false);
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-song', 'repeat');
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-page', '1');
});


it('widens the long-sentence column without changing the requested font or adding a page', () => {
  vi.restoreAllMocks();
  mockLyricsReadingGeometry(736, 517, true);
  const lyrics = { ...song, lyricsDoc: { chinese: '', blocks: [
    { id: 'v1', marker: 'Verse 1', chinese: '起初神的靈運行 在眾水之上\n聖靈澆灌我們\n祢的同在\n充滿我心', english: '' },
    ...['Verse 2', 'Chorus', 'Bridge'].map((marker, index) => ({ id: `part-${index}`, marker, chinese: '我們歡然歌唱\n一同敬拜\n一同讚美\n充滿我心', english: '' })),
  ] } };
  const { container } = render(<AdaptiveLyricsReader song={lyrics} identity="long-line" language="zh" settings={{ ...DEFAULT_LYRICS_READING_SETTINGS, fontSize: 30 }}/>);
  const reader = container.querySelector('.adaptive-lyrics-reader')!;
  expect(reader).toHaveAttribute('data-column-count', '2');
  expect(reader).toHaveAttribute('data-page-count', '1');
  expect(reader).toHaveAttribute('data-font-size', '30');
  const widths = reader.getAttribute('data-column-widths')!.split(',').map(Number);
  expect(widths[0]).toBeGreaterThan(widths[1]);
});

it('uses fewer, wider columns when a sentence cannot fit narrow columns above the readability floor', () => {
  vi.restoreAllMocks();
  mockLyricsReadingGeometry(736, 517, true);
  const lyrics = { ...song, lyricsDoc: { chinese: '[Verse 1]\n這是一句比較長但應當完整保留在同一行的歌詞' } };
  const { container } = render(<AdaptiveLyricsReader song={lyrics} identity="wide-line" language="zh" settings={DEFAULT_LYRICS_READING_SETTINGS}/>);
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-column-count', '1');
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-font-size', '24');
});

it('retains an exceptionally long phone sentence at a readable size instead of clipping it', () => {
  vi.restoreAllMocks();
  mockLyricsReadingGeometry(288, 360, true);
  const source = '這是一句比手機螢幕寬很多仍然需要保留完整內容的歌詞';
  const { container } = render(<AdaptiveLyricsReader song={{ ...song, lyricsDoc: { chinese: source } }} identity="phone-long" language="zh" settings={DEFAULT_LYRICS_READING_SETTINGS}/>);
  expect(Number(container.querySelector('.adaptive-lyrics-reader')!.getAttribute('data-font-size'))).toBe(24);
  expect(container.querySelector('.alr-columns')).toHaveTextContent(source);
});


it('keeps every song, page and viewport at the same requested size until the user changes it', async () => {
  const props = { song, identity: 'long', language: 'zh' as const, settings: { ...DEFAULT_LYRICS_READING_SETTINGS, fontSize: 30 } };
  const { container, rerender } = render(<AdaptiveLyricsReader {...props}/>);
  const size = () => container.querySelector('.adaptive-lyrics-reader')!.getAttribute('data-font-size');
  expect(size()).toBe('30');
  fireEvent.keyDown(screen.getByLabelText('當頁歌詞'), { key: 'ArrowRight' });
  expect(size()).toBe('30');
  act(() => geometry.resize(1200, 700));
  await waitFor(() => expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-column-count', '3'));
  expect(size()).toBe('30');
  rerender(<AdaptiveLyricsReader {...props} identity="short" song={{ ...song, lyricsDoc: { chinese: '[Chorus]\n短句' } }}/>);
  expect(size()).toBe('30');
  act(() => geometry.resize(288, 280));
  await waitFor(() => expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-column-count', '1'));
  expect(size()).toBe('30');
});
