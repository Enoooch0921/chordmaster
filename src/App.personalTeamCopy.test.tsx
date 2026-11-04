import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { CloudLibrarySummary, WorkspaceSnapshot } from './types';
const state = vi.hoisted(() => ({ libraries: [] as CloudLibrarySummary[], inspect: vi.fn(), copy: vi.fn(), sync: vi.fn(), load: vi.fn() }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: { id: 'copy-user', email: 'copy@example.test', name: 'Copy', picture: '' }, session: { access_token: 'test-session' }, status: 'signed-in', isConfigured: true, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./lib/sync', () => ({ syncWorkspaceDiff: state.sync }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({ listLibraries: async () => state.libraries, setActiveLibrary: vi.fn(), loadLibraryWorkspace: state.load, loadPersonalWorkspace: async () => fixture, inspectTeamSongImport: state.inspect, importPersonalSongsToTeam: state.copy, getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [], subscribeToLibraryChanges: () => () => {} }) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: [], failed: false }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, error: null, dismiss: vi.fn(), restored: vi.fn() }) }));
beforeAll(() => {
 vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
 window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
 HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
 HTMLDialogElement.prototype.showModal = function () { this.open = true; }; HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
 localStorage.clear(); vi.clearAllMocks();
 vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(100,100,200,44));
 const library = (id: string, role: CloudLibrarySummary['role'], kind: CloudLibrarySummary['kind'] = 'team'): CloudLibrarySummary => ({ id, name: id, kind, role, ownerUserId: 'copy-user', createdAt: '', updatedAt: '' });
 state.libraries = [library('personal', 'owner', 'personal'), library('團隊甲', 'editor'), library('團隊乙', 'admin'), library('唯讀團隊', 'viewer')];
 fixture = { songs: ['恩典之路', '活出愛'].map((title, i) => ({ id: `song-${i}`, title, updatedAt: 1, originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: `bar-${i}`, chords: ['C'] }] }] })), setlists: [], projects: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1 };
 state.load.mockImplementation(async () => structuredClone(fixture)); state.sync.mockResolvedValue(undefined);
 state.inspect.mockImplementation(async (_target, ids: string[]) => ({ songs: ids.map(id => ({ sourceSongId: id, title: fixture.songs.find(s => s.id === id)!.title, existingSongId: null, existingTitle: null, possibleMatches: [] })) }));
 state.copy.mockResolvedValue({ createdCount: 1, overwrittenCount: 0, duplicateCount: 0, songs: [] });
 localStorage.setItem('chordmaster.active-library.copy-user.v1', 'personal');
});
async function mount() {
 const view = render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
 await waitFor(() => expect(document.querySelector('[data-library-song-id="song-0"]')).not.toBeNull(), { timeout: 5000 });
 const pin = await screen.findByRole('button', { name: '固定歌曲列表' }, { timeout: 5000 }); fireEvent.click(pin);
 await screen.findByRole('button', { name: '歌曲庫操作' });
 return view;
}
it('copies a single personal song to the chosen writable team without switching or replacing personal songs', async () => {
 await mount();
 fireEvent.click(screen.getByRole('button', { name: '歌曲操作：恩典之路' }));
 fireEvent.click(await screen.findByRole('menuitem', { name: '複製到團隊…' }));
 const dialog = await screen.findByRole('dialog', { name: '複製到團隊' });
 await waitFor(() => expect(within(dialog).getByRole('button', { name: '下一步' })).toBeEnabled());
 expect(within(dialog).getByText('已選 1 首')).toBeInTheDocument();
 expect(within(dialog).queryByRole('option', { name: '唯讀團隊' })).toBeNull();
 fireEvent.change(within(dialog).getByRole('combobox', { name: '目標團隊' }), { target: { value: '團隊乙' } });
 fireEvent.click(within(dialog).getByRole('button', { name: '下一步' }));
 await waitFor(() => expect(state.inspect).toHaveBeenCalledWith('團隊乙', ['song-0']));
 fireEvent.click(await within(dialog).findByRole('button', { name: '複製 1 首' }));
 await waitFor(() => expect(state.copy).toHaveBeenCalledWith('團隊乙', [{ sourceSongId: 'song-0', resolution: 'create' }]));
 await waitFor(() => expect(screen.queryByRole('dialog', { name: '複製到團隊' })).toBeNull());
 expect(state.sync).toHaveBeenCalled();
 expect(document.querySelector('[data-library-song-id="song-0"]')).not.toBeNull(); expect(document.querySelector('[data-library-song-id="song-1"]')).not.toBeNull();
 expect(state.load.mock.calls.every(([id]) => id === 'personal')).toBe(true);
});
it('passes the bulk selection rather than just the currently open song', async () => {
 await mount();fireEvent.click(screen.getByRole('button', { name: '歌曲庫操作' }));fireEvent.click(await screen.findByRole('menuitem', { name: '管理歌曲' }));
 const rows = ['song-0', 'song-1'].map(id => document.querySelector(`[data-library-song-id="${id}"]`)!);
 for (const row of rows) fireEvent.click(within(row as HTMLElement).getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button', { name: '複製到團隊…' }));
 const dialog = await screen.findByRole('dialog', { name: '複製到團隊' });await waitFor(() => expect(within(dialog).getByRole('button', { name: '下一步' })).toBeEnabled());
 expect(within(dialog).getByText('已選 2 首')).toBeInTheDocument();fireEvent.click(within(dialog).getByRole('button', { name: '下一步' }));
 await waitFor(() => expect(state.inspect).toHaveBeenCalledWith('團隊甲', ['song-0', 'song-1']));
});
it('hides the personal copy route when there is no writable team', async () => {
 state.libraries = state.libraries.filter(l => l.kind === 'personal' || l.role === 'viewer');await mount();
 fireEvent.click(screen.getByRole('button', { name: '歌曲操作：恩典之路' }));
 expect(screen.queryByRole('menuitem', { name: '複製到團隊…' })).toBeNull();
});

it('refuses to write when the chosen team loses editing permission after the review', async () => {
 const view = await mount();fireEvent.click(screen.getByRole('button',{name:'歌曲操作：恩典之路'}));fireEvent.click(await screen.findByRole('menuitem',{name:'複製到團隊…'}));
 const dialog = await screen.findByRole('dialog',{name:'複製到團隊'});await waitFor(()=>expect(within(dialog).getByRole('button',{name:'下一步'})).toBeEnabled());fireEvent.click(within(dialog).getByRole('button',{name:'下一步'}));
 const confirm = await within(dialog).findByRole('button',{name:'複製 1 首'});state.libraries[1].role='viewer';view.rerender(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);fireEvent.click(confirm);
 expect(await within(dialog).findByRole('alert')).toHaveTextContent('工作區或權限已變更');expect(state.copy).not.toHaveBeenCalled();
});

it('does not start a transfer when the connection is lost',async()=>{
 await mount();vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 fireEvent.click(screen.getByRole('button',{name:'歌曲操作：恩典之路'}));fireEvent.click(await screen.findByRole('menuitem',{name:'複製到團隊…'}));
 expect(await screen.findByText('連線後才能複製到團隊。')).toBeInTheDocument();expect(state.inspect).not.toHaveBeenCalled();expect(state.copy).not.toHaveBeenCalled();
});
