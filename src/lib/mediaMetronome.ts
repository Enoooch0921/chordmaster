import { loadClickSamples, isPlayableTempo, type ClickSamples, type ClickSound, type MetronomeConfig } from './metronome';

/** Render an entire repeating measure; background playback needs no JS timer. */
export function renderClickLoop(config: MetronomeConfig, samples: ClickSamples, rate = 48000) {
  const frames = Math.round(config.beats * 60 / config.bpm * rate);
  if (!isPlayableTempo(config.bpm) || config.beats < 1 || config.beats > 16 || frames <= 0) throw new Error('invalid-click-loop');
  const mix = new Float32Array(frames);
  for (let tick = 0; tick < config.beats * config.subdivision; tick++) {
    const pulse = tick / config.subdivision, whole = tick % config.subdivision === 0;
    const strength = config.beatLevels?.[Math.floor(pulse)] ?? (tick === 0 ? 3 : 2);
    const level = strength === 0 ? 0 : whole ? strength === 3 ? config.accent : config.regular * (strength === 1 ? .5 : 1) : config.subdivisions;
    const buffer = whole && strength === 3 ? samples.accent : samples.regular;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
    const onset = Math.round(pulse * 60 / config.bpm * rate);
    for (let frame = 0; frame < Math.ceil(buffer.duration * rate); frame++) {
      const position = frame * buffer.sampleRate / rate, left = Math.floor(position), fraction = position - left;
      let value = 0;
      for (const channel of channels) value += (channel[left] ?? 0) * (1 - fraction) + (channel[left + 1] ?? 0) * fraction;
      mix[(onset + frame) % frames] += value / channels.length * level * (config.muted ? 0 : config.volume);
    }
  }
  const bytes = new ArrayBuffer(44 + frames * 2), view = new DataView(bytes);
  const text = (at: number, value: string) => Array.from(value).forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  mix.forEach((value, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true));
  return new Blob([bytes], { type: 'audio/wav' });
}

function deadline<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('audio-timeout')), 8000);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

/** The media element owns the playback clock, including when Safari suspends JS. */
export class MediaMetronome {
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private loads = new Map<ClickSound, Promise<ClickSamples>>();
  private config: MetronomeConfig | null = null;
  private url: string | null = null;
  private silentUrl: string | null = null;
  private generation = 0;
  private active = false;
  private disposed = false;
  private replacing = false;
  private session: { type: string } | null = null;
  private previousSession: string | null = null;
  constructor(private onInterrupt: () => void = () => {}, private createAudio: () => HTMLAudioElement = () => {
    const audio = document.createElement('audio');
    audio.hidden = true; audio.dataset.drummerClickPlayer = '';
    document.body.append(audio); return audio;
  }, private createContext: () => AudioContext = () => new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(), private load = loadClickSamples) {}
  get playing() { return this.active && Boolean(this.audio && !this.audio.paused && !this.audio.ended); }
  private ensure() {
    if (this.disposed) throw new Error('audio-disposed');
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) { if (!this.session) { this.session = session; this.previousSession = session.type; } session.type = 'playback'; }
    } catch { /* Older browsers still support ordinary media playback. */ }
    if (!this.audio) {
      this.audio = this.createAudio(); this.audio.loop = true; this.audio.preload = 'auto';
      this.audio.setAttribute('playsinline', '');
      this.audio.onpause = this.audio.onerror = () => {
        if (this.active && !this.replacing) { this.active = false; this.onInterrupt(); }
      };
    }
    if (this.context?.state === 'closed') { this.context = null; this.loads.clear(); }
    this.context ??= this.createContext(); // Decode only; never route media through Web Audio.
    return this.audio;
  }
  async prepare() {
    const audio = this.ensure();
    if (this.playing) return;
    if (!this.silentUrl) {
      const silent = { sound: 'ableton-classic', bpm: 120, beats: 1, subdivision: 1, volume: 0, accent: 0, regular: 0, subdivisions: 0, muted: true } as MetronomeConfig;
      const buffer = { numberOfChannels: 1, sampleRate: 48000, duration: .001, getChannelData: () => new Float32Array(48) } as unknown as AudioBuffer;
      this.silentUrl = URL.createObjectURL(renderClickLoop(silent, { regular: buffer, accent: buffer }));
    }
    if (audio.src !== this.silentUrl) audio.src = this.silentUrl;
    this.url ??= this.silentUrl;
    // Start the media element inside the user gesture, before fetching/decoding.
    await deadline(audio.play());
  }
  start(config: MetronomeConfig) { return this.replace(config, 0); }
  private async replace(config: MetronomeConfig, phase: number): Promise<boolean> {
    if (!isPlayableTempo(config.bpm) || this.disposed) return false;
    const generation = ++this.generation;
    const wasPlaying = this.playing;
    const audio = this.ensure();
    let nextUrl: string | null = null;
    try {
      const unlock = wasPlaying ? Promise.resolve() : this.prepare();
      let loading = this.loads.get(config.sound);
      if (!loading) {
        loading = deadline(this.load(this.context!, config.sound)).catch(error => {
          if (this.loads.get(config.sound) === loading) this.loads.delete(config.sound);
          throw error;
        });
        this.loads.set(config.sound, loading);
      }
      const [samples] = await Promise.all([loading, unlock]);
      if (generation !== this.generation || this.disposed) return false;
      nextUrl = URL.createObjectURL(renderClickLoop(config, samples));
      const previous = this.url;
      this.replacing = true; audio.src = nextUrl;
      audio.currentTime = phase * 60 / config.bpm;
      try { await deadline(audio.play()); }
      catch (error) {
        if (generation === this.generation && previous && wasPlaying) { audio.src = previous; await deadline(audio.play()); }
        throw error;
      }
      if (generation !== this.generation || this.disposed) return false;
      this.url = nextUrl; nextUrl = null; if (previous && previous !== this.silentUrl) URL.revokeObjectURL(previous);
      this.config = { ...config }; this.active = true; return true;
    } catch (error) {
      if (generation === this.generation && this.playing) return false;
      if (generation === this.generation && !this.active) audio.pause();
      throw error;
    } finally {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      if (generation === this.generation) this.replacing = false;
    }
  }
  update(config: MetronomeConfig) {
    if (!this.playing || !this.config || JSON.stringify(config) === JSON.stringify(this.config) || config.sound !== this.config.sound) return;
    const phase = this.audio!.currentTime * this.config.bpm / 60 % config.beats;
    void this.replace(config, phase).catch(() => { this.stop(); this.onInterrupt(); });
  }
  getBeat() { return this.playing && this.config ? Math.floor(this.audio!.currentTime * this.config.bpm / 60) % this.config.beats : -1; }
  stop() { this.generation++; this.active = false; this.replacing = false; this.audio?.pause(); }
  dispose() {
    this.stop(); this.disposed = true;
    if (this.audio) { this.audio.onpause = this.audio.onerror = null; this.audio.removeAttribute('src'); this.audio.load(); this.audio.remove?.(); }
    if (this.url && this.url !== this.silentUrl) URL.revokeObjectURL(this.url);
    if (this.silentUrl) URL.revokeObjectURL(this.silentUrl);
    void this.context?.close().catch(() => {});
    try { if (this.session?.type === 'playback' && this.previousSession !== null) this.session.type = this.previousSession; } catch { /* Session may no longer be available. */ }
    this.loads.clear();
  }
}
