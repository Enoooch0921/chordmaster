import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { InvitationTransitionProvider, useInvitationTransition } from './components/InvitationTransition';
import App from './App';
import { ToastProvider } from './components/Toast';
import { loadActiveLibraryPreference, saveActiveLibraryPreference } from './lib/activeLibraryPreference';
import { getNavigationStorageKey, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';
import type { CloudWorkspaceCache } from './lib/cloudWorkspaceCache';

const state = vi.hoisted(() => ({ auth: 'authenticated', userId: 'user', cache: null as CloudWorkspaceCache | null,
  saveCache: vi.fn(), list: vi.fn(), load: vi.fn(), setActive: vi.fn(), refresh: vi.fn(() => false) }));
vi.mock('./lib/cloudWorkspaceCache', async original => ({ ...await original<typeof import('./lib/cloudWorkspaceCache')>(),
  loadCloudStartupCache: async () => state.cache, saveCloudWorkspaceCache: state.saveCache }));
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({
  user: state.auth === 'authenticated' ? { id: state.userId, email: 'test@example.invalid', name: 'Test' } : null,
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
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: state.refresh }));
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
  localStorage.clear(); state.auth = 'authenticated'; state.userId = 'user'; state.cache = null; state.saveCache.mockReset(); state.saveCache.mockResolvedValue(undefined);
  state.list.mockReset(); state.load.mockReset(); state.setActive.mockReset(); state.refresh.mockClear();
  localWorkspace = { songs: [makeSong('personal-song', '個人快取歌曲')], setlists: [], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  remoteWorkspace = { ...localWorkspace, songs: [makeSong('team-song', '點燃（官方版）')] };
  state.list.mockResolvedValue([personal, team]); state.load.mockResolvedValue(remoteWorkspace);
  saveActiveLibraryPreference('user', 'team');
  localStorage.setItem('chordmaster.workspace-mode.v1', 'songs');
});
afterEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/'); });

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

const cacheTeam = () => {
  const library = { ...team, kind: 'team' as const, role: 'owner' as const };
  state.cache = { version: 1, user: { id: 'user', email: 'test@example.invalid', name: 'Test' }, library,
    libraries: [{ ...personal, kind: 'personal', role: 'owner' }, library], workspace: structuredClone(remoteWorkspace), cachedAt: 100 };
};

it.each(['loading', 'offline'])('opens the remembered team cache during %s auth without a network request', async auth => {
  cacheTeam(); state.auth = auth;
  render(view());
  expect(await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' })).toBeInTheDocument();
  expect(root()).not.toHaveAttribute('aria-hidden'); expect(root()).not.toHaveAttribute('inert');
  expect(document.querySelector('[data-main-panel]')?.firstElementChild).toBe(document.querySelector('[data-topbar]'));
  expect(document.querySelector('[data-connection-mode="offline"]')).toHaveTextContent('離線模式');
  expect(screen.queryByRole('button', { name: '開啟歌曲：個人快取歌曲' })).toBeNull();
  expect(state.list).not.toHaveBeenCalled(); expect(state.saveCache).not.toHaveBeenCalled();
});

it('keeps cached scores visible while discovery hangs, then adopts the confirmed server version', async () => {
  cacheTeam();
  const libraries = deferred<typeof team[]>(); state.list.mockReturnValue(libraries.promise);
  remoteWorkspace.songs[0].title = '點燃（最新修訂）';
  render(view());
  await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' });
  expect(root()).not.toHaveAttribute('inert');
  await act(async () => libraries.resolve([personal, team]));
  await screen.findByRole('button', { name: '開啟歌曲：點燃（最新修訂）' });
  expect(document.querySelector('[data-connection-mode="offline"]')).toBeNull();
  expect(screen.getByRole('status', { name: '連線狀態: Online' })).toHaveTextContent('Online');
  expect(document.querySelector('[data-main-panel]')?.firstElementChild).toBe(document.querySelector('[data-topbar]'));
  await waitFor(() => expect(state.saveCache).toHaveBeenCalledWith(expect.objectContaining({
    library: expect.objectContaining({ id: 'team' }), workspace: expect.objectContaining({ songs: remoteWorkspace.songs })
  })));
});

it('preserves cached content and the selected team on failure, then retries in place', async () => {
  cacheTeam(); state.load.mockRejectedValueOnce(new Error('Network unavailable'));
  render(view());
  await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' });
  await waitFor(() => expect(document.querySelector('[data-connection-mode="offline"]')).toHaveAttribute('title', expect.stringContaining('可繼續看譜')));
  expect(root()).not.toHaveAttribute('aria-hidden'); expect(loadActiveLibraryPreference('user')).toBe('team');
  fireEvent.click(screen.getByRole('button', { name: /同步狀態:.*離線模式/ }));
  await waitFor(() => expect(document.querySelector('[data-connection-mode="offline"]')).toBeNull());
  expect(screen.queryByRole('button', { name: '開啟歌曲：個人快取歌曲' })).toBeNull();
  expect(state.load).toHaveBeenCalledTimes(2);
});

it('does not show another account’s cache or resurrect deleted songs from an empty server snapshot', async () => {
  cacheTeam(); state.userId = 'other';
  const pending = deferred<WorkspaceSnapshot>(); state.load.mockReturnValue(pending.promise);
  render(view());
  await waitFor(() => expect(state.load).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: '開啟歌曲：點燃（官方版）' })).toBeNull();
  await act(async () => pending.resolve({ songs: [], setlists: [], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: null }));
  expect(screen.queryByRole('button', { name: '開啟歌曲：點燃（官方版）' })).toBeNull();
});

it('treats an empty confirmed team snapshot as authoritative over its cached songs', async () => {
  cacheTeam(); remoteWorkspace = { ...remoteWorkspace, songs: [] };
  state.load.mockResolvedValue(remoteWorkspace);
  render(view());
  await waitFor(() => expect(state.load).toHaveBeenCalledWith('team'));
  await waitFor(() => expect(document.querySelector('[data-connection-mode="offline"]')).toBeNull());
  expect(screen.queryByRole('button', { name: '開啟歌曲：點燃（官方版）' })).toBeNull();
});

it('restores the cached meeting offline without copying its songs into personal storage', async () => {
  const song = remoteWorkspace.songs[0];
  remoteWorkspace.setlists = [{ id: 'meeting', name: '聚會一', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', setlistId: 'meeting', songId: song.id, songData: song, order: 0, sectionOrder: ['verse'] }] }];
  cacheTeam(); state.auth = 'offline';
  const personalBackup = JSON.stringify(localWorkspace.songs);
  localStorage.setItem('chordmaster.song-library.v1', personalBackup);
  saveNavigationLocation(getNavigationStorageKey('user', 'team'), { version: 1, workspaceMode: 'setlists',
    filter: { kind: 'all' }, parentFilter: { kind: 'all' }, view: 'detail', setlistId: 'meeting', songId: 'entry' });
  render(view());
  await waitFor(() => expect(document.querySelector('[data-setlist-preview-song-id="entry"]')).not.toBeNull());
  expect(root()).not.toHaveAttribute('aria-hidden');
  expect(localStorage.getItem('chordmaster.song-library.v1')).toBe(personalBackup);
  expect(screen.queryByRole('textbox', { name: '歌單名稱' })).toBeNull();
});

it('keeps a song selected during cached browsing when background loading completes', async () => {
  remoteWorkspace.songs.push(makeSong('second', '第二首'));
  cacheTeam();
  const pending = deferred<WorkspaceSnapshot>(); state.load.mockReturnValue(pending.promise);
  render(view());
  fireEvent.click(await screen.findByRole('button', { name: '開啟歌曲：第二首' }));
  await act(async () => pending.resolve(remoteWorkspace));
  await waitFor(() => expect(document.querySelector('[data-connection-mode="offline"]')).toBeNull());
  expect(screen.getByRole('button', { name: '開啟歌曲：第二首' })).toHaveAttribute('aria-current', 'true');
});

it('defers a newly loaded score until cached Performance Mode ends', async () => {
  const song = remoteWorkspace.songs[0];
  remoteWorkspace.setlists = [{ id: 'meeting', name: '聚會一', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', setlistId: 'meeting', songId: song.id, songData: song, order: 0, sectionOrder: ['verse'] }] }];
  cacheTeam();
  saveNavigationLocation(getNavigationStorageKey('user', 'team'), { version: 1, workspaceMode: 'setlists',
    filter: { kind: 'all' }, parentFilter: { kind: 'all' }, view: 'detail', setlistId: 'meeting', songId: 'entry' });
  const pending = deferred<WorkspaceSnapshot>(); state.load.mockReturnValueOnce(pending.promise);
  render(view());
  fireEvent.click((await screen.findAllByRole('button', { name: /^演出模式$/ }))[0]);
  await waitFor(() => expect(document.querySelector('[data-performance-overlay]')).not.toBeNull());
  await act(async () => pending.resolve(remoteWorkspace));
  expect(document.querySelector('[data-performance-overlay]')).not.toBeNull();
  expect(document.querySelector('[data-connection-mode="offline"]')).toHaveAttribute('title', expect.stringContaining('退出演出模式後更新'));
  fireEvent.click(screen.getByRole('button', { name: '退出' }));
  await waitFor(() => expect(document.querySelector('[data-connection-mode="offline"]')).toBeNull());
});

it('switches the compact connection hint in place when the network disconnects and reconnects', async () => {
  let online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  render(view());
  await screen.findByRole('status', { name: '連線狀態: Online' });
  const header = document.querySelector('[data-topbar]');
  online = false;
  act(() => window.dispatchEvent(new Event('offline')));
  expect(screen.getByRole('status', { name: '連線狀態: 離線模式' })).toHaveTextContent('離線模式');
  expect(document.querySelector('[data-main-panel]')?.firstElementChild).toBe(header);
  online = true;
  act(() => window.dispatchEvent(new Event('online')));
  expect(screen.getByRole('status', { name: '連線狀態: Online' })).toHaveTextContent('Online');
  expect(document.querySelector('[data-main-panel]')?.firstElementChild).toBe(header);
});

// Real App integration: the invitation gate must wait for both the complete
// workspace and the target navigation, even with a remembered team library.
it.each([['setlist', false], ['project', false], ['setlist', true], ['project', true]] as const)('reveals the requested %s from an invitation in the personal workspace (cached: %s)', async (kind, cached) => {
  const song = makeSong('invited-song', '受邀歌曲');
  const setlist = { id: 'invited-setlist', name: '受邀歌單', displayMode: 'chord-movable-key' as const,
    createdAt: 1, updatedAt: 1, isJoined: true as const, songs: [{ id: 'invited-entry', setlistId: 'invited-setlist', songId: song.id, songData: song, order: 0, sectionOrder: ['verse'] }] };
  const resource = { kind, id: kind === 'setlist' ? setlist.id : 'invited-project', name: '受邀內容', token: 'invite', language: 'zh' as const };
  remoteWorkspace = { songs: [], projects: [], setlists: [], joinedSetlists: kind === 'setlist' ? [setlist] : [],
    joinedProjects: kind === 'project' ? [{ id: 'invited-project', name: '受邀專案', createdAt: 1, updatedAt: 1, isJoined: true, role: 'viewer', setlists: [setlist] }] : [], lastSavedAt: 1 };
  if (cached) {
    // The last personal snapshot predates joining the project and points to a setlist.
    state.cache = { version: 1, user: { id: 'user', email: 'test@example.invalid', name: 'Test' },
      library: { ...personal, kind: 'personal', role: 'owner' }, libraries: [{ ...personal, kind: 'personal', role: 'owner' }],
      workspace: { ...remoteWorkspace, joinedProjects: [], joinedSetlists: [setlist] }, cachedAt: Date.now() };
    saveActiveLibraryPreference('user', 'personal');
    saveNavigationLocation(getNavigationStorageKey('user', 'personal'), { version: 1, workspaceMode: 'setlists', filter: {kind:'all'}, parentFilter: {kind:'all'}, view:'detail', setlistId:setlist.id, songId:'invited-entry' });
  }
  const delayed = deferred<WorkspaceSnapshot>(); state.load.mockReturnValue(delayed.promise);
  function Source() {
    const transition = useInvitationTransition(); const navigate = useNavigate();
    return <button onClick={async event => {
      await transition.cover(resource, event, 'app');
      const path = `/?${kind}=${resource.id}`;
      window.history.replaceState(null, '', path); navigate(path);
    }}>開啟測試邀請</button>;
  }
  render(<MemoryRouter initialEntries={['/share/invite']}><ToastProvider><InvitationTransitionProvider><Routes>
    <Route path="/share/:token" element={<Source />} /><Route path="/" element={<App />} />
  </Routes></InvitationTransitionProvider></ToastProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '開啟測試邀請' }));
  await waitFor(() => expect(state.load).toHaveBeenCalledWith('personal'));
  expect(document.querySelector('.invitation-gate')).toBeInTheDocument();
  await act(async () => delayed.resolve(remoteWorkspace));
  await waitFor(() => expect(document.querySelector('.invitation-gate')).toBeNull(), { timeout: 5000 });
  expect(document.querySelector('.invitation-route-content')).not.toHaveAttribute('inert');
  if (kind === 'project') {
    await waitFor(() => expect(document.activeElement).toHaveTextContent('受邀專案'));
    expect(document.activeElement?.tagName).toBe('H2');
  } else {
    await waitFor(() => expect(document.querySelector('[data-setlist-preview-pane]')).toHaveFocus());
    expect(document.activeElement).toHaveAccessibleName('受邀歌單');
  }
}, 15000);
it('closes the tablet workspace menu while selecting another song on the first tap', async () => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(834);
  remoteWorkspace.songs.push(makeSong('second', '第二首'));
  render(view());
  const second = await screen.findByRole('button', { name: '開啟歌曲：第二首' });
  fireEvent.click(screen.getByRole('button', { name: '固定歌曲列表' }));
  const switcher = screen.getByRole('button', { name: '顯示工作區選項' });
  fireEvent.click(switcher);
  expect(switcher).toHaveAttribute('aria-expanded', 'true');
  fireEvent.pointerDown(second); fireEvent.focusIn(second); fireEvent.click(second);
  await waitFor(() => expect(switcher).toHaveAttribute('aria-expanded', 'false'));
  expect(second).toHaveAttribute('aria-current', 'true');
});

it('keeps workspace-list scrolling available but closes when the chart scrolls', async () => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(834);
  render(view());
  await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' });
  fireEvent.click(screen.getByRole('button', { name: '固定歌曲列表' }));
  const switcher = screen.getByRole('button', { name: '顯示工作區選項' });
  fireEvent.click(switcher);
  fireEvent.scroll(screen.getByLabelText('切換工作區'));
  expect(switcher).toHaveAttribute('aria-expanded', 'true');
  fireEvent.scroll(document.querySelector('[data-main-panel]')!);
  await waitFor(() => expect(switcher).toHaveAttribute('aria-expanded', 'false'));
});

const symbolFixture = (id: string, title = '符號測試頁（2行）') => ({ ...makeSong(id, title), sections: [
  { id: 'test-bars', title: '測試小節', bars: [{ chords: ['C'] }] },
  { id: 'test-meter', title: '拍號測試', bars: [{ chords: ['C'] }] }
] });
const visibleSongRows = () => document.querySelectorAll('[data-library-song-id]');

it('starts a fresh local library empty, stays empty on reopen, and lets the user create the first song', async () => {
  state.auth = 'unconfigured'; localWorkspace.songs = [];
  const first = render(view());
  await screen.findByRole('heading', { name: '歌曲庫' });
  expect(visibleSongRows()).toHaveLength(0);
  expect(screen.queryByText(/符號測試頁/)).toBeNull();
  first.unmount(); render(view());
  await screen.findByRole('heading', { name: '歌曲庫' });
  expect(visibleSongRows()).toHaveLength(0);
  fireEvent.click(screen.getAllByRole('button', { name: '新歌' })[0]);
  expect(await screen.findByRole('button', { name: '開啟歌曲：新歌 1' })).toBeInTheDocument();
  expect(visibleSongRows()).toHaveLength(1);
});

it('hides legacy bundled fixtures including renamed copies while preserving genuine user songs', async () => {
  state.auth = 'unconfigured';
  const realSong = makeSong('real', '符號測試頁');
  localWorkspace.songs = [symbolFixture('old', '符號測試頁'), symbolFixture('two'),
    symbolFixture('three', '符號測試頁（3行）'), symbolFixture('renamed', '我重新命名的測試'), realSong];
  const original = JSON.stringify(localWorkspace);
  localStorage.setItem('chordmaster.selected-song-id.v1', 'two');
  render(view());
  expect(await screen.findByRole('button', { name: '開啟歌曲：符號測試頁' })).toBeInTheDocument();
  expect(visibleSongRows()).toHaveLength(1);
  expect(document.querySelector('[data-library-song-id="real"]')).not.toBeNull();
  expect(JSON.stringify(localWorkspace)).toBe(original);
});

it('keeps a new personal cloud library empty instead of inserting symbol pages', async () => {
  localWorkspace.songs = [];
  remoteWorkspace = { ...localWorkspace, songs: [] };
  state.list.mockResolvedValue([personal]); state.load.mockResolvedValue(remoteWorkspace);
  saveActiveLibraryPreference('user', 'personal');
  render(view());
  await waitFor(() => expect(state.load).toHaveBeenCalledWith('personal'));
  await waitFor(() => expect(root()).not.toHaveAttribute('inert'));
  expect(visibleSongRows()).toHaveLength(0);
  expect(screen.queryByText(/符號測試頁/)).toBeNull();
});

it('does not display bundled fixtures from an offline startup cache', async () => {
  remoteWorkspace.songs = [symbolFixture('cached-test')]; cacheTeam(); state.auth = 'offline';
  render(view());
  await screen.findByRole('heading', { name: '歌曲庫' });
  expect(root()).not.toHaveAttribute('inert');
  expect(visibleSongRows()).toHaveLength(0);
  expect(screen.queryByText(/符號測試頁/)).toBeNull();
});

it('does not bring test pages back after a personal library refresh becomes empty', async () => {
  state.list.mockResolvedValue([personal]); saveActiveLibraryPreference('user', 'personal');
  render(view());
  await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' });
  const latest = () => (state.refresh.mock.calls.at(-1) as unknown as [Parameters<typeof import('./hooks/useLibraryWorkspaceRefresh').useLibraryWorkspaceRefresh>[0]])[0];
  await waitFor(() => expect(latest()).toMatchObject({ enabled: true, libraryId: 'personal' }));
  await act(async () => latest().onUpdate({ ...remoteWorkspace, songs: [] }));
  await waitFor(() => expect(visibleSongRows()).toHaveLength(0));
  expect(screen.queryByText(/符號測試頁/)).toBeNull();
});
