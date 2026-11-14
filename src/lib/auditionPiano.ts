import { auditionBeats, type AuditionPlan } from './chordAudition';
import { loadClickSamples } from './clickSamples';

const CLICK_VOLUME = 0.32;

const files = import.meta.glob<string>('../assets/audio/salamander/*.mp3', { eager: true, import: 'default', query: '?url' });
const samples = Object.entries(files).map(([name, url]) => ({ midi: Number(name.match(/(\d+)\.mp3$/)![1]), url }));
const decoded = new Map<string, Promise<AudioBuffer>>();
function nearest(midi: number) {
  return samples.reduce((best, sample) => Math.abs(midi - sample.midi) < Math.abs(midi - best.midi) ? sample : best);
}
function load(context: AudioContext, url: string) {
  const cached = decoded.get(url);
  if (cached) return cached;
  const pending = fetch(url, { signal: AbortSignal.timeout(12000) }).then(response => {
    if (!response.ok) throw new Error('piano-sample');
    return response.arrayBuffer();
  }).then(bytes => context.decodeAudioData(bytes)).catch(error => { decoded.delete(url); throw error; });
  decoded.set(url, pending);
  return pending;
}

/** One foreground playback at a time. Only the explicit play gesture opens the audio route. */
export class AuditionPiano {
  private context?: AudioContext;
  private bus?: GainNode;
  private clickBus?: GainNode;
  private metronomeEnabled = true;
  private sources = new Set<AudioBufferSourceNode>();
  private timer?: ReturnType<typeof setInterval>;
  private frame?: number;
  private deadline?: ReturnType<typeof setTimeout>;
  private generation = 0;

  setMetronomeEnabled(enabled: boolean) {
    this.metronomeEnabled = enabled;
    if (this.clickBus && this.context) this.clickBus.gain.setValueAtTime(enabled ? CLICK_VOLUME : 0, this.context.currentTime);
  }

  async play(plan: AuditionPlan, paint: (elapsed: number) => void, done: () => void, interrupted: () => void) {
    this.stop();
    const generation = this.generation;
    const context = this.context ??= new AudioContext({ latencyHint: 'interactive' });
    this.deadline = setTimeout(() => {
      if (this.generation === generation) { this.dispose(); interrupted(); }
    }, 15000);
    const notes = new Set(plan.sounds.flatMap(sound => sound.notes));
    const buffers = new Map<number, AudioBuffer>();
    // resume() must run synchronously inside the user gesture, before any sample fetch.
    const beats = auditionBeats(plan.bars);
    let nextBeat = beats.next();
    const hasBeats = !nextBeat.done;
    const [, clicks] = await Promise.all([
      context.resume(),
      hasBeats ? loadClickSamples(context, 'ableton-classic').catch(() => null) : null,
      ...Array.from(notes, async midi => {
        buffers.set(midi, await load(context, nearest(midi).url));
      }),
    ]);
    if (this.generation !== generation) return;
    clearTimeout(this.deadline);
    if (context.state !== 'running') throw new Error('piano-interrupted');
    context.onstatechange = () => { if (context.state !== 'running' && this.generation === generation) interrupted(); };
    const bus = this.bus = context.createGain();
    bus.gain.value = 0.85;
    bus.connect(context.destination);
    const clickBus = this.clickBus = clicks ? context.createGain() : undefined;
    if (clickBus) {
      clickBus.gain.value = this.metronomeEnabled ? CLICK_VOLUME : 0;
      clickBus.connect(bus);
    }
    const origin = context.currentTime + 0.025;
    let index = 0;
    const schedule = () => {
      const now = context.currentTime;
      const horizon = now + 0.25;
      while (clicks && clickBus && nextBeat.done === false) {
        const beat = nextBeat.value;
        const when = origin + beat.at;
        if (when > horizon) break;
        nextBeat = beats.next();
        if (when < now) continue;
        const click = context.createBufferSource();
        click.buffer = beat.accent ? clicks.accent : clicks.regular;
        click.connect(clickBus);
        this.sources.add(click);
        click.onended = () => { click.disconnect(); this.sources.delete(click); };
        click.start(when);
        click.stop(Math.min(when + click.buffer.duration, origin + plan.duration));
      }
      while (index < plan.sounds.length && origin + plan.sounds[index].start <= horizon) {
        const event = plan.sounds[index++];
        if (event.start >= event.end || origin + event.end <= context.currentTime) continue;
        for (const midi of event.notes) {
          const source = context.createBufferSource();
          const gain = context.createGain();
          const rate = 2 ** ((midi - nearest(midi).midi) / 12);
          const start = origin + event.start;
          const end = origin + event.end;
          source.buffer = buffers.get(midi)!;
          source.playbackRate.value = rate;
          gain.gain.setValueAtTime(1, start);
          gain.gain.setValueAtTime(1, Math.max(start, end - 0.065));
          gain.gain.linearRampToValueAtTime(0, end);
          source.connect(gain).connect(bus);
          this.sources.add(source);
          source.onended = () => { source.disconnect(); gain.disconnect(); this.sources.delete(source); };
          // If the main thread stalls, resume at the corresponding sample position.
          const late = Math.max(0, context.currentTime - start);
          source.start(start + late, Math.min(source.buffer.duration, late * rate));
          source.stop(end);
        }
      }
    };
    const refresh = () => {
      if (this.generation !== generation) return;
      const elapsed = context.currentTime - origin;
      if (elapsed >= plan.duration) { this.stop(); done(); return; }
      if (elapsed >= 0) paint(elapsed);
      this.frame = requestAnimationFrame(refresh);
    };
    schedule();
    this.timer = setInterval(schedule, 65);
    refresh();
    return { metronomeUnavailable: hasBeats && !clicks };
  }

  stop() {
    ++this.generation;
    clearInterval(this.timer);
    clearTimeout(this.deadline);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    if (this.context) this.context.onstatechange = null;
    this.clickBus?.disconnect();
    this.clickBus = undefined;
    this.bus?.disconnect();
    this.bus = undefined;
    for (const source of this.sources) source.stop();
    this.sources.clear();
  }

  dispose() {
    this.stop();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = undefined;
  }
}
