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

function deadline<T>(promise: Promise<T>, milliseconds = 8000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('audio-timeout')), milliseconds);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

/** Native AudioBufferSourceNode looping is gapless; HTML media loops are not. */
export class MediaMetronome {
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private loads = new Map<ClickSound, Promise<ClickSamples>>();
  private sampleCache = new Map<ClickSound, ClickSamples>();
  private config: MetronomeConfig | null = null;
  private silentUrl: string | null = null;
  private generation = 0;
  private active = false;
  private disposed = false;
  private recovering = false;
  private repairing = false;
  private needsRebuild = false;
  private cancelProbe: (() => void) | null = null;
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
  private releaseSession() {
    try { if (this.session && this.previousSession !== null && this.session.type === 'playback') this.session.type = this.previousSession; } catch { /* Session may no longer be available. */ }
    this.session = null; this.previousSession = null;
  }
  private releaseIdleAudio() {
    this.audio?.pause();
    if (this.context && this.context.state !== 'closed') void this.context.suspend().catch(() => {});
    this.releaseSession();
  }
  private retireContext() {
    this.cancelProbe?.();
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
    }
    for (const source of this.sources) { try { source.stop(); } catch { /* Already stopped. */ } }
    this.sources.clear(); this.source = null; this.active = false;
    this.context = null; this.loads.clear(); this.needsRebuild = false;
  }
  private ensure(playback = true) {
    if (this.disposed) throw new Error('audio-disposed');
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (playback && session) { if (!this.session) { this.session = session; this.previousSession = session.type; } session.type = 'playback'; }
    } catch { /* Older browsers still support ordinary audio playback. */ }
    if (!this.audio) {
      this.audio = this.createAudio(); this.audio.loop = true; this.audio.preload = 'auto';
      this.audio.setAttribute('playsinline', '');
    }
    if (this.context?.state === 'closed') { this.context.onstatechange = null; this.context = null; this.loads.clear(); }
    if (!this.context) {
      const context = this.context = this.createContext();
      context.onstatechange = () => {
        if (!this.active || this.disposed || this.context !== context || context.state === 'running' || this.recovering || this.repairing) return;
        const generation = this.generation;
        this.recovering = true;
        void deadline(context.resume(), 1500).catch(() => {}).finally(() => {
          this.recovering = false;
          if (generation === this.generation && this.active && this.context === context && context.state !== 'running') { this.needsRebuild = true; this.stop(); this.onInterrupt(); }
        });
      };
    }
    return this.audio;
  }
  async prepare() {
    if (this.active) return;
    // MIDI/keyboard preparation must not claim playback focus before Click starts.
    this.ensure(false);
    await deadline(this.context!.resume());
  }
  private async unlock() {
    const audio = this.ensure();
    if (!this.silentUrl) {
      const silent = { sound: 'ableton-classic', bpm: 120, beats: 1, subdivision: 1, volume: 0, accent: 0, regular: 0, subdivisions: 0, muted: true } as MetronomeConfig;
      const buffer = { numberOfChannels: 1, sampleRate: 48000, duration: .001, getChannelData: () => new Float32Array(48) } as unknown as AudioBuffer;
      this.silentUrl = URL.createObjectURL(renderClickLoop(silent, { regular: buffer, accent: buffer }));
    }
    if (audio.src !== this.silentUrl) audio.src = this.silentUrl;
    // Only actual Click playback activates the silent media-session helper.
    void deadline(audio.play()).catch(() => {});
    await deadline(this.context!.resume());
  }
  start(config: MetronomeConfig) {
    // An explicit song/play gesture must supersede a stuck native recovery.
    if (this.repairing || (this.needsRebuild && !this.active) || this.context?.state === 'closed') this.retireContext();
    return this.replace(config, false);
  }
  private async clockAdvances(context: AudioContext) {
    const time = context.currentTime;
    try {
      return await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(context.state === 'running' && context.currentTime > time), 120);
        this.cancelProbe = () => { clearTimeout(timer); resolve(false); };
      });
    } finally { this.cancelProbe = null; }
  }
  async recover(config: MetronomeConfig): Promise<boolean> {
    if (this.disposed || this.repairing) return false;
    const context = this.context;
    if (!context || context.state === 'closed') return this.start(config);
    this.ensure();
    // A subsequent explicit play/song gesture gets a fresh native output route,
    // even on WebKit versions whose silent output still advances the clock.
    this.needsRebuild = true;
    const generation = ++this.generation;
    this.repairing = true;
    try {
      // Safari can report running after an interruption while output stays silent.
      // Reconnect the native route; preserve the audio-clock beat phase on success.
      await deadline(context.suspend(), 1500);
      if (generation !== this.generation || this.disposed) return false;
      await deadline(context.resume(), 1500);
      if (generation !== this.generation || this.disposed) return false;
      if (context.state !== 'running') throw new Error('audio-interrupted');
      const moving = await this.clockAdvances(context);
      if (generation !== this.generation || this.disposed) return false;
      if (!moving) throw new Error('audio-clock-frozen');
      return await this.replace(config, true);
    } catch {
      if (generation !== this.generation || this.disposed) return false;
      this.retireContext();
      if (!await this.replace(config, false)) return false;
      const replacement = this.generation;
      const moving = await this.clockAdvances(this.context!);
      if (replacement !== this.generation || this.disposed) return false;
      if (!moving) this.stop();
      return moving;
    } finally { this.repairing = false; }
  }
  private async replace(config: MetronomeConfig, preservePhase: boolean): Promise<boolean> {
    if (!isPlayableTempo(config.bpm) || this.disposed) return false;
    const generation = ++this.generation;
    const wasPlaying = this.playing;
    try {
      this.ensure();
      const unlock = wasPlaying ? Promise.resolve() : this.unlock();
      let loading = this.loads.get(config.sound);
      if (!loading) {
        const cached = this.sampleCache.get(config.sound);
        loading = (cached ? Promise.resolve(cached) : deadline(this.load(this.context!, config.sound))).then(samples => {
          if (!this.disposed) this.sampleCache.set(config.sound, samples);
          return samples;
        }).catch(error => {
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
      if (generation === this.generation && !this.active) this.releaseIdleAudio();
      throw error;
    }
  }
  update(config: MetronomeConfig) {
    if (!this.playing || !this.config || JSON.stringify(config) === JSON.stringify(this.config) || config.sound !== this.config.sound) return;
    void this.replace(config, true).catch(() => { this.stop(); this.onInterrupt(); });
  }
  getBeat() {
    if (!this.playing || !this.config || !this.context) return -1;
    let outputTime = this.context.currentTime;
    try {
      // This read drives the display only. The native loop never waits for RAF.
      // currentTime can lead the speaker; map the output device's timestamp to
      // now when available, so the highlight follows the audible beat instead.
      const stamp = this.context.getOutputTimestamp?.();
      if (stamp && Number.isFinite(stamp.contextTime) && stamp.contextTime >= 0
          && Number.isFinite(stamp.performanceTime) && stamp.performanceTime > 0) {
        outputTime = Math.min(outputTime, stamp.contextTime + Math.max(0, performance.now() - stamp.performanceTime) / 1000);
      }
    } catch { /* Older/interrupted engines fall back to their audio clock. */ }
    if (outputTime < this.anchorTime) return -1;
    // Follow the actual PCM loop length, including sample rounding. Computing
    // an ideal BPM from total elapsed time would slowly drift from that loop.
    const rate = 48000;
    const frames = Math.round((this.source?.buffer?.duration ?? this.config.beats * 60 / this.config.bpm) * rate);
    const elapsedFrames = (this.anchorPulse * 60 / this.config.bpm + outputTime - this.anchorTime) * rate;
    const position = ((elapsedFrames % frames) + frames) % frames;
    for (let beat = this.config.beats - 1; beat > 0; beat--) {
      if (position + 1e-6 >= Math.round(beat * 60 / this.config.bpm * rate)) return beat;
    }
    return 0;
  }
  stop() {
    this.generation++; this.active = false;
    this.cancelProbe?.();
    for (const source of this.sources) { try { source.stop(); } catch { /* Already stopped. */ } }
    this.sources.clear(); this.source = null; this.releaseIdleAudio();
  }
  dispose() {
    this.stop(); this.disposed = true;
    if (this.audio) { this.audio.removeAttribute('src'); this.audio.load(); this.audio.remove?.(); }
    if (this.silentUrl) URL.revokeObjectURL(this.silentUrl);
    if (this.context) { this.context.onstatechange = null; void this.context.close().catch(() => {}); }
    this.loads.clear(); this.sampleCache.clear();
  }
}
