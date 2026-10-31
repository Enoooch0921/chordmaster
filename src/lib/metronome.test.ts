import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metronome, loadClickSamples, parseClickMeter, type ClickSamples, type MetronomeConfig } from './metronome';

const config: MetronomeConfig = { sound: 'multitracks', bpm: 120, beats: 4, subdivision: 1, volume: .7, accent: 1, regular: .7, subdivisions: .4, muted: false };
function audio() {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; buffer: AudioBuffer | null }[] = [];
  const gains: { gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> } }[] = [];
  const samples = { regular: { duration: .11542 }, accent: { duration: .11542 } } as ClickSamples;
  const ctx = {
    loadSamples: vi.fn(async () => samples),
    currentTime: 0, outputLatency: 0, state: 'running', onstatechange: null as (() => void) | null, destination: {},
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    createGain: () => { const node = { gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(node); return node; },
    createBufferSource: () => { const node = { buffer: null as AudioBuffer | null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(node); return node; },
  };
  return { ctx, sources, gains, samples };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('audio clock scheduling', () => {
  it('requests playback before context creation/resume, keeps prepare silent, and restores the session on exit', async () => {
    const session = { type: 'ambient' };
    vi.stubGlobal('navigator', { audioSession: session });
    const { ctx, sources } = audio();
    const create = vi.fn(() => { expect(session.type).toBe('playback'); return ctx as unknown as AudioContext; });
    ctx.resume.mockImplementation(async () => { expect(session.type).toBe('playback'); });
    const engine = new Metronome(undefined, create, ctx.loadSamples);
    await engine.prepare();
    expect(sources).toHaveLength(0);
    expect(engine.playing).toBe(false);
    expect(await engine.start(config)).toBe(true);
    expect(await engine.start({ ...config, sound: 'drive' })).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    engine.dispose();
    expect(session.type).toBe('ambient');
  });
  it.each(['missing', 'throws'] as const)('still plays when audioSession is %s', async support => {
    vi.stubGlobal('navigator', support === 'missing' ? {} : {
      audioSession: { get type() { return 'auto'; }, set type(_value: string) { throw new Error('unsupported'); } },
    });
    const { ctx, sources } = audio();
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    expect(await engine.start(config)).toBe(true);
    expect(sources).toHaveLength(1);
    expect(() => engine.dispose()).not.toThrow();
  });
  it('does not overwrite a later audio-session choice when exiting', async () => {
    const session = { type: 'auto' };
    vi.stubGlobal('navigator', { audioSession: session });
    const { ctx } = audio();
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    await engine.start(config);
    session.type = 'play-and-record';
    engine.dispose();
    expect(session.type).toBe('play-and-record');
  });
  it('switches sound buffers between starts, caches each pair, and keeps the other pair after a load failure', async () => {
    const { ctx, samples, sources } = audio();
    const classic = { regular: { duration: .12 }, accent: { duration: .13 } } as ClickSamples;
    const load = vi.fn().mockResolvedValueOnce(samples).mockRejectedValueOnce(new Error('classic unavailable')).mockResolvedValueOnce(classic);
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, load);
    await engine.start(config);
    expect(sources.at(-1)?.buffer).toBe(samples.accent);
    await expect(engine.start({ ...config, sound: 'ableton-classic' })).rejects.toThrow('classic unavailable');
    await engine.start(config);
    expect(load).toHaveBeenCalledTimes(2);
    expect(sources.at(-1)?.buffer).toBe(samples.accent);
    await engine.start({ ...config, sound: 'ableton-classic', subdivision: 2 });
    expect(sources.at(-1)?.buffer).toBe(classic.accent);
    ctx.currentTime = .2; vi.advanceTimersByTime(25);
    expect(sources.at(-1)?.buffer).toBe(classic.regular);
    await engine.start(config);
    expect(load).toHaveBeenCalledTimes(3);
    expect(load.mock.calls.map(call => call[1])).toEqual(['multitracks', 'ableton-classic', 'ableton-classic']);
    expect(sources.at(-1)?.buffer).toBe(samples.accent);
    engine.dispose();
  });
  it('never replaces the chosen sound when an older sound finishes loading later', async () => {
    const { ctx, sources, samples } = audio();
    const classic = { regular: { duration: .12 }, accent: { duration: .13 } } as ClickSamples;
    let resolve!: (value: ClickSamples) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce(classic);
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, load);
    const pending = engine.start(config);
    expect(await engine.start({ ...config, sound: 'ableton-classic' })).toBe(true);
    resolve(samples);
    expect(await pending).toBe(false);
    expect(sources).toHaveLength(1);
    expect(sources[0].buffer).toBe(classic.accent);
    engine.dispose();
  });
  it('reuses decoded samples across songs, uses the regular sample for subdivisions, and stops the full tail', async () => {
    const { ctx, sources, samples } = audio();
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    await engine.start({ ...config, subdivision: 2 });
    ctx.currentTime = .2; vi.advanceTimersByTime(25);
    expect(sources[1].buffer).toBe(samples.regular);
    ctx.currentTime = .36; vi.advanceTimersByTime(25); // Still in the second click's 115 ms tail.
    engine.stop();
    expect(sources[1].stop).toHaveBeenCalledOnce();
    await engine.start({ ...config, bpm: 72 });
    expect(ctx.loadSamples).toHaveBeenCalledOnce();
    expect(sources.at(-1)?.buffer).toBe(samples.accent);
    engine.dispose();
  });
  it('honors changes while samples load and never revives a stopped loading attempt', async () => {
    const { ctx, sources, samples, gains } = audio();
    let resolve!: (value: ClickSamples) => void;
    ctx.loadSamples.mockImplementation(() => new Promise(done => { resolve = done; }));
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    const first = engine.start(config);
    engine.stop();
    const second = engine.start({ ...config, bpm: 72 });
    engine.update({ ...config, bpm: 72, muted: true });
    resolve(samples);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(sources).toHaveLength(1);
    expect(gains[0].gain.value).toBe(0);
    engine.dispose();
  });
  it('fails without a synthetic fallback and retries sample loading on the next play', async () => {
    const { ctx, sources } = audio();
    ctx.loadSamples.mockRejectedValueOnce(new Error('missing sample'));
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    await expect(engine.start(config)).rejects.toThrow('missing sample');
    expect(engine.playing).toBe(false);
    expect(sources).toHaveLength(0);
    expect(await engine.start(config)).toBe(true);
    expect(ctx.loadSamples).toHaveBeenCalledTimes(2);
    engine.dispose();
  });
  it('spaces triplets evenly and silences every subdivision of a muted beat without stopping the count', async () => {
    const { ctx, sources, gains } = audio();
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    await engine.start({ ...config, subdivision: 3, beatLevels: [0, 3, 2, 1] });
    for (const time of [.15, .32, .49]) { ctx.currentTime = time; vi.advanceTimersByTime(25); }
    expect(sources.slice(0, 4).map(source => source.start.mock.calls[0][0])).toEqual([.04, .04 + .5 / 3, .04 + 1 / 3, .54]);
    for (const envelope of gains.slice(1, 4)) {
      expect(envelope.gain.setValueAtTime.mock.calls[0][0]).toBe(0);
      expect(envelope.gain.exponentialRampToValueAtTime).not.toHaveBeenCalled();
    }
    expect(sources[3].buffer).toBe((await ctx.loadSamples()).accent);
    ctx.currentTime = .55;
    expect(engine.getBeat()).toBe(1);
    engine.dispose();
  });
  it('schedules on the audio clock, accents first beats and never bursts after a UI stall', async () => {
    const { ctx, sources } = audio();
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    await engine.start(config);
    expect(sources[0].start).toHaveBeenCalledWith(.04);
    expect(sources[0].buffer).toBe((await ctx.loadSamples()).accent);
    expect(sources[0].stop).not.toHaveBeenCalled(); // Let the original decay finish naturally.
    ctx.currentTime = .48; vi.advanceTimersByTime(25);
    expect(sources[1].start).toHaveBeenCalledWith(.54);
    expect(sources[1].buffer).toBe((await ctx.loadSamples()).regular);
    ctx.currentTime = 10.01; vi.advanceTimersByTime(25);
    expect(sources).toHaveLength(3);
    expect(sources[2].start.mock.calls[0][0]).toBeCloseTo(10.04);
    engine.dispose();
  });
  it('retimes the remaining fraction of a beat without restarting its first beat', async () => {
    const { ctx, sources } = audio();
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    await engine.start(config);
    ctx.currentTime = .29; // Halfway between .04 and .54.
    engine.update({ ...config, bpm: 60 });
    ctx.currentTime = .72; vi.advanceTimersByTime(25);
    expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(.79);
    expect(sources[1].buffer).toBe((await ctx.loadSamples()).regular);
    engine.dispose();
  });
  it('mutes the master while time and visual beats continue, and cancels future sounds on stop', async () => {
    const { ctx, sources, gains } = audio();
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    await engine.start({ ...config, subdivision: 4 });
    ctx.currentTime = .08;
    engine.update({ ...config, subdivision: 4, muted: true });
    expect(gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, .08);
    expect(engine.getBeat()).toBe(0);
    ctx.currentTime = .12; vi.advanceTimersByTime(25);
    // Stop both the current sample's decay and the upcoming subdivision.
    expect(engine.playing).toBe(true);
    engine.stop();
    expect(engine.getBeat()).toBe(-1);
    expect(sources.every(source => source.stop.mock.calls.length >= 1)).toBe(true);
    const count = sources.length;
    ctx.currentTime = 10; vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(count);
    engine.dispose();
  });
  it('does not start after an outstanding resume resolves following exit', async () => {
    const { ctx, sources } = audio();
    let resolve!: () => void;
    ctx.resume.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const engine = new Metronome(undefined, () => ctx as unknown as AudioContext, ctx.loadSamples);
    const pending = engine.start(config);
    engine.dispose(); resolve();
    expect(await pending).toBe(false);
    expect(sources).toHaveLength(0);
    expect(ctx.close).toHaveBeenCalledOnce();
  });
  it('stops instead of silently continuing after an audio interruption', async () => {
    const { ctx } = audio(), interrupted = vi.fn();
    const engine = new Metronome(interrupted, () => ctx as unknown as AudioContext, ctx.loadSamples);
    await engine.start(config);
    ctx.state = 'suspended'; ctx.onstatechange?.();
    expect(engine.playing).toBe(false);
    expect(interrupted).toHaveBeenCalledOnce();
    engine.dispose();
  });
  it('rejects invalid tempo without allocating an audio context', async () => {
    const create = vi.fn(); const engine = new Metronome(undefined, create);
    expect(await engine.start({ ...config, bpm: NaN })).toBe(false);
    expect(await engine.start({ ...config, bpm: 0 })).toBe(false);
    expect(create).not.toHaveBeenCalled();
    engine.dispose();
  });
});
it.each(['multitracks', 'drive', 'ableton-classic'] as const)('loads the %s WAV pair and rejects an unavailable asset before decoding it', async sound => {
  const bytes = new ArrayBuffer(8);
  const fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });
  vi.stubGlobal('fetch', fetch);
  const regular = { duration: .11542 }, accent = { duration: .11542 };
  const decodeAudioData = vi.fn().mockResolvedValueOnce(regular).mockResolvedValueOnce(accent);
  const samples = await loadClickSamples({ decodeAudioData } as unknown as AudioContext, sound);
  expect(samples).toEqual({ regular, accent });
  expect(fetch.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
    expect.stringContaining(sound === 'ableton-classic' ? 'ableton-classic/Metronome.wav' : `${sound === 'drive' ? 'drive-click' : 'multitracks-click'}/regular.wav`),
    expect.stringContaining(sound === 'ableton-classic' ? 'ableton-classic/MetronomeUp.wav' : `${sound === 'drive' ? 'drive-click' : 'multitracks-click'}/accent.wav`),
  ]));
  expect(decodeAudioData).toHaveBeenCalledTimes(2);
  fetch.mockResolvedValue({ ok: false });
  await expect(loadClickSamples({ decodeAudioData } as unknown as AudioContext, sound)).rejects.toThrow('click-samples-unavailable');
  expect(decodeAudioData).toHaveBeenCalledTimes(2);
});
it('parses common and compound meters without guessing unconfirmed values', () => {
  expect(parseClickMeter('6/8')).toEqual({ count: 6, denominator: 8, compound: true });
  expect(parseClickMeter('7/8')?.compound).toBe(false);
  expect(parseClickMeter('0/4')).toBeNull(); expect(parseClickMeter('free')).toBeNull();
});
