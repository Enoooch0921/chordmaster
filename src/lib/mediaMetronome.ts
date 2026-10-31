import { loadClickSamples, isPlayableTempo, type ClickSamples, type ClickSound, type MetronomeConfig } from './metronome';

/** Render an entire repeating measure; background playback needs no JS timer. */
export function renderClickPcm(config: MetronomeConfig, samples: ClickSamples, rate = 48000) {
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
  return mix;
}

export function renderClickLoop(config: MetronomeConfig, samples: ClickSamples, rate = 48000) {
  const mix = renderClickPcm(config, samples, rate), frames = mix.length;
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

/** Native AudioBufferSourceNode looping is gapless; HTML media loops are not. */
export class MediaMetronome {
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private loads = new Map<ClickSound, Promise<ClickSamples>>();
  private config: MetronomeConfig | null = null;
  private silentUrl: string | null = null;
  private generation = 0;
  private active = false;
  private disposed = false;
  private recovering = false;
  private anchorTime = 0;
  private anchorPulse = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private source: AudioBufferSourceNode | null = null;
  private session: { type: string } | null = null;
  private previousSession: string | null = null;
  constructor(private onInterrupt: () => void = () => {}, private createAudio: () => HTMLAudioElement = () => {
    const audio = document.createElement('audio');
    audio.hidden = true; audio.dataset.drummerClickPlayer = '';
    document.body.append(audio); return audio;
  }, private createContext: () => AudioContext = () => new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ latencyHint: 'interactive' }), private load = loadClickSamples) {}
  get playing() { return this.active && this.context?.state === 'running'; }
  private ensure() {
    if (this.disposed) throw new Error('audio-disposed');
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) { if (!this.session) { this.session = session; this.previousSession = session.type; } session.type = 'playback'; }
    } catch { /* Older browsers still support ordinary audio playback. */ }
    if (!this.audio) {
      this.audio = this.createAudio(); this.audio.loop = true; this.audio.preload = 'auto';
      this.audio.setAttribute('playsinline', '');
    }
    if (this.context?.state === 'closed') { this.context.onstatechange = null; this.context = null; this.loads.clear(); }
    if (!this.context) {
      const context = this.context = this.createContext();
      context.onstatechange = () => {
        if (!this.active || this.disposed || this.context !== context || context.state === 'running' || this.recovering) return;
        this.recovering = true;
        void deadline(context.resume()).catch(() => {}).finally(() => {
          this.recovering = false;
          if (this.active && this.context === context && context.state !== 'running') { this.stop(); this.onInterrupt(); }
        });
      };
    }
    return this.audio;
  }
  async prepare() {
    const audio = this.ensure();
    if (!this.silentUrl) {
      const silent = { sound: 'ableton-classic', bpm: 120, beats: 1, subdivision: 1, volume: 0, accent: 0, regular: 0, subdivisions: 0, muted: true } as MetronomeConfig;
      const buffer = { numberOfChannels: 1, sampleRate: 48000, duration: .001, getChannelData: () => new Float32Array(48) } as unknown as AudioBuffer;
      this.silentUrl = URL.createObjectURL(renderClickLoop(silent, { regular: buffer, accent: buffer }));
    }
    if (audio.src !== this.silentUrl) audio.src = this.silentUrl;
    // Optional media session support is silent and never determines Click timing.
    void deadline(audio.play()).catch(() => {});
    await deadline(this.context!.resume());
  }
  start(config: MetronomeConfig) { return this.replace(config, false); }
  private async replace(config: MetronomeConfig, preservePhase: boolean): Promise<boolean> {
    if (!isPlayableTempo(config.bpm) || this.disposed) return false;
    const generation = ++this.generation;
    const wasPlaying = this.playing;
    this.ensure();
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
      if (this.context!.state !== 'running') throw new Error('audio-interrupted');
      const pcm = renderClickPcm(config, samples);
      const buffer = this.context!.createBuffer(1, pcm.length, 48000);
      buffer.copyToChannel(pcm, 0);
      const source = this.context!.createBufferSource();
      source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = buffer.duration;
      source.connect(this.context!.destination);
      source.onended = () => { source.disconnect(); this.sources.delete(source); };
      const when = this.context!.currentTime + .015;
      const phase = preservePhase && this.config ? ((this.anchorPulse + (when - this.anchorTime) * this.config.bpm / 60) % config.beats + config.beats) % config.beats : 0;
      source.start(when, phase * 60 / config.bpm);
      if (this.source) { try { this.source.stop(when); } catch { /* Already stopped. */ } }
      this.sources.add(source); this.source = source;
      this.anchorTime = when; this.anchorPulse = phase;
      this.config = { ...config }; this.active = true; return true;
    } catch (error) {
      if (generation === this.generation && this.playing) return false;
      if (generation === this.generation && !this.active) this.audio?.pause();
      throw error;
    }
  }
  update(config: MetronomeConfig) {
    if (!this.playing || !this.config || JSON.stringify(config) === JSON.stringify(this.config) || config.sound !== this.config.sound) return;
    void this.replace(config, true).catch(() => { this.stop(); this.onInterrupt(); });
  }
  getBeat() {
    if (!this.playing || !this.config || !this.context || this.context.currentTime < this.anchorTime) return -1;
    const pulse = this.anchorPulse + (this.context.currentTime - this.anchorTime) * this.config.bpm / 60;
    return Math.floor(pulse + 1e-8) % this.config.beats;
  }
  stop() {
    this.generation++; this.active = false;
    for (const source of this.sources) { try { source.stop(); } catch { /* Already stopped. */ } }
    this.sources.clear(); this.source = null; this.audio?.pause();
  }
  dispose() {
    this.stop(); this.disposed = true;
    if (this.audio) { this.audio.removeAttribute('src'); this.audio.load(); this.audio.remove?.(); }
    if (this.silentUrl) URL.revokeObjectURL(this.silentUrl);
    if (this.context) { this.context.onstatechange = null; void this.context.close().catch(() => {}); }
    try { if (this.session?.type === 'playback' && this.previousSession !== null) this.session.type = this.previousSession; } catch { /* Session may no longer be available. */ }
    this.loads.clear();
  }
}
