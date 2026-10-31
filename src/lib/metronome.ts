import regularClickUrl from '../assets/audio/ableton-classic/Metronome.wav?url';
import accentClickUrl from '../assets/audio/ableton-classic/MetronomeUp.wav?url';
import multitracksRegularUrl from '../assets/audio/multitracks-click/regular.wav?url';
import multitracksAccentUrl from '../assets/audio/multitracks-click/accent.wav?url';
import driveRegularUrl from '../assets/audio/drive-click/regular.wav?url';
import driveAccentUrl from '../assets/audio/drive-click/accent.wav?url';

export type ClickSamples = { regular: AudioBuffer; accent: AudioBuffer };
export type ClickSound = 'multitracks' | 'drive' | 'ableton-classic';
export const CLICK_SOUNDS: Record<ClickSound, string> = { multitracks: 'MultiTracks Click', drive: 'Drive Click', 'ableton-classic': 'Ableton Live Classic' };
const SAMPLE_URLS: Record<ClickSound, [string, string]> = {
  multitracks: [multitracksRegularUrl, multitracksAccentUrl],
  drive: [driveRegularUrl, driveAccentUrl],
  'ableton-classic': [regularClickUrl, accentClickUrl],
};

export async function loadClickSamples(context: AudioContext, sound: ClickSound): Promise<ClickSamples> {
  const decode = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('click-samples-unavailable');
    return context.decodeAudioData(await response.arrayBuffer());
  };
  const urls = SAMPLE_URLS[sound];
  const [regular, accent] = await Promise.all(urls.map(decode));
  return { regular, accent };
}

/** Foreground metronome. Only the audio clock determines when a click sounds. */
export interface MetronomeConfig {
  sound: ClickSound;
  bpm: number;
  beats: number;
  subdivision: 1 | 2 | 3 | 4;
  beatLevels?: BeatLevel[];
  volume: number;
  accent: number;
  regular: number;
  subdivisions: number;
  muted: boolean;
}

export type BeatLevel = 0 | 1 | 2 | 3;
export const defaultBeatLevels = (beats: number): BeatLevel[] => Array.from({ length: beats }, (_, index) => index === 0 ? 3 : 1);

export const isPlayableTempo = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 400;

export function parseClickMeter(value: string): { count: number; denominator: number; compound: boolean } | null {
  const match = /^(\d{1,2})\/(2|4|8|16)$/.exec(value);
  if (!match) return null;
  const count = Number(match[1]);
  if (count < 1 || count > 16) return null;
  return { count, denominator: Number(match[2]), compound: match[2] === '8' && count >= 6 && count % 3 === 0 };
}

type ScheduledClick = { time: number; endTime: number; source: AudioBufferSourceNode };
type PlaybackAudioSession = { type: string };
const LOOKAHEAD = 0.1;
const AUDIO_START_TIMEOUT = 8000;
function audioDeadline<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('audio-start-timeout')), AUDIO_START_TIMEOUT);
    operation.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}


export class Metronome {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: MetronomeConfig | null = null;
  private anchorTime = 0;
  private anchorPulse = 0;
  private nextPulse = 0;
  private scheduled: ScheduledClick[] = [];
  private visual: { time: number; beat: number }[] = [];
  private lastBeat = -1;
  private generation = 0;
  private disposed = false;
  private rebuildContext = false;
  private lastClockTime = 0;
  private lastClockAdvance = 0;
  private interrupt(rebuild = false) {
    if (!this.playing) return;
    this.rebuildContext ||= rebuild;
    this.stop(); this.onInterrupt();
  }
  private tick() {
    if (!this.playing || !this.context) return;
    // Some browsers omit statechange, or keep reporting running with a frozen clock.
    if (this.context.state !== 'running') { this.interrupt(); return; }
    const now = performance.now();
    if (this.context.currentTime !== this.lastClockTime) {
      this.lastClockTime = this.context.currentTime; this.lastClockAdvance = now;
    } else if (now - this.lastClockAdvance > 2000) { this.interrupt(true); return; }
    try { this.schedule(); } catch { this.interrupt(true); }
  }
  private sampleLoads = new Map<ClickSound, Promise<ClickSamples>>();
  private samples: ClickSamples | null = null;
  private audioSession: PlaybackAudioSession | null = null;
  private previousAudioSessionType: string | null = null;
  playing = false;

  constructor(
    private onInterrupt: () => void = () => {},
    private createContext: () => AudioContext = () => {
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) throw new Error('audio-unavailable');
      return new Audio({ latencyHint: 'interactive' });
    },
    private loadSamples: (context: AudioContext, sound: ClickSound) => Promise<ClickSamples> = loadClickSamples,
  ) {}

  private ensureContext() {
    if (this.disposed) throw new Error('audio-disposed');
    // Safari's Web Audio defaults to ambient audio, which follows the silent
    // switch. Request media playback synchronously in the user's play/connect
    // gesture, before creating or resuming the context. Older browsers fall back.
    try {
      const session = (navigator as Navigator & { audioSession?: PlaybackAudioSession }).audioSession;
      if (session) {
        const previousType = session.type;
        if (previousType !== 'playback') session.type = 'playback';
        if (!this.audioSession) {
          this.audioSession = session;
          this.previousAudioSessionType = previousType;
        }
      }
    } catch { /* Unsupported or restricted audio-session API; keep Web Audio usable. */ }
    if (this.context && (this.context.state === 'closed' || this.rebuildContext)) {
      this.context.onstatechange = null;
      if (this.context.state !== 'closed') void this.context.close().catch(() => {});
      this.rebuildContext = false;
      this.context = null; this.master = null; this.sampleLoads.clear();
    }
    if (!this.context) {
      this.context = this.createContext();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.context.onstatechange = () => {
        if (this.playing && this.context?.state !== 'running') {
          this.interrupt();
        }
      };
    }
    return this.context;
  }

  // Unlock audio during the explicit Connect gesture, before a hardware key
  // arrives. Preparing is silent and must not start or interrupt the clock.
  prepare() { return audioDeadline(this.ensureContext().resume()); }

  async start(config: MetronomeConfig): Promise<boolean> {
    if (this.disposed || !isPlayableTempo(config.bpm) || config.beats < 1 || config.beats > 16) return false;
    const switchingSound = this.playing && this.config?.sound !== config.sound;
    if (switchingSound) this.generation++;
    else this.stop();
    const generation = this.generation;
    this.ensureContext();
    if (!switchingSound) this.config = { ...config };
    let sampleLoad = this.sampleLoads.get(config.sound);
    if (!sampleLoad) {
      sampleLoad = audioDeadline(this.loadSamples(this.context, config.sound)).catch(error => {
        if (this.sampleLoads.get(config.sound) === sampleLoad) this.sampleLoads.delete(config.sound); // Retry only this sound after a failed fetch or decode.
        throw error;
      });
      this.sampleLoads.set(config.sound, sampleLoad);
    }
    // Resume in the user gesture; fetch/decode both samples before starting beat one.
    let samples: ClickSamples;
    try {
      [, samples] = await Promise.all([audioDeadline(this.context.resume()), sampleLoad]);
    } catch (error) {
      // Loading a replacement must not silence the currently working click.
      if (generation === this.generation && switchingSound && this.playing) return false;
      throw error;
    }
    if (generation !== this.generation || this.disposed) return false;
    if (this.context.state !== 'running') throw new Error('audio-interrupted');
    if (switchingSound) {
      this.stop(); this.config = { ...config };
    }
    this.samples = samples;
    this.master!.gain.value = this.config.muted ? 0 : this.config.volume;
    this.anchorTime = this.context.currentTime + 0.04;
    this.anchorPulse = 0;
    this.nextPulse = 0;
    this.playing = true;
    this.schedule();
    this.lastClockTime = this.context.currentTime;
    this.lastClockAdvance = performance.now();
    this.timer = setInterval(() => this.tick(), 25);
    return true;
  }

  update(config: MetronomeConfig) {
    const previous = this.config;
    if (!isPlayableTempo(config.bpm)) return;
    // Sound selection is a stopped-state control; never relabel a sounding buffer.
    if (this.playing && previous?.sound !== config.sound) return;
    this.config = { ...config };
    if (!this.context || !this.master || !this.playing || !previous) return;
    try {
    const now = this.context.currentTime;
    this.master.gain.setValueAtTime(config.muted ? 0 : config.volume, now);
    // Preserve fractional beat position when tempo changes. Cancel only future clicks.
    const pulse = this.anchorPulse + (now - this.anchorTime) * previous.bpm / 60;
    this.anchorTime = now;
    this.anchorPulse = pulse;
    for (const click of this.scheduled) if (click.time > now) { try { click.source.stop(); } catch { /* The browser may already have ended this node. */ } }
    this.scheduled = this.scheduled.filter(click => click.time <= now);
    this.visual = this.visual.filter(click => click.time <= now);
    this.nextPulse = Math.max(0, (Math.floor((pulse + 1e-8) * config.subdivision) + 1) / config.subdivision);
    this.schedule();
    } catch { this.interrupt(true); }
  }

  private schedule() {
    if (!this.context || !this.master || !this.samples || !this.config || !this.playing) return;
    const ctx = this.context, config = this.config, now = ctx.currentTime;
    // A delayed UI timer skips missed ticks instead of emitting a burst of old clicks.
    const pulseNow = this.anchorPulse + (now - this.anchorTime) * config.bpm / 60;
    if (this.nextPulse < pulseNow) this.nextPulse = Math.ceil(pulseNow * config.subdivision) / config.subdivision;
    let time = this.anchorTime + (this.nextPulse - this.anchorPulse) * 60 / config.bpm;
    while (time < now + LOOKAHEAD) {
      const wholeBeat = Math.abs(this.nextPulse - Math.round(this.nextPulse)) < 1e-6;
      const beat = Math.floor(this.nextPulse + 1e-6) % config.beats;
      const strength = config.beatLevels?.[beat] ?? (beat === 0 ? 3 : 2);
      const level = strength === 0 ? 0 : wholeBeat ? (strength === 3 ? config.accent : config.regular * (strength === 1 ? 0.5 : 1)) : config.subdivisions;
      const source = ctx.createBufferSource(), envelope = ctx.createGain();
      source.buffer = wholeBeat && strength === 3 ? this.samples.accent : this.samples.regular;
      // Preserve the original sample's pitch and full decay. Strength changes gain only.
      envelope.gain.setValueAtTime(level, time);
      source.connect(envelope);
      envelope.connect(this.master);
      source.onended = () => { source.disconnect(); envelope.disconnect(); };
      source.start(time);
      this.scheduled.push({ time, endTime: time + source.buffer.duration, source });
      if (wholeBeat) this.visual.push({ time, beat });
      this.nextPulse += 1 / config.subdivision;
      time = this.anchorTime + (this.nextPulse - this.anchorPulse) * 60 / config.bpm;
    }
    this.scheduled = this.scheduled.filter(click => click.endTime >= now);
  }

  getBeat(): number {
    if (!this.playing || !this.context) return -1;
    const now = this.context.currentTime - (this.context.outputLatency || 0);
    while (this.visual.length && this.visual[0].time <= now) this.lastBeat = this.visual.shift()!.beat;
    return this.lastBeat;
  }

  stop() {
    this.generation++;
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const click of this.scheduled) { try { click.source.stop(); } catch { /* Already ended. */ } }
    this.scheduled = [];
    this.visual = [];
    this.lastBeat = -1;
  }

  dispose() {
    this.stop();
    this.disposed = true;
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
    }
    try {
      // Leave another audio feature's later session choice alone.
      if (this.audioSession?.type === 'playback' && this.previousAudioSessionType !== null) {
        this.audioSession.type = this.previousAudioSessionType;
      }
    } catch { /* Session access can become unavailable during page teardown. */ }
    this.audioSession = null;
    this.previousAudioSessionType = null;
  }
}
