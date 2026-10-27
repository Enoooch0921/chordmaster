import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
vi.mock('./components/useAnchoredPortalPanel',()=>({useAnchoredPortalPanel:()=>({panelStyle:{position:'fixed',top:0,left:0},placement:'bottom',isPositioned:true,transformOrigin:'top right'})}));
import App from './App';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, loadNavigationLocation, saveNavigationLocation, type SetlistNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({ cloud: false, members: false, role: 'viewer', load: vi.fn(), removeMember: vi.fn(), changeRole: vi.fn(), projectStatus: vi.fn() }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: state.cloud ? { id: 'user', email: 'user@example.invalid', name: 'Test' } : null,
  session: state.cloud ? { access_token: 'test' } : null, status: state.cloud ? 'authenticated' : 'unconfigured', isConfigured: state.cloud, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({ listLibraries: async () => [{ id: 'team', name: 'Team', kind: 'team', role: state.role, ownerUserId: 'owner', createdAt: '', updatedAt: '' }],
  setActiveLibrary: vi.fn(), loadLibraryWorkspace: state.load, getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [],
  getSetlistShareStatus: async () => ({ activeToken: null, activeCreatedAt: null, participantCount: 0, participants: [] }), getProjectShareStatus: state.projectStatus, removeSharedMember: state.removeMember, setProjectMemberRole: state.changeRole,
  getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }), subscribeToLibraryChanges: () => () => {} }) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: [], failed: false }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, dismiss: vi.fn(), restored: vi.fn() }) }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function(){this.open=true;};
  HTMLDialogElement.prototype.close = function(){this.open=false;};
});
const remembered: SetlistNavigationLocation = { version: 1, workspaceMode: 'setlists', filter: { kind: 'owned-project', projectId: 'la' }, parentFilter: { kind: 'owned-project', projectId: 'la' }, view: 'detail', setlistId: 'meeting', songId: 'entry' };
const mount = () => render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
beforeEach(() => {
  localStorage.clear(); state.cloud = false; state.members = false; state.role = 'viewer'; state.load.mockReset(); state.removeMember.mockReset(); state.changeRole.mockReset(); state.projectStatus.mockReset();
  state.projectStatus.mockImplementation(async () => ({ activeToken: null, activeCreatedAt: null, participantCount: state.members ? 1 : 0, participants: state.members ? [{ userId: 'member', name: '測試成員', email: 'member@example.invalid', role: 'viewer' }] : [] }));
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

const openMembers = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^成員與權限/ }));
  await screen.findByRole('heading', { name: /^成員與權限/ });
};
it('removes a member through an explicit action without changing their role', async () => {
  state.cloud = true; state.members = true; state.role = 'owner';state.load.mockResolvedValue(fixture);
  saveNavigationLocation(getNavigationStorageKey('user', 'team'), { ...remembered, view: 'list' });mount();
  await openMembers();
  fireEvent.click(screen.getByRole('button',{name:'測試成員的成員操作'}));
  expect(state.changeRole).not.toHaveBeenCalled();expect(state.removeMember).not.toHaveBeenCalled();
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
  fireEvent.click(await screen.findByRole('menuitem',{name:'移除成員'}));
  await waitFor(()=>expect(state.removeMember).toHaveBeenCalledWith('project','la','member'));
  expect(state.changeRole).not.toHaveBeenCalled();confirm.mockRestore();
});
it('puts project folders and loose setlists at the same root level without an All or Ungrouped view', async () => {
  fixture.setlists.push({...fixture.setlists[0],id:'loose',name:'臨時聚會',projectId:null,songs:[]});
  saveNavigationLocation(getNavigationStorageKey(null,null),{...remembered,filter:{kind:'all'},view:'list'});mount();
  const root=()=>document.querySelector<HTMLElement>('[data-setlist-panel-layer][data-ui-presence="visible"] [data-setlist-scroll]')!;
  await screen.findByRole('button',{name:/洛杉磯烈火/});
  expect(within(root()).getByRole('button',{name:/^臨時聚會(?: |$)/})).toBeInTheDocument();
  expect(within(root()).queryByRole('button',{name:/^聚會一(?: |$)/})).toBeNull();
  expect(screen.queryByRole('combobox',{name:'專案篩選'})).toBeNull();expect(screen.queryByText('全部歌單')).toBeNull();
  fireEvent.click(within(root()).getByRole('button',{name:/洛杉磯烈火/}));
  await within(root()).findByRole('button',{name:/^聚會一(?: |$)/});
  expect(within(root()).queryByRole('button',{name:/^臨時聚會(?: |$)/})).toBeNull();
  fireEvent.click(within(document.querySelector('[data-setlist-panel-layer][data-ui-presence="visible"] [data-setlist-browser-header]')!).getByRole('button',{name:'歌單'}));
  fireEvent.click(await within(root()).findByRole('button',{name:/^臨時聚會(?: |$)/}));
  await screen.findByDisplayValue('臨時聚會');
  fireEvent.click(await screen.findByRole('button',{name:/返回.*歌單/}));
  await within(root()).findByRole('button',{name:/洛杉磯烈火/});
});
it('centralizes project members and permissions behind the folder entry and returns to that folder', async () => {
  state.cloud=true;state.members=true;state.role='owner';state.load.mockResolvedValue(fixture);
  saveNavigationLocation(getNavigationStorageKey('user','team'),{...remembered,view:'list'});mount();await openMembers();
  const detail=document.querySelector('[data-project-management-detail="la"]')!;
  await within(detail as HTMLElement).findByText('測試成員');
  fireEvent.change(within(detail as HTMLElement).getByRole('combobox',{name:'測試成員的權限'}),{target:{value:'manager'}});
  await waitFor(()=>expect(state.changeRole).toHaveBeenCalledWith('la','member','manager'));
  fireEvent.click(screen.getByRole('button',{name:'專案歌單'}));
  await within(document.querySelector('[data-setlist-panel-layer][data-ui-presence="visible"] [data-setlist-scroll]')!).findByRole('button',{name:/^聚會一(?: |$)/});
  await waitFor(()=>expect(document.querySelector('[data-project-management-detail]')).toBeNull());
});
it('keeps late membership results from replacing the newly opened project folder', async () => {
  state.cloud=true;state.role='owner';
  fixture.projects.push({...fixture.projects[0],id:'second',name:'另一專案'});
  fixture.setlists.push({...fixture.setlists[0],id:'second-setlist',projectId:'second',name:'另一聚會'});state.load.mockResolvedValue(fixture);
  let resolveFirst!: (value:unknown)=>void;const first=new Promise(done=>{resolveFirst=done;});
  const status=(name:string)=>({activeToken:null,participantCount:1,participants:[{userId:name,name,email:name+'@example.invalid',role:'viewer'}]});
  state.projectStatus.mockImplementation((id:string)=>id==='la'?first:Promise.resolve(status('成員乙')));
  saveNavigationLocation(getNavigationStorageKey('user','team'),{...remembered,view:'list'});mount();
  await waitFor(()=>expect(state.projectStatus).toHaveBeenCalledWith('la'));
  fireEvent.click(within(document.querySelector('[data-setlist-panel-layer][data-ui-presence="visible"] [data-setlist-browser-header]')!).getByRole('button',{name:'歌單'}));
  fireEvent.click(await screen.findByRole('button',{name:/另一專案/}));await screen.findByText('成員乙');
  await act(async()=>resolveFirst(status('成員甲')));
  expect(screen.getByRole('button',{name:/^成員與權限/})).toHaveTextContent('成員乙');expect(screen.queryByText('成員甲')).toBeNull();
});
it('opens a root search result in its actual parent folder',async()=>{
  saveNavigationLocation(getNavigationStorageKey(null,null),{...remembered,filter:{kind:'all'},view:'list'});mount();
  await screen.findByRole('button',{name:/洛杉磯烈火/});
  fireEvent.change(screen.getByRole('searchbox',{name:'搜尋歌單'}),{target:{value:'jhy'}});
  fireEvent.click(await within(document.querySelector('[data-setlist-panel-layer][data-ui-presence="visible"] [data-setlist-scroll]')!).findByRole('button',{name:/^聚會一(?: |$)/}));
  await screen.findByDisplayValue('聚會一');
  fireEvent.click(await screen.findByRole('button',{name:/返回.*歌單/}));
  expect(within(document.querySelector('[data-setlist-panel-layer][data-ui-presence="visible"] [data-setlist-browser-header]')!).getByRole('heading',{name:'洛杉磯烈火'})).toBeInTheDocument();
});
it('keeps local project settings available without cloud sharing permissions',async()=>{
 saveNavigationLocation(getNavigationStorageKey(null,null),{...remembered,view:'list'});mount();
 fireEvent.click(await screen.findByRole('button',{name:/^管理專案/}));
 fireEvent.click(await screen.findByRole('button',{name:'更多專案操作'}));
 expect(await screen.findByRole('menuitem',{name:'重新命名'})).toBeInTheDocument();
 expect(screen.getByRole('menuitem',{name:'歸檔專案'})).toBeInTheDocument();
 expect(screen.getByRole('menuitem',{name:'刪除專案'})).toBeInTheDocument();
});
it('creates a loose setlist and returns directly to the folder/file root',async()=>{
 saveNavigationLocation(getNavigationStorageKey(null,null),{...remembered,filter:{kind:'all'},view:'list'});mount();
 fireEvent.click(await screen.findByRole('button',{name:'新增'}));
 fireEvent.click(await screen.findByRole('menuitem',{name:'新增歌單'}));
 fireEvent.change(await screen.findByRole('textbox',{name:'歌單名稱'}),{target:{value:'全新聚會'}});
 expect(screen.getByRole('combobox',{name:'所屬專案'})).toHaveValue('');
 fireEvent.click(screen.getByRole('button',{name:'建立歌單'}));
 await screen.findByDisplayValue('全新聚會');
 fireEvent.click(await screen.findByRole('button',{name:/返回.*歌單/}));
 await screen.findByRole('button',{name:/洛杉磯烈火/});
 expect(screen.getByRole('button',{name:/^全新聚會(?: |$)/})).toBeInTheDocument();
 expect(screen.queryByRole('heading',{name:'未分類'})).toBeNull();
});
it('lets keyboard and tap users enter batch selection through the explicit setlist menu',async()=>{
 fixture.setlists.push({...fixture.setlists[0],id:'loose',name:'臨時聚會',projectId:null,songs:[]});
 saveNavigationLocation(getNavigationStorageKey(null,null),{...remembered,filter:{kind:'all'},view:'list'});mount();
 fireEvent.click(await screen.findByRole('button',{name:'臨時聚會的歌單操作'}));
 fireEvent.click(await screen.findByRole('menuitem',{name:'選取多份歌單'}));
 expect(await screen.findByRole('checkbox',{name:'選取 臨時聚會'})).toBeChecked();
});
it('retains song attribution and directly editable Key and tempo controls',async()=>{
 fixture.songs[0].composer='Unique Author';fixture.songs[0].originalKey='G';
 saveNavigationLocation(getNavigationStorageKey(null,null),remembered);mount();
 const row=await waitFor(()=>{const element=document.querySelector<HTMLElement>('[data-setlist-song-id="entry"]');expect(element).not.toBeNull();return element!;});
 expect(within(row).getByRole('button',{name:'Key C'})).toBeInTheDocument();
 expect(within(row).getByRole('button',{name:'速度 未設定 BPM'})).toBeInTheDocument();
 expect(row.querySelector('.setlist-song-summary')).toHaveTextContent('原調 G · 4/4');
 expect(row).toHaveTextContent('Unique Author');
});
it('returns to the new parent after moving the open setlist out of its project',async()=>{
 saveNavigationLocation(getNavigationStorageKey(null,null),remembered);mount();
 fireEvent.click(await screen.findByRole('button',{name:'歌單操作'}));
 fireEvent.click(await screen.findByRole('menuitem',{name:'移到專案'}));
 fireEvent.click(await screen.findByRole('button',{name:/^歌單根目錄/}));
 fireEvent.click(await screen.findByRole('button',{name:/返回.*歌單/}));
 await screen.findByRole('button',{name:/洛杉磯烈火/});
 expect(screen.getByRole('button',{name:/^聚會一(?: |$)/})).toBeInTheDocument();
});
