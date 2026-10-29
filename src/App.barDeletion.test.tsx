import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { StoredSong, WorkspaceSnapshot } from './types';

let fixture: WorkspaceSnapshot;

vi.mock('./lib/auth', () => ({
  useSupabaseAuth: () => ({
    user: null, session: null, status: 'signed-out', isConfigured: false,
    signInWithGoogle: vi.fn(), signOut: vi.fn()
  })
}));
vi.mock('./lib/workspace', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/workspace')>(),
  loadPersistentWorkspaceSnapshot: async () => fixture
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => localStorage.clear());

it.each(['songs', 'setlists'])('deletes bars from the %s preview without crashing', async (mode) => {
  localStorage.clear();
  const song: StoredSong = {
    id: 'test-song', updatedAt: 1, title: '新歌 1',
    originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
    sections: [{
      id: 'section-1', title: 'Verse',
      bars: Array.from({ length: 4 }, (_, i) => ({ id: `bar-${i}`, chords: ['C'] }))
    }]
  };
  fixture = {
    songs: [song], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1,
    setlists: [{
      id: 'setlist-1', name: '測試歌單', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
      songs: [{
        id: 'entry-1', setlistId: 'setlist-1', songId: song.id, order: 0,
        sectionOrder: ['section-1'], songData: song
      }]
    }]
  };
  localStorage.setItem('chordmaster.workspace-mode.v1', mode);
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'setlist-1');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findAllByText('新歌 1');

  for (let i = 0; i < 4; i++) {
    const bar = document.querySelector('[data-preview-slot-index="0"]');
    expect(bar).not.toBeNull();
    fireEvent.click(bar!);
    fireEvent.click(await screen.findByRole('button', { name: '小節操作' }));
    const remove = await screen.findByRole('button', { name: '刪除' });
    fireEvent.click(remove);
    expect(document.querySelectorAll('[data-preview-clipboard-bar^="bar-"]')).toHaveLength(3 - i);
    expect(screen.queryByText('畫面暫時無法顯示')).not.toBeInTheDocument();
  }

  expect(screen.getByText('小節已刪除，可復原或完成這次編輯')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.queryByText('小節已刪除，可復原或完成這次編輯')).not.toBeInTheDocument();
  expect(document.querySelector('[data-preview-slot-index="0"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(screen.getByText('小節已刪除，可復原或完成這次編輯')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  expect(screen.queryByText('小節已刪除，可復原或完成這次編輯')).not.toBeInTheDocument();
  expect(song.sections[0].bars).toHaveLength(4);
}, 15000);

async function renderBatchPreview(mode: 'songs' | 'setlists') {
  const song: StoredSong = {
    id: 'batch-song', updatedAt: 1, title: '批次編輯測試',
    originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
    sections: [{ id: 'batch-section', title: 'Verse', bars: ['C', 'Dm', 'F', 'G'].map((chord, i) => ({ id: `batch-${i}`, chords: [chord] })) }]
  };
  fixture = {
    songs: [song], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1,
    setlists: [{ id: 'batch-list', name: '批次歌單', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
      songs: [{ id: 'batch-entry', setlistId: 'batch-list', songId: song.id, order: 0, sectionOrder: ['batch-section'], songData: song }] }]
  };
  localStorage.setItem('chordmaster.workspace-mode.v1', mode);
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'batch-list');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findAllByText('批次編輯測試');
  return song;
}

const batchBar = (index: number) => document.querySelector<HTMLElement>(`[data-preview-clipboard-bar="batch-${index}"]`)!;
const batchBars = () => document.querySelectorAll('[data-preview-clipboard-bar^="batch-"]');

it.each(['songs', 'setlists'] as const)('deletes a multi-bar selection in %s with either delete key and restores it in one undo', async (mode) => {
  const original = await renderBatchPreview(mode);
  for (const key of ['Delete', 'Backspace']) {
    fireEvent.click(batchBar(0), { metaKey: true });
    fireEvent.click(batchBar(1), { metaKey: true });
    expect(document.querySelectorAll('[data-preview-selected-bar]')).toHaveLength(2);
    const input = document.createElement('input');
    document.body.append(input);
    expect(fireEvent.keyDown(input, { key })).toBe(true);
    input.remove();
    expect(batchBars()).toHaveLength(4);
    fireEvent.keyDown(document.body, { key, repeat: true });
    fireEvent.keyDown(document.body, { key, isComposing: true });
    fireEvent.keyDown(document.body, { key, metaKey: true });
    expect(batchBars()).toHaveLength(4);
    expect(fireEvent.keyDown(document.body, { key })).toBe(false);
    expect(batchBars()).toHaveLength(2);
    expect(batchBar(0)).toBeNull();
    expect(batchBar(1)).toBeNull();
    expect(batchBar(2)).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', metaKey: true });
    await waitFor(()=>expect(batchBars()).toHaveLength(4));
  }
  expect(original.sections[0].bars).toHaveLength(4);
}, 15000);

it.each(['songs', 'setlists'] as const)('copies several bars and overwrites the destination in %s without inserting, with one-step undo', async (mode) => {
  await renderBatchPreview(mode);
  fireEvent.click(batchBar(0), { ctrlKey: true });
  fireEvent.click(batchBar(1), { ctrlKey: true });
  expect([...document.querySelectorAll<HTMLElement>('[data-preview-selected-bar]')].map((bar) => bar.dataset.previewClipboardBar)).toEqual(['batch-0', 'batch-1']);
  const values = new Map<string, string>();
  const clipboardData = { setData: (key: string, value: string) => values.set(key, value), getData: (key: string) => values.get(key) ?? '' };
  const dispatchClipboard = (type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);
  };
  dispatchClipboard('copy');
  expect(values.get('text/plain')).toBe('| C |\n| Dm |');
  fireEvent.click(batchBar(0), { ctrlKey: true });
  fireEvent.click(batchBar(1), { ctrlKey: true });
  fireEvent.contextMenu(batchBar(2));
  expect([...document.querySelectorAll<HTMLElement>('[data-preview-selected-bar]')].map((bar) => bar.dataset.previewClipboardBar)).toEqual(['batch-2']);
  // jsdom has no real pointer position; model the pointer over this destination.
  const querySelector = document.querySelector.bind(document);
  const hover = vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => selector === '[data-preview-hoverable]:hover'
    ? querySelector('[data-preview-clipboard-bar="batch-2"]') : querySelector(selector));
  try { dispatchClipboard('paste'); } finally { hover.mockRestore(); }
  expect(batchBar(2)).toHaveTextContent('F');
  fireEvent.click(screen.getByRole('menuitem', { name: '貼上小節' }));
  expect(batchBars()).toHaveLength(4);
  expect(batchBar(2)).toHaveTextContent('C');
  expect(batchBar(3)).toHaveTextContent('Dm');
  fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', metaKey: true });
  expect(batchBars()).toHaveLength(4);
  await waitFor(()=>{expect(batchBar(2)).toHaveTextContent('F');expect(batchBar(3)).toHaveTextContent('G');});
}, 15000);


it.each(['songs', 'setlists'] as const)('clears, closes, reopens and undoes the first bar from the %s context menu without moving later bars', async mode => {
  const original = await renderBatchPreview(mode);
  fireEvent.contextMenu(batchBar(0));
  expect(screen.getByRole('menuitem', { name: '關閉此小節' })).toBeDisabled();
  expect(screen.getByText('請先清空小節，再關閉')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: '清空此小節' }));
  expect(batchBar(0)).not.toHaveTextContent('C');
  expect(batchBar(1)).toHaveTextContent('Dm');
  fireEvent.contextMenu(batchBar(0));
  fireEvent.click(screen.getByRole('menuitem', { name: '關閉此小節' }));
  expect(batchBar(0)).toHaveAttribute('data-preview-closed-cell', 'true');
  expect(batchBars()).toHaveLength(4);
  expect(batchBar(1)).toHaveTextContent('Dm');
  expect(batchBar(2)).toHaveTextContent('F');
  expect(batchBar(3)).toHaveTextContent('G');
  fireEvent.contextMenu(screen.getByRole('button', { name: '已關閉的小節，開啟編輯' }));
  fireEvent.click(screen.getByRole('menuitem', { name: '重新開啟此小節' }));
  expect(batchBar(0)).not.toHaveAttribute('data-preview-closed-cell');
  fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', metaKey: true });
  await waitFor(()=>expect(batchBar(0)).toHaveAttribute('data-preview-closed-cell', 'true'));
  fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', metaKey: true });
  await waitFor(()=>expect(batchBar(0)).not.toHaveAttribute('data-preview-closed-cell'));
  fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', metaKey: true });
  await waitFor(()=>expect(batchBar(0)).toHaveTextContent('C'));
  expect(original.sections[0].bars[0].chords).toEqual(['C']);
}, 15000);

it('applies context clearing inside the active draft and undoes it without losing previous input', async () => {
  await renderBatchPreview('songs');
  fireEvent.click(batchBar(0).querySelector('[data-preview-slot-index="0"]')!);
  fireEvent.change(await screen.findByRole('textbox', { name: '和弦直接輸入' }), { target: { value: 'Em7' } });
  fireEvent.contextMenu(batchBar(0));
  fireEvent.click(screen.getByRole('menuitem', { name: '清空此小節' }));
  expect(batchBar(0)).not.toHaveTextContent('Em7');
  expect(screen.getByRole('textbox', { name: '和弦直接輸入' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(batchBar(0)).toHaveTextContent('Em7');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(batchBar(0)).toHaveTextContent('C');
});
