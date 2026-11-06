import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { LibraryRole, WorkspaceSnapshot } from './types';

const state = vi.hoisted(() => ({
  cloud: false,
  role: 'owner' as LibraryRole,
  saveSong: vi.fn(async () => {}),
  shareBundle: vi.fn(async (_ids: string[]) => 'library-bundle-token'),
  shareSingle: vi.fn(async () => 'library-song-token'),
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
    subscribeToLibraryChanges: () => () => {},
    saveSong: state.saveSong, createSongBundleShare: state.shareBundle, createShareLink: state.shareSingle
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
  await waitFor(() => expect(document.querySelector('[data-sidebar]')).not.toBeNull());
  fireEvent.mouseEnter(document.querySelector('[data-sidebar]')!.firstElementChild!);
  await waitFor(() => expect(row(fixture.songs[2].id)).not.toBeNull());
  if (state.cloud) {
    await waitFor(() => expect((state.refresh.mock.calls.at(-1) as unknown as [{ libraryId: string; enabled: boolean }])[0])
      .toMatchObject({ libraryId: 'team', enabled: true }));
  }
  await waitFor(() => expect(within(row(fixture.songs[0].id)).getByRole('button', { name: `開啟歌曲：${fixture.songs[0].title}` })).toHaveAttribute('aria-current', 'true'));
};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
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

it('lets viewers favorite songs independently and combines collapsible musical filters', async () => {
  state.cloud = true; state.role = 'viewer';
  fixture.songs[1].tempo = 92.5; fixture.songs[1].timeSignature = '6/8'; fixture.songs[2].tempo = 140;
  await mount();
  fireEvent.click(within(row('second')).getByRole('button', { name: '收藏：第二首歌曲' }));
  expect(selectedSongId()).toBe('first');
  fireEvent.click(within(screen.getByRole('group', { name: '歌曲範圍' })).getByRole('button', { name: '收藏' }));
  expect(row('first')).toBeNull(); expect(row('second')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '篩選' }));
  const filters = within(screen.getByRole('region', { name: '歌曲篩選' }));
  fireEvent.change(filters.getByRole('combobox', { name: 'Key' }), { target: { value: 'D' } });
  fireEvent.change(filters.getByRole('combobox', { name: '拍號' }), { target: { value: '6/8' } });
  fireEvent.change(filters.getByRole('spinbutton', { name: '最低 BPM' }), { target: { value: '92.5' } });
  fireEvent.change(filters.getByRole('spinbutton', { name: '最高 BPM' }), { target: { value: '92.5' } });
  expect(row('second')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '篩選 (3)' }));
  expect(screen.queryByRole('region', { name: '歌曲篩選' })).toBeNull(); expect(row('second')).not.toBeNull();
  fireEvent.click(within(row('second')).getByRole('button', { name: '取消收藏：第二首歌曲' }));
  expect(row('second')).toBeNull(); expect(screen.getByRole('button', { name: '顯示全部歌曲' })).toBeInTheDocument();
});

it('records real song choices as recently used, without treating initial restoration as a new use', async () => {
  await mount();
  const scope = within(screen.getByRole('group', { name: '歌曲範圍' }));
  fireEvent.click(scope.getByRole('button', { name: '最近使用' }));
  expect(document.querySelectorAll('[data-library-song-id]')).toHaveLength(0);
  fireEvent.click(scope.getByRole('button', { name: '全部' }));
  fireEvent.click(openSong('第二首歌曲')); await waitFor(() => expect(selectedSongId()).toBe('second'));
  fireEvent.click(openSong('第三首歌曲')); await waitFor(() => expect(selectedSongId()).toBe('third'));
  fireEvent.click(scope.getByRole('button', { name: '最近使用' }));
  expect([...document.querySelectorAll<HTMLElement>('[data-library-song-id]')].map(el => el.dataset.librarySongId)).toEqual(['third', 'second']);
});

it('keeps same-title authors and version/language information in separate stable slots', async () => {
  fixture.songs[0] = { ...fixture.songs[0], title: '同名歌曲（原版）', composer: '作者甲', lyricsDoc: { chinese: '歌詞' } };
  fixture.songs[1] = { ...fixture.songs[1], title: '同名歌曲（現場版）', composer: '作者乙', lyricsDoc: { chinese: '', english: 'Lyrics' } };
  await mount();
  expect(row('first').querySelector('.song-library-title')).toHaveTextContent('同名歌曲');
  expect(row('first').querySelector('.song-library-credit-slot')).toHaveTextContent('作者甲');
  expect(row('first').querySelector('.song-library-version-slot')).toHaveTextContent('（原版）中文');
  expect(row('second').querySelector('.song-library-version-slot')).toHaveTextContent('（現場版）英文');
});

it('shares the same complete cross-search selection as archive, with inspect/remove/clear controls', async () => {
  state.cloud = true;
  await mount();
  fireEvent.click(screen.getByRole('button', { name: '歌曲庫操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '管理歌曲' }));
  fireEvent.click(within(row('first')).getByRole('checkbox'));
  const search = screen.getByRole('textbox', { name: '搜尋歌曲' });
  fireEvent.change(search, { target: { value: '第二首' } }); fireEvent.click(within(row('second')).getByRole('checkbox'));
  fireEvent.change(search, { target: { value: '第三首' } });
  fireEvent.click(screen.getByRole('button', { name: '已選 2 首' }));
  const selection = within(screen.getByRole('region', { name: '已選歌曲' }));
  expect(selection.getByText('第一首歌曲')).toBeInTheDocument(); expect(selection.getByText('第二首歌曲')).toBeInTheDocument();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try { fireEvent.click(screen.getByRole('button', { name: '刪除所選（可還原） (2)' })); expect(confirm).toHaveBeenCalledWith('要封存選取的 2 首歌曲嗎？'); } finally { confirm.mockRestore(); }
  fireEvent.click(selection.getByRole('button', { name: '取消選取：第一首歌曲' }));
  expect(screen.getByRole('button', { name: '分享 (1)' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '清除全部選取' }));
  expect(screen.getByRole('button', { name: '分享 (0)' })).toBeDisabled();
  fireEvent.change(search, { target: { value: '' } });
  fireEvent.click(within(row('first')).getByRole('checkbox')); fireEvent.click(within(row('second')).getByRole('checkbox'));
  fireEvent.change(search, { target: { value: '第三首' } });
  fireEvent.click(screen.getByRole('button', { name: '分享 (2)' }));
  await waitFor(() => expect(state.shareBundle).toHaveBeenCalledWith(['first', 'second']));
  expect(state.saveSong.mock.calls.map(call => (call as unknown as [{ id: string }])[0].id)).toEqual(expect.arrayContaining(['first', 'second']));
});

it('only deduplicates the selected songs, even when an unselected identical copy exists', async () => {
  fixture.songs = ['first', 'second', 'third'].map(id => ({ ...structuredClone(fixture.songs[0]), id }));
  await mount();
  fireEvent.click(screen.getByRole('button', { name: '歌曲庫操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '管理歌曲' }));
  fireEvent.click(within(row('first')).getByRole('checkbox')); fireEvent.click(within(row('second')).getByRole('checkbox'));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    fireEvent.click(screen.getByRole('button', { name: '封存所選重複歌曲' }));
    expect(confirm).toHaveBeenCalledWith('要封存已選 2 首中的 1 首相同副本嗎？既有歌單保留原本引用，可用撤銷恢復。');
  } finally { confirm.mockRestore(); }
});

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

it.each([false, true])('finds saved lyrics in the song library without changing selection (team: %s)', async cloud => {
  state.cloud = cloud; state.role = 'viewer';
  fixture.songs[1].lyricsDoc = { chinese: '已刪除的歌詞', blocks: [
    { id: 'v', marker: 'Verse', chinese: '星光照亮前路，\n我們一起前行', english: 'Hope will light\nour way' }
  ] };
  fixture.songs[2].sections[0].bars[0].annotation = '星光照亮前路';
  await mount();
  const search = screen.getByRole('textbox', { name: '搜尋歌曲' });
  expect(search).toHaveAttribute('placeholder', '搜尋歌名、歌詞或作者');
  for (const value of ['星光照亮前路我們一起前行', '我们一起前行', 'hope will light our way', '星光 D']) {
    fireEvent.change(search, { target: { value } });
    expect(await screen.findByRole('button', { name: '開啟歌曲：第二首歌曲' })).toBeInTheDocument();
    expect(row('first')).toBeNull(); expect(row('third')).toBeNull();
    expect(selectedSongId()).toBe('first');
  }
  expect(row('second').querySelector('.song-library-lyrics-match')).toHaveTextContent('星光照亮前路');
  fireEvent.change(search, { target: { value: '已刪除的歌詞' } });
  expect(row('second')).toBeNull();
  fireEvent.change(search, { target: { value: '' } });
  expect(openSong('第一首歌曲')).toHaveAttribute('aria-current', 'true');
  expect(row('second').querySelector('.song-library-lyrics-match')).toBeNull();
  fireEvent.change(search, { target: { value: '星光照亮前路' } });
  fireEvent.click(await screen.findByRole('button', { name: '開啟歌曲：第二首歌曲' }));
  await waitFor(() => expect(selectedSongId()).toBe('second'));
});


it('long-presses into selection without native selection and exposes recoverable deletion', async () => {
  await mount();
  const target = openSong('第二首歌曲');
  const range = document.createRange();
  range.selectNodeContents(target);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  expect(window.getSelection()!.toString()).not.toBe('');
  expect(fireEvent.contextMenu(target)).toBe(false);
  vi.useFakeTimers();
  try {
    fireEvent.touchStart(target, { touches: [{ clientX: 40, clientY: 100 }] });
    act(() => vi.advanceTimersByTime(451));
    expect(window.getSelection()!.toString()).toBe('');
    expect(within(row('second')).getByRole('checkbox', { name: '選取：第二首歌曲' })).toBeChecked();
    expect(within(row('first')).getByRole('checkbox')).not.toBeChecked();
    expect(within(row('second')).getByRole('textbox', { name: '歌曲名稱：第二首歌曲' })).toBeEnabled();
    const deletion = screen.getByRole('button', { name: '刪除所選（可還原） (1)' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      fireEvent.click(deletion);
      expect(confirm).toHaveBeenCalledWith('要封存選取的 1 首歌曲嗎？');
      expect(within(row('second')).getByRole('checkbox')).toBeChecked();
    } finally { confirm.mockRestore(); }
  } finally { vi.useRealTimers(); window.getSelection()!.removeAllRanges(); }
});

it.each(['scroll', 'multitouch'])('does not select a song when a long press becomes %s', async gesture => {
  await mount();
  const target = openSong('第二首歌曲');
  vi.useFakeTimers();
  try {
    fireEvent.touchStart(target, { touches: [{ clientX: 40, clientY: 100 }] });
    if (gesture === 'scroll') fireEvent.touchMove(target, { touches: [{ clientX: 40, clientY: 130 }] });
    else fireEvent.touchStart(target, { touches: [{ clientX: 40, clientY: 100 }, { clientX: 80, clientY: 100 }] });
    act(() => vi.advanceTimersByTime(451));
    expect(within(row('second')).queryByRole('checkbox')).toBeNull();
    fireEvent.touchEnd(target, { touches: [] });
  } finally { vi.useRealTimers(); }
});
