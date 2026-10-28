import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { loadActiveLibraryPreference, saveActiveLibraryPreference } from './lib/activeLibraryPreference';
import { getNavigationStorageKey, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({ auth: 'authenticated', list: vi.fn(), load: vi.fn(), setActive: vi.fn() }));
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({
  user: state.auth === 'authenticated' ? { id: 'user', email: 'test@example.invalid', name: 'Test' } : null,
  session: state.auth === 'authenticated' ? { access_token: 'test' } : null,
  status: state.auth, isConfigured: state.auth !== 'unconfigured', signInWithGoogle: vi.fn(), signOut: vi.fn()
}) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(),
  loadPersistentWorkspaceSnapshot: async () => localWorkspace
}));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({
  listLibraries: state.list, setActiveLibrary: state.setActive, loadLibraryWorkspace: state.load,
  getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [],
  getSetlistShareStatus: async () => ({ activeToken: null, activeCreatedAt: null, participantCount: 0, participants: [] }),
  getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }), subscribeToLibraryChanges: () => () => {}
}) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: [], failed: false }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, error: null, dismiss: vi.fn(), restored: vi.fn() }) }));
vi.mock('./components/useAnchoredPortalPanel', () => ({ useAnchoredPortalPanel: () => ({
  panelStyle: { position: 'fixed', top: 0, left: 0 }, placement: 'bottom', isPositioned: true, transformOrigin: 'top right'
}) }));

const makeSong = (id: string, title: string) => ({ id, title, originalKey: 'C' as const, currentKey: 'C' as const,
  timeSignature: '4/4', updatedAt: 1, sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] });
const personal = { id: 'personal', name: '個人區', kind: 'personal', role: 'owner', ownerUserId: 'user', createdAt: '', updatedAt: '' };
const team = { ...personal, id: 'team', name: 'TopChurchWorship', kind: 'team' };
let localWorkspace: WorkspaceSnapshot;
let remoteWorkspace: WorkspaceSnapshot;
const view = () => <MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>;
const root = () => document.querySelector<HTMLElement>('[data-app-root]')!;
const expectPersonalHidden = () => {
  expect(screen.queryByRole('button', { name: '開啟歌曲：個人快取歌曲' })).toBeNull();
  expect(root()).toHaveAttribute('aria-hidden', 'true');
  expect(root()).toHaveAttribute('inert');
};
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
  localStorage.clear(); state.auth = 'authenticated'; state.list.mockReset(); state.load.mockReset(); state.setActive.mockReset();
  localWorkspace = { songs: [makeSong('personal-song', '個人快取歌曲')], setlists: [], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  remoteWorkspace = { ...localWorkspace, songs: [makeSong('team-song', '點燃（官方版）')] };
  state.list.mockResolvedValue([personal, team]); state.load.mockResolvedValue(remoteWorkspace);
  saveActiveLibraryPreference('user', 'team');
  localStorage.setItem('chordmaster.workspace-mode.v1', 'songs');
});
afterEach(() => localStorage.clear());

it('covers the personal cache through auth, library discovery and complete team loading', async () => {
  state.auth = 'loading';
  const libraries = deferred<typeof team[]>();
  const workspace = deferred<WorkspaceSnapshot>();
  state.list.mockReturnValue(libraries.promise); state.load.mockReturnValue(workspace.promise);
  const mounted = render(view());
  await screen.findByRole('status', { name: '正在還原工作區…' }); expectPersonalHidden();
  expect(state.list).not.toHaveBeenCalled();
  state.auth = 'authenticated'; mounted.rerender(view());
  await waitFor(() => expect(state.list).toHaveBeenCalledOnce()); expectPersonalHidden();
  await act(async () => libraries.resolve([personal, team]));
  expect(screen.getByRole('status', { name: '正在載入 TopChurchWorship…' })).toBeInTheDocument();
  expectPersonalHidden(); expect(state.load).toHaveBeenCalledWith('team');
  await act(async () => workspace.resolve(remoteWorkspace));
  expect(await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' })).toBeInTheDocument();
  expect(root()).not.toHaveAttribute('aria-hidden'); expect(root()).not.toHaveAttribute('inert');
  expect(screen.queryByRole('status', { name: /正在.*工作區|正在載入 TopChurch/ })).toBeNull();
  expect(state.setActive).toHaveBeenCalledWith('team');
  mounted.rerender(view());
  expect(state.load).toHaveBeenCalledOnce();
});

it('reveals the remembered team meeting only after its navigation is restored', async () => {
  const song = remoteWorkspace.songs[0];
  remoteWorkspace.setlists = [{ id: 'meeting', name: '聚會一', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', setlistId: 'meeting', songId: song.id, songData: song, order: 0, sectionOrder: ['verse'] }] }];
  saveNavigationLocation(getNavigationStorageKey('user', 'team'), { version: 1, workspaceMode: 'setlists',
    filter: { kind: 'all' }, parentFilter: { kind: 'all' }, view: 'detail', setlistId: 'meeting', songId: 'entry' });
  render(view());
  expect(await screen.findByRole('textbox', { name: '歌單名稱' })).toHaveValue('聚會一');
  expect(root()).not.toHaveAttribute('aria-hidden');
  expect(screen.queryByRole('status', { name: /正在.*工作區|正在載入 TopChurch/ })).toBeNull();
});

it.each(['list', 'load'] as const)('keeps the team selection on %s failure and retries without showing personal content', async operation => {
  state[operation].mockRejectedValueOnce(new Error('連線暫時中斷'));
  render(view());
  fireEvent.click(await screen.findByRole('button', { name: '重試' }));
  expectPersonalHidden(); expect(loadActiveLibraryPreference('user')).toBe('team');
  expect(await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' })).toBeInTheDocument();
  expect(state.load).toHaveBeenLastCalledWith('team');
  expect(root()).not.toHaveAttribute('aria-hidden');
});

it('keeps local mode available without waiting for a cloud workspace', async () => {
  state.auth = 'unconfigured'; render(view());
  expect(await screen.findByRole('button', { name: '開啟歌曲：個人快取歌曲' })).toBeInTheDocument();
  expect(state.list).not.toHaveBeenCalled(); expect(root()).not.toHaveAttribute('aria-hidden');
});
