import { afterEach, expect, it, vi } from 'vitest';
import { MediaMetronome, renderClickLoop } from './mediaMetronome';
import type { ClickSamples, MetronomeConfig } from './metronome';
const config: MetronomeConfig = { sound: 'ableton-classic', bpm: 120, beats: 4, subdivision: 1, volume: 1, accent: 1, regular: .5, subdivisions: .25, muted: false };
const buffer = { duration: .002, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array([1, 1, 1, 1]) } as unknown as AudioBuffer;
const samples: ClickSamples = { regular: buffer, accent: buffer };
function setup() {
  const media = { src: '', loop: false, preload: '', currentTime: 0, paused: true, ended: false, onpause: null, onerror: null,
    setAttribute: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(),
    play: vi.fn(async () => { media.paused = false; }), pause: vi.fn(() => { media.paused = true; }) };
  const decoder = { close: vi.fn(async () => {}) } as unknown as AudioContext;
  const load = vi.fn(async () => samples), interrupted = vi.fn();
  const engine = new MediaMetronome(interrupted, () => media as unknown as HTMLAudioElement, () => decoder, load);
  let id = 0;
  if (!URL.createObjectURL) URL.createObjectURL = () => '';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:click-${++id}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return { media, decoder, load, engine, interrupted };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it('renders the correct duration, beat strengths, subdivision and mute into a WAV', async () => {
  // jsdom Blob does not expose arrayBuffer; capture Blob parts directly.
  let bytes: ArrayBuffer;
  const BlobOriginal = globalThis.Blob;
  vi.stubGlobal('Blob', class { constructor(parts: ArrayBuffer[]) { bytes = parts[0]; } });
  try {
    renderClickLoop({ ...config, subdivision: 2, beatLevels: [3, 0, 1, 2] }, samples);
    let wave = new DataView(bytes!);
    expect(wave.getUint32(24, true)).toBe(48000);
    expect(wave.getUint32(40, true)).toBe(192000); // 2 seconds, mono PCM16.
    const sample = (seconds: number) => wave.getInt16(44 + Math.round(seconds * 48000) * 2, true);
    expect(sample(0)).toBe(32767); expect(sample(.25)).toBe(8192);
    expect(sample(.5)).toBe(0); expect(sample(.75)).toBe(0);
    expect(sample(1)).toBe(8192); expect(sample(1.5)).toBe(16384);
    renderClickLoop({ ...config, muted: true }, samples); wave = new DataView(bytes!);
    expect(sample(0)).toBe(0);
  } finally { vi.stubGlobal('Blob', BlobOriginal); }
});
it('plays through the media element without scheduling timers and follows its real clock', async () => {
  const { media, engine } = setup();
  const timer = vi.spyOn(globalThis, 'setInterval');
  expect(await engine.start(config)).toBe(true); expect(media.loop).toBe(true);
  expect(timer).not.toHaveBeenCalled();
  media.currentTime = 1.1; expect(engine.getBeat()).toBe(2);
  expect(engine.playing).toBe(true);
  engine.stop(); expect(media.paused).toBe(true); expect(engine.getBeat()).toBe(-1);
  engine.dispose();
});
it('keeps the previous loop running when a replacement fails, then retries', async () => {
  const { media, engine, load } = setup();
  await engine.start(config); const source = media.src;
  load.mockRejectedValueOnce(new Error('offline'));
  expect(await engine.start({ ...config, sound: 'drive' })).toBe(false);
  expect(media.src).toBe(source); expect(engine.playing).toBe(true);
  expect(await engine.start({ ...config, sound: 'drive' })).toBe(true);
  expect(media.src).not.toBe(source);
  engine.dispose();
});
it('does not play a pending loop after stopping or a newer song selection', async () => {
  const { engine, load, media } = setup();
  let resolve!: (value: ClickSamples) => void;
  load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = engine.start(config); engine.stop(); resolve(samples);
  expect(await pending).toBe(false); expect(media.paused).toBe(true);
  expect(await engine.start({ ...config, bpm: 140 })).toBe(true);
  engine.dispose(); expect(media.paused).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('only replaces a loop for actual configuration changes, preserving beat phase', async () => {
  const { engine, media } = setup();
  await engine.start(config); const source = media.src;
  media.currentTime = .75; engine.update({ ...config }); expect(media.src).toBe(source);
  engine.update({ ...config, bpm: 60 });
  await vi.waitFor(() => expect(media.currentTime).toBe(1.5));
  expect(engine.playing).toBe(true); engine.dispose();
});
