import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { applyWorkspaceHistory } from './lib/workspaceHistory';
import { getNavigationStorageKey, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { SetlistShareStatus, WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({ share: vi.fn(), apply: vi.fn(), saveSetlist: vi.fn() }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({
  user: { id: 'history-user', email: 'history@example.invalid', name: 'History' }, session: { access_token: 'test' },
  status: 'authenticated', isConfigured: true, signInWithGoogle: vi.fn(), signOut: vi.fn()
}) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({
  listLibraries: async () => [{ id: 'team', name: '測試團隊', kind: 'team', role: 'owner', ownerUserId: 'history-user', createdAt: '', updatedAt: '' }],
  setActiveLibrary: vi.fn(), loadLibraryWorkspace: async () => fixture, loadLibraryContent: async () => fixture,
  getSetlistShareStatus: state.share, applyWorkspaceHistory: state.apply, saveSetlist: state.saveSetlist,
  getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [],
  getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }), subscribeToLibraryChanges: () => () => {}
}) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: [], failed: false }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, error: null, dismiss: vi.fn(), restored: vi.fn() }) }));
vi.mock('./components/useAnchoredPortalPanel', () => ({ useAnchoredPortalPanel: () => ({
  panelStyle: { position: 'fixed', top: 0, left: 0 }, placement: 'bottom', isPositioned: true, transformOrigin: 'top right'
}) }));

const status: SetlistShareStatus = { activeToken: 'synthetic-link', activeCreatedAt: null, participantCount: 1,
  participants: [{ userId: 'member', name: '測試團員', email: 'member@example.invalid', role: 'viewer', joinedAt: '' }] };
const rowOrder = () => Array.from(document.querySelectorAll('[data-setlist-song-id]'), item => item.getAttribute('data-setlist-song-id'));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear(); state.share.mockReset().mockResolvedValue(status); state.apply.mockReset(); state.saveSetlist.mockReset();
  const songs = ['第一首', '第二首'].map((title, i) => ({ id: `song-${i}`, title, originalKey: 'C' as const, currentKey: 'C' as const,
    timeSignature: '4/4', updatedAt: 1, sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] }));
  fixture = { songs, setlists: [{ id: 'meeting', name: '共享聚會', createdAt: 1, updatedAt: 1, createdBy: 'history-user', displayMode: 'chord-movable-key',
    songs: songs.map((song, order) => ({ id: `entry-${order}`, setlistId: 'meeting', songId: song.id, songData: song, order, sectionOrder: ['verse'] })) }],
    projects: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1 };
  state.saveSetlist.mockImplementation(async setlist => { fixture = { ...fixture, setlists: fixture.setlists.map(item => item.id === setlist.id ? setlist : item) }; });
  state.apply.mockImplementation(async (entry, direction) => { fixture = { ...fixture, ...applyWorkspaceHistory(fixture, entry, direction) }; return entry; });
  localStorage.setItem('chordmaster.active-library.history-user.v1', 'team');
  localStorage.setItem('chordmaster.workspace-mode.v1', 'setlists');
  saveNavigationLocation(getNavigationStorageKey('history-user', 'team'), { version: 1, workspaceMode: 'setlists', filter: { kind: 'all' },
    parentFilter: { kind: 'all' }, view: 'detail', setlistId: 'meeting', songId: 'entry-0' });
});
afterEach(() => localStorage.clear());

async function mount(width: number) {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(width);
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await waitFor(() => expect(state.share).toHaveBeenCalledWith('meeting'));
  if (width < 640) fireEvent.click(await screen.findByRole('button', { name: '固定歌曲列表' }));
  const panel = await waitFor(() => {
    const panel = document.querySelector<HTMLDetailsElement>('.setlist-sharing-summary'); expect(panel).not.toBeNull(); return panel!;
  });
  panel.open = true;
  return panel;
}

it.each([390, 834, 1440])('keeps sharing status mounted through undo/redo at %ipx and centers completion feedback', async width => {
  const panel = await mount(width);
  const initialReads = state.share.mock.calls.length;
  // A redundant read would remain pending, exposing any cleared sharing panel.
  state.share.mockImplementation(() => new Promise(() => {}));
  fireEvent.keyDown(screen.getByRole('button', { name: '拖動排序：第二首' }), { key: 'ArrowUp' });
  expect(rowOrder()).toEqual(['entry-1', 'entry-0']);
  const undo = screen.getByRole('button', { name: '復原 (Cmd/Ctrl+Z)' });
  await waitFor(() => expect(undo).toBeEnabled());
  const pending = deferred<void>();
  const apply = state.apply.getMockImplementation()!;
  state.apply.mockImplementationOnce(async (...args) => { await pending.promise; return apply(...args); });
  fireEvent.click(undo);
  const loading = await screen.findByText('正在撤銷歌曲排序…');
  const feedback = loading.closest('[data-ui-toast]');
  expect(document.querySelector('.setlist-sharing-summary')).toBe(panel); expect(panel.open).toBe(true);
  await act(async () => pending.resolve());
  await waitFor(() => expect(rowOrder()).toEqual(['entry-0', 'entry-1']));
  const message = await screen.findByText('已撤銷歌曲排序');
  expect(message.closest('[data-ui-toast]')).toBe(feedback);
  expect(message.closest('[data-toast-viewport]')).toHaveAttribute('data-toast-viewport', 'history');
  expect(document.querySelector('.setlist-sharing-summary')).toBe(panel); expect(panel.open).toBe(true);
  expect(panel).toHaveTextContent('測試團員'); expect(state.share).toHaveBeenCalledTimes(initialReads);
  const redo = screen.getByRole('button', { name: '重做 (Shift+Cmd/Ctrl+Z)' });
  await waitFor(() => expect(redo).toBeEnabled()); fireEvent.click(redo);
  await waitFor(() => expect(rowOrder()).toEqual(['entry-1', 'entry-0']));
  expect(await screen.findByText('已重做歌曲排序')).toBeInTheDocument();
  expect(document.querySelector('.setlist-sharing-summary')).toBe(panel); expect(panel.open).toBe(true);
  expect(state.share).toHaveBeenCalledTimes(initialReads);
}, 15000);

it('keeps the current share panel and badge while an explicit refresh is pending', async () => {
  const panel = await mount(834);
  const update = deferred<SetlistShareStatus>(); state.share.mockReturnValueOnce(update.promise);
  const badge = panel.querySelector('summary span')!;
  const text = badge.textContent;
  fireEvent.click(within(panel).getByRole('button', { name: /^重新整理$/ }));
  expect(document.querySelector('.setlist-sharing-summary')).toBe(panel); expect(panel.open).toBe(true);
  expect(badge).toHaveTextContent(text!); expect(panel).toHaveTextContent('測試團員');
  await act(async () => update.resolve({ ...status, participantCount: 2 }));
  expect(document.querySelector('.setlist-sharing-summary')).toBe(panel); expect(panel.open).toBe(true);
});

it('keeps failed history replay visible in the same centered card and preserves sharing data', async () => {
  const panel = await mount(834);
  fireEvent.keyDown(screen.getByRole('button', { name: '拖動排序：第二首' }), { key: 'ArrowUp' });
  const undo = screen.getByRole('button', { name: '復原 (Cmd/Ctrl+Z)' });
  await waitFor(() => expect(undo).toBeEnabled());
  state.apply.mockRejectedValueOnce(new Error('連線中斷，請重試撤銷'));
  fireEvent.click(undo);
  const error = await screen.findByText('連線中斷，請重試撤銷');
  expect(error.closest('[data-toast-viewport]')).toHaveAttribute('data-toast-viewport', 'history');
  expect(rowOrder()).toEqual(['entry-1', 'entry-0']);
  expect(document.querySelector('.setlist-sharing-summary')).toBe(panel); expect(panel.open).toBe(true);
  expect(panel).toHaveTextContent('測試團員'); await waitFor(() => expect(undo).toBeEnabled());
});
