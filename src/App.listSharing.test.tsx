import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, loadNavigationLocation, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { LibraryRole, WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({ kind: 'personal', role: 'owner' as LibraryRole,
  reorder: vi.fn(), setRole: vi.fn(), setKey: vi.fn(), create: vi.fn(), saveSong: vi.fn(), saveSetlist: vi.fn(), saveProject: vi.fn(), status: vi.fn() }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: { id: 'user', email: 'test@example.invalid', name: 'Test' },
  session: { access_token: 'test' }, status: 'authenticated', isConfigured: true, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({
  listLibraries: async () => [{ id: 'library', name: '測試工作區', kind: state.kind, role: state.role, ownerUserId: 'user', createdAt: '', updatedAt: '' }],
  setActiveLibrary: vi.fn(), loadLibraryWorkspace: async () => fixture,
  createShareLink: state.create, saveSong: state.saveSong, saveSetlist: state.saveSetlist, saveProject: state.saveProject,
  loadJoinedWorkspace: async () => fixture, applyWorkspaceHistory: state.reorder,
  setSetlistMemberRole: state.setRole, setProjectSetlistSongKey: state.setKey,
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

it('shows the member count only after the owner enables sharing on an empty setlist', async () => {
  let activeToken: string | null = null;
  state.status.mockImplementation(async () => ({ activeToken, activeCreatedAt: null, participantCount: 0, participants: [] }));
  state.create.mockImplementationOnce(async () => { activeToken = 'new-token'; return activeToken; });
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!, view: 'detail' });
  mount();
  await waitFor(() => expect(state.status).toHaveBeenCalledWith('first'));
  expect(screen.queryByRole('button', { name: /^成員與權限/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '歌單操作' }));
  fireEvent.click(screen.getByRole('menuitem', { name: '分享歌單' }));
  await waitFor(() => expect(state.create).toHaveBeenCalledWith('setlist', 'first'));
  expect(await screen.findByRole('textbox', { name: '分享連結' })).toHaveValue(`${window.location.origin}/share/new-token`);
  await waitFor(() => expect(document.querySelector('[data-members-trigger="setlist"]')).toHaveTextContent('成員0'));
});

it('opens the existing selected-setlist invitation directly and reuses its own link', async () => {
  const location = loadNavigationLocation(navigationKey())!;
  saveNavigationLocation(navigationKey(), { ...location, view: 'detail' }); mount();
  await waitFor(() => expect(state.status).toHaveBeenCalledWith('first'));
  const members = await screen.findByRole('button', { name: /^成員與權限/ });
  expect(members).toHaveTextContent('成員0');
  expect(screen.queryByRole('heading', { name: /^成員與權限/ })).toBeNull();
  fireEvent.click(members);
  await screen.findByText(/尚無共享成員/);
  fireEvent.click(await screen.findByRole('button', { name: '邀請' }));
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

it('changes a direct member’s role from a standalone setlist and restores the saved value on failure', async () => {
  const member = { userId: 'guest', name: '小安', email: 'guest@example.invalid', role: 'viewer', joinedAt: '' };
  state.status.mockImplementation(async () => ({ activeToken: null, participantCount: 1, participants: [{ ...member }] }));
  state.setRole.mockImplementation(async (_id, _user, role) => { member.role = role; });
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!, view: 'detail' });
  mount();
  const members = await screen.findByRole('button', { name: '成員與權限：小安' });
  expect(members).toHaveTextContent('成員1');
  expect(screen.queryByRole('combobox', { name: '小安的權限' })).toBeNull();
  fireEvent.click(members);
  const select = await screen.findByRole('combobox', { name: '小安的權限' });
  fireEvent.change(select, { target: { value: 'manager' } });
  await waitFor(() => expect(state.setRole).toHaveBeenCalledWith('first', 'guest', 'manager'));
  await waitFor(() => expect(select).toBeEnabled());
  expect(select).toHaveValue('manager');
  state.setRole.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.change(select, { target: { value: 'viewer' } });
  await screen.findByText('更新成員權限失敗，請重試。');
  expect(select).toHaveValue('manager');
  fireEvent.click(screen.getByRole('button', { name: '歌單內容' }));
  await waitFor(() => expect(screen.queryByRole('combobox', { name: '小安的權限' })).toBeNull());
  expect(await screen.findByRole('button', { name: '成員與權限：小安' })).toHaveFocus();
  expect(loadNavigationLocation(navigationKey())).toMatchObject({ view: 'detail', setlistId: 'first', songId: 'first-entry' });
});

it.each(['viewer', 'manager'] as const)('uses the direct %s role for the shared Key and order controls', async role => {
  const [list] = fixture.setlists;
  fixture = { ...fixture, setlists: [], projects: [], joinedSetlists: [{ ...list, isJoined: true, role }] };
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!, view: 'detail' });
  mount();
  const key = await screen.findByRole('button', { name: 'Key C' });
  if (role === 'manager') {
    expect(key).toBeEnabled();
    fireEvent.click(key);
    fireEvent.click(await screen.findByRole('button', { name: 'D' }));
    await waitFor(() => expect(state.setKey).toHaveBeenCalledWith('first-entry', 'D'));
    await screen.findByRole('button', { name: 'Key D' });
  } else expect(key).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '歌單操作' }));
  await screen.findByRole('menuitem', { name: '退出' });
  expect(Boolean(screen.queryByRole('menuitem', { name: '調整歌曲順序' }))).toBe(role === 'manager');
  expect(screen.queryByRole('menuitem', { name: '刪除' })).toBeNull();
});


it('reorders a directly joined setlist and undoes it without writing to the personal library', async () => {
  const [list] = fixture.setlists;
  const secondEntry = { ...list.songs[0], id: 'other-entry', order: 1 };
  fixture = { ...fixture, setlists: [], projects: [], joinedSetlists: [
    { ...list, songs: [...list.songs, secondEntry], role: 'manager', isJoined: true }
  ] };
  state.reorder.mockImplementation(async entry => {
    const current = fixture.joinedSetlists[0];
    fixture = { ...fixture, joinedSetlists: [{ ...current, songs: [...current.songs].reverse().map((song, order) => ({ ...song, order })) }] };
    return entry;
  });
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!, view: 'detail' });
  mount();
  const order = () => [...document.querySelectorAll('[data-setlist-song-id]')].map(el => el.getAttribute('data-setlist-song-id'));
  await waitFor(() => expect(order()).toEqual(['first-entry', 'other-entry']));
  const second = document.querySelector<HTMLElement>('[data-setlist-song-id="other-entry"]')!;
  fireEvent.keyDown(within(second).getByRole('button', { name: /拖動排序/ }), { key: 'ArrowUp' });
  await waitFor(() => expect(order()).toEqual(['other-entry', 'first-entry']));
  const undo = screen.getByRole('button', { name: '復原 (Cmd/Ctrl+Z)' });
  await waitFor(() => expect(undo).toBeEnabled());
  fireEvent.click(undo);
  await waitFor(() => expect(order()).toEqual(['first-entry', 'other-entry']));
  expect(state.reorder.mock.calls.map(call => call[1])).toEqual(['redo', 'undo']);
  expect(state.saveSetlist).not.toHaveBeenCalled();
});


it('opens a failed count and retries from the setlist member page', async () => {
  state.status.mockRejectedValueOnce(new Error('offline'));
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!, view: 'detail' });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: /成員載入失敗/ }));
  const detail = await screen.findByRole('region', { name: /^成員與權限/ });
  expect(within(detail).getByRole('alert')).toHaveTextContent('無法載入成員');
  fireEvent.click(screen.getByRole('button', { name: '重新整理成員' }));
  await screen.findByText(/尚無共享成員/);
});
