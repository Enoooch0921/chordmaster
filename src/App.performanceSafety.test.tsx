import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { Setlist, StoredSong, WorkspaceSnapshot } from './types';
const sync = vi.hoisted(() => ({ owned: vi.fn(() => false), joined: vi.fn(() => false) }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: sync.owned }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: sync.joined }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); });
afterEach(() => localStorage.clear());
const stageSong = (id: string): StoredSong => ({ id, updatedAt: 1, title: `Stage ${id}`, originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: `${id}-verse`, title: 'Verse', bars: Array.from({ length: 96 }, (_, i) => ({ id: `${id}-${i}`, chords: ['C'] })) }] });
const start = async (shared = false) => {
  const songs = [stageSong('one'), stageSong('two')];
  const setlist: Setlist = { id: 'stage-list', name: '離線演出', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: songs.map((song, i) => ({ id: `entry-${i}`, songId: song.id, setlistId: 'stage-list', order: i, sectionOrder: [song.sections[0].id!], songData: song })) };
  fixture = { songs, setlists: shared ? [] : [setlist], joinedSetlists: shared ? [{ ...setlist, isJoined: true }] : [], projects: [], joinedProjects: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.workspace-mode.v1', 'setlists'); localStorage.setItem('chordmaster.selected-setlist-id.v1', setlist.id); localStorage.setItem('chordmaster.selected-setlist-song-id.v1', 'entry-0');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  fireEvent.click((await screen.findAllByRole('button', { name: /^演出模式$/ }))[0]);
  await waitFor(() => expect(document.querySelector('[data-performance-overlay]')).not.toBeNull());
  await waitFor(() => expect(Number(document.querySelector('[data-performance-pages]')!.getAttribute('data-performance-pages'))).toBeGreaterThan(2));
};
const page = () => Number(document.querySelector('[data-performance-page]')!.getAttribute('data-performance-page'));
const pedal = (type: 'keydown' | 'keyup', key = 'PageDown', repeat = false) => fireEvent(window, new KeyboardEvent(type, { key, code: key, repeat, bubbles: true, cancelable: true }));

describe('on-stage offline and page-turner stability', () => {
  it('pauses owned and shared background reads and keeps keyboard/manual turns through disconnect and reconnect', async () => {
    await start();
    expect((sync.owned.mock.calls.at(-1) as unknown as [{ paused: boolean }])[0].paused).toBe(true);
    expect((sync.joined.mock.calls.at(-1) as unknown as [{ paused: boolean }])[0].paused).toBe(true);
    act(() => { pedal('keydown'); pedal('keyup'); }); expect(page()).toBe(2);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    act(() => { pedal('keydown'); pedal('keydown', 'PageDown', true); pedal('keyup'); }); expect(page()).toBe(3);
    const at = page();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(page()).toBe(at);
    act(() => { pedal('keyup', 'PageUp'); }); expect(page()).toBe(at - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(page()).toBe(at);
  }, 15000);
  it('does not count a synthesized click after a swipe as a second page turn', async () => {
    await start(); const overlay = document.querySelector('[data-performance-overlay]')!;
    fireEvent.touchStart(overlay, { touches: [{ clientX: 700, clientY: 300 }] });
    fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 400, clientY: 300 }] });
    expect(page()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(page()).toBe(2);
    fireEvent.touchStart(overlay, { touches: [{ clientX: 700, clientY: 300 }] });
    fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 700, clientY: 300 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(page()).toBe(3);
  }, 15000);
});
