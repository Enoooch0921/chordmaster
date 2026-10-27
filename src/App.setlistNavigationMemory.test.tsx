import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, loadNavigationLocation, saveNavigationLocation, type SetlistNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({ cloud: false, members: false, role: 'viewer', load: vi.fn(), removeMember: vi.fn(), changeRole: vi.fn() }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: state.cloud ? { id: 'user', email: 'user@example.invalid', name: 'Test' } : null,
  session: state.cloud ? { access_token: 'test' } : null, status: state.cloud ? 'authenticated' : 'unconfigured', isConfigured: state.cloud, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({ listLibraries: async () => [{ id: 'team', name: 'Team', kind: 'team', role: state.role, ownerUserId: 'owner', createdAt: '', updatedAt: '' }],
  setActiveLibrary: vi.fn(), loadLibraryWorkspace: state.load, getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [],
  getSetlistShareStatus: async () => ({ activeToken: null, activeCreatedAt: null, participantCount: 0, participants: [] }), getProjectShareStatus: async () => ({ activeToken: null, activeCreatedAt: null, participantCount: state.members ? 1 : 0, participants: state.members ? [{ userId: 'member', name: '測試成員', email: 'member@example.invalid', role: 'viewer' }] : [] }), removeSharedMember: state.removeMember, setProjectMemberRole: state.changeRole,
  getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }), subscribeToLibraryChanges: () => () => {} }) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: [], failed: false }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, dismiss: vi.fn(), restored: vi.fn() }) }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
const remembered: SetlistNavigationLocation = { version: 1, workspaceMode: 'setlists', filter: { kind: 'owned-project', projectId: 'la' }, parentFilter: { kind: 'owned-project', projectId: 'la' }, view: 'detail', setlistId: 'meeting', songId: 'entry' };
const mount = () => render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
beforeEach(() => {
  localStorage.clear(); state.cloud = false; state.members = false; state.role = 'viewer'; state.load.mockReset(); state.removeMember.mockReset(); state.changeRole.mockReset();
  const song = { id: 'song', title: '測試歌曲', originalKey: 'C' as const, currentKey: 'C' as const, timeSignature: '4/4', updatedAt: 1, sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
  fixture = { songs: [song], projects: [{ id: 'la', name: '洛杉磯烈火', createdAt: 1, updatedAt: 1 }],
    setlists: [{ id: 'meeting', name: '聚會一', projectId: 'la', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1, songs: [{ id: 'entry', setlistId: 'meeting', songId: 'song', songData: song, order: 0, sectionOrder: ['verse'] }] }], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1 };
});
afterEach(() => localStorage.clear());

it('reopens the same meeting rather than resetting to the overview', async () => {
  saveNavigationLocation(getNavigationStorageKey(null, null), remembered);
  const first = mount();
  await screen.findByDisplayValue('聚會一');
  first.unmount(); mount();
  await screen.findByDisplayValue('聚會一');
});
it.each(['meeting', 'project'])('falls back one level when the remembered %s was archived', async item => {
  saveNavigationLocation(getNavigationStorageKey(null, null), remembered);
  if (item === 'meeting') fixture.setlists[0].archived = true;
  else fixture.projects[0].archived = true;
  mount();
  await waitFor(() => expect(loadNavigationLocation(getNavigationStorageKey(null, null))).toMatchObject({ view: 'list', filter: item === 'meeting' ? remembered.filter : { kind: 'all' } }));
  expect(screen.queryByDisplayValue('聚會一')).toBeNull();
  expect(screen.getByText('請從列表選擇歌單')).toBeInTheDocument();
});
it('acknowledges a tap before opening and remembers the resulting detail view', async () => {
  saveNavigationLocation(getNavigationStorageKey(null, null), { ...remembered, view: 'list' });
  mount();
  await screen.findAllByText('測試歌曲');
  fireEvent.click(await within(document.querySelector('[data-sidebar]')!).findByText('聚會一'));
  expect(within(document.querySelector('[data-setlist-preview-pane]')!).getByRole('status')).toHaveTextContent('正在開啟「聚會一」…');
  expect(within(document.querySelector('[data-sidebar]')!).queryByText('正在開啟「聚會一」…')).toBeNull();
  expect(screen.queryByDisplayValue('聚會一')).toBeNull();
  await screen.findByDisplayValue('聚會一');
  expect(screen.queryByText('正在開啟「聚會一」…')).toBeNull();
  await waitFor(() => expect(loadNavigationLocation(getNavigationStorageKey(null, null))?.view).toBe('detail'));
});
it('waits for cloud shared projects before restoring or replacing the saved location', async () => {
  state.cloud = true;
  const key = getNavigationStorageKey('user', 'team');
  const shared = { ...remembered, filter: { kind: 'shared-project', projectId: 'la' } as const, parentFilter: { kind: 'shared-project', projectId: 'la' } as const };
  saveNavigationLocation(key, shared);
  const remote: WorkspaceSnapshot = { ...fixture, projects: [], setlists: [], joinedProjects: [{ ...fixture.projects[0], isJoined: true, role: 'viewer', setlists: fixture.setlists }] };
  fixture = { songs: [], setlists: [], projects: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: null };
  let resolve!: (value: WorkspaceSnapshot) => void;
  state.load.mockReturnValue(new Promise<WorkspaceSnapshot>(done => { resolve = done; }));
  mount();
  await waitFor(() => expect(state.load).toHaveBeenCalled());
  expect(loadNavigationLocation(key)).toEqual(shared);
  await act(async () => resolve(remote));
  await within(document.querySelector('[data-sidebar]')!).findByText('聚會一');
  await waitFor(() => expect(loadNavigationLocation(key)).toEqual(shared));
  expect(screen.getByRole('button', { name: /返回.*歌單/ })).toBeInTheDocument();
}, 15000);

it('reveals member removal without navigating or changing their project role', async () => {
  state.cloud = true; state.members = true; state.role = 'owner';
  state.load.mockResolvedValue(fixture);
  saveNavigationLocation(getNavigationStorageKey('user', 'team'), { ...remembered, view: 'list' });
  mount();
  const name = await screen.findByText('測試成員');
  const details = name.closest('details')!;
  fireEvent.click(details.querySelector('summary')!);
  const row = name.closest('[data-swipe-foreground]')!;
  fireEvent.pointerDown(row, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 180, clientY: 30 });
  fireEvent.pointerMove(row, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 30 });
  fireEvent.pointerUp(row, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 30 });
  expect(within(details).getByRole('button', { name: /移除.*測試成員/ })).toBeInTheDocument();
  expect(state.changeRole).not.toHaveBeenCalled(); expect(state.removeMember).not.toHaveBeenCalled();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(within(details).getByRole('button', { name: /移除.*測試成員/ }));
  await waitFor(() => expect(state.removeMember).toHaveBeenCalledWith('project', 'la', 'member'));
  expect(state.changeRole).not.toHaveBeenCalled();
  confirm.mockRestore();
});
