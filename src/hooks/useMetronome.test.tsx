import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useMetronome } from './useMetronome';
import type { MetronomeConfig } from '../lib/metronome';
const mocks = vi.hoisted(() => ({ resume: vi.fn(), stop: vi.fn(), dispose: vi.fn(), update: vi.fn() }));
vi.mock('../lib/metronome', () => ({ Metronome: class {
  playing = false;
  start = async (config: MetronomeConfig) => { await mocks.resume(config); this.playing = true; return true; };
  stop = () => { this.playing = false; mocks.stop(); };
  dispose = mocks.dispose;
  update = mocks.update;
  getBeat = () => 0;
} }));
const config: MetronomeConfig = { sound: 'multitracks', bpm: 80, beats: 4, subdivision: 1, volume: .5, accent: 1, regular: .8, subdivisions: .4, muted: false };
beforeEach(() => { vi.clearAllMocks(); mocks.resume.mockResolvedValue(undefined); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); });
it('stops on hiding and does not silently resume when the page comes back', async () => {
  const { result, unmount } = renderHook(useMetronome);
  await act(async () => { await result.current.start(config); });
  expect(result.current.playing).toBe(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(result.current.playing).toBe(false); expect(result.current.notice).toBe('hidden');
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
