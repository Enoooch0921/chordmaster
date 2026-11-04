import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sounds = ['ableton-classic', 'multitracks', 'drive'] as const;
function buffer(value = .2) {
  const channels = [new Float32Array([value, -value, value / 2]), new Float32Array([value / 2, -value / 2, 0])];
  return { numberOfChannels: 2, duration: 3 / 48000, sampleRate: 48000,
    getChannelData: (index: number) => channels[index] } as AudioBuffer;
}
const response = () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer });
beforeEach(() => { vi.resetModules(); vi.stubGlobal('fetch', vi.fn(async () => response())); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(sounds)('loads and balances the %s pair once across concurrent callers and new playback contexts', async sound => {
  const { loadClickSamples, CLICK_SAMPLE_GAIN_DB } = await import('./clickSamples');
  const regular = buffer(), accent = buffer(.3);
  const decodeAudioData = vi.fn().mockResolvedValueOnce(regular).mockResolvedValueOnce(accent);
  const context = { decodeAudioData };
  const another = { decodeAudioData: vi.fn() };
  const [first, second] = await Promise.all([loadClickSamples(context, sound), loadClickSamples(another, sound)]);
  expect(first).toBe(second); expect(await loadClickSamples(another, sound)).toBe(first);
  expect(fetch).toHaveBeenCalledTimes(2); expect(decodeAudioData).toHaveBeenCalledTimes(2);
  expect(another.decodeAudioData).not.toHaveBeenCalled();
  expect(first.regular.getChannelData(0)[0]).toBeCloseTo(.2 * 10 ** (CLICK_SAMPLE_GAIN_DB[sound].regular / 20));
  expect(first.accent.getChannelData(1)[0]).toBeCloseTo(.15 * 10 ** (CLICK_SAMPLE_GAIN_DB[sound].accent / 20));
  expect(first.regular.getChannelData(0)[1]).toBeCloseTo(-first.regular.getChannelData(0)[0]);
  expect(first.regular.sampleRate).toBe(48000); expect(first.regular.duration).toBe(3 / 48000);
});

it('preloads all six assets and decodes offline without creating a live context or starting audio', async () => {
  const decode = vi.fn(async () => buffer());
  const live = vi.fn(() => { throw new Error('live context must not be created'); });
  vi.stubGlobal('AudioContext', live);
  const Offline = vi.fn(function () { this.decodeAudioData = decode; });
  vi.stubGlobal('OfflineAudioContext', Offline);
  const { preloadClickSounds, loadClickSamples } = await import('./clickSamples');
  const first = preloadClickSounds(); expect(preloadClickSounds()).toBe(first);
  await first;
  expect(Offline).toHaveBeenCalledExactlyOnceWith(1, 1, 48000);
  expect(live).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(6); expect(decode).toHaveBeenCalledTimes(6);
  const playback = { decodeAudioData: vi.fn() };
  for (const sound of sounds) await loadClickSamples(playback, sound);
  expect(playback.decodeAudioData).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(6);
});

it('falls back to byte prefetch when offline decoding is unavailable, then reuses bytes on play', async () => {
  vi.stubGlobal('OfflineAudioContext', undefined);
  vi.stubGlobal('webkitOfflineAudioContext', undefined);
  const { preloadClickSounds, loadClickSamples } = await import('./clickSamples');
  await preloadClickSounds(); expect(fetch).toHaveBeenCalledTimes(6);
  const playback = { decodeAudioData: vi.fn(async () => buffer()) };
  await loadClickSamples(playback, 'ableton-classic');
  expect(playback.decodeAudioData).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledTimes(6);
});

it('evicts failed requests so a failed startup preload cannot poison later playback', async () => {
  vi.stubGlobal('OfflineAudioContext', undefined);
  vi.stubGlobal('webkitOfflineAudioContext', undefined);
  vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
  const { preloadClickSounds, loadClickSamples } = await import('./clickSamples');
  await preloadClickSounds();
  vi.mocked(fetch).mockImplementation(async () => response() as Response);
  const playback = { decodeAudioData: vi.fn(async () => buffer()) };
  const samples = await loadClickSamples(playback, 'drive');
  expect(samples.regular).toBeDefined(); expect(fetch).toHaveBeenCalledTimes(8);
});

it('keeps downloaded bytes intact when a decoder consumes or rejects its private copy', async () => {
  const original = new Uint8Array([12, 34, 56, 78]).buffer;
  vi.mocked(fetch).mockResolvedValue({ ok: true, arrayBuffer: async () => original } as Response);
  const { loadClickSamples } = await import('./clickSamples');
  const broken = { decodeAudioData: vi.fn(async data => { new Uint8Array(data).fill(0); throw new Error('bad decoder'); }) };
  await expect(loadClickSamples(broken, 'ableton-classic')).rejects.toThrow('bad decoder');
  expect([...new Uint8Array(original)]).toEqual([12, 34, 56, 78]);
  const playback = { decodeAudioData: vi.fn(async data => { expect([...new Uint8Array(data)]).toEqual([12, 34, 56, 78]); return buffer(); }) };
  await loadClickSamples(playback, 'ableton-classic');
  expect(fetch).toHaveBeenCalledTimes(2); expect(playback.decodeAudioData).toHaveBeenCalledTimes(2);
});

it.each(['fetch', 'decode'] as const)('times out stalled %s preloads and lets a later play retry', async stalled => {
  vi.useFakeTimers();
  if (stalled === 'fetch') {
    vi.stubGlobal('OfflineAudioContext', undefined); vi.stubGlobal('webkitOfflineAudioContext', undefined);
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  } else {
    vi.stubGlobal('OfflineAudioContext', class { decodeAudioData = () => new Promise(() => {}); });
  }
  const { preloadClickSounds, loadClickSamples } = await import('./clickSamples');
  const preload = preloadClickSounds();
  await vi.advanceTimersByTimeAsync(8001); await preload;
  vi.mocked(fetch).mockImplementation(async () => response() as Response);
  const playback = { decodeAudioData: vi.fn(async () => buffer()) };
  expect((await loadClickSamples(playback, 'ableton-classic')).accent).toBeDefined();
  expect(playback.decodeAudioData).toHaveBeenCalledTimes(2);
});
