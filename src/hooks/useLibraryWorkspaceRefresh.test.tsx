import { useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRepository } from '../lib/repository';
import { syncWorkspaceDiff } from '../lib/sync';
import { useLibraryWorkspaceRefresh, type LibraryContent } from './useLibraryWorkspaceRefresh';

const initial: LibraryContent = {
  songs: [{ id: 'song', title: 'Alpha', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
    sections: [{ title: 'Verse', bars: [{ chords: ['C'] }] }], updatedAt: 1 }],
  setlists: [{ id: 'setlist', name: 'Sunday', displayMode: 'chord-fixed-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', songId: 'song', setlistId: 'setlist', order: 0, overrideKey: 'C', sectionOrder: [] }] }],
  projects: [], lastSavedAt: 1
};
const updated = (): LibraryContent => ({ ...initial,
  setlists: [{ ...initial.setlists[0], updatedAt: 2, songs: [
    { ...initial.setlists[0].songs[0], overrideKey: 'D', personalCapoOverride: 2 },
    { ...initial.setlists[0].songs[0], id: 'added', order: 1, overrideKey: 'F#' }
  ] }], lastSavedAt: 2
});
const flush = () => act(async () => { await Promise.resolve(); });
const tick = (ms = 5 * 60 * 1000) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const setup = (load = vi.fn().mockResolvedValue(updated())) => {
  const repository = { loadLibraryContent: load } as unknown as WorkspaceRepository;
  const onUpdate = vi.fn();
  const options = { repository, scope: 'same-user:personal', libraryId: 'personal', enabled: true,
    paused: false, workspace: initial, canApply: () => true, onUpdate };
  return { ...renderHook((props) => useLibraryWorkspaceRefresh(props), { initialProps: options }), options, load, onUpdate };
};

describe('owned library cross-device updates', () => {
  it.each(['personal', 'team'])('updates another device in the same account’s %s library without writing the response back', async (libraryId) => {
    let cloud = initial;
    const load = vi.fn(async () => structuredClone(cloud));
    const repository = { loadLibraryContent: load,
      saveSong: vi.fn(), saveSetlist: vi.fn(), saveProject: vi.fn(),
      deleteSong: vi.fn(), deleteSetlist: vi.fn(), deleteProject: vi.fn()
    } as unknown as WorkspaceRepository;
    const useDevice = () => {
      const [workspace, setWorkspace] = useState(initial);
      const [baseline, setBaseline] = useState(initial);
      const [selectedEntry] = useState('entry');
      useLibraryWorkspaceRefresh({ repository, scope: `same-user:${libraryId}`, libraryId, enabled: true,
        paused: false, workspace, canApply: () => true, onUpdate: (remote) => {
          setWorkspace(remote); setBaseline(remote);
        } });
      return { workspace, baseline, selectedEntry, save: (next: LibraryContent) => {
        cloud = next; setWorkspace(next); setBaseline(next);
      } };
    };
    const desktop = renderHook(useDevice);
    const phone = renderHook(useDevice);
    await flush();
    act(() => desktop.result.current.save(updated()));
    expect(phone.result.current.workspace.setlists[0].songs[0].overrideKey).toBe('C');
    await tick();
    expect(phone.result.current.workspace.setlists[0].songs.map((song) => [song.id, song.overrideKey, song.personalCapoOverride]))
      .toEqual([['entry', 'D', 2], ['added', 'F#', undefined]]);
    expect(phone.result.current.selectedEntry).toBe('entry');
    const { workspace, baseline } = phone.result.current;
    await syncWorkspaceDiff({ repository, ...workspace, savedSongs: baseline.songs,
      savedSetlists: baseline.setlists, savedProjects: baseline.projects });
    expect(repository.saveSetlist).not.toHaveBeenCalled();
    expect(repository.saveSong).not.toHaveBeenCalled();
    expect(repository.deleteSong).not.toHaveBeenCalled();
    act(() => desktop.result.current.save({ ...cloud, setlists: [] }));
    await tick();
    expect(phone.result.current.workspace.setlists).toEqual([]);
  });

  it('pauses for unsaved edits and resumes after saving', async () => {
    const { rerender, options, load, onUpdate } = setup();
    await flush();
    onUpdate.mockClear();
    rerender({ ...options, paused: true });
    await tick(15000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    rerender(options);
    await tick();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('discards a read racing a local edit even when that edit has already been saved', async () => {
    let resolve!: (value: LibraryContent) => void;
    const load = vi.fn().mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender, options, onUpdate } = setup(load);
    rerender({ ...options, workspace: updated() });
    await act(async () => resolve(initial));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('honors pending offline writes and synchronous mutation guards before and after reading', async () => {
    let allowed = false;
    let resolve!: (value: LibraryContent) => void;
    const load = vi.fn().mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender, options, onUpdate } = setup(load);
    rerender({ ...options, canApply: () => allowed });
    await act(async () => resolve(updated()));
    expect(onUpdate).not.toHaveBeenCalled();
    await tick();
    expect(load).toHaveBeenCalledOnce();
    allowed = true;
    await tick();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('does not start overlapping reads on focus, pageshow or online', async () => {
    const { load } = setup(vi.fn().mockReturnValue(new Promise(() => {})));
    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('pageshow'));
    });
    await tick();
    expect(load).toHaveBeenCalledOnce();
  });

  it('checks on mobile foreground return and reconnect, while pausing in the background', async () => {
    const { load } = setup();
    await flush();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await tick(30000);
    expect(load).toHaveBeenCalledOnce();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    await tick(30000);
    expect(load).toHaveBeenCalledTimes(2);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('preserves current data on errors and retries with backoff', async () => {
    const { load, result, onUpdate } = setup(vi.fn().mockRejectedValueOnce(new Error('Network')).mockResolvedValue(updated()));
    await flush();
    expect(result.current).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    await tick(9999);
    expect(load).toHaveBeenCalledOnce();
    await tick(1);
    expect(result.current).toBe(false);
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('aborts stalled reads after 15 seconds and recovers', async () => {
    const load = vi.fn().mockImplementationOnce((_id, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted')));
    })).mockResolvedValue(updated());
    const { result, onUpdate } = setup(load);
    await tick(15000);
    expect(result.current).toBe(true);
    await tick(10000);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(result.current).toBe(false);
  });

  it('aborts and ignores old-account responses after switching and stops on unmount', async () => {
    let resolve!: (value: LibraryContent) => void;
    const load = vi.fn().mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValue(updated());
    const { rerender, options, onUpdate, unmount } = setup(load);
    const signal = load.mock.calls[0][1] as AbortSignal;
    rerender({ ...options, scope: 'other-user:other-library', libraryId: 'other-library' });
    expect(signal.aborted).toBe(true);
    await flush();
    await act(async () => resolve(initial));
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(updated());
    unmount();
    await tick(30000);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
