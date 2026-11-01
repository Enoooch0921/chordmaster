import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';
import type { WorkspaceRepository } from './lib/repository';
type LibraryChangeKind = Parameters<Parameters<WorkspaceRepository['subscribeToLibraryChanges']>[1]>[0];

const state = vi.hoisted(() => ({ listeners: new Set<(kind: LibraryChangeKind) => void>(),
  subscribe: vi.fn(), unsubscribe: vi.fn(), content: vi.fn(), collections: vi.fn(), save: vi.fn(),
  audio: { start: vi.fn(), stop: vi.fn(), update: vi.fn(), prepare: vi.fn(), playing: false, starting: false, beat: -1, notice: null } }));
let cloud: WorkspaceSnapshot;
const read = () => structuredClone(cloud);
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({
  user: { id: 'same-user', name: 'Test', email: 'test@example.invalid' }, session: { access_token: 'test' },
  status: 'authenticated', isConfigured: true, signInWithGoogle: vi.fn(), signOut: vi.fn()
}) }));
vi.mock('./lib/cloudWorkspaceCache', async original => ({ ...await original<typeof import('./lib/cloudWorkspaceCache')>(),
  loadCloudStartupCache: async () => null, saveCloudWorkspaceCache: async () => {} }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => read() }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({
  listLibraries: async () => [{ id: 'personal', name: '個人區', kind: 'personal', role: 'owner', ownerUserId: 'same-user', createdAt: '', updatedAt: '' }],
  setActiveLibrary: vi.fn(), loadLibraryWorkspace: async () => read(), loadPersonalWorkspace: async () => read(),
  loadLibraryContent: state.content, loadLibraryCollections: state.collections,
  loadLibrarySongVersions: async () => cloud.songs.map(({ id, updatedAt }) => ({ id, updatedAt })),
  loadJoinedWorkspace: async () => ({ joinedSetlists: read().joinedSetlists, joinedProjects: read().joinedProjects }),
  getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [],
  getSetlistShareStatus: async () => ({ activeToken: null, activeCreatedAt: null, participantCount: 0, participants: [] }),
  subscribeToLibraryChanges: state.subscribe,
  saveSong: state.save, saveSetlist: state.save, saveProject: state.save,
  deleteSong: state.save, deleteSetlist: state.save, deleteProject: state.save
}) }));
vi.mock('./hooks/useMetronome', () => ({ useMetronome: () => state.audio }));
vi.mock('./components/ChordSheet', () => ({ default: ({ song }: { song: { title: string; currentKey: string } }) =>
  <div data-testid="sync-chart" data-key={song.currentKey}>{song.title}</div> }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); state.listeners.clear(); state.audio.playing = false; state.audio.starting = false;
  const song = { id: 'original', title: '原有歌曲', tempo: 72, currentKey: 'C' as const, originalKey: 'C' as const, timeSignature: '4/4', updatedAt: 1,
    sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
  cloud = { songs: [song], setlists: [{ id: 'meeting', name: '我的歌單', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', setlistId: 'meeting', songId: song.id, songData: song, order: 0, sectionOrder: ['verse'] }] }],
    projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  state.content.mockImplementation(async () => read());
  state.collections.mockImplementation(async (_id, songs) => ({ ...read(), songs }));
  state.subscribe.mockImplementation((_id, listener) => { state.listeners.add(listener); return () => { state.listeners.delete(listener); state.unsubscribe(); }; });
  saveNavigationLocation(getNavigationStorageKey('same-user', 'personal'), { version: 1, workspaceMode: 'setlists', filter: { kind: 'all' }, parentFilter: { kind: 'all' }, view: 'detail', setlistId: 'meeting', songId: 'entry' });
  localStorage.setItem('chordmaster.active-library.same-user.v1', 'personal');
});
const saveOnPhone = () => {
  const list = cloud.setlists[0];
  cloud = { ...cloud, setlists: [{ ...list, updatedAt: 2, songs: [
    { ...list.songs[0], overrideKey: 'D', songData: { ...cloud.songs[0], tempo: 140 } },
    { ...list.songs[0], id: 'added', order: 1, songData: { ...cloud.songs[0], title: '手機加入的歌曲', tempo: 88 } }
  ] }], lastSavedAt: 2 };
  act(() => state.listeners.forEach(listener => listener('setlists')));
};
const mount = async () => {
  const view = render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
  await waitFor(() => expect(state.subscribe).toHaveBeenCalledWith('personal', expect.any(Function)));
  await waitFor(() => expect(document.querySelector('[data-setlist-song-id="entry"]')).not.toBeNull());
  return view;
};
it('receives same-account key/addition events in the personal library without refreshing the page or writing back', async () => {
  const view = await mount();
  saveOnPhone();
  await waitFor(() => expect(document.querySelector('[data-setlist-song-id="added"]')).not.toBeNull());
  expect(within(document.querySelector<HTMLElement>('[data-setlist-song-id="entry"]')!).getByRole('button', { name: 'Key D' })).toBeInTheDocument();
  expect(state.save).not.toHaveBeenCalled();
  view.unmount();
  expect(state.listeners.size).toBe(0); expect(state.unsubscribe).toHaveBeenCalled();
});
it('updates the already mounted drummer list and chart while protecting its playing tempo', async () => {
  const view = await mount();
  fireEvent.click(screen.getAllByRole('button', { name: '鼓手模式' })[0]);
  const dialog = await screen.findByRole('dialog', { name: '鼓手模式' });
  fireEvent.click(within(dialog).getByRole('button', { name: '播放' }));
  state.audio.playing = true;
  const chart = within(dialog).getByTestId('sync-chart');
  const list = dialog.querySelector<HTMLElement>('.drummer-list-scroll')!;
  list.scrollTop = 43;
  saveOnPhone();
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /2 手機加入的歌曲/ })).toBeInTheDocument());
  expect(screen.getByRole('dialog', { name: '鼓手模式' })).toBe(dialog);
  expect(within(dialog).getByTestId('sync-chart')).toBe(chart);
  expect(list.scrollTop).toBe(43);
  expect(within(dialog).getByTestId('sync-chart')).toHaveAttribute('data-key', 'D');
  expect(within(dialog).getByRole('textbox', { name: '節拍器速度 BPM' })).toHaveValue('72');
  expect(state.audio.start).toHaveBeenCalledOnce();
  expect(state.save).not.toHaveBeenCalled();
  view.unmount();
});


it('receives key/addition changes while the regular full-screen performance view stays open', async () => {
  const view = await mount();
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  const overlay = document.querySelector<HTMLElement>('[data-performance-overlay]')!;
  expect(overlay).not.toBeNull();
  expect(within(overlay).getByTestId('sync-chart')).toHaveAttribute('data-key', 'C');
  saveOnPhone();
  await waitFor(() => expect(within(overlay).getByTestId('sync-chart')).toHaveAttribute('data-key', 'D'));
  expect(document.querySelector('[data-performance-overlay]')).toBe(overlay);
  expect(document.querySelector('[data-setlist-song-id="added"]')).not.toBeNull();
  expect(state.save).not.toHaveBeenCalled();
  view.unmount();
});


it('updates a joined shared setlist in performance mode when the device returns online', async () => {
  cloud = { ...cloud, setlists: [], joinedSetlists: [{ ...cloud.setlists[0], isJoined: true }] };
  const view = await mount();
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  const overlay = document.querySelector<HTMLElement>('[data-performance-overlay]')!;
  cloud = { ...cloud, joinedSetlists: cloud.joinedSetlists.map(list => ({ ...list, songs: list.songs.map(row => ({ ...row, overrideKey: 'E' })) })) };
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(within(overlay).getByTestId('sync-chart')).toHaveAttribute('data-key', 'E'));
  expect(document.querySelector('[data-performance-overlay]')).toBe(overlay);
  expect(state.save).not.toHaveBeenCalled();
  view.unmount();
});
