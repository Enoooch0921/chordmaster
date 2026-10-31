import { afterEach, expect, it, vi } from 'vitest';
import { MediaMetronome, renderClickLoop, renderClickPcm } from './mediaMetronome';
import type { ClickSamples, MetronomeConfig } from './metronome';
const config: MetronomeConfig = { sound: 'ableton-classic', bpm: 120, beats: 4, subdivision: 1, volume: 1, accent: 1, regular: .5, subdivisions: .25, muted: false };
const buffer = { duration: .002, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array([1, 1, 1, 1]) } as unknown as AudioBuffer;
const samples: ClickSamples = { regular: buffer, accent: buffer };
function setup() {
  const media = { src: '', loop: false, preload: '', currentTime: 0, paused: true, ended: false, onpause: null, onerror: null,
    setAttribute: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(),
    play: vi.fn(async () => { media.paused = false; }), pause: vi.fn(() => { media.paused = true; }) };
  const sources: any[] = [];
  const context = { currentTime: 0, state: 'running', destination: {}, onstatechange: null,
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    createBuffer: vi.fn((_channels: number, frames: number, rate: number) => ({ duration: frames / rate, copyToChannel: vi.fn() })),
    createBufferSource: vi.fn(() => { const source = { buffer: null, loop: false, loopStart: 0, loopEnd: 0, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(source); return source; }),
  };
  const decoder = context as unknown as AudioContext;
  const load = vi.fn(async () => samples), interrupted = vi.fn();
  const engine = new MediaMetronome(interrupted, () => media as unknown as HTMLAudioElement, () => decoder, load);
  let id = 0;
  if (!URL.createObjectURL) URL.createObjectURL = () => '';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:click-${++id}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return { media, decoder, context, sources, load, engine, interrupted };
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
it('uses a native gapless audio buffer loop and follows the audio clock without timers', async () => {
  const { media, engine, context, sources } = setup();
  const timer = vi.spyOn(globalThis, 'setInterval');
  expect(await engine.start(config)).toBe(true);
  expect(sources[0].loop).toBe(true); expect(sources[0].loopEnd).toBe(2);
  expect(sources[0].start).toHaveBeenCalledWith(.015, 0);
  expect(timer).not.toHaveBeenCalled();
  context.currentTime = 1.115; expect(engine.getBeat()).toBe(2);
  expect(engine.playing).toBe(true);
  engine.stop(); expect(media.paused).toBe(true); expect(engine.getBeat()).toBe(-1);
  engine.dispose();
});
it('keeps the previous loop running when a replacement fails, then retries', async () => {
  const { sources, engine, load } = setup();
  await engine.start(config); const source = sources[0];
  load.mockRejectedValueOnce(new Error('offline'));
  expect(await engine.start({ ...config, sound: 'drive' })).toBe(false);
  expect(source.stop).not.toHaveBeenCalled(); expect(engine.playing).toBe(true);
  expect(await engine.start({ ...config, sound: 'drive' })).toBe(true);
  expect(sources).toHaveLength(2); expect(source.stop).toHaveBeenCalledWith(.015);
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
  const { engine, context, sources } = setup();
  await engine.start(config);
  context.currentTime = .75; engine.update({ ...config }); expect(sources).toHaveLength(1);
  engine.update({ ...config, bpm: 60 });
  await vi.waitFor(() => expect(sources).toHaveLength(2));
  expect(sources[1].start).toHaveBeenCalledWith(.765, 1.5);
  expect(sources[0].stop).toHaveBeenCalledWith(.765);
  expect(engine.playing).toBe(true); engine.dispose();
});

it.each([72, 110, 120, 128, 137, 180])('keeps last-to-first PCM tick spacing equal at %i BPM', bpm => {
  const pcm = renderClickPcm({ ...config, bpm, beatLevels: [3, 3, 3, 3], regular: 1 }, samples);
  const onsets: number[] = [];
  for (let index = 0; index < pcm.length; index++) if (pcm[index] > .9 && (index === 0 || pcm[index - 1] <= .9)) onsets.push(index);
  expect(onsets).toHaveLength(4);
  const interval = 48000 * 60 / bpm;
  const acrossBoundary = pcm.length - onsets[3] + onsets[0];
  expect(Math.abs(acrossBoundary - interval)).toBeLessThanOrEqual(1);
  expect(Math.abs(onsets[1] - onsets[0] - acrossBoundary)).toBeLessThanOrEqual(1);
});
