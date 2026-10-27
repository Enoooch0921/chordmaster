import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, loadNavigationLocation, saveNavigationLocation, type SetlistNavigationLocation } from './lib/setlistNavigationMemory';
import type { LibraryRole, WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({ cloud: false, role: 'viewer' as LibraryRole, saveCapo: vi.fn() }));
let fixture: WorkspaceSnapshot;
vi.mock('./components/useAnchoredPortalPanel', () => ({ useAnchoredPortalPanel: () => ({ panelStyle: { position: 'fixed', top: 0, left: 0 }, placement: 'bottom', isPositioned: true, transformOrigin: 'top right' }) }));
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: state.cloud ? { id: 'controls-user', email: 'controls@example.invalid', name: 'Controls' } : null,
  session: state.cloud ? { access_token: 'test' } : null, status: state.cloud ? 'authenticated' : 'unconfigured', isConfigured: state.cloud, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({
  listLibraries: async () => [{ id: 'team', name: 'Controls team', kind: 'team', role: state.role, ownerUserId: 'owner', createdAt: '', updatedAt: '' }],
  setActiveLibrary: vi.fn(), loadLibraryWorkspace: async () => fixture, saveCapoOverride: state.saveCapo,
  getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [],
  getSetlistShareStatus: async () => ({ activeToken: null, activeCreatedAt: null, participantCount: 0, participants: [] }),
  getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }), subscribeToLibraryChanges: () => () => {}
}) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: [], failed: false }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, dismiss: vi.fn(), restored: vi.fn() }) }));

const remembered: SetlistNavigationLocation = { version: 1, workspaceMode: 'setlists', filter: { kind: 'all' }, parentFilter: { kind: 'all' }, view: 'detail', setlistId: 'meeting', songId: 'entry-first' };
const navigationKey = () => getNavigationStorageKey(state.cloud ? 'controls-user' : null, state.cloud ? 'team' : null);
const row = (id: string) => document.querySelector<HTMLElement>(`[data-setlist-song-id="${id}"]`)!;
const currentSong = () => loadNavigationLocation(navigationKey())?.songId;
const rowOrder = () => Array.from(document.querySelectorAll('[data-setlist-song-id]'), element => element.getAttribute('data-setlist-song-id'));
const elementFromPoint = vi.fn();
const pointer = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 40, clientY: 100 };
const targetRow = (id: string) => elementFromPoint.mockReturnValue(row(id));
const mount = async () => {
  saveNavigationLocation(navigationKey(), remembered);
  if (state.cloud) localStorage.setItem('chordmaster.active-library.controls-user.v1', 'team');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await waitFor(() => expect(row('entry-second')).not.toBeNull());
  await waitFor(() => expect(currentSong()).toBe('entry-first'));
};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!window.PointerEvent) {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    });
  }
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear(); state.cloud = false; state.role = 'viewer'; state.saveCapo.mockReset().mockResolvedValue(undefined);
  elementFromPoint.mockReset();
  const songs = [
    { id: 'first', title: '第一首歌曲', originalKey: 'C' as const, currentKey: 'C' as const, timeSignature: '4/4', updatedAt: 1, sections: [{ id: 'verse-first', title: 'Verse', bars: [{ id: 'bar-first', chords: ['C'] }] }] },
    { id: 'second', title: '第二首歌曲', originalKey: 'D' as const, currentKey: 'D' as const, timeSignature: '4/4', updatedAt: 1, sections: [{ id: 'verse-second', title: 'Verse', bars: [{ id: 'bar-second', chords: ['D'] }] }] }
  ];
  fixture = { songs, projects: [], setlists: [{ id: 'meeting', name: '聚會一', displayMode: 'chord-movable-key', createdBy: 'owner', createdAt: 1, updatedAt: 1,
    songs: songs.map((song, order) => ({ id: `entry-${song.id}`, setlistId: 'meeting', songId: song.id, songData: song, order, capo: 0, sectionOrder: [song.sections[0].id] })) }], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1 };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.style.userSelect = '';
  localStorage.clear();
});

it('drags the numbered handle directly while keeping inline controls and the current song', async () => {
  await mount();
  const handle = within(row('entry-second')).getByRole('button', { name: '拖動排序：第二首歌曲' });
  expect(handle).toHaveTextContent('2');
  expect(screen.getAllByRole('button', { name: /^拖動排序：/ })).toHaveLength(2);
  expect(within(row('entry-second')).getByRole('button', { name: 'Key D' })).toBeEnabled();
  expect(within(row('entry-second')).getByRole('button', { name: '速度 未設定 BPM' })).toBeEnabled();
  expect(within(row('entry-second')).getByRole('button', { name: '歌曲操作：第二首歌曲' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '完成排序' })).toBeNull();

  targetRow('entry-first');
  fireEvent.pointerDown(handle, pointer);
  expect(row('entry-second')).toHaveClass('is-dragging');
  fireEvent.pointerMove(handle, pointer);
  expect(rowOrder()).toEqual(['entry-second', 'entry-first']);
  fireEvent.pointerUp(handle, pointer);
  fireEvent.click(handle);

  expect(row('entry-second')).not.toHaveClass('is-dragging');
  expect(document.body.style.userSelect).toBe('');
  expect(currentSong()).toBe('entry-first');
  expect(within(row('entry-second')).getByRole('button', { name: 'Key D' })).toBeEnabled();
});

it('waits for a touch hold before allowing a direct drag', async () => {
  await mount();
  vi.useFakeTimers();
  const handle = within(row('entry-second')).getByRole('button', { name: '拖動排序：第二首歌曲' });
  const touch = { ...pointer, pointerType: 'touch' };
  targetRow('entry-first');

  fireEvent.pointerDown(handle, touch);
  fireEvent.pointerMove(handle, touch);
  act(() => vi.advanceTimersByTime(179));
  fireEvent.pointerMove(handle, touch);
  expect(rowOrder()).toEqual(['entry-first', 'entry-second']);
  expect(row('entry-second')).not.toHaveClass('is-dragging');

  act(() => vi.advanceTimersByTime(1));
  expect(row('entry-second')).toHaveClass('is-dragging');
  fireEvent.pointerMove(handle, touch);
  expect(rowOrder()).toEqual(['entry-second', 'entry-first']);
  fireEvent.pointerUp(handle, touch);
  expect(row('entry-second')).not.toHaveClass('is-dragging');
  expect(document.body.style.userSelect).toBe('');
  expect(currentSong()).toBe('entry-first');
});

it('cancels a pending touch hold without later starting a drag', async () => {
  await mount();
  vi.useFakeTimers();
  const handle = within(row('entry-second')).getByRole('button', { name: '拖動排序：第二首歌曲' });
  const touch = { ...pointer, pointerType: 'touch' };
  targetRow('entry-first');

  fireEvent.pointerDown(handle, touch);
  act(() => vi.advanceTimersByTime(100));
  fireEvent.pointerCancel(handle, touch);
  act(() => vi.advanceTimersByTime(180));
  fireEvent.pointerMove(handle, touch);

  expect(rowOrder()).toEqual(['entry-first', 'entry-second']);
  expect(row('entry-second')).not.toHaveClass('is-dragging');
  expect(document.body.style.userSelect).toBe('');
  expect(currentSong()).toBe('entry-first');
});

it('reorders from the normal handle with arrow keys while retaining keyboard focus', async () => {
  await mount();
  const handle = within(row('entry-second')).getByRole('button', { name: '拖動排序：第二首歌曲' });
  expect(handle).toHaveAttribute('aria-description', expect.stringContaining('方向鍵'));
  handle.focus();

  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  expect(rowOrder()).toEqual(['entry-second', 'entry-first']);
  expect(handle).toHaveFocus();
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  expect(rowOrder()).toEqual(['entry-second', 'entry-first']);
  fireEvent.keyDown(handle, { key: 'ArrowDown' });
  expect(rowOrder()).toEqual(['entry-first', 'entry-second']);
  fireEvent.keyDown(handle, { key: 'ArrowDown' });
  expect(rowOrder()).toEqual(['entry-first', 'entry-second']);
  expect(currentSong()).toBe('entry-first');
});

it('selects a song from its title without starting a drag or changing the order', async () => {
  await mount();
  const title = within(row('entry-second')).getByRole('button', { name: /第二首歌曲.*4\/4/ });
  targetRow('entry-first');
  fireEvent.pointerDown(title, pointer);
  fireEvent.pointerMove(title, pointer);
  fireEvent.pointerUp(title, pointer);
  fireEvent.click(title);

  await waitFor(() => expect(currentSong()).toBe('entry-second'));
  expect(rowOrder()).toEqual(['entry-first', 'entry-second']);
  expect(row('entry-second')).not.toHaveClass('is-dragging');
});

it('adjusts another song directly without changing the currently selected song', async () => {
  await mount();
  fireEvent.click(within(row('entry-second')).getByRole('button', { name: 'Key D' }));
  fireEvent.click(await screen.findByRole('button', { name: 'G' }));
  await within(row('entry-second')).findByRole('button', { name: 'Key G' });
  expect(currentSong()).toBe('entry-first');
  expect(within(row('entry-first')).getByRole('button', { name: 'Key C' })).toBeInTheDocument();
  expect(rowOrder()).toEqual(['entry-first', 'entry-second']);

  fireEvent.click(within(row('entry-second')).getByRole('button', { name: '速度 未設定 BPM' }));
  fireEvent.change(await screen.findByRole('textbox', { name: '速度 BPM' }), { target: { value: '92.5' } });
  fireEvent.click(screen.getByRole('button', { name: '套用' }));
  await within(row('entry-second')).findByRole('button', { name: '速度 92.5 BPM' });
  expect(within(row('entry-first')).getByRole('button', { name: '速度 未設定 BPM' })).toBeInTheDocument();
  expect(currentSong()).toBe('entry-first');
  expect(rowOrder()).toEqual(['entry-first', 'entry-second']);
  fireEvent.click(within(row('entry-second')).getByRole('button', { name: /第二首歌曲.*4\/4/ }));
  await waitFor(() => expect(currentSong()).toBe('entry-second'));
  const topbar = within(document.querySelector<HTMLElement>('[data-topbar]')!);
  fireEvent.click(topbar.getByRole('button', { name: '速度 92.5 BPM' }));
  fireEvent.click(await screen.findByRole('button', { name: '增加 1 BPM' }));
  expect(within(row('entry-second')).getByRole('button', { name: '速度 93.5 BPM' })).toBeInTheDocument();
  expect(topbar.getByRole('button', { name: '速度 93.5 BPM' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '關閉' }));
  fireEvent.click(screen.getByRole('button', { name: '歌曲' }));
  expect(topbar.getByRole('button', { name: '速度 未設定 BPM' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /開啟歌曲：第二首歌曲/ }));
  expect(topbar.getByRole('button', { name: '速度 未設定 BPM' })).toBeInTheDocument();
  expect(fixture.songs.every(song => song.tempo === undefined)).toBe(true);

});

it('reorders through explicit sorting controls and returns to inline settings when finished', async () => {
  await mount();
  expect(screen.queryByRole('button', { name: '下移：第一首歌曲' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '歌單操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '調整歌曲順序' }));
  expect(within(row('entry-first')).getByRole('button', { name: '上移：第一首歌曲' })).toBeDisabled();
  fireEvent.click(within(row('entry-first')).getByRole('button', { name: '下移：第一首歌曲' }));
  await waitFor(() => expect(rowOrder()).toEqual(['entry-second', 'entry-first']));
  expect(within(row('entry-first')).getByRole('button', { name: '下移：第一首歌曲' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '完成排序' }));
  expect(screen.queryByRole('button', { name: '下移：第一首歌曲' })).toBeNull();
  expect(within(row('entry-second')).getByRole('button', { name: 'Key D' })).toBeEnabled();
  expect(rowOrder()).toEqual(['entry-second', 'entry-first']);
  expect(currentSong()).toBe('entry-first');
});

it('keeps keys and tempo read-only for a viewer while saving personal Capo from the topbar', async () => {
  state.cloud = true;
  await mount();
  await waitFor(() => expect(within(row('entry-second')).getByRole('button', { name: 'Key D' })).toBeDisabled());
  expect(within(row('entry-second')).getByRole('button', { name: '速度 未設定 BPM' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /^拖動排序：/ })).toBeNull();
  expect(within(row('entry-second')).queryByText('Capo')).toBeNull();
  const topbar = within(document.querySelector<HTMLElement>('[data-topbar]')!);
  const capo = topbar.getByRole('button', { name: '0' });
  expect(capo).toBeEnabled();
  fireEvent.click(capo);
  fireEvent.click(await screen.findByRole('button', { name: /^2\s*\(\s*Bb\s*\)$/ }));
  await waitFor(() => expect(state.saveCapo).toHaveBeenCalledWith('entry-first', 2));
  expect(topbar.getByRole('button', { name: '2' })).toBeInTheDocument();
  expect(topbar.getByRole('button', { name: '速度 未設定 BPM' })).toBeDisabled();
  expect(currentSong()).toBe('entry-first');
});

it('uses the same phonetic search when choosing songs to add', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: '加入歌曲' }));
  const search = await screen.findByPlaceholderText('搜尋要加入的歌曲');
  for (const value of ['desgq', 'ㄉㄦㄕㄍㄑ']) {
    fireEvent.change(search, { target: { value } });
    expect(await screen.findByRole('button', { name: /^第二首歌曲.*已加入/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /^第一首歌曲.*已加入/ })).toBeNull();
    expect(currentSong()).toBe('entry-first');
  }
});
