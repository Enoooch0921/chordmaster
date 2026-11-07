import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { writeNoteRecords } from './lib/personalNotesDatabase';
import { noteId } from './lib/personalNotes';
import type { WorkspaceSnapshot } from './types';
const state = vi.hoisted(() => ({ fixture: null as WorkspaceSnapshot | null, saveSong: vi.fn(), saveSetlist: vi.fn() }));
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: { id: 'note-owner', email: 'notes@example.invalid', name: 'Notes' },
  session: { access_token: 'test' }, status: 'signed-in', isConfigured: true, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/supabase', () => ({ supabase: null, hasSupabaseConfig: false }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => structuredClone(state.fixture!) }));
vi.mock('./lib/repository', () => ({ createCloudRepository: () => ({ listLibraries: async () => [{ id: 'personal', name: '個人曲庫', kind: 'personal', role: 'owner', ownerUserId: 'note-owner', createdAt: '', updatedAt: '' }],
  setActiveLibrary: vi.fn(), loadLibraryWorkspace: async () => structuredClone(state.fixture!), saveSong: state.saveSong, saveSetlist: state.saveSetlist, saveProject: vi.fn(),
  getNotifications: async () => [], getShareContacts: async () => [], getPendingTeamInvites: async () => [], getSetlistShareStatus: async () => ({ activeToken: null, participants: [] }),
  getSetlistEditorAssignments: async () => ({ members: [], assignments: [] }), subscribeToLibraryChanges: () => () => {} }) }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: () => ({ editors: [], failed: false }) }));
vi.mock('./hooks/useTeamWorkspaceDraft', () => ({ useTeamWorkspaceDraft: () => ({ ready: true, pending: null, dismiss: vi.fn(), restored: vi.fn() }) }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  const rect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.hasAttribute('data-print-page') ? { x: 0, y: 0, left: 0, top: 0, right: 794, bottom: 1123, width: 794, height: 1123, toJSON() {} } : rect.call(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return this.hasAttribute('data-print-page') ? 794 : 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.hasAttribute('data-print-page') ? 1123 : 0; });
});
it('uses the source song identity for personal ink in a setlist and performance without saving a shared score', async () => {
  localStorage.clear(); vi.stubGlobal('indexedDB', new IDBFactory());
  const song = { id: 'notes-song', title: 'Private rehearsal notes', originalKey: 'C' as const, currentKey: 'C' as const, timeSignature: '4/4', updatedAt: 1,
    sections: [{ id: 'verse', title: 'Verse', bars: Array.from({ length: 44 }, (_, i) => ({ id: 'bar' + i, chords: ['C'] })) }] };
  state.fixture = { songs: [song], setlists: [{ id: 'set', name: '聚會', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'service-entry', setlistId: 'set', songId: song.id, order: 0, sectionOrder: ['verse'], songData: song }] }],
    projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  const nextSong = { ...song, id: 'notes-encore', title: 'Encore' };
  state.fixture.songs.push(nextSong);
  state.fixture.setlists[0].songs.push({ ...state.fixture.setlists[0].songs[0], id: 'encore-entry',
    songId: nextSong.id, songData: nextSong, order: 1 });
  const opId = noteId();
  await writeNoteRecords('note-owner', song.id, [{ id: opId, strokes: [{ id: noteId(), anchor: { kind: 'page', page: 0 },
    color: '#2563eb', width: 2.5, tool: 'pen', points: [[.1, .2], [.2, .3]] }], removed: [] }], false);
  localStorage.setItem('chordmaster.workspace-mode.v1', 'setlists'); localStorage.setItem('chordmaster.selected-setlist-id.v1', 'set');
  localStorage.setItem('chordmaster.active-library.note-owner.v1', 'personal');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findByRole('button', { name: '手寫筆記' }, { timeout: 6000 });
  await waitFor(() => expect(document.querySelectorAll('[data-personal-note-stroke]')).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: '手寫筆記' }));
  expect(screen.getByRole('toolbar', { name: '個人手寫筆記' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '手寫筆記' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: '打開編輯器' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '完成筆記' }));
  fireEvent.click((await screen.findAllByRole('button', { name: /^演出模式$/ }, { timeout: 6000 }))[0]);
  await waitFor(() => expect(document.querySelector('[data-performance-overlay] [data-personal-note-stroke]')).not.toBeNull());
  expect(screen.getAllByRole('button', { name: '個人筆記' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '個人筆記' }));
  expect(document.querySelector('[data-performance-overlay]')).toHaveAttribute('data-handwriting', 'true');
  expect(screen.getByRole('button', { name: 'Next page' })).not.toHaveClass('w-1/2');
  expect(screen.getByRole('button', { name: 'Previous page' })).not.toHaveClass('w-1/2');
  fireEvent.click(screen.getByRole('button', { name: '隱藏筆記' }));
  expect(document.querySelector<SVGElement>('[data-performance-overlay] [data-personal-notes-layer]')?.style.visibility).toBe('hidden');
  const neighbor = await waitFor(() => {
    const node = document.querySelector('[data-performance-entry="encore-entry"][aria-hidden="true"]');
    expect(node).toBeInTheDocument();
    return node!;
  });
  const preparedLayer = await waitFor(() => {
    const layer = neighbor.querySelector('[data-personal-notes-layer]');
    expect(layer).toBeInTheDocument();
    return layer!;
  });
  const previousEntry = document.querySelector('[data-performance-entry="service-entry"]')!;
  const previousLayer = previousEntry.querySelector('[data-personal-notes-layer]');
  const previousInk = previousEntry.querySelector('[data-personal-note-stroke]');
  expect(neighbor.querySelector('[data-personal-notes-drawing]')).toBeNull();
  const spread = document.querySelector<HTMLElement>('[data-performance-spread]')!;
  for (let i = 0; i < Number(spread.dataset.performancePages); i += Number(spread.dataset.performanceSpread)) {
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  }
  expect(neighbor).not.toHaveAttribute('aria-hidden', 'true');
  expect(neighbor.querySelector('[data-personal-notes-layer]')).toBe(preparedLayer);
  expect(neighbor.querySelector('[data-personal-note-stroke]')).toBeNull();
  expect(screen.getAllByRole('toolbar', { name: '個人手寫筆記' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  await waitFor(() => expect(document.querySelector('[data-performance-entry="service-entry"]:not([aria-hidden="true"]) [data-personal-note-stroke]')).toBeInTheDocument());
  expect(previousEntry.querySelector('[data-personal-notes-layer]')).toBe(previousLayer);
  expect(previousEntry.querySelector('[data-personal-note-stroke]')).toBe(previousInk);
  expect(state.saveSong).not.toHaveBeenCalled(); expect(state.saveSetlist).not.toHaveBeenCalled();
}, 15000);
