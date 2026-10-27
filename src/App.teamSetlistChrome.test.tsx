import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { LibraryRole, WorkspaceSnapshot } from './types';
const state = vi.hoisted(() => ({ refresh: vi.fn(() => false), role: 'viewer' as LibraryRole, presenceFailed: false, editors: [] as import('./lib/songEditingPresence').SongEditorPresence[] }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: { id: 'review-user', email: 'review@example.invalid', name: 'Review', picture: '' }, session: { access_token: 'test-session' }, status: 'signed-in', isConfigured: true, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({ listLibraries: async () => [{ id: 'team', name: '測試團隊', kind: 'team', role: state.role, ownerUserId: 'owner', createdAt: '', updatedAt: '' }], setActiveLibrary: vi.fn(), loadLibraryWorkspace: async () => fixture, getSetlistShareStatus: async () => ({ activeToken: null, activeCreatedAt: null, participantCount: 0, participants: [] }), getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }), getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [], subscribeToLibraryChanges: () => () => {} }) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: state.refresh }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: state.editors, failed: state.presenceFailed }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, error: null, dismiss: vi.fn(), restored: vi.fn() }) }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); state.refresh.mockReturnValue(false); state.presenceFailed = false; state.editors = [];
  const song = { id: 'song', updatedAt: 1, title: '團隊顯示檢查', originalKey: 'C' as const, currentKey: 'C' as const, timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
  fixture = { songs: [song], setlists: [{ id: 'set', name: '團隊歌單', displayMode: 'chord-movable-key', createdBy: 'owner', createdAt: 1, updatedAt: 1, songs: [{ id: 'entry', setlistId: 'set', songId: song.id, order: 0, sectionOrder: [], songData: song }] }], projects: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.workspace-mode.v1', 'setlists');
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'set');
  localStorage.setItem('chordmaster.active-library.review-user.v1', 'team');
});
afterEach(() => localStorage.clear());
it.each(['owner', 'viewer'] as const)('removes empty team-setlist chrome and permits a personal view for %s', async role => {
  state.role = role;
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  const latest = () => (state.refresh.mock.calls.at(-1) as unknown as [Parameters<typeof import('./hooks/useLibraryWorkspaceRefresh').useLibraryWorkspaceRefresh>[0]])[0];
  await waitFor(() => expect(latest().enabled && latest().libraryId === 'team').toBe(true), { timeout: 5000 });
  expect(document.querySelector('[data-library-live-status]')).toBeNull();
  expect(document.querySelector('[data-main-panel]')?.firstElementChild).toBe(document.querySelector('[data-topbar]'));
  const before = JSON.stringify(latest().workspace.setlists);
  const controls = screen.getByRole('group', { name: '個人顯示模式' });
  expect(within(controls).getByRole('button', { name: '級數' })).toBeEnabled();
  fireEvent.click(within(controls).getByRole('button', { name: '級數' }));
  await waitFor(() => expect(document.querySelector('[data-setlist-preview-song-id="entry"] [data-preview-owner-slot="0"]')?.textContent).toBe('1'));
  expect(JSON.stringify(latest().workspace.setlists)).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: '歌曲' }));
  await waitFor(() => expect(document.querySelector('[data-main-panel]')?.firstElementChild).toBe(document.querySelector('[data-topbar]')));
  expect(document.querySelector('[data-library-live-status]')).toBeNull();
  expect(screen.queryByText('歌曲庫自動同步')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /同步狀態: .*歌曲庫自動同步/ }));
  expect(screen.getByText(/歌曲庫自動同步/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '歌單' }));
  expect(document.querySelector('[data-main-panel]')?.firstElementChild).toBe(document.querySelector('[data-topbar]'));
  expect(localStorage.getItem('chordmaster.personal-setlist-display-modes.v1:user:review-user')).toContain('nashville-number-system');
}, 15000);

it.each(['refresh', 'presence', 'editor'])('keeps meaningful %s notices and removes the row after recovery', async issue => {
  state.role = 'owner';
  localStorage.setItem('chordmaster.workspace-mode.v1', 'songs');
  if (issue === 'refresh') state.refresh.mockReturnValue(true);
  if (issue === 'presence') state.presenceFailed = true;
  if (issue === 'editor') state.editors = [{ sessionId: 'session', userId: 'other', name: '測試團員', songId: 'song', updatedAt: Date.now() }];
  const content = () => <MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>;
  const { rerender } = render(content());
  await waitFor(() => expect((state.refresh.mock.calls.at(-1) as unknown as [{ libraryId: string; enabled: boolean }])[0]).toMatchObject({ libraryId: 'team', enabled: true }));
  const notice = document.querySelector('[data-library-live-status]');
  expect(notice).toHaveTextContent(issue === 'refresh' ? '雲端更新暫時中斷' : issue === 'presence' ? '編輯狀態暫時中斷' : '測試團員 正在編輯這首歌');
  state.refresh.mockReturnValue(false); state.presenceFailed = false; state.editors = [];
  rerender(content());
  await waitFor(() => expect(document.querySelector('[data-library-live-status]')).toBeNull());
  expect(document.querySelector('[data-main-panel]')?.firstElementChild).toBe(document.querySelector('[data-topbar]'));
}, 15000);

it('keeps score-version notices inside the preview overlay instead of resizing the content area', async () => {
  state.role = 'owner';
  fixture.setlists[0].songs[0].songData = structuredClone(fixture.songs[0]);
  fixture.setlists[0].songs[0].songData!.sections[0].bars[0].annotation = '歌單修改';
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  const notice = await waitFor(() => {
    const item=document.querySelector('[data-source-sync-overlay]'); expect(item).not.toBeNull(); return item!;
  }, {timeout:5000});
  expect(notice.closest('[data-setlist-preview-pane]')).toBe(document.querySelector('[data-setlist-preview-pane]'));
  expect(notice).toHaveClass('absolute');
  expect(within(notice as HTMLElement).getByRole('button',{name:'比對差異與方向'})).toBeVisible();
  expect(document.querySelector('[data-content-area]')?.previousElementSibling).toBe(document.querySelector('[data-topbar]'));
});
