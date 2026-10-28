import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, loadNavigationLocation, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { LibraryRole, WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({ kind: 'personal', role: 'owner' as LibraryRole,
  create: vi.fn(), saveSong: vi.fn(), saveSetlist: vi.fn(), saveProject: vi.fn(), status: vi.fn() }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: { id: 'user', email: 'test@example.invalid', name: 'Test' },
  session: { access_token: 'test' }, status: 'authenticated', isConfigured: true, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({
  listLibraries: async () => [{ id: 'library', name: '測試工作區', kind: state.kind, role: state.role, ownerUserId: 'user', createdAt: '', updatedAt: '' }],
  setActiveLibrary: vi.fn(), loadLibraryWorkspace: async () => fixture,
  createShareLink: state.create, saveSong: state.saveSong, saveSetlist: state.saveSetlist, saveProject: state.saveProject,
  getSetlistShareStatus: state.status, getProjectShareStatus: async () => ({ activeToken: null, activeCreatedAt: null, participantCount: 0, participants: [] }),
  getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }),
  getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [], subscribeToLibraryChanges: () => () => {}
}) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: [], failed: false }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, error: null, dismiss: vi.fn(), restored: vi.fn() }) }));
vi.mock('./components/useAnchoredPortalPanel', () => ({ useAnchoredPortalPanel: () => ({
  panelStyle: { position: 'fixed', top: 0, left: 0 }, placement: 'bottom', isPositioned: true, transformOrigin: 'top right'
}) }));
const navigationKey = () => getNavigationStorageKey('user', 'library');
const mount = () => render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); state.kind = 'personal'; state.role = 'owner';
  state.create.mockResolvedValue('target-token'); state.saveSong.mockResolvedValue(undefined);
  state.saveSetlist.mockResolvedValue(undefined); state.saveProject.mockResolvedValue(undefined);
  state.status.mockImplementation(async (id: string) => ({ activeToken: id === 'first' ? 'first-token' : null,
    activeCreatedAt: null, participantCount: 0, participants: [] }));
  const song = { id: 'song', title: '測試歌曲', originalKey: 'C' as const, currentKey: 'C' as const,
    timeSignature: '4/4', updatedAt: 1, sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
  fixture = { songs: [song], projects: [{ id: 'project', name: '測試專案', createdAt: 1, updatedAt: 1 }],
    setlists: ['first', 'second'].map((id, i) => ({ id, name: `歌單${i + 1}`, displayMode: 'chord-movable-key',
      createdAt: 1, updatedAt: 1, songs: [{ id: `${id}-entry`, setlistId: id, songId: 'song', songData: song, order: 0, sectionOrder: ['verse'] }] })),
    joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.active-library.user.v1', 'library');
  saveNavigationLocation(navigationKey(), { version: 1, workspaceMode: 'setlists', filter: { kind: 'all' },
    parentFilter: { kind: 'all' }, view: 'list', setlistId: 'first', songId: 'first-entry' });
});
afterEach(() => localStorage.clear());

it.each(['personal', 'team'])('shares a different setlist from the %s list without changing selection or reusing the selected link', async kind => {
  state.kind = kind; mount();
  await waitFor(() => expect(state.status).toHaveBeenCalledWith('first'));
  fireEvent.click(await screen.findByRole('button', { name: '歌單2的歌單操作' }));
  fireEvent.click(screen.getByRole('menuitem', { name: '分享／邀請' }));
  expect(await screen.findByRole('textbox', { name: '分享連結' })).toHaveValue(`${window.location.origin}/share/target-token`);
  expect(state.create).toHaveBeenCalledWith('setlist', 'second');
  expect(loadNavigationLocation(navigationKey())).toMatchObject({ view: 'list', setlistId: 'first', songId: 'first-entry' });
  expect(screen.queryByRole('textbox', { name: '歌單名稱' })).toBeNull();
  if (kind === 'personal') expect(state.saveSetlist).toHaveBeenCalledWith(expect.objectContaining({ id: 'second' }));
  expect(state.status).not.toHaveBeenCalledWith('second');
});

it('opens the existing selected-setlist invitation directly and reuses its own link', async () => {
  const location = loadNavigationLocation(navigationKey())!;
  saveNavigationLocation(navigationKey(), { ...location, view: 'detail' }); mount();
  await waitFor(() => expect(state.status).toHaveBeenCalledWith('first'));
  fireEvent.click(await screen.findByRole('button', { name: '邀請加入歌單' }));
  expect(await screen.findByRole('textbox', { name: '分享連結' })).toHaveValue(`${window.location.origin}/share/first-token`);
  expect(state.create).not.toHaveBeenCalled();
});

it('shares a project directly from the list and keeps its management invitation', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: '專案操作：測試專案' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '分享／邀請' }));
  expect(await screen.findByRole('textbox', { name: '分享連結' })).toHaveValue(`${window.location.origin}/share/target-token`);
  expect(state.create).toHaveBeenCalledWith('project', 'project');
  expect(loadNavigationLocation(navigationKey())?.view).toBe('list');
  fireEvent.click(screen.getByRole('button', { name: '關閉分享' }));
  fireEvent.click(screen.getByRole('button', { name: '專案操作：測試專案' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '專案管理' }));
  expect(await screen.findByRole('button', { name: '邀請' })).toBeEnabled();
});

it('keeps sharing actions unavailable for a team viewer', async () => {
  state.kind = 'team'; state.role = 'viewer'; mount();
  await screen.findByRole('button', { name: '專案操作：測試專案' });
  expect(screen.queryByRole('button', { name: '歌單2的歌單操作' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '專案操作：測試專案' }));
  await screen.findByRole('menuitem', { name: '專案管理' });
  expect(screen.queryByRole('menuitem', { name: '分享／邀請' })).toBeNull();
  expect(state.create).not.toHaveBeenCalled();
});
