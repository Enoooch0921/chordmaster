import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdaptiveLyricsReader from './AdaptiveLyricsReader';
import PerformanceLyricsReader from './PerformanceLyricsReader';
import { DEFAULT_LYRICS_READING_SETTINGS } from '../hooks/useLyricsReadingPreferences';
import { mockLyricsReadingGeometry } from '../test/lyricsReadingGeometry';
import type { Song } from '../types';
const song: Song = { title: '長歌', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [], lyricsDoc: { chinese: '', blocks: [{ id: 'v', marker: 'Verse 1', chinese: Array.from({ length: 40 }, (_, i) => `歌詞 ${i}`).join('\n'), english: '' }] } };
let geometry: ReturnType<typeof mockLyricsReadingGeometry>;
beforeEach(() => { localStorage.clear(); geometry = mockLyricsReadingGeometry(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('preserves a source-line anchor through font changes and a tablet rotation', async () => {
  const props = { song, identity: 'entry', language: 'zh' as const, settings: DEFAULT_LYRICS_READING_SETTINGS };
  const { container, rerender } = render(<AdaptiveLyricsReader {...props}/>);
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
  const id = container.querySelector('.alr-columns [data-source-line]')!.getAttribute('data-source-line');
  rerender(<AdaptiveLyricsReader {...props} settings={{ ...props.settings, fontSize: 28 }}/>);
  expect(container.querySelector(`.alr-columns [data-source-line="${id}"]`)).not.toBeNull();
  act(() => geometry.resize(1000, 600));
  await waitFor(() => expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-column-count', '2'));
  expect(container.querySelector(`.alr-columns [data-source-line="${id}"]`)).not.toBeNull();
  expect(Number(container.querySelector('.adaptive-lyrics-reader')!.getAttribute('data-font-size'))).toBe(28);
});
it('safely replaces a long song with a shorter song, even before measurement', () => {
  const { container, rerender } = render(<AdaptiveLyricsReader song={song} identity="long" language="zh" settings={DEFAULT_LYRICS_READING_SETTINGS}/>);
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
  rerender(<AdaptiveLyricsReader song={{ ...song, title: '短歌', lyricsDoc: { chinese: '[Chorus]\n短歌詞' } }} identity="short" language="zh" settings={DEFAULT_LYRICS_READING_SETTINGS}/>);
  expect(container.querySelector('.alr-columns')).toHaveTextContent('短歌詞');
  expect(container.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-page', '1');
});
it('opens the previous song on its last page and uses entry identity for repeated songs', () => {
  const entries = [{ id: 'first', song }, { id: 'repeat', song }];
  function Harness() {
    const [id, setId] = React.useState('repeat');
    return <PerformanceLyricsReader entries={entries} selectedId={id} onSelectSong={setId} language="zh" preferenceKey="test"/>;
  }
  const { container } = render(<Harness/>);
  fireEvent.click(screen.getByRole('button', { name: '上一首' }));
  const reader = container.querySelector('.adaptive-lyrics-reader')!;
  expect(reader).toHaveAttribute('data-reading-song', 'first');
  expect(reader.getAttribute('data-reading-page')).toBe(reader.getAttribute('data-page-count'));
  fireEvent.click(screen.getByRole('button', { name: '下一首' }));
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
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
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
