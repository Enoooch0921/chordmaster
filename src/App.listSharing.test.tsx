import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, loadNavigationLocation, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { LibraryRole, WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({ kind: 'personal', role: 'owner' as LibraryRole,
  reorder: vi.fn(), setRole: vi.fn(), setKey: vi.fn(), saveSettings: vi.fn(), create: vi.fn(), saveSong: vi.fn(), saveSetlist: vi.fn(), saveProject: vi.fn(), status: vi.fn() }));
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
  saveSharedSetlistSongSettings: state.saveSettings,
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

it('keeps the first invitation available in an unshared project folder', async () => {
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!,
    filter: { kind: 'owned-project', projectId: 'project' }, view: 'list' });
  mount();
  const actions = await screen.findByRole('button', { name: '專案操作' });
  expect(screen.queryByRole('button', { name: /^成員與權限/ })).toBeNull();
  fireEvent.click(actions);
  fireEvent.click(await screen.findByRole('menuitem', { name: '分享／邀請' }));
  expect(await screen.findByRole('textbox', { name: '分享連結' })).toHaveValue(`${window.location.origin}/share/target-token`);
  expect(state.create).toHaveBeenCalledWith('project', 'project');
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
  expect(Boolean(screen.queryByRole('combobox', { name: '歌曲設定' }))).toBe(role === 'manager');
  fireEvent.click(screen.getByRole('button', { name: '歌單操作' }));
  await screen.findByRole('menuitem', { name: '退出' });
  expect(Boolean(screen.queryByRole('menuitem', { name: '調整歌曲順序' }))).toBe(role === 'manager');
  expect(screen.queryByRole('menuitem', { name: '刪除' })).toBeNull();
});

it('saves a joined manager’s song map and metadata through the shared entry only', async () => {
  const [list] = fixture.setlists;
  const source = fixture.songs[0];
  fixture = { ...fixture, setlists: [], projects: [], joinedSetlists: [{ ...list, isJoined: true, role: 'manager' }] };
  state.saveSettings.mockResolvedValueOnce({ ...source, setlistSongMap: [{ label: 'Verse', repeats: 2 }] });
  state.saveSettings.mockRejectedValueOnce(new Error('儲存失敗，請再試一次。'));
  state.saveSettings.mockResolvedValueOnce({ ...source, setlistSongMap: [{ label: 'Verse', repeats: 2 }], title: '本場歌名' });
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!, view: 'detail' });
  const { container } = mount();
  const settings = await screen.findByRole('combobox', { name: '歌曲設定' });
  expect(container.querySelector('[data-preview-edit-hit]')).toBeNull();
  fireEvent.change(settings, { target: { value: 'map' } });
  const map = await screen.findByRole('dialog', { name: '本場曲序' });
  fireEvent.click(within(map).getByRole('button', { name: '增加遍數' }));
  fireEvent.click(within(map).getByRole('button', { name: '儲存曲序' }));
  await waitFor(() => expect(state.saveSettings).toHaveBeenCalledWith('first', 'first-entry', { setlistSongMap: [{ label: 'Verse', repeats: 2 }] }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '本場曲序' })).toBeNull());
  expect(await screen.findByRole('img', { name: 'Verse，共 2 遍' })).toBeInTheDocument();

  settings.focus();
  fireEvent.change(settings, { target: { value: 'info' } });
  const info = await screen.findByRole('dialog', { name: '歌曲資訊' });
  await waitFor(() => expect(within(info).getByRole('button', { name: '取消' })).toHaveFocus());
  const title = within(info).getByDisplayValue('測試歌曲');
  fireEvent.change(title, { target: { value: '本場歌名' } });
  fireEvent.click(within(info).getByRole('button', { name: '儲存歌曲資訊' }));
  expect(await within(info).findByRole('alert')).toHaveTextContent('儲存失敗，請再試一次。');
  expect(title).toHaveValue('本場歌名');
  fireEvent.click(within(info).getByRole('button', { name: '儲存歌曲資訊' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '歌曲資訊' })).toBeNull());
  await waitFor(() => expect(settings).toHaveFocus());
  expect(state.saveSettings).toHaveBeenLastCalledWith('first', 'first-entry', { title: '本場歌名' });
  expect(await screen.findAllByText('本場歌名')).not.toHaveLength(0);
  expect(state.saveSong).not.toHaveBeenCalled();
  expect(state.saveSetlist).not.toHaveBeenCalled();
});


it('saves shared BPM from the song row and toolbar while retaining a failed edit for retry', async () => {
  const [list] = fixture.setlists;
  const source = fixture.songs[0];
  fixture = { ...fixture, setlists: [], projects: [], joinedSetlists: [{ ...list, isJoined: true, role: 'manager' }] };
  state.saveSettings.mockReset()
    .mockRejectedValueOnce(new Error('速度儲存失敗'))
    .mockResolvedValueOnce({ ...source, tempo: 108 })
    .mockResolvedValueOnce(source);
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!, view: 'detail' });
  mount();

  const row = await waitFor(() => {
    const element = document.querySelector<HTMLElement>('[data-setlist-song-id="first-entry"]');
    expect(element).toBeInTheDocument();
    return element!;
  });
  fireEvent.click(within(row).getByRole('button', { name: '速度 未設定 BPM' }));
  const panel = await screen.findByRole('dialog', { name: '調整速度' });
  const input = within(panel).getByRole('textbox', { name: '速度 BPM' });
  fireEvent.change(input, { target: { value: '108' } });
  fireEvent.click(within(panel).getByRole('button', { name: '套用' }));
  expect(await within(panel).findByRole('alert')).toHaveTextContent('速度儲存失敗');
  expect(input).toHaveValue('108');
  expect(input).toHaveFocus();
  fireEvent.click(within(panel).getByRole('button', { name: '套用' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '調整速度' })).toBeNull());
  expect(state.saveSettings).toHaveBeenLastCalledWith('first', 'first-entry', { tempo: 108 });

  const bpmControls = await screen.findAllByRole('button', { name: '速度 108 BPM' });
  expect(bpmControls).toHaveLength(2);
  expect(within(row).getByRole('button', { name: '速度 108 BPM' })).toHaveFocus();
  fireEvent.click(bpmControls.find(control => !row.contains(control))!);
  const toolbarPanel = await screen.findByRole('dialog', { name: '調整速度' });
  expect(within(toolbarPanel).queryByRole('button', { name: /還原歌曲庫速度|設為歌曲原始速度/ })).toBeNull();
  fireEvent.change(within(toolbarPanel).getByRole('textbox', { name: '速度 BPM' }), { target: { value: '' } });
  fireEvent.click(within(toolbarPanel).getByRole('button', { name: '套用' }));
  await waitFor(() => expect(state.saveSettings).toHaveBeenLastCalledWith('first', 'first-entry', { tempo: null }));
  await within(row).findByRole('button', { name: '速度 未設定 BPM' });
  expect(state.saveSong).not.toHaveBeenCalled();
  expect(state.saveSetlist).not.toHaveBeenCalled();
});

it.each(['direct', 'project'] as const)('keeps an archived %s shared setlist readable without arrangement controls', async grant => {
  const archived = { ...fixture.setlists[0], archived: true };
  const project = fixture.projects[0];
  fixture = { ...fixture, setlists: [], projects: [],
    joinedSetlists: grant === 'direct' ? [{ ...archived, isJoined: true, role: 'manager' }] : [],
    joinedProjects: grant === 'project' ? [{ ...project, isJoined: true, role: 'manager', setlists: [{ ...archived, projectId: project.id }] }] : [],
  };
  const filter = grant === 'project' ? { kind: 'shared-project', projectId: project.id } as const : { kind: 'all' } as const;
  saveNavigationLocation(navigationKey(), { ...loadNavigationLocation(navigationKey())!, filter, parentFilter: filter, view: 'list' });
  const { container } = mount();
  fireEvent.click(await screen.findByRole('button', { name: /歌單1.*已歸檔/ }));
  expect(await screen.findByText('已歸檔，僅供檢視')).toBeInTheDocument();
  expect(container.querySelector('[data-setlist-preview-song-id="first-entry"] h1')).toHaveTextContent('測試歌曲');
  expect(screen.queryByRole('combobox', { name: '歌曲設定' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Key C' })).toBeDisabled();
  for (const bpm of screen.getAllByRole('button', { name: '速度 未設定 BPM' })) expect(bpm).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '歌單操作' }));
  expect(screen.queryByRole('menuitem', { name: '調整歌曲順序' })).toBeNull();
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
  const actions = within(second).getByRole('button', { name: /^歌曲操作/ });
  fireEvent.click(actions);
  const menu = await screen.findByRole('menu', { name: /^歌曲操作/ });
  const moveUp = within(menu).getByRole('menuitem', { name: '上移一首' });
  expect(within(menu).getAllByRole('menuitem')).toEqual([moveUp]);
  await waitFor(() => expect(moveUp).toHaveFocus());
  fireEvent.click(moveUp);
  await waitFor(() => expect(order()).toEqual(['other-entry', 'first-entry']));
  expect(actions).toHaveFocus();
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
