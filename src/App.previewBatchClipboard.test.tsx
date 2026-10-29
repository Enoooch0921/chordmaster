import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { WorkspaceSnapshot } from './types';

let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({
  user: null, session: null, status: 'signed-out', isConfigured: false,
  signInWithGoogle: vi.fn(), signOut: vi.fn()
}) }));
vi.mock('./lib/workspace', async original => ({
  ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  const song = { id: 'gesture-song', updatedAt: 1, title: '手勢測試', originalKey: 'C' as const, currentKey: 'C' as const,
    timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: Array.from({ length: 8 }, (_, i) => ({ id: `bar-${i}`, chords: [['C', 'Dm', 'F', 'G'][i % 4]], rhythm: i % 2 ? 'h h' : 'q q q q', riff: `${i % 7 + 1} 2 3 4` })) }] };
  fixture = { songs: [song], setlists: [{ id: 'set', name: '測試歌單', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', setlistId: 'set', songId: song.id, order: 0, sectionOrder: ['verse'], songData: song }] }],
    projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'set');
});
afterEach(() => localStorage.clear());


const bar = (i: number) => document.querySelector<HTMLElement>(`[data-preview-hoverable][data-preview-clipboard-bar="bar-${i}"]`)!;
const selection = () => [...document.querySelectorAll<HTMLElement>('[data-preview-selected-bar]')].map(node => node.dataset.previewClipboardBar);
async function start(mode = 'songs') {
  localStorage.setItem('chordmaster.workspace-mode.v1', mode);
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findAllByText('手勢測試');
  await waitFor(() => expect(bar(0)).not.toBeNull());
}

it.each(['songs', 'setlists'])('extends, shrinks and adds ranges in %s', async mode => {
  await start(mode);
  fireEvent.click(bar(0), { metaKey: true });
  fireEvent.click(bar(4), { shiftKey: true });
  expect(selection()).toEqual(['bar-0', 'bar-1', 'bar-2', 'bar-3', 'bar-4']);
  fireEvent.click(bar(2), { shiftKey: true });
  expect(selection()).toEqual(['bar-0', 'bar-1', 'bar-2']);
  fireEvent.click(bar(6), { ctrlKey: true });
  fireEvent.click(bar(7), { ctrlKey: true, shiftKey: true });
  expect(selection()).toEqual(['bar-0', 'bar-1', 'bar-2', 'bar-6', 'bar-7']);
}, 15000);

it.each(['小節', '和弦', '節奏', '簡譜'])('copies complete bars once and chooses %s when pasting', async label => {
  fixture.songs[0].sections[0].bars[4] = { id: 'bar-4', chords: ['B7'], rhythm: 'w', riff: '7 7 7 7' };
  await start();
  fireEvent.click(bar(0), { metaKey: true });
  fireEvent.click(bar(1), { shiftKey: true });
  fireEvent.contextMenu(bar(1), { clientX: 150, clientY: 150 });
  expect(screen.queryByRole('menuitem', { name: '複製和弦' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: '複製小節' }));
  fireEvent.contextMenu(bar(4), { clientX: 150, clientY: 150 });
  const group = screen.getByRole('group', { name: '貼上' });
  expect(within(group).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['小節', '和弦', '節奏', '簡譜']);
  expect(screen.getByRole('menuitem', { name: '貼到前方' })).not.toBeDisabled();
  const first = within(group).getByRole('menuitem', { name: '貼上小節' });
  first.focus(); fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(within(group).getByRole('menuitem', { name: '貼上和弦' }));
  fireEvent.click(within(group).getByRole('menuitem', { name: `貼上${label}` }));
  await waitFor(() => expect(selection()).toEqual(['bar-4', 'bar-5']));
  const kind = label === '小節' ? '完整小節' : label;
  expect(await screen.findByText(`已貼上${kind}（2 小節）`)).toBeTruthy();
  expect(bar(4).querySelector('[data-chord-root]')?.textContent).toBe(['小節', '和弦'].includes(label) ? 'C' : 'B');
  expect(within(bar(4)).getAllByRole('button', { name: /Select rhythm note/ })).toHaveLength(['小節', '節奏'].includes(label) ? 4 : 1);
  expect(bar(4).querySelector('[data-jianpu-onset="0"]')?.textContent).toBe(['小節', '簡譜'].includes(label) ? '1' : '7');
}, 15000);

function nativeClipboardEvent(type: 'copy' | 'paste', values: Map<string, string>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (key: string) => values.get(key) ?? '', setData: (key: string, value: string) => values.set(key, value) } });
  fireEvent(window, event);
}
it('opens paste choices before modifying data, supports Escape, and reuses the full copy for different lanes', async () => {
  await start();
  fireEvent.click(bar(0), { metaKey: true });
  const clipboard = new Map<string, string>();
  nativeClipboardEvent('copy', clipboard);
  expect(clipboard.get('text/plain')).toContain('q q q q');
  expect(clipboard.get('text/plain')).toContain('1 2 3 4');
  fireEvent.contextMenu(bar(5), { clientX: 150, clientY: 150 });
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  nativeClipboardEvent('paste', clipboard);
  const menu = screen.getByRole('menu', { name: '選擇貼上內容' });
  expect(within(bar(5)).getAllByRole('button', { name: /Select rhythm note/ })).toHaveLength(2);
  fireEvent.keyDown(menu, { key: 'Escape' });
  expect(screen.queryByRole('menu', { name: '選擇貼上內容' })).toBeNull();
  nativeClipboardEvent('paste', clipboard);
  fireEvent.click(screen.getByRole('menuitem', { name: '貼上節奏' }));
  expect(within(bar(5)).getAllByRole('button', { name: /Select rhythm note/ })).toHaveLength(4);
  expect(bar(5).querySelector('[data-chord-root]')?.textContent).toBe('D');
  expect(bar(5).querySelector('[data-jianpu-onset="0"]')?.textContent).toBe('6');
  nativeClipboardEvent('paste', clipboard);
  fireEvent.click(screen.getByRole('menuitem', { name: '貼上簡譜' }));
  expect(bar(5).querySelector('[data-jianpu-onset="0"]')?.textContent).toBe('1');
  expect(bar(5).querySelector('[data-chord-root]')?.textContent).toBe('D');
}, 15000);

it('uses a normally clicked bar as the Shift anchor and keeps that anchor on repeated range changes', async () => {
  await start();
  fireEvent.click(bar(2).querySelector<HTMLElement>('[data-preview-hover-field="jianpu"]')!);
  await waitFor(() => expect(document.querySelector('[data-preview-bar-editor]')).not.toBeNull());
  fireEvent.click(bar(5), { shiftKey: true });
  expect(selection()).toEqual(['bar-2', 'bar-3', 'bar-4', 'bar-5']);
  fireEvent.click(bar(0), { shiftKey: true });
  expect(selection()).toEqual(['bar-0', 'bar-1', 'bar-2']);
}, 15000);

it('retains chord and rhythm selection across the subdivision editor and mode switches', async () => {
  fixture.songs[0].sections[0].bars[0] = { id: 'bar-0', chords: ['Gmaj7', '/', 'G', 'G/B'], rhythm: 'e3r e q e e q', chordSubdivisions: [{ beat: 2, offset: .5, chord: 'Am' }] };
  await start();
  fireEvent.click(bar(0).querySelector('[data-chord-event-position="3"]')!);
  const selected = () => bar(0).querySelector('.preview-section-active-chord');
  expect(selected()).toHaveAttribute('data-preview-slot-index', '2');
  const toggle = screen.getByRole('button', { name: '拍內和弦與指定遍數和弦' });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(selected()).toHaveAttribute('data-preview-slot-index', '2');
  fireEvent.click(screen.getByRole('button', { name: '切換到節奏' }));
  fireEvent.click(within(bar(0)).getByRole('button', { name: 'Select rhythm note 4' }));
  const cursor = bar(0).querySelector('[data-rhythm-cursor-unit]')?.getAttribute('data-rhythm-cursor-unit');
  fireEvent.click(screen.getByRole('button', { name: '切換到和弦' }));
  fireEvent.click(screen.getByRole('button', { name: '拍內和弦與指定遍數和弦' }));
  fireEvent.click(screen.getByRole('button', { name: '拍內和弦與指定遍數和弦' }));
  expect(selected()).toHaveAttribute('data-preview-slot-index', '2');
  fireEvent.click(screen.getByRole('button', { name: '切換到節奏' }));
  expect(bar(0).querySelector('[data-rhythm-cursor-unit]')).toHaveAttribute('data-rhythm-cursor-unit', cursor);
  expect(within(bar(0)).getByRole('button', { name: 'Select rhythm note 4' })).toHaveAttribute('aria-pressed', 'true');
}, 15000);
