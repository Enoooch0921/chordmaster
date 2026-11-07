import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { mockLyricsReadingGeometry } from './test/lyricsReadingGeometry';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';

const exports = vi.hoisted(() => vi.fn());
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./lib/pdfExport', () => ({ exportCaptureHostToPdf: exports }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});

beforeEach(() => {
  mockLyricsReadingGeometry();
  localStorage.clear();
  exports.mockReset().mockImplementation(async (host: HTMLElement) => ({
    layout: host.querySelector<HTMLElement>('[data-book-layout]')?.dataset.bookLayout,
    titles: Array.from(host.querySelectorAll('[data-print-page] [data-book-song-title]'), node => node.textContent),
    controls: host.querySelectorAll('button, select').length,
  }));
  const songs = ['one', 'two'].map(id => ({
    id, updatedAt: 1, title: `歌曲 ${id}`, originalKey: 'C' as const, currentKey: 'C' as const, timeSignature: '4/4',
    sections: [{ id: `${id}-verse`, title: 'Verse', bars: [{ id: `${id}-bar`, chords: ['C'] }] }],
    lyricsDoc: { chinese: '[Verse]\n主歌第一行\n主歌第二行\n\n[Chorus]\n副歌第一行\n副歌第二行' },
  }));
  fixture = { songs, projects: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1,
    setlists: [{ id: 'meeting', name: '歌詞排版聚會', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
      songs: songs.map((song, order) => ({ id: `entry-${song.id}`, setlistId: 'meeting', songId: song.id, songData: song, order, sectionOrder: [song.sections[0].id] })) }],
  };
  localStorage.setItem('chordmaster.workspace-mode.v1', 'setlists');
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'meeting');
  localStorage.setItem('chordmaster.selected-setlist-song-id.v1', 'entry-one');
  saveNavigationLocation(getNavigationStorageKey(null, null), { version: 1, workspaceMode: 'setlists', filter: { kind: 'all' }, parentFilter: { kind: 'all' }, view: 'detail', setlistId: 'meeting', songId: 'entry-one' });
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

const mountLyrics = async () => {
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findByDisplayValue('歌詞排版聚會');
  fireEvent.click(screen.getAllByRole('button', { name: '歌詞模式' })[0]);
  await waitFor(() => expect(document.querySelector('.adaptive-lyrics-reader')).not.toBeNull());
};

it('opens locked reading, navigates songs, and retains both A4 layouts independently of reading size', async () => {
  const original = JSON.stringify(fixture);
  await mountLyrics();
  expect(document.querySelector('[data-lyrics-workspace-mode]')).toHaveAttribute('data-lyrics-workspace-mode', 'reading');
  expect(screen.getByRole('combobox', { name: '目前歌曲' }).closest('.slw-toolbar')).not.toBeNull();
  expect(document.querySelector('.alr-heading')).toBeNull();
  expect(document.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-song', 'entry-one');
  expect(document.querySelector('.alr-canvas button')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '下一首' }));
  expect(screen.getByRole('combobox', { name: '目前歌曲' })).toHaveValue('entry-two');
  fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }));
  fireEvent.click(screen.getByRole('button', { name: '放大歌詞' }));
  expect(document.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-font-size', '26');
  fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
  expect(document.querySelector('[data-print-page]')).toHaveTextContent('《歌曲 one》');
  expect(parseFloat((document.querySelector('[data-print-page]') as HTMLElement).style.fontSize)).toBeCloseTo(16 * 4 / 3);
  expect(screen.getByRole('combobox', { name: 'A4 版面' }).closest('.slw-paper')).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: 'compact' } });
  expect(document.querySelector('.lyrics-book')).toHaveAttribute('data-book-layout', 'compact');
  fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: 'readable' } });
  expect(document.querySelector('.lyrics-book')).toHaveAttribute('data-book-layout', 'readable');
  expect(JSON.stringify(fixture)).toBe(original);
});

it('exports the selected layout through the real PDF action, including from reading view', async () => {
  await mountLyrics();
  for (const layout of ['readable', 'compact'] as const) {
    fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: layout } });
    if (layout === 'compact') fireEvent.click(screen.getByRole('button', { name: '閱讀' }));
    fireEvent.click(screen.getAllByRole('button', { name: '更多' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: '匯出歌單 PDF' }));
    await waitFor(() => expect(exports).toHaveBeenCalledTimes(layout === 'readable' ? 1 : 2));
    expect(await exports.mock.results.at(-1)!.value).toEqual({ layout, titles: ['1. 《歌曲 one》', '2. 《歌曲 two》'], controls: 0 });
    await waitFor(() => expect(document.querySelector('[data-pdf-capture-root]')).toBeNull());
  }
});

it('uses screen reading in performance independently of the chosen A4 layout', async () => {
  await mountLyrics();
  fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: 'compact' } });
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  await waitFor(() => expect(document.querySelector('[data-performance-overlay] .adaptive-lyrics-reader')).toHaveAttribute('data-reading-song', 'entry-one'));
  expect(document.querySelector('[data-performance-overlay] [data-print-page]')).toBeNull();
});

it('edits only the chosen entry after explicit Edit, returns to locked reading, and restores the chart viewport', async () => {
  await mountLyrics();
  fireEvent.change(screen.getByRole('combobox', { name: '目前歌曲' }), { target: { value: 'entry-two' } });
  fireEvent.click(screen.getByRole('button', { name: '編輯' }));
  expect(screen.queryByRole('button', { name: '切換 A4 排版' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^中文歌詞 Verse/ }));
  const input = screen.getByRole('textbox', { name: /^中文歌詞 Verse/ });
  fireEvent.change(input, { target: { value: '修改第二首主歌' } });
  fireEvent.blur(input);
  fireEvent.click(screen.getByRole('button', { name: '完成編輯' }));
  expect(document.querySelector('[data-reading-song="entry-two"]')).toHaveTextContent('修改第二首主歌');
  fireEvent.change(screen.getByRole('combobox', { name: '目前歌曲' }), { target: { value: 'entry-one' } });
  expect(document.querySelector('[data-reading-song="entry-one"]')).toHaveTextContent('主歌第一行');
  expect(document.querySelector('.lyrics-book textarea')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: '歌詞模式' })[0]);
  await waitFor(() => expect(document.querySelector('[data-print-preview-container]')).not.toBeNull());
  expect(document.querySelector('[data-lyrics-workspace-mode]')).toBeNull();
});

it('turns lyrics once per pedal press and retains the page on an App refresh', async () => {
  const lyrics = Array.from({ length: 150 }, (_, i) => `主歌歌詞第 ${i + 1} 行`).join('\n');
  for (const song of fixture.songs) song.lyricsDoc = { chinese: lyrics };
  for (const entry of fixture.setlists[0].songs) entry.songData = fixture.songs.find(song => song.id === entry.songId);
  await mountLyrics();
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  const reader = () => document.querySelector('[data-performance-overlay] .adaptive-lyrics-reader');
  await waitFor(() => expect(Number(reader()?.getAttribute('data-page-count'))).toBeGreaterThan(2));
  fireEvent.keyDown(window, { key: 'ArrowRight', code: 'ArrowRight' });
  fireEvent.keyUp(window, { key: 'ArrowRight', code: 'ArrowRight' });
  expect(reader()).toHaveAttribute('data-reading-page', '2');
  act(() => window.dispatchEvent(new Event('offline')));
  expect(reader()).toHaveAttribute('data-reading-page', '2');
});

it('preserves native section-picker keys in performance', async () => {
  await mountLyrics();
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  const overlay = document.querySelector('[data-performance-overlay]')!;
  const select = overlay.querySelector('select')!;
  select.focus();
  const event = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true });
  act(() => select.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(overlay.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-song', 'entry-one');
  expect(select).toHaveFocus();
});

it('retains the single-song reading anchor across its original A4 print view', async () => {
  localStorage.removeItem('chordmaster.workspace-mode.v1');
  localStorage.removeItem('chordmaster.selected-setlist-id.v1');
  localStorage.removeItem('chordmaster.selected-setlist-song-id.v1');
  localStorage.removeItem(getNavigationStorageKey(null, null));
  fixture.songs[0].lyricsDoc = { chinese: Array.from({ length: 80 }, (_, i) => `單首歌第 ${i + 1} 行`).join('\n') };
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findAllByRole('button', { name: '歌詞模式' });
  fireEvent.click(screen.getAllByRole('button', { name: '歌詞模式' })[0]);
  await waitFor(() => expect(document.querySelector('.adaptive-lyrics-reader')).not.toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
  const firstLine = document.querySelector('.alr-columns [data-source-line]')!.getAttribute('data-source-line');
  fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
  expect(document.querySelector('.adaptive-lyrics-reader')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '大字閱讀' }));
  expect(document.querySelector(`.alr-columns [data-source-line="${firstLine}"]`)).not.toBeNull();
});
