import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedResourcePayload } from '../types';
import { ShareLinkResolutionError } from '../lib/sharing';
import { SHARED_RESOURCE_REFRESH_MS, useSharedResource } from './useSharedResource';

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('../lib/sharing', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/sharing')>(),
  resolveShareLink: mocks.resolve
}));

const payload = (key: 'C' | 'D' = 'C', titles = ['Alpha']): SharedResourcePayload => ({
  resourceType: 'setlist',
  setlist: {
    id: 'setlist-1', name: 'Sunday', displayMode: 'chord-movable-key',
    songs: titles.map((title) => ({ id: title, title, overrideKey: key, song: {
      title, originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
      sections: [{ title: 'Verse', bars: [{ chords: ['C'] }] }]
    } }))
  }
});

const flush = () => act(async () => { await Promise.resolve(); });
const tick = (ms = SHARED_RESOURCE_REFRESH_MS) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  mocks.resolve.mockReset().mockResolvedValue(payload());
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('public share background updates', () => {
  it('updates keys, additions, removals and ordering without returning to a loading screen', async () => {
    const { result } = renderHook(() => useSharedResource('token'));
    await flush();
    expect(result.current.payload?.setlist?.songs[0].overrideKey).toBe('C');
    mocks.resolve.mockResolvedValue(payload('D', ['Beta', 'Alpha']));
    await tick();
    expect(result.current.payload?.setlist?.songs.map((item) => [item.title, item.overrideKey]))
      .toEqual([['Beta', 'D'], ['Alpha', 'D']]);
    expect(result.current.isLoading).toBe(false);
    mocks.resolve.mockResolvedValue(payload('D', ['Beta']));
    await tick();
    expect(result.current.payload?.setlist?.songs.map((item) => item.title)).toEqual(['Beta']);
  });

  it('retains normalized objects and legacy IDs when the response is unchanged', async () => {
    const { result } = renderHook(() => useSharedResource('token'));
    await flush();
    const initial = result.current;
    mocks.resolve.mockResolvedValue(JSON.parse(JSON.stringify(payload())));
    await tick();
    expect(result.current).toBe(initial);
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });

  it('does not overlap requests even when focus and online events arrive during a slow response', async () => {
    let resolve!: (value: SharedResourcePayload) => void;
    mocks.resolve.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useSharedResource('token'));
    await tick(20000);
    act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    await act(async () => resolve(payload()));
    expect(result.current.isLoading).toBe(false);
  });

  it('pauses while hidden and reloads immediately on returning to the page', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    renderHook(() => useSharedResource('token'));
    await flush();
    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await tick(30000);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });

  it('keeps the last version offline and refreshes as soon as the connection returns', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get');
    const { result } = renderHook(() => useSharedResource('token'));
    await flush();
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    await tick(30000);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    expect(result.current.refreshFailed).toBe(true);
    expect(result.current.payload).not.toBeNull();
    mocks.resolve.mockResolvedValue(payload('D'));
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    await flush();
    expect(result.current.payload?.setlist?.songs[0].overrideKey).toBe('D');
    expect(result.current.refreshFailed).toBe(false);
  });

  it('backs off after temporary failures without removing the chart, then recovers', async () => {
    const { result } = renderHook(() => useSharedResource('token'));
    await flush();
    const original = result.current.payload;
    mocks.resolve.mockRejectedValueOnce(new Error('Network unavailable'));
    await tick();
    expect(result.current.payload).toBe(original);
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.refreshFailed).toBe(true);
    await tick();
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    await tick();
    expect(mocks.resolve).toHaveBeenCalledTimes(3);
    expect(result.current.refreshFailed).toBe(false);
  });

  it.each([403, 404, 410])('clears the chart and stops polling when access ends (%s)', async (status) => {
    const { result } = renderHook(() => useSharedResource('token'));
    await flush();
    mocks.resolve.mockRejectedValue(new ShareLinkResolutionError('Share unavailable', status));
    await tick();
    expect(result.current.payload).toBeNull();
    expect(result.current.errorMessage).toBe('Share unavailable');
    await tick(60000);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });

  it('cancels an old token request and ignores its late response', async () => {
    let resolveOld!: (value: SharedResourcePayload) => void;
    mocks.resolve.mockReturnValueOnce(new Promise((done) => { resolveOld = done; }));
    const { result, rerender, unmount } = renderHook(({ token }) => useSharedResource(token), { initialProps: { token: 'old' } });
    const oldSignal = mocks.resolve.mock.calls[0][1] as AbortSignal;
    rerender({ token: 'new' });
    expect(oldSignal.aborted).toBe(true);
    await flush();
    const currentPayload = result.current.payload;
    await act(async () => resolveOld(payload('D', ['Old data'])));
    expect(result.current.payload).toBe(currentPayload);
    const newSignal = mocks.resolve.mock.calls[1][1] as AbortSignal;
    unmount();
    expect(newSignal.aborted).toBe(true);
    await tick(30000);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });

  it('recovers an initial failure on focus without a page reload', async () => {
    mocks.resolve.mockRejectedValueOnce(new Error('Temporary failure'));
    const { result } = renderHook(() => useSharedResource('token'));
    await flush();
    expect(result.current.errorMessage).toBe('Temporary failure');
    act(() => window.dispatchEvent(new Event('focus')));
    await flush();
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.payload?.setlist?.name).toBe('Sunday');
  });
});
