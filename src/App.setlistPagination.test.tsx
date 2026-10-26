import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { StoredSong, WorkspaceSnapshot } from './types';
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => localStorage.clear());
const makeSong = (id: string, count: number): StoredSong => ({ id, updatedAt: 1, title: `Pagination ${id}`, originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [{ id: `${id}-verse`, title: 'Verse', bars: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i}`, chords: ['C'] })) }] });
it('uses the setlist arrangement for every preview before and after selection changes', async () => {
  localStorage.clear();
  const a = makeSong('a', 8), b = makeSong('b', 8);
  fixture = { songs: [a, b], setlists: [{ id: 'set', name: 'Pagination set', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1, songs: [
    { id: 'entry-a', setlistId: 'set', songId: 'a', order: 0, sectionOrder: [], songData: makeSong('a', 100) },
    { id: 'entry-b', setlistId: 'set', songId: 'b', order: 1, sectionOrder: [], songData: makeSong('b', 60) }
  ] }], projects: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.workspace-mode.v1', 'setlists');
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'set');
  localStorage.setItem('chordmaster.selected-setlist-song-id.v1', 'entry-a');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  const wrapper = (id: string) => document.querySelector(`[data-setlist-preview-song-id="${id}"]`)!;
  const counts = () => ['entry-a', 'entry-b'].map(id => wrapper(id)?.querySelectorAll('[data-print-page]').length);
  await waitFor(() => expect(counts()).toEqual([3, 2]));
  fireEvent.click(wrapper('entry-b').querySelector('[data-preview-slot-index="0"]')!);
  await screen.findByRole('dialog', { name: '預覽快捷編輯' });
  expect(counts()).toEqual([3, 2]);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(wrapper('entry-a').querySelector('[data-preview-slot-index="0"]')!);
  await screen.findByRole('dialog', { name: '預覽快捷編輯' });
  expect(counts()).toEqual([3, 2]);
  expect(fixture.songs).toEqual([a, b]);
}, 20000);
