import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';

let fixture: WorkspaceSnapshot;
let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({
  user: null, session: null, status: 'unconfigured', isConfigured: false,
  signInWithGoogle: vi.fn(), signOut: vi.fn()
}) }));
vi.mock('./lib/workspace', async original => ({
  ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 844);
  viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  const songs = ['常常喜樂', '感恩的心'].map((title, index) => ({
    id: `song-${index}`, title, updatedAt: 1, originalKey: 'C' as const, currentKey: 'C' as const,
    timeSignature: '4/4', sections: [{ id: `verse-${index}`, title: 'Verse', bars: [{ id: `bar-${index}`, chords: ['C'] }] }]
  }));
  fixture = { songs, projects: [], setlists: [{ id: 'meeting', name: '主日敬拜', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1, songs: [] }],
    joinedProjects: [], joinedSetlists: [], lastSavedAt: 1 };
  saveNavigationLocation(getNavigationStorageKey(null, null), {
    version: 1, workspaceMode: 'setlists', filter: { kind: 'all' }, parentFilter: { kind: 'all' },
    view: 'detail', setlistId: 'meeting', songId: null
  });
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const mount = () => render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
const openPicker = async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: '固定歌曲列表' }));
  const sidebar = document.querySelector<HTMLElement>('[data-sidebar]')!;
  fireEvent.click(await within(sidebar).findByRole('button', { name: '加入歌曲' }));
  return await screen.findByRole('textbox', { name: '搜尋要加入的歌曲' });
};

it('searches and adds a song with the reduced keyboard viewport, restoring navigation afterwards', async () => {
  const input = await openPicker();
  const picker = input.closest<HTMLElement>('[data-setlist-add-scroll]')!;
  const results = picker.querySelector<HTMLElement>('[data-setlist-detail-scroll]')!;
  expect(document.querySelector('[data-mobile-sidebar-navigation]')).toBeNull();
  fireEvent.focus(input);
  viewport.height = 340; viewport.offsetTop = 20;
  act(() => viewport.dispatchEvent(new Event('resize')));
  await waitFor(() => expect(document.querySelector<HTMLElement>('[data-app-root]')!.style.height).toBe('340px'));
  picker.scrollTop = 250; results.scrollTop = 250;
  fireEvent.change(input, { target: { value: '常常' } });
  expect(picker.scrollTop).toBe(0); expect(results.scrollTop).toBe(0);
  const choice = within(results).getByRole('button', { name: /常常喜樂/ });
  expect(within(results).queryByRole('button', { name: /感恩的心/ })).toBeNull();
  fireEvent.click(choice);
  expect(choice).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: '加入 1 首' }));
  await waitFor(() => expect(document.querySelector('[data-setlist-song-id]')).toHaveTextContent('常常喜樂'));
  expect(document.querySelector('[data-mobile-sidebar-navigation]')).not.toBeNull();
});

it('keeps Chinese composition focused, and only dismisses the keyboard for a completed Enter', async () => {
  const input = await openPicker();
  input.focus();
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).not.toHaveFocus();
  expect(input).toHaveAttribute('enterkeyhint', 'done');
});

it.each([390, 820, 1280])('shows the edit-mode toggle only beyond phone width (%i)', async width => {
  vi.stubGlobal('innerWidth', width);
  mount();
  await screen.findByDisplayValue('主日敬拜');
  expect(screen.queryByRole('button', { name: '打開編輯器' }) !== null).toBe(width >= 640);
});
