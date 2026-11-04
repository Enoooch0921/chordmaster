import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { WorkspaceSnapshot } from './types';

const updateMocks = vi.hoisted(() => ({ reloaded: vi.fn(), persisted: vi.fn(async (..._args: unknown[]) => 1), apply: vi.fn() }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/appUpdates', () => ({ appUpdates: {
  getSnapshot: () => true, subscribe: () => () => {},
  apply: async (prepare: () => Promise<void>) => { updateMocks.apply(); await prepare(); updateMocks.reloaded(); }
} }));
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(),
  loadPersistentWorkspaceSnapshot: async () => fixture,
  persistPersistentWorkspaceSnapshot: updateMocks.persisted,
}));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear(); updateMocks.persisted.mockReset().mockResolvedValue(1); updateMocks.reloaded.mockClear(); updateMocks.apply.mockClear();
  const song = { id: 'update-song', updatedAt: 1, title: '更新前草稿', originalKey: 'C' as const, currentKey: 'C' as const,
    timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'first', chords: ['C'] }] }] };
  fixture = { songs: [song], setlists: [{ id: 'set', name: '測試歌單', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', setlistId: 'set', songId: song.id, order: 0, sectionOrder: ['verse'], songData: song }] }], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'set');
});
afterEach(() => localStorage.clear());
async function start(mode: string) {
  localStorage.setItem('chordmaster.workspace-mode.v1', mode);
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findAllByText('更新前草稿');
  await waitFor(() => expect(document.querySelector('[data-preview-slot-index="0"]')).not.toBeNull());
  fireEvent.click(document.querySelector('[data-preview-slot-index="0"]')!);
  fireEvent.change(await screen.findByRole('textbox', { name: '和弦直接輸入' }), { target: { value: 'Em7' } });
}
it.each(['songs', 'setlists'])('persists the active %s draft before allowing a reload', async mode => {
  await start(mode);
  fireEvent.click(screen.getByRole('button', { name: '立即更新' }));
  await waitFor(() => expect(updateMocks.reloaded).toHaveBeenCalledOnce());
  const calls = updateMocks.persisted.mock.calls as unknown as [WorkspaceSnapshot['songs'], WorkspaceSnapshot['setlists']][];
  const saved = calls.at(-1)!;
  expect(mode === 'songs' ? saved[0][0].sections[0].bars[0].chords : saved[1][0].songs[0].songData?.sections[0].bars[0].chords).toContain('Em7');
  expect(fixture.songs[0].sections[0].bars[0].chords).toEqual(['C']);
}, 15000);
it('keeps the page and edited score when saving fails', async () => {
  await start('songs'); updateMocks.persisted.mockRejectedValue(new Error('disk full'));
  fireEvent.click(screen.getByRole('button', { name: '立即更新' }));
  await waitFor(() => expect(within(screen.getByRole('complementary', { name: '版本更新' })).getByRole('alert')).toHaveTextContent('disk full'));
  expect(updateMocks.reloaded).not.toHaveBeenCalled();
  expect(document.querySelector('[data-preview-clipboard-bar="first"]')).toHaveTextContent('Em7');
  expect(document.querySelector('[data-app-root]')).not.toHaveAttribute('inert');
}, 15000);
