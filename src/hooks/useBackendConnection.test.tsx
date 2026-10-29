import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useBackendConnection } from './useBackendConnection';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
let online = true;
let visible = 'visible';
beforeEach(() => {
  vi.useFakeTimers(); online = true; visible = 'visible';
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible as DocumentVisibilityState);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const flush = () => act(async () => { await Promise.resolve(); });
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

it('checks at startup and recovers periodically without song selection or saves', async () => {
  const initial = deferred();
  const probe = vi.fn().mockReturnValueOnce(initial.promise).mockRejectedValueOnce(new Error('unreachable')).mockResolvedValue(undefined);
  const { result } = renderHook(() => useBackendConnection(probe, 'account'));
  expect(result.current).toBe('checking');
  await act(async () => initial.resolve());
  expect(result.current).toBe('online');
  await tick(30_000); expect(result.current).toBe('offline');
  await tick(30_000); expect(result.current).toBe('online');
  expect(probe).toHaveBeenCalledTimes(3);
});
it('does not trust navigator.onLine until the server answers and bounds hanging requests', async () => {
  const pending = deferred(); const probe = vi.fn().mockReturnValue(pending.promise);
  const { result } = renderHook(() => useBackendConnection(probe, 'account'));
  await tick(8_000); expect(result.current).toBe('offline');
  expect(probe.mock.calls[0][0].aborted).toBe(true);
  await act(async () => pending.resolve()); expect(result.current).toBe('offline');
});
it('rejects stale successes after disconnect and probes immediately on reconnection', async () => {
  const pending = deferred();
  const probe = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
  const { result } = renderHook(() => useBackendConnection(probe, 'account'));
  online = false; act(() => window.dispatchEvent(new Event('offline')));
  expect(result.current).toBe('offline');
  await act(async () => pending.resolve()); expect(result.current).toBe('offline');
  online = true; act(() => window.dispatchEvent(new Event('online'))); await flush();
  expect(result.current).toBe('online'); expect(probe).toHaveBeenCalledTimes(2);
});
it('pauses hidden-page polling and checks on foreground, pageshow and focus', async () => {
  visible = 'hidden'; const probe = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useBackendConnection(probe, 'account'));
  expect(probe).not.toHaveBeenCalled();
  visible = 'visible'; act(() => document.dispatchEvent(new Event('visibilitychange'))); await flush();
  expect(result.current).toBe('online');
  visible = 'hidden'; act(() => document.dispatchEvent(new Event('visibilitychange'))); await tick(60_000);
  expect(probe).toHaveBeenCalledTimes(1);
  visible = 'visible'; act(() => window.dispatchEvent(new Event('pageshow'))); await flush();
  act(() => window.dispatchEvent(new Event('focus'))); await flush();
  expect(probe).toHaveBeenCalledTimes(3);
});
it('ignores old-account results and cancels work after unmount', async () => {
  const old = deferred(); const next = deferred();
  const probe = vi.fn().mockReturnValueOnce(old.promise).mockReturnValue(next.promise);
  const { result, rerender, unmount } = renderHook(({ scope }) => useBackendConnection(probe, scope), { initialProps: { scope: 'old' } });
  rerender({ scope: 'new' });
  expect(probe.mock.calls[0][0].aborted).toBe(true);
  await act(async () => old.resolve()); expect(result.current).toBe('checking');
  unmount(); expect(probe.mock.calls[1][0].aborted).toBe(true);
  await act(async () => next.resolve()); await tick(60_000);
  expect(probe).toHaveBeenCalledTimes(2);
});
it('makes no request for local adapters or while the browser is offline', async () => {
  const probe = vi.fn().mockResolvedValue(undefined); online = false;
  const { result, rerender } = renderHook(({ enabled }) => useBackendConnection(enabled ? probe : undefined, 'account'), { initialProps: { enabled: false } });
  expect(result.current).toBe('unknown'); rerender({ enabled: true });
  expect(result.current).toBe('offline'); await tick(30_000); expect(probe).not.toHaveBeenCalled();
});
