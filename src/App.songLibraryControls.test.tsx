import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { LibraryRole, WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({
  cloud: false,
  role: 'owner' as LibraryRole,
  refresh: vi.fn(() => false)
}));
let fixture: WorkspaceSnapshot;

vi.mock('./components/useAnchoredPortalPanel', () => ({
  useAnchoredPortalPanel: () => ({
    panelStyle: { position: 'fixed', top: 0, left: 0 },
    placement: 'bottom', isPositioned: true, transformOrigin: 'top right'
  })
}));
vi.mock('./lib/auth', () => ({
  useSupabaseAuth: () => ({
    user: state.cloud ? { id: 'library-user', email: 'library@example.invalid', name: 'Library' } : null,
    session: state.cloud ? { access_token: 'test-session' } : null,
    status: state.cloud ? 'signed-in' : 'unconfigured',
    isConfigured: state.cloud,
    signInWithGoogle: vi.fn(), signOut: vi.fn()
  })
}));
vi.mock('./lib/workspace', async original => ({
  ...await original<typeof import('./lib/workspace')>(),
  loadPersistentWorkspaceSnapshot: async () => fixture
}));
vi.mock('./lib/repository', () => ({
  createCloudRepository: () => ({
    listLibraries: async () => [{
      id: 'team', name: '歌曲庫測試團隊', kind: 'team', role: state.role,
      ownerUserId: 'owner', createdAt: '', updatedAt: ''
    }],
    setActiveLibrary: vi.fn(),
    loadLibraryWorkspace: async () => fixture,
    getNotifications: async () => [],
    getShareContacts: async () => [],
    getPendingTeamInvites: async () => [],
    getSetlistShareStatus: async () => ({
      activeToken: null, activeCreatedAt: null, participantCount: 0, participants: []
    }),
    getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }),
    subscribeToLibraryChanges: () => () => {}
  })
}));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: state.refresh }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({
  useSongEditingPresence: () => ({ editors: [], failed: false })
}));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({
  useTeamWorkspaceDraft: () => ({ ready: true, pending: null, error: null, dismiss: vi.fn(), restored: vi.fn() })
}));

const row = (id: string) => document.querySelector<HTMLElement>(`[data-library-song-id="${id}"]`)!;
const openSong = (title: string) => screen.getByRole('button', { name: `開啟歌曲：${title}` });
const selectedSongId = () => localStorage.getItem('chordmaster.selected-song-id.v1');
const mount = async () => {
  localStorage.setItem('chordmaster.workspace-mode.v1', 'songs');
  localStorage.setItem('chordmaster.selected-song-id.v1', 'first');
  if (state.cloud) localStorage.setItem('chordmaster.active-library.library-user.v1', 'team');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findByRole('button', { name: `開啟歌曲：${fixture.songs[2].title}` });
  if (state.cloud) {
    await waitFor(() => expect((state.refresh.mock.calls.at(-1) as unknown as [{ libraryId: string; enabled: boolean }])[0])
      .toMatchObject({ libraryId: 'team', enabled: true }));
  }
  await waitFor(() => expect(openSong(fixture.songs[0].title)).toHaveAttribute('aria-current', 'true'));
};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  state.cloud = false;
  state.role = 'owner';
  state.refresh.mockReturnValue(false);
  fixture = {
    songs: [
      { id: 'first', title: '第一首歌曲', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', updatedAt: 1,
        sections: [{ id: 'verse-first', title: 'Verse', bars: [{ id: 'bar-first', chords: ['C'] }] }] },
      { id: 'second', title: '第二首歌曲', originalKey: 'D', currentKey: 'D', timeSignature: '4/4', updatedAt: 1,
        sections: [{ id: 'verse-second', title: 'Verse', bars: [{ id: 'bar-second', chords: ['D'] }] }] },
      { id: 'third', title: '第三首歌曲', originalKey: 'E', currentKey: 'E', timeSignature: '4/4', updatedAt: 1,
        sections: [{ id: 'verse-third', title: 'Verse', bars: [{ id: 'bar-third', chords: ['E'] }] }] }
    ],
    projects: [], setlists: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1
  };
});
afterEach(() => localStorage.clear());

it('keeps the current song when a different row menu is dismissed and edits the requested song', async () => {
  await mount();
  const trigger = within(row('second')).getByRole('button', { name: '歌曲操作：第二首歌曲' });
  fireEvent.click(trigger);
  const menu = await screen.findByRole('menu', { name: '歌曲操作：第二首歌曲' });
  expect(selectedSongId()).toBe('first');
  expect(openSong('第一首歌曲')).toHaveAttribute('aria-current', 'true');
  fireEvent.keyDown(menu, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu', { name: '歌曲操作：第二首歌曲' })).toBeNull());
  expect(trigger).toHaveFocus();
  expect(selectedSongId()).toBe('first');

  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('menuitem', { name: '編輯歌曲' }));
  await waitFor(() => expect(selectedSongId()).toBe('second'));
  expect(openSong('第二首歌曲')).toHaveAttribute('aria-current', 'true');
  expect(openSong('第一首歌曲')).not.toHaveAttribute('aria-current', 'true');
  const main = document.querySelector<HTMLElement>('[data-main-panel]')!;
  expect(await within(main).findByDisplayValue('第二首歌曲')).toBeVisible();
  expect(within(main).queryByDisplayValue('第一首歌曲')).toBeNull();
});

it('lets a team viewer select songs without exposing management or write actions', async () => {
  state.cloud = true;
  state.role = 'viewer';
  await mount();
  const library = within(document.querySelector<HTMLElement>('[data-song-library]')!);
  expect(library.queryByRole('button', { name: '歌曲庫操作' })).toBeNull();
  expect(library.queryByRole('button', { name: /^歌曲操作：/ })).toBeNull();
  expect(library.queryByRole('button', { name: /管理歌曲|匯出|新增歌曲|編輯歌曲|複製歌曲|封存歌曲/ })).toBeNull();
  expect(library.queryByRole('checkbox')).toBeNull();
  fireEvent.click(openSong('第二首歌曲'));
  await waitFor(() => expect(selectedSongId()).toBe('second'));
  expect(openSong('第二首歌曲')).toHaveAttribute('aria-current', 'true');
  expect(screen.queryByRole('menu')).toBeNull();
});

it('preserves bulk selections across search and commits a renamed title only after composition ends', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: '歌曲庫操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '管理歌曲' }));
  fireEvent.click(within(row('first')).getByRole('checkbox', { name: '選取：第一首歌曲' }));
  const search = screen.getByRole('textbox', { name: '搜尋歌曲' });
  fireEvent.change(search, { target: { value: '第二首' } });
  expect(row('first')).toBeNull();
  fireEvent.click(within(row('second')).getByRole('checkbox', { name: '選取：第二首歌曲' }));
  fireEvent.change(search, { target: { value: '' } });
  expect(within(row('first')).getByRole('checkbox')).toBeChecked();
  expect(within(row('second')).getByRole('checkbox')).toBeChecked();
  expect(within(row('third')).getByRole('checkbox')).not.toBeChecked();

  const title = within(row('first')).getByRole('textbox', { name: '歌曲名稱：第一首歌曲' });
  act(() => title.focus());
  fireEvent.change(title, { target: { value: 'new song name' } });
  fireEvent.keyDown(title, { key: 'Enter', isComposing: true });
  expect(title).toHaveFocus();
  expect(title).toHaveValue('new song name');
  fireEvent.keyDown(title, { key: 'Enter', isComposing: false });
  expect(title).not.toHaveFocus();
  expect(title).toHaveValue('New Song Name');
  expect(within(row('first')).getByRole('checkbox')).toBeChecked();
  expect(within(row('second')).getByRole('checkbox')).toBeChecked();
  expect(selectedSongId()).toBe('first');

  fireEvent.click(screen.getByRole('button', { name: '完成管理' }));
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(openSong('New Song Name')).toHaveAttribute('aria-current', 'true');
});

it('finds songs through pinyin, Zhuyin and missed input-method switching without changing the selection', async () => {
  fixture.songs[0].title = '我們歡迎君王降臨';
  fixture.songs[1].title = '計算機';
  await mount();
  const search = screen.getByRole('textbox', { name: '搜尋歌曲' });
  for (const value of ['wmhyjwjl', 'womenhuanyingjunwangjianglin', 'ㄨㄇㄏㄧㄐㄨㄐㄌ', 'jacurjrx']) {
    fireEvent.change(search, { target: { value } });
    expect(await screen.findByRole('button', { name: '開啟歌曲：我們歡迎君王降臨' })).toHaveAttribute('aria-current', 'true');
    expect(row('second')).toBeNull();
    expect(row('third')).toBeNull();
  }
  for (const value of ['jsj', 'ㄐㄙㄐ', 'rnr', 'ru4nj04ru']) {
    fireEvent.change(search, { target: { value } });
    expect(await screen.findByRole('button', { name: '開啟歌曲：計算機' })).toBeInTheDocument();
    expect(row('first')).toBeNull();
    expect(selectedSongId()).toBe('first');
  }
  fireEvent.change(search, { target: { value: '' } });
  expect(await screen.findByRole('button', { name: '開啟歌曲：我們歡迎君王降臨' })).toHaveAttribute('aria-current', 'true');
  expect(row('third')).not.toBeNull();
});

it('finds 點燃 in the library with both two-letter and two-symbol initials', async () => {
  fixture.songs[0].title = '點燃（官方版）';
  await mount();
  const search = screen.getByRole('textbox', { name: '搜尋歌曲' });
  for (const value of ['dr', 'ㄉㄖ', '點燃']) {
    fireEvent.change(search, { target: { value } });
    expect(await screen.findByRole('button', { name: '開啟歌曲：點燃（官方版）' })).toHaveAttribute('aria-current', 'true');
    expect(row('second')).toBeNull();
    expect(row('third')).toBeNull();
  }
});
