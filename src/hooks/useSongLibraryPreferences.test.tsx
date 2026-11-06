import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { songLibraryPreferencesKey, useSongLibraryPreferences } from './useSongLibraryPreferences';
import { applyLibraryPreferenceChanges, type LibraryPreferenceSnapshot, type LibraryPreferenceSyncResult } from '../lib/songLibraryPreferenceSync';
const remote = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock('../lib/songLibraryPreferenceSync', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/songLibraryPreferenceSync')>(), canSyncLibraryPreferences: true, syncLibraryPreferences: remote.sync
}));
beforeEach(() => { localStorage.clear(); remote.sync.mockReset().mockImplementation(() => new Promise(() => {})); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(350); });

it('persists favorites and most-recent order without leaking across accounts/libraries', () => {
  const { result, rerender, unmount } = renderHook(({ user, library }) => useSongLibraryPreferences(user, library), { initialProps: { user: 'a', library: 'one' } });
  act(() => { result.current.toggleFavorite('song'); result.current.recordUsed('first'); result.current.recordUsed('second'); result.current.recordUsed('first'); });
  expect([...result.current.recentOrder.keys()]).toEqual(['first', 'second']);
  rerender({ user: 'a', library: 'two' }); expect(result.current.favoriteIds.size).toBe(0);
  rerender({ user: 'b', library: 'one' }); expect(result.current.recentOrder.size).toBe(0);
  rerender({ user: 'a', library: 'one' }); expect(result.current.favoriteIds.has('song')).toBe(true);
  unmount();
  const restored = renderHook(() => useSongLibraryPreferences('a', 'one'));
  expect([...restored.result.current.recentOrder.keys()]).toEqual(['first', 'second']);
  act(() => restored.result.current.toggleFavorite('song')); expect(restored.result.current.favoriteIds.size).toBe(0);
});

it('validates stored values and receives only the current scope’s storage changes', () => {
  const key = songLibraryPreferencesKey('a', 'one');
  localStorage.setItem(key, JSON.stringify({ favorites: ['song', '', 'song', null], recent: [null, { id: 'first', at: 2 }, { id: 'second', at: 3 }, { id: 'first', at: 1 }, { id: 'invalid', at: '4' }] }));
  const { result } = renderHook(() => useSongLibraryPreferences('a', 'one'));
  expect([...result.current.favoriteIds]).toEqual(['song']); expect([...result.current.recentOrder.keys()]).toEqual(['second', 'first']);
  localStorage.setItem(key, '{}');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'other' })));
  expect(result.current.favoriteIds.size).toBe(1);
  act(() => window.dispatchEvent(new StorageEvent('storage', { key })));
  expect(result.current.favoriteIds.size).toBe(0);
});

it('keeps changes in memory with unavailable storage and bounds recent history', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const { result } = renderHook(() => useSongLibraryPreferences());
  act(() => { result.current.toggleFavorite('song'); for (let i = 0; i < 110; i++) result.current.recordUsed(`song-${i}`); });
  expect(result.current.favoriteIds.has('song')).toBe(true); expect(result.current.recentOrder.size).toBe(100);
  expect([...result.current.recentOrder.keys()][0]).toBe('song-109'); expect(result.current.recentOrder.has('song-0')).toBe(false);
});

it('merges two devices through the account and library without replacing the other favorite', async () => {
  vi.useFakeTimers();
  let server: LibraryPreferenceSnapshot = { favorites: ['remote-song'], recent: [] };
  remote.sync.mockImplementation(async (_user, _library, changes) => { server = applyLibraryPreferenceChanges(server, changes); return { ...structuredClone(server), applied: changes.map((item: { id: string }) => item.id) }; });
  const phone = renderHook(() => useSongLibraryPreferences('a', 'one'));
  const tablet = renderHook(() => useSongLibraryPreferences('a', 'one'));
  await tick(); expect(phone.result.current.favoriteIds.has('remote-song')).toBe(true);
  act(() => phone.result.current.toggleFavorite('phone-song')); await tick();
  act(() => tablet.result.current.toggleFavorite('tablet-song')); await tick();
  act(() => phone.result.current.refresh()); await tick();
  expect([...phone.result.current.favoriteIds]).toEqual(['remote-song', 'phone-song', 'tablet-song']);
  expect(remote.sync.mock.calls.every(([user, library]) => user === 'a' && library === 'one')).toBe(true);
});

it('keeps clicks made during load and during an in-flight save, then acknowledges only the sent fields', async () => {
  vi.useFakeTimers();
  let finish: (value: LibraryPreferenceSyncResult) => void = () => {};
  remote.sync.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useSongLibraryPreferences('a', 'one'));
  act(() => result.current.toggleFavorite('song'));
  await act(async () => finish({ favorites: [], recent: [], applied: [] }));
  expect(result.current.favoriteIds.has('song')).toBe(true);
  await tick(); // Sends favorite=true.
  act(() => { result.current.toggleFavorite('song'); result.current.recordUsed('song'); });
  await act(async () => finish({ favorites: ['song'], recent: [], applied: ['song'] }));
  expect(result.current.favoriteIds.has('song')).toBe(false);
  expect(result.current.recentOrder.has('song')).toBe(true);
  await tick();
  expect(remote.sync.mock.calls.at(-1)?.[2][0]).toMatchObject({ id: 'song', favorite: false, usedAt: expect.any(Number) });
  await act(async () => finish({ favorites: [], recent: [{ id: 'song', at: Date.now() }], applied: ['song'] }));
  expect(JSON.parse(localStorage.getItem(songLibraryPreferencesKey('a', 'one'))!).pending).toEqual([]);
  expect(result.current.syncStatus).toBe('saved');
});

it('retains failed changes across a reload and sends them when connection returns', async () => {
  vi.useFakeTimers(); remote.sync.mockRejectedValue(new Error('offline'));
  const first = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  act(() => { first.result.current.toggleFavorite('song'); first.result.current.recordUsed('song'); }); await tick();
  expect(first.result.current.syncStatus).toBe('error'); first.unmount();
  remote.sync.mockImplementation(async (_u, _l, changes) => ({ ...applyLibraryPreferenceChanges({ favorites: [], recent: [] }, changes), applied: changes.map((item: { id: string }) => item.id) }));
  const restored = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  expect(restored.result.current.favoriteIds.has('song')).toBe(true); expect(restored.result.current.syncStatus).toBe('saved');
  expect(JSON.parse(localStorage.getItem(songLibraryPreferencesKey('a', 'one'))!).pending).toEqual([]);
});

it('ignores stale responses after account/library changes and does not retry under the new identity', async () => {
  vi.useFakeTimers(); let finish: (value: LibraryPreferenceSnapshot) => void = () => {};
  remote.sync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ favorites: ['new-user'], recent: [], applied: [] });
  const { result, rerender } = renderHook(({ user }) => useSongLibraryPreferences(user, 'one'), { initialProps: { user: 'a' } });
  act(() => result.current.toggleFavorite('old-user'));
  rerender({ user: 'b' }); await tick();
  await act(async () => finish({ favorites: ['old-user'], recent: [] })); await tick();
  expect([...result.current.favoriteIds]).toEqual(['new-user']);
  expect(remote.sync.mock.calls.filter(([user]) => user === 'b').every(([, , changes]) => changes.length === 0)).toBe(true);
  expect(JSON.parse(localStorage.getItem(songLibraryPreferencesKey('a', 'one'))!).pending[0].id).toBe('old-user');
});

it('retains an unsaved song until the server accepts it, without spinning on unavailable IDs', async () => {
  vi.useFakeTimers(); remote.sync.mockResolvedValue({ favorites: [], recent: [], applied: [] });
  const { result } = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  act(() => { result.current.toggleFavorite('new-song'); result.current.recordUsed('new-song'); }); await tick();
  const calls = remote.sync.mock.calls.length;
  expect(result.current.favoriteIds.has('new-song')).toBe(true); expect(result.current.syncStatus).toBe('error');
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(remote.sync.mock.calls.length).toBe(calls);
  remote.sync.mockImplementation(async (_u, _l, changes) => ({ ...applyLibraryPreferenceChanges({ favorites: [], recent: [] }, changes), applied: ['new-song'] }));
  act(() => result.current.retryPending()); await tick();
  expect(result.current.favoriteIds.has('new-song')).toBe(true); expect(result.current.recentOrder.has('new-song')).toBe(true);
  expect(result.current.syncStatus).toBe('saved'); expect(Object.keys(localStorage).some(key => key.includes(':outbox:'))).toBe(false);
});

it('preserves separate tab operations before storage events and ignores cache events for network scheduling', async () => {
  vi.useFakeTimers(); remote.sync.mockRejectedValue(new Error('offline'));
  const a = renderHook(() => useSongLibraryPreferences('a', 'one')), b = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  act(() => { a.result.current.toggleFavorite('x'); b.result.current.toggleFavorite('y'); });
  expect(Object.keys(localStorage).filter(key => key.includes(':outbox:'))).toHaveLength(2);
  const key = songLibraryPreferencesKey('a', 'one');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) })));
  expect([...a.result.current.favoriteIds]).toEqual(['x', 'y']); expect([...b.result.current.favoriteIds]).toEqual(['x', 'y']);
  await tick(); const calls = remote.sync.mock.calls.length;
  act(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) }))); await tick();
  expect(remote.sync.mock.calls.length).toBe(calls);
});

it('uses observed server clock when a slow device cancels a remote favorite', async () => {
  vi.useFakeTimers(); const serverClock = Date.now() + 5 * 60_000;
  remote.sync.mockResolvedValue({ favorites: ['song'], recent: [], clock: serverClock, applied: [] });
  const { result } = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  act(() => result.current.toggleFavorite('song')); await tick();
  const patch = remote.sync.mock.calls.at(-1)![2][0]; expect(patch.favorite).toBe(false); expect(patch.favoriteAt).toBeGreaterThan(serverClock);
});

it('removes pending work only when the loaded library confirms a song is gone', async () => {
  vi.useFakeTimers(); remote.sync.mockResolvedValue({ favorites: [], recent: [], applied: [] });
  const { result } = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  act(() => result.current.toggleFavorite('gone')); await tick();
  act(() => result.current.forgetSongs(new Set(['gone']))); await tick();
  expect(result.current.favoriteIds.size).toBe(0); expect(result.current.syncStatus).toBe('saved');
  expect(Object.keys(localStorage).some(key => key.includes(':outbox:'))).toBe(false);
});

it('does not let an old tab response erase another tab’s acknowledged changes even before its storage event', async () => {
  vi.useFakeTimers(); let finishOld: (value: LibraryPreferenceSyncResult) => void = () => {};
  remote.sync.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockImplementation(async (_u, _l, changes) => changes.length
      ? { favorites: ['x'], favoriteStates: [['x', true, 200]], recent: [{ id: 'x', at: 200 }], clock: 200, applied: ['x'] }
      : { favorites: [], favoriteStates: [], recent: [], clock: 100, applied: [] });
  const a = renderHook(() => useSongLibraryPreferences('a', 'one')), b = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  act(() => b.result.current.toggleFavorite('x')); await tick();
  expect(b.result.current.syncStatus).toBe('saved');
  await act(async () => finishOld({ favorites: [], favoriteStates: [], recent: [], clock: 100, applied: [] }));
  expect(a.result.current.favoriteIds.has('x')).toBe(true); expect(a.result.current.recentOrder.has('x')).toBe(true);
  const stored = JSON.parse(localStorage.getItem(songLibraryPreferencesKey('a', 'one'))!);
  expect(stored.clock).toBe(200); expect(stored.favorites).toEqual(['x']);
});

it('does not erase another tab’s unsaved song when only a different known song is removed', async () => {
  vi.useFakeTimers(); remote.sync.mockResolvedValue({ favorites: [], recent: [], applied: [] });
  const a = renderHook(() => useSongLibraryPreferences('a', 'one')), b = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  act(() => a.result.current.toggleFavorite('unsaved-in-a')); await tick();
  act(() => b.result.current.forgetSongs(new Set(['deleted-in-b']))); await tick();
  expect(Object.keys(localStorage).filter(key => key.includes(':outbox:'))).toHaveLength(1);
  expect(a.result.current.favoriteIds.has('unsaved-in-a')).toBe(true);
});

it('replaces fast-device optimistic recent times with confirmed server times, including after reload', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  remote.sync.mockImplementation(async (_u, _l, changes) => changes.length
    ? { favorites: [], recent: [{ id: 'a', at: 1_060_000 }], clock: 1_060_000, applied: ['a'] }
    : { favorites: [], recent: [], clock: 1_000_000, applied: [] });
  const first = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  vi.setSystemTime(87_400_000); act(() => first.result.current.recordUsed('a')); await tick();
  expect(JSON.parse(localStorage.getItem(songLibraryPreferencesKey('a', 'one'))!).recent).toEqual([{ id: 'a', at: 1_060_000 }]);
  first.unmount();
  remote.sync.mockResolvedValue({ favorites: [], recent: [{ id: 'b', at: 1_120_000 }, { id: 'a', at: 1_060_000 }], clock: 1_120_000, applied: [] });
  const restored = renderHook(() => useSongLibraryPreferences('a', 'one')); await tick();
  expect([...restored.result.current.recentOrder.keys()]).toEqual(['b', 'a']);
});
