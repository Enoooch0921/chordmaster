import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JoinedSetlist } from '../types';
import type { WorkspaceRepository } from '../lib/repository';
import { reconcileJoinedWorkspace, type JoinedWorkspace } from '../lib/joinedWorkspaceRefresh';
import { useJoinedWorkspaceRefresh } from './useJoinedWorkspaceRefresh';

const setlist: JoinedSetlist = {
  id: 'sl', name: 'Sunday', isJoined: true, displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
  songs: [{ id: 'a', setlistId: 'sl', songId: 'source-a', order: 0, overrideKey: 'C', sectionOrder: [], personalCapoOverride: 2 }]
};
const initial: JoinedWorkspace = { joinedSetlists: [setlist], joinedProjects: [] };
const remote: JoinedWorkspace = { joinedSetlists: [{ ...setlist, songs: [
  { ...setlist.songs[0], id: 'b', songId: 'source-b', personalCapoOverride: undefined },
  { ...setlist.songs[0], overrideKey: 'D', personalCapoOverride: undefined, order: 1 }
] }], joinedProjects: [] };
const flush = () => act(async () => { await Promise.resolve(); });
const tick = (ms = 5000) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('joined setlist updates', () => {
  it('receives a new song and shared key while preserving the existing personal Capo', () => {
    const next = reconcileJoinedWorkspace(initial, remote);
    expect(next.joinedSetlists[0].songs.map((song) => [song.id, song.overrideKey, song.personalCapoOverride]))
      .toEqual([['b', 'C', undefined], ['a', 'D', 2]]);
    expect(initial.joinedSetlists[0].songs[0].overrideKey).toBe('C');
    expect(reconcileJoinedWorkspace(next, remote).joinedSetlists).toBe(next.joinedSetlists);
    expect(reconcileJoinedWorkspace(next, { joinedSetlists: [], joinedProjects: [] }).joinedSetlists).toEqual([]);
  });

  it('applies the same rules to nested shared projects, including role changes', () => {
    const project = { id: 'p', name: 'Project', isJoined: true as const, role: 'manager' as const,
      createdAt: 1, updatedAt: 1, setlists: [setlist] };
    const next = reconcileJoinedWorkspace({ joinedSetlists: [], joinedProjects: [project] }, {
      joinedSetlists: [], joinedProjects: [{ ...project, role: 'viewer', setlists: remote.joinedSetlists }]
    });
    expect(next.joinedProjects?.[0].role).toBe('viewer');
    expect(next.joinedProjects?.[0].setlists[0].songs[1].personalCapoOverride).toBe(2);
    expect(next.joinedProjects?.[0].setlists[0].songs[1].overrideKey).toBe('D');
  });

  const setup = (load = vi.fn().mockResolvedValue(remote)) => {
    const repository = { loadJoinedWorkspace: load } as unknown as WorkspaceRepository;
    const onUpdate = vi.fn();
    const options = { ...initial, repository, onUpdate, scope: 'account:library', enabled: true, paused: false };
    const hook = renderHook((props) => useJoinedWorkspaceRefresh(props), { initialProps: options });
    return { ...hook, options, load, onUpdate };
  };

  it('periodically refreshes joined collections without loading the personal workspace', async () => {
    const { onUpdate, load } = setup();
    await flush();
    expect(onUpdate.mock.calls[0][0].joinedSetlists[0].songs).toHaveLength(2);
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite optimistic edits while a mutation is being saved', async () => {
    let resolve!: (value: JoinedWorkspace) => void;
    const load = vi.fn().mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValue(remote);
    const { onUpdate, rerender, options } = setup(load);
    rerender({ ...options, paused: true });
    await act(async () => resolve(remote));
    expect(onUpdate).not.toHaveBeenCalled();
    await tick();
    expect(load).toHaveBeenCalledTimes(1);
    rerender(options);
    await tick();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('ignores a response when a local edit or leaving a setlist changed the snapshot', async () => {
    let resolve!: (value: JoinedWorkspace) => void;
    const load = vi.fn().mockReturnValue(new Promise((done) => { resolve = done; }));
    const { onUpdate, rerender, options } = setup(load);
    rerender({ ...options, joinedSetlists: [] });
    await act(async () => resolve(remote));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('retains the current collections on a failed read and retries', async () => {
    const { result, onUpdate, load } = setup(vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(remote));
    await flush();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(result.current).toBe(true);
    await tick(10000);
    expect(result.current).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not apply an old account response after switching scope', async () => {
    let resolve!: (value: JoinedWorkspace) => void;
    const load = vi.fn().mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValue(initial);
    const { onUpdate, rerender, options, unmount } = setup(load);
    rerender({ ...options, scope: 'new-account:library' });
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await act(async () => resolve(remote));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    unmount();
    await tick(30000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('pauses in the background and checks immediately on focus', async () => {
    const { load } = setup();
    await flush();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await tick(30000);
    expect(load).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => window.dispatchEvent(new Event('focus')));
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
