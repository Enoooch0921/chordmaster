import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { saveActiveLibraryPreference } from './lib/activeLibraryPreference';
import { getNavigationStorageKey, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';
import type { CloudWorkspaceCache } from './lib/cloudWorkspaceCache';

const state = vi.hoisted(() => ({ auth: 'authenticated', userId: 'user', cache: null as CloudWorkspaceCache | null,
  saveSong: vi.fn(), saveSetlist: vi.fn(), probe: undefined as undefined | ((signal: AbortSignal) => Promise<void>), saveCache: vi.fn(), list: vi.fn(), load: vi.fn(), setActive: vi.fn(), refresh: vi.fn(() => false) }));
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
  checkConnection: state.probe, listLibraries: state.list, setActiveLibrary: state.setActive, loadLibraryWorkspace: state.load,
  saveSong: state.saveSong, saveSetlist: state.saveSetlist, getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [],
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
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  window.scrollTo = vi.fn();
  localStorage.clear(); state.saveSong.mockReset(); state.saveSong.mockResolvedValue(undefined); state.saveSetlist.mockReset(); state.saveSetlist.mockResolvedValue(undefined); state.probe = undefined; state.auth = 'authenticated'; state.userId = 'user'; state.cache = null; state.saveCache.mockReset(); state.saveCache.mockResolvedValue(undefined);
  state.list.mockReset(); state.load.mockReset(); state.setActive.mockReset(); state.refresh.mockClear();
  localWorkspace = { songs: [makeSong('personal-song', '個人快取歌曲')], setlists: [], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  remoteWorkspace = { ...localWorkspace, songs: [makeSong('team-song', '點燃（官方版）')] };
  state.list.mockResolvedValue([personal, team]); state.load.mockResolvedValue(remoteWorkspace);
  saveActiveLibraryPreference('user', 'team');
  localStorage.setItem('chordmaster.workspace-mode.v1', 'songs');
});
afterEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/'); });

const editChord = async () => {
  await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' });
  fireEvent.click(document.querySelector('[data-preview-slot-index="0"]')!);
  const chord = await screen.findByRole('textbox', { name: '和弦直接輸入' });
  fireEvent.change(chord, { target: { value: 'Dm' } });
};
const choosePersonal = async () => {
  fireEvent.click(screen.getByRole('button', { name: '顯示工作區選項' }));
  fireEvent.click(await screen.findByRole('button', { name: /個人區/ }));
};
it('names the unfinished library score and cancels the workspace switch without losing its draft', async () => {
  render(view()); await editChord(); await choosePersonal();
  const dialog = await screen.findByRole('alertdialog', { name: '儲存後切換工作區？' });
  expect(dialog).toHaveTextContent('TopChurchWorship'); expect(dialog).toHaveTextContent('歌曲庫');
  expect(dialog).toHaveTextContent('點燃（官方版）'); expect(dialog).toHaveTextContent('和弦');
  expect(state.load).not.toHaveBeenCalledWith('personal');
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByRole('textbox', { name: '和弦直接輸入' })).toHaveValue('Dm');
});
it('keeps the last saved footer date and current workspace when saving a named draft fails', async () => {
  state.saveSong.mockRejectedValue(new Error('Save failed'));
  render(view()); await editChord(); await choosePersonal();
  await screen.findByRole('alertdialog', { name: '儲存後切換工作區？' });
  fireEvent.click(screen.getByRole('button', { name: '儲存並切換' }));
  await waitFor(() => expect(state.saveSong).toHaveBeenCalled());
  expect(state.load).not.toHaveBeenCalledWith('personal');
  expect(document.querySelector('[data-chart-edited-at]')).toHaveAttribute('data-chart-edited-at','1');
  expect(screen.getByRole('button', { name: '顯示工作區選項' })).toHaveAttribute('title', expect.stringContaining('TopChurchWorship'));
});
it('saves the identified draft and its date before switching to personal', async () => {
  render(view()); await editChord(); await choosePersonal();
  await screen.findByRole('alertdialog', { name: '儲存後切換工作區？' });
  fireEvent.click(screen.getByRole('button', { name: '儲存並切換' }));
  await waitFor(() => expect(state.load).toHaveBeenCalledWith('personal'));
  expect(state.saveSong).toHaveBeenCalledWith(expect.objectContaining({title:'點燃（官方版）',lastEditedAt:expect.any(Number),sections:expect.arrayContaining([expect.objectContaining({bars:expect.arrayContaining([expect.objectContaining({chords:expect.arrayContaining(['Dm'])})])})])}));
});
it('discards the unfinished draft only when explicitly selected, then switches', async () => {
  render(view()); await editChord(); await choosePersonal();
  await screen.findByRole('alertdialog', { name: '儲存後切換工作區？' });
  fireEvent.click(screen.getByRole('button', { name: '捨棄並切換' }));
  await waitFor(() => expect(state.load).toHaveBeenCalledWith('personal'));
  expect(state.saveSong).not.toHaveBeenCalled();
});
it('names and saves the team setlist copy without changing its library source', async () => {
  const source = remoteWorkspace.songs[0];
  remoteWorkspace.setlists = [{id:'meeting',name:'主日敬拜',displayMode:'chord-movable-key',createdAt:1,updatedAt:1,
    songs:[{id:'entry',songId:source.id,setlistId:'meeting',order:0,sectionOrder:['verse'],songData:structuredClone(source)}]}];
  localStorage.setItem('chordmaster.workspace-mode.v1','setlists');
  localStorage.setItem('chordmaster.selected-setlist-id.v1','meeting');
  saveNavigationLocation(getNavigationStorageKey('user', 'team'), {version:1,workspaceMode:'setlists',filter:{kind:'all'},parentFilter:{kind:'all'},view:'detail',setlistId:'meeting',songId:'entry'});
  render(view()); await screen.findByRole('textbox',{name:'歌單名稱'});
  fireEvent.click(document.querySelector('[data-preview-slot-index="0"]')!);
  fireEvent.change(await screen.findByRole('textbox',{name:'和弦直接輸入'}),{target:{value:'Dm'}});
  await choosePersonal();
  const dialog=await screen.findByRole('alertdialog',{name:'儲存後切換工作區？'});
  expect(dialog).toHaveTextContent('歌單「主日敬拜」'); expect(dialog).toHaveTextContent('點燃（官方版）'); expect(dialog).toHaveTextContent('和弦');
  fireEvent.click(screen.getByRole('button',{name:'儲存並切換'}));
  await waitFor(()=>expect(state.load).toHaveBeenCalledWith('personal'));
  expect(state.saveSong).not.toHaveBeenCalled();
  expect(state.saveSetlist).toHaveBeenCalledWith(expect.objectContaining({songs:[expect.objectContaining({songData:expect.objectContaining({lastEditedAt:expect.any(Number)})})]}),expect.anything(),expect.anything());
});
