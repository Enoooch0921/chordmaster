import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMetronome } from './useMetronome';
import type { MetronomeConfig } from '../lib/metronome';
const mocks = vi.hoisted(() => ({ resume: vi.fn(), recover: vi.fn(), stop: vi.fn(), dispose: vi.fn(), update: vi.fn(), beat: 0, instances: [] as { playing: boolean }[] }));
vi.mock('../lib/mediaMetronome', () => ({ MediaMetronome: class {
  constructor() { mocks.instances.push(this); }
  playing = false;
  start = async (config: MetronomeConfig) => { const ok = await mocks.resume(config); if (ok !== false) this.playing = true; return ok !== false; };
  recover = async (config: MetronomeConfig) => { const ok = await mocks.recover(config); this.playing = ok !== false; return ok !== false; };
  stop = () => { this.playing = false; mocks.stop(); };
  dispose = mocks.dispose;
  update = mocks.update;
  getBeat = () => mocks.beat;
} }));
const config: MetronomeConfig = { sound: 'multitracks', bpm: 80, beats: 4, subdivision: 1, volume: .5, accent: 1, regular: .8, subdivisions: .4, muted: false };
beforeEach(() => { vi.clearAllMocks(); mocks.beat = 0; mocks.instances.length = 0; mocks.resume.mockResolvedValue(undefined); mocks.recover.mockResolvedValue(true); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('keeps native audio playing when hidden and reconnects output on return even if state still says playing', async () => {
  const { result, unmount } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  expect(result.current.playing).toBe(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(result.current.playing).toBe(true); expect(mocks.stop).not.toHaveBeenCalled();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.resume).toHaveBeenCalledOnce();
  expect(mocks.recover).toHaveBeenCalledOnce();
  unmount(); expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('does not leave controls starting after a failed resume', async () => {
  mocks.resume.mockRejectedValue(new Error('blocked'));
  const { result } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  expect(result.current.playing).toBe(false); expect(result.current.starting).toBe(false);
  expect(result.current.notice).toBe('failed');
});
it('releases a wake lock even when the request resolves after stopping', async () => {
  let resolve!: (lock: { release: () => Promise<void> }) => void;
  const release = vi.fn(async () => {});
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: vi.fn(() => new Promise(done => { resolve = done; })) } });
  const { result } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  act(() => result.current.stop());
  await act(async () => resolve({ release }));
  await waitFor(() => expect(release).toHaveBeenCalledOnce());
});

it('keeps the working click after a replacement sound fails and reports failure', async () => {
  const { result } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  mocks.resume.mockResolvedValueOnce(false);
  await act(async () => { expect(await result.current.start({ ...config, sound: 'drive' })).toBe(false); });
  expect(result.current.playing).toBe(true); expect(result.current.notice).toBe('failed');
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('automatically recovers if the system paused media while the app was hidden', async () => {
  const { result } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  mocks.instances[0].playing = false;
  hidden.mockReturnValue(false);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); });
  expect(mocks.resume).toHaveBeenCalledOnce(); expect(mocks.recover).toHaveBeenCalledOnce(); expect(result.current.playing).toBe(true);
});
it('does not resume a manually stopped click when coming back from another app', async () => {
  const { result } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  act(() => result.current.stop());
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.resume).toHaveBeenCalledOnce(); expect(result.current.playing).toBe(false);
  expect(mocks.recover).not.toHaveBeenCalled();
});
it('retries a blocked foreground recovery and does not clear playback intent after the first failure', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  mocks.recover.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  hidden.mockReturnValue(false);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(result.current.playing).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(mocks.recover).toHaveBeenCalledTimes(2);
  expect(mocks.recover).toHaveBeenLastCalledWith(config);
  expect(result.current.playing).toBe(true); expect(result.current.notice).toBeNull();
});
it('uses a later foreground touch to retry after bounded automatic attempts, but manual stop cancels it', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  mocks.recover.mockResolvedValue(false); hidden.mockReturnValue(false);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await act(async () => vi.advanceTimersByTimeAsync(1600));
  expect(mocks.recover).toHaveBeenCalledTimes(3);
  mocks.recover.mockResolvedValue(true);
  await act(async () => document.dispatchEvent(new Event('pointerdown')));
  expect(result.current.playing).toBe(true);
  act(() => result.current.stop());
  await act(async () => { document.dispatchEvent(new Event('pointerdown')); window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(2000); });
  expect(mocks.recover).toHaveBeenCalledTimes(4); expect(result.current.playing).toBe(false);
});
it('silently retries the previous sound when a quiet sound switch cannot restart media', async () => {
  const { result } = renderHook(useMetronome);
  mocks.resume.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await act(async () => { expect(await result.current.start(config, { quiet: true, fallbackSound: 'drive' })).toBe(false); });
  expect(result.current.playing).toBe(true); expect(result.current.notice).toBeNull();
  expect(mocks.resume).toHaveBeenLastCalledWith(expect.objectContaining({ sound: 'drive' }));
});

it('honors lock-screen pause and removes media-session handlers on exit', async () => {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler>();
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: { setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => { if (handler) handlers.set(action, handler); else handlers.delete(action); } } });
  try {
    const { result, unmount } = renderHook(useMetronome);
    expect(handlers.size).toBe(0);
    await act(async () => { await result.current.start(config); });
    expect(handlers.size).toBe(3);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => handlers.get('pause')!({ action: 'pause' }));
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.playing).toBe(false);
    expect(handlers.size).toBe(0);
    expect(mocks.resume).toHaveBeenCalledOnce();
    unmount(); expect(handlers.size).toBe(0);
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'mediaSession', descriptor);
    else delete (navigator as unknown as { mediaSession?: MediaSession }).mediaSession;
  }
});


it('leaves audio running while animation frames stall and catches up without replaying missed flashes', async () => {
  let serial = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const draw = () => {
    const [id, callback] = frames.entries().next().value!;
    frames.delete(id);
    act(() => callback(performance.now()));
  };
  const { result, unmount } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  draw(); expect(result.current.beat).toBe(0);
  // No visual callbacks run during the simulated stall, but audio has advanced.
  mocks.beat = 3;
  expect(result.current.playing).toBe(true); expect(result.current.beat).toBe(0);
  expect(mocks.stop).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  draw();
  expect(result.current.beat).toBe(3); expect(frames.size).toBe(1);
  expect(mocks.resume).toHaveBeenCalledOnce(); expect(mocks.recover).not.toHaveBeenCalled();
  unmount(); expect(frames.size).toBe(0);
});
