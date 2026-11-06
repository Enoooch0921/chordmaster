import { afterEach, expect, it, vi } from 'vitest';
import { mergeLibraryPreferenceSnapshots, syncLibraryPreferences } from './songLibraryPreferenceSync';
const client = vi.hoisted(() => ({ rpc: vi.fn(), request: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: client.rpc } }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it('binds the server request to its original account and library and preserves explicit acknowledgments', async () => {
  const data = { favorites: ['song'], recent: [], clock: 100, applied: ['song'] };
  client.request.mockResolvedValue({ data, error: null }); client.rpc.mockReturnValue({ abortSignal: client.request });
  const changes = [{ id: 'song', favorite: true, favoriteAt: 100 }];
  expect(await syncLibraryPreferences('user', 'library', changes)).toEqual(data);
  expect(client.rpc).toHaveBeenCalledWith('sync_song_library_preferences', { p_user_id: 'user', p_library_id: 'library', p_changes: changes });
});
it('propagates server rejection so the outbox is not acknowledged', async () => {
  client.request.mockResolvedValue({ data: null, error: new Error('account changed') }); client.rpc.mockReturnValue({ abortSignal: client.request });
  await expect(syncLibraryPreferences('user', 'library', [])).rejects.toThrow('account changed');
});
it('bounds an unresponsive connection so a future retry can run', async () => {
  vi.useFakeTimers(); client.request.mockImplementation((signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
  client.rpc.mockReturnValue({ abortSignal: client.request });
  const request = expect(syncLibraryPreferences('user', 'library', [])).rejects.toThrow('aborted');
  await vi.advanceTimersByTimeAsync(15_000); await request;
  expect(vi.getTimerCount()).toBe(0);
});

it('merges equal global clocks by each song version, preserving cancellations and recent order', () => {
  const merged = mergeLibraryPreferenceSnapshots({
    favorites: ['a'], favoriteStates: [['a', true, 10], ['b', false, 20]], recent: [{ id: 'b', at: 30 }], clock: 100
  }, {
    favorites: ['b', 'c'], favoriteStates: [['b', true, 5], ['c', true, 15]], recent: [{ id: 'b', at: 10 }, { id: 'c', at: 25 }], clock: 100
  });
  expect(merged.favorites).toEqual(['a', 'c']); expect(merged.recent).toEqual([{ id: 'b', at: 30 }, { id: 'c', at: 25 }]);
  expect(merged.favoriteStates).toContainEqual(['b', false, 20]);
});
