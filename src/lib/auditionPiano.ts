import { auditionBeats, type AuditionPlan } from './chordAudition';
import { loadClickSamples } from './clickSamples';

const CLICK_VOLUME = 0.32;

const files = import.meta.glob<string>('../assets/audio/salamander/*.mp3', { eager: true, import: 'default', query: '?url' });
const samples = Object.entries(files).map(([name, url]) => ({ midi: Number(name.match(/(\d+)\.mp3$/)![1]), url }));
type PianoSample = { buffer: AudioBuffer; attackSeconds: number; sustain?: AudioBuffer };
const decoded = new Map<string, Promise<PianoSample>>();

// Measure the hammer transient in the decoded audio, including any decoder padding.
// Start the quiet lead-in before the grid so the acoustic attack lands on the click.
export function pianoAttackSeconds(buffer: Pick<AudioBuffer, 'getChannelData' | 'sampleRate'>) {
  const audio = buffer.getChannelData(0);
  const frames = Math.min(audio.length, Math.ceil(buffer.sampleRate * .1));
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(audio[i]));
  for (let i = 0; i < frames && peak > 0; i++) {
    if (Math.abs(audio[i]) >= peak * .1) return i / buffer.sampleRate;
  }
  return 0;
}
// The bundled notes fade out in their eighth second. For longer written holds,
// crossfade the ringing part into a loop so a barline never introduces a new attack.
function sustainedBuffer(context: AudioContext, sample: PianoSample) {
  if (sample.sustain) return sample.sustain;
  const original = sample.buffer;
  const rate = original.sampleRate;
  const frames = Math.round(rate * 5);
  const blend = Math.round(rate * .12);
  const result = context.createBuffer(original.numberOfChannels, frames, rate);
  for (let channel = 0; channel < original.numberOfChannels; channel++) {
    const source = original.getChannelData(channel);
    const output = result.getChannelData(channel);
    output.set(source.subarray(0, frames));
    for (let i = 0; i < blend; i++) {
      const mix = (1 - Math.cos(Math.PI * i / (blend - 1))) / 2;
      output[frames - blend + i] = source[frames - blend + i] * (1 - mix)
        + source[3 * rate - blend + i] * mix;
    }
  }
  sample.sustain = result;
  return result;
}

function nearest(midi: number) {
  return samples.reduce((best, sample) => Math.abs(midi - sample.midi) < Math.abs(midi - best.midi) ? sample : best);
}
function load(context: AudioContext, url: string) {
  const cached = decoded.get(url);
  if (cached) return cached;
  const pending = fetch(url, { signal: AbortSignal.timeout(12000) }).then(response => {
    if (!response.ok) throw new Error('piano-sample');
    return response.arrayBuffer();
  }).then(bytes => context.decodeAudioData(bytes))
    .then(buffer => ({ buffer, attackSeconds: pianoAttackSeconds(buffer) }))
    .catch(error => { decoded.delete(url); throw error; });
  decoded.set(url, pending);
  return pending;
}

/** One foreground playback at a time. Only the explicit play gesture opens the audio route. */
export class AuditionPiano {
  private context?: AudioContext;
  private bus?: GainNode;
  private clickBus?: GainNode;
  private melodyBus?: GainNode;
  private melodyEnabled = true;
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

  setMelodyEnabled(enabled: boolean) {
    this.melodyEnabled = enabled;
    if (this.melodyBus && this.context) this.melodyBus.gain.setValueAtTime(enabled ? 1 : 0, this.context.currentTime);
  }

  async play(plan: AuditionPlan, paint: (elapsed: number) => void, done: () => void, interrupted: () => void) {
    this.stop();
    const generation = this.generation;
    const context = this.context ??= new AudioContext({ latencyHint: 'interactive' });
    this.deadline = setTimeout(() => {
      if (this.generation === generation) { this.dispose(); interrupted(); }
    }, 15000);
    const notes = new Set(plan.sounds.flatMap(sound => sound.notes));
    const buffers = new Map<number, PianoSample>();
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
    if (plan.sounds.some(event => event.voice === 'melody')) {
      this.melodyBus = context.createGain();
      this.melodyBus.gain.value = this.melodyEnabled ? 1 : 0;
      this.melodyBus.connect(bus);
    }
    const clickBus = this.clickBus = clicks ? context.createGain() : undefined;
    if (clickBus) {
      clickBus.gain.value = this.metronomeEnabled ? CLICK_VOLUME : 0;
      clickBus.connect(bus);
    }
    const longestLead = Math.max(0, ...Array.from(buffers, ([midi, sample]) =>
      sample.attackSeconds / 2 ** ((midi - nearest(midi).midi) / 12)));
    const origin = context.currentTime + 0.025 + longestLead;
    let index = 0;
    const schedule = () => {
      const now = context.currentTime;
      const horizon = now + 0.25 + longestLead;
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
          const sample = buffers.get(midi)!;
          const attackStart = start - sample.attackSeconds / rate;
          const sustain = sample.buffer.duration >= 6 && (end - attackStart) * rate > sample.buffer.duration - 1;
          source.buffer = sustain ? sustainedBuffer(context, sample) : sample.buffer;
          if (sustain) {
            source.loop = true;
            source.loopStart = 3;
            source.loopEnd = 5;
          }
          source.playbackRate.value = rate;
          // Keep the previous harmony up to the change. A short release avoids a click
          // without fading out the whole ensemble in the last 65 ms of every chord.
          gain.gain.setValueAtTime(1, attackStart);
          gain.gain.setValueAtTime(1, Math.max(start, end - Math.min(.008, (end - start) / 4)));
          gain.gain.linearRampToValueAtTime(0, end);
          source.connect(gain).connect(event.voice === 'melody' ? this.melodyBus! : bus);
          this.sources.add(source);
          source.onended = () => { source.disconnect(); gain.disconnect(); this.sources.delete(source); };
          // If the main thread stalls, resume at the corresponding sample position.
          const late = Math.max(0, context.currentTime - attackStart);
          const offset = late * rate;
          source.start(attackStart + late, sustain && offset >= source.loopEnd
            ? source.loopStart + (offset - source.loopStart) % (source.loopEnd - source.loopStart)
            : Math.min(source.buffer.duration, offset));
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
    this.melodyBus?.disconnect();
    this.melodyBus = undefined;
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
