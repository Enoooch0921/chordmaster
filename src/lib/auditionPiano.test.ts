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
