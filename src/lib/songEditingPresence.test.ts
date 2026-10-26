import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: mocks }));
import { subscribeToSongEditors } from './songEditingPresence';

let sync: () => void;
let status: (value: string) => void;
let state: Record<string, unknown[]>;
const channel = { on: vi.fn(), subscribe: vi.fn(), presenceState: vi.fn(), track: vi.fn(), untrack: vi.fn() };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); state = {};
  channel.on.mockImplementation((_type, _filter, callback) => { sync = callback; return channel; });
  channel.subscribe.mockImplementation((callback) => { status = callback; return channel; });
  channel.presenceState.mockImplementation(() => state);
  channel.track.mockResolvedValue('ok'); channel.untrack.mockResolvedValue('ok'); mocks.channel.mockReturnValue(channel);
});
afterEach(() => { vi.useRealTimers(); });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const editor = (overrides = {}) => ({ sessionId: 'other-session', userId: 'other-user', name: '小明', songId: 'song', updatedAt: Date.now(), ...overrides });

describe('private song editing presence', () => {
  it('joins privately, publishes only editing state, and removes the session on exit', async () => {
    const update = vi.fn(), failed = vi.fn();
    const connection = subscribeToSongEditors('team', { id: 'me', name: '我' }, update, failed);
    connection.setSong('song'); await flush(); expect(channel.track).not.toHaveBeenCalled();
    status('SUBSCRIBED'); await flush();
    expect(mocks.channel).toHaveBeenCalledWith('song-editors:team', { config: { private: true, presence: { key: expect.any(String) } } });
    expect(channel.track).toHaveBeenCalledWith(expect.objectContaining({ userId: 'me', name: '我', songId: 'song' }));
    connection.setSong(null); await flush(); expect(channel.untrack).toHaveBeenCalledOnce();
    connection.dispose(); connection.dispose();
    await vi.advanceTimersByTimeAsync(80000);
    expect(mocks.removeChannel).toHaveBeenCalledExactlyOnceWith(channel);
    expect(channel.track).toHaveBeenCalledOnce();
  });

  it('shows other tabs of the same account, deduplicates people, expires ghosts and avoids heartbeat rerenders', async () => {
    const update = vi.fn();
    const connection = subscribeToSongEditors('team', { id: 'me', name: 'Me' }, update, vi.fn());
    status('SUBSCRIBED'); connection.setSong('mine'); await flush();
    const own = channel.track.mock.calls[0][0];
    state = { own: [own], other: [editor({ userId: 'me' }), editor({ sessionId: 'duplicate', userId: 'me' })],
      stale: [editor({ userId: 'gone', updatedAt: Date.now() - 80000 })] };
    sync(); expect(update.mock.calls.at(-1)![0]).toHaveLength(1);
    expect(update.mock.calls.at(-1)![0][0].userId).toBe('me');
    update.mockClear(); state.other = state.other.map((v: any) => ({ ...v, updatedAt: Date.now() + 20000 }));
    sync(); expect(update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100000);
    expect(update.mock.calls.at(-1)![0]).toEqual([]);
    connection.dispose();
  });

  it('clears remote status on disconnect and republishes the current song on reconnect', async () => {
    const update = vi.fn(), failed = vi.fn();
    const connection = subscribeToSongEditors('team', { id: 'me', name: 'Me' }, update, failed);
    status('SUBSCRIBED'); state = { other: [editor()] }; sync();
    status('CHANNEL_ERROR'); expect(update).toHaveBeenLastCalledWith([]); expect(failed).toHaveBeenLastCalledWith(true);
    connection.setSong('next'); status('SUBSCRIBED'); await flush();
    expect(channel.track).toHaveBeenLastCalledWith(expect.objectContaining({ songId: 'next' }));
    expect(failed).toHaveBeenLastCalledWith(false); connection.dispose();
  });
});
