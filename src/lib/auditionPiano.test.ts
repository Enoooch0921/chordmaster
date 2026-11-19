import { afterEach, expect, it, vi } from 'vitest';
import { AuditionPiano, pianoAttackSeconds } from './auditionPiano';
import type { AuditionPlan } from './chordAudition';

const plan: AuditionPlan = { duration: 1, fallbackTempo: false, bars: [],
  sounds: [{ start: 0, end: 1, notes: [48, 60] }] };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('locates the acoustic onset after a quiet lead-in at the decoded sample rate', () => {
  const signal = new Float32Array(4800);
  signal[250] = .001;
  signal[720] = -.11;
  signal[960] = 1;
  const sample = { sampleRate: 48000, getChannelData: () => signal };
  expect(pianoAttackSeconds(sample)).toBe(.015);
  signal.fill(0);
  expect(pianoAttackSeconds(sample)).toBe(0);
});

it('cancels an in-flight start, and a restarted audition owns its sources and visual callbacks', async () => {
  vi.useFakeTimers();
  const starts = vi.fn(), stops = vi.fn(), close = vi.fn();
  let ready: () => void;
  const cold = new Promise<void>(resolve => { ready = resolve; });
  class Context {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = () => cold;
    close = async () => close();
    decodeAudioData = async () => ({ duration: 8, sampleRate: 48000, getChannelData: () => new Float32Array(64) });
    createGain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
    createBufferSource = () => ({ playbackRate: {}, connect: (node: object) => node, disconnect: vi.fn(), start: starts, stop: stops });
  }
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const engine = new AuditionPiano();
  const old = engine.play(plan, vi.fn(), vi.fn(), vi.fn());
  engine.stop();
  const restart = engine.play(plan, vi.fn(), vi.fn(), vi.fn());
  ready!();
  await Promise.all([old, restart]);
  expect(starts).toHaveBeenCalledTimes(2);
  expect(stops).toHaveBeenCalledTimes(2); // scheduled releases
  engine.stop();
  expect(stops).toHaveBeenCalledTimes(4); // cancel both immediately
  engine.dispose();
  expect(close).toHaveBeenCalledOnce();
});

it('sustains a long hold with a continuous loop until the scheduled release', async () => {
  vi.useFakeTimers();
  const pcm = new Float32Array(8000).map((_, i) => Math.sin(i / 23) * .4);
  const voices: { buffer?: AudioBuffer; loop?: boolean; loopStart?: number; loopEnd?: number; stop: ReturnType<typeof vi.fn> }[] = [];
  class Context {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = async () => {};
    close = async () => {};
    decodeAudioData = async () => ({ duration: 8, sampleRate: 1000, numberOfChannels: 1, getChannelData: () => pcm });
    createBuffer = (_channels: number, frames: number, rate: number) => {
      const data = new Float32Array(frames);
      return {duration: frames / rate, getChannelData: () => data};
    };
    createGain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
    createBufferSource = () => {
      const voice = { playbackRate: {}, start: vi.fn(), stop: vi.fn(), connect: (node: object) => node, disconnect: vi.fn() };
      voices.push(voice);
      return voice;
    };
  }
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const engine = new AuditionPiano();
  await engine.play({ ...plan, duration: 12, sounds: [{start: 0, end: 12, notes: [72]}] }, vi.fn(), vi.fn(), vi.fn());
  expect(voices).toHaveLength(1);
  const [voice] = voices;
  expect(voice).toMatchObject({loop: true, loopStart: 3, loopEnd: 5});
  expect(voice.buffer!.getChannelData(0)[4999]).toBe(pcm[2999]);
  expect(voice.stop.mock.calls[0][0]).toBeGreaterThanOrEqual(12);
  engine.dispose();
});

function mockPianoClock() {
  vi.useFakeTimers();
  const voices: { playbackRate: { value?: number }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  let clock = 0;
  class Context {
    state = 'running';
    get currentTime() { return clock; }
    destination = {};
    resume = async () => {};
    close = async () => {};
    decodeAudioData = async () => ({duration: 2, sampleRate: 1000, getChannelData: () => new Float32Array(64)});
    createGain = () => ({gain:{setValueAtTime:vi.fn(), linearRampToValueAtTime:vi.fn()}, connect:vi.fn(), disconnect:vi.fn()});
    createBufferSource = () => {
      const node = {playbackRate:{}, connect:(gain:object) => gain, disconnect:vi.fn(), start:vi.fn(), stop:vi.fn()};
      voices.push(node);
      return node;
    };
  }
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn(async () => ({ok:true, arrayBuffer:async () => new ArrayBuffer(1)})));
  let frame: FrameRequestCallback;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  return { voices, setClock: (time: number) => { clock = time; }, paintFrame: () => frame(0) };
}

it('replaces a scheduled section at its audio boundary and cancels it on an immediate second tap', async () => {
  const { voices, setClock } = mockPianoClock();
  const engine = new AuditionPiano();
  const section = {...plan, sounds:[{start:0,end:1,notes:[48]}]};
  await engine.play(section, vi.fn(), vi.fn(), vi.fn());
  const origin = voices[0].start.mock.calls[0][0];
  expect(engine.redirect!(section, 1)).toBe(1);
  expect(voices).toHaveLength(1);
  const clock = origin + .8;
  setClock(clock);
  vi.advanceTimersByTime(65);
  expect(voices[1].start.mock.calls[0][0]).toBeCloseTo(origin + 1);
  const cut = engine.redirect!(section);
  expect(cut).toBeLessThan(1);
  expect(voices[1].stop).toHaveBeenLastCalledWith(clock);
  expect(voices[0].stop).toHaveBeenLastCalledWith(origin + cut);
  expect(voices[2].start.mock.calls[0][0]).toBeCloseTo(origin + cut);
  engine.dispose();
});

it('retunes held accompaniment and melody and rescales upcoming clicks and queued jumps on the same beat', async () => {
  const { voices, setClock, paintFrame } = mockPianoClock();
  const bar = { sectionId: 'v', sectionOccurrence: 0, barId: 'b', start: 0, end: 2, beats: 4, firstBeat: 0, beatSeconds: .5 };
  const verse: AuditionPlan = { ...plan, duration: 2, bars: [bar], sounds: [
    { start: 0, end: 2, notes: [48] }, { voice: 'melody', start: 0, end: 2, notes: [60] },
  ] };
  const engine = new AuditionPiano();
  const paint = vi.fn();
  await engine.play(verse, paint, vi.fn(), vi.fn());
  const origin = voices[0].start.mock.calls[0][0];
  engine.redirect!({ ...verse, bars: [{ ...bar, barId: 'ending' }] }, 2);
  const cut = origin + .25;
  setClock(cut);
  engine.setPracticeTuning({ semitones: -2, tempoRatio: .5 });
  const held = voices.slice(-2);
  for (const voice of held) {
    expect(voice.playbackRate.value).toBeCloseTo(2 ** (-2 / 12));
    expect(voice.start.mock.calls[0][0]).toBeCloseTo(cut);
    expect(voice.start.mock.calls[0][1]).toBeGreaterThan(0);
    expect(voice.stop.mock.calls[0][0]).toBeCloseTo(cut + 3.5);
  }
  setClock(cut + .4);
  vi.advanceTimersByTime(65);
  // Clicks keep their pitch. The next half-second score beat is now .5 real seconds away from the cut.
  expect(voices.at(-1)!.playbackRate.value).toBeUndefined();
  expect(voices.at(-1)!.start.mock.calls[0][0]).toBeCloseTo(cut + .5);
  paintFrame();
  const [scoreTime, timeline] = paint.mock.lastCall!;
  expect(scoreTime).toBeCloseTo(.45);
  expect(timeline.bars.at(-1)).toMatchObject({ barId: 'ending', start: 2 });
  engine.dispose();
});
