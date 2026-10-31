import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useMetronome } from './useMetronome';
import type { MetronomeConfig } from '../lib/metronome';
const mocks = vi.hoisted(() => ({ resume: vi.fn(), stop: vi.fn(), dispose: vi.fn(), update: vi.fn(), instances: [] as { playing: boolean }[] }));
vi.mock('../lib/mediaMetronome', () => ({ MediaMetronome: class {
  constructor() { mocks.instances.push(this); }
  playing = false;
  start = async (config: MetronomeConfig) => { const ok = await mocks.resume(config); if (ok !== false) this.playing = true; return ok !== false; };
  stop = () => { this.playing = false; mocks.stop(); };
  dispose = mocks.dispose;
  update = mocks.update;
  getBeat = () => 0;
} }));
const config: MetronomeConfig = { sound: 'multitracks', bpm: 80, beats: 4, subdivision: 1, volume: .5, accent: 1, regular: .8, subdivisions: .4, muted: false };
beforeEach(() => { vi.clearAllMocks(); mocks.instances.length = 0; mocks.resume.mockResolvedValue(undefined); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); });
it('keeps media playing when hidden and does not restart it on returning', async () => {
  const { result, unmount } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  expect(result.current.playing).toBe(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(result.current.playing).toBe(true); expect(mocks.stop).not.toHaveBeenCalled();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.resume).toHaveBeenCalledOnce();
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
  expect(mocks.resume).toHaveBeenCalledTimes(2); expect(result.current.playing).toBe(true);
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
    await act(async () => { await result.current.start(config); });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => handlers.get('pause')!({ action: 'pause' }));
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.playing).toBe(false);
    expect(mocks.resume).toHaveBeenCalledOnce();
    unmount(); expect(handlers.size).toBe(0);
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'mediaSession', descriptor);
    else delete (navigator as unknown as { mediaSession?: MediaSession }).mediaSession;
  }
});
