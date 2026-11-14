import type { Song } from '../types';
import { getParenthesizedChordInner } from '../utils/musicUtils';
import { getChordEvents } from '../utils/chordSubdivisions';
import { isClosedBar } from '../utils/closedBar';
import { getSongTempoStates } from '../utils/tempoEvents';
import { hasUnmeteredChords } from '../utils/unmeteredChords';
import { resolveAuditionChord, type Harmony } from './auditionChords';
import { getSongDisplayKeyStates, getSongKeyStates, getSongTimeSignatureStates } from './songEditing';

export type AuditionScope = 'chord' | 'bar' | 'section';
export interface AuditionTarget {
  sectionId: string;
  sectionOccurrence?: number;
  barId: string;
  slotIndex: number;
  offset?: number;
  orderedIndex?: number;
}
export interface AuditionBar {
  barId: string;
  start: number;
  end: number;
  firstBeat: number;
  beatSeconds: number;
  beats: number;
}
export interface AuditionNote { start: number; end: number; notes: number[] }
export interface AuditionPlan {
  sounds: AuditionNote[];
  bars: AuditionBar[];
  duration: number;
  fallbackTempo: boolean;
  issue?: { kind: 'timing' | 'key' | 'unsupported' | 'empty' | 'repeat'; token?: string };
}

/** Walk the printed beat grid, independently of the shifted chord attacks. */
export function* auditionBeats(bars: AuditionBar[]) {
  for (const bar of bars) {
    if (!Number.isFinite(bar.beatSeconds) || bar.beatSeconds <= 0) continue;
    for (let beat = Math.ceil(bar.firstBeat); ; beat++) {
      const at = bar.start + (beat - bar.firstBeat) * bar.beatSeconds;
      // Adjacent bars may reach their shared boundary by different floating-point sums.
      if (at >= bar.end - 1e-7) break;
      yield { at, accent: beat % bar.beats === 0 };
    }
  }
}

type Attack = { position: number; written: number; harmony: Harmony };
type TimedAttack = { at: number; harmony: Harmony };

function halfBeatShift(token: string) {
  const suffix = (value: string) => value.match(/[<>^~]+$/)?.[0] ?? '';
  const outer = suffix(token);
  const inner = getParenthesizedChordInner(token.slice(0, token.length - outer.length));
  const arrow = (outer + suffix(inner ?? '')).match(/[<>]/)?.[0];
  return arrow === '<' ? -0.5 : arrow === '>' ? 0.5 : 0;
}

/** Resolve overlaps on the audio timeline before deriving any note lengths. */
function renderAttacks(plan: AuditionPlan, events: TimedAttack[], origin: number) {
  events.sort((a, b) => a.at - b.at);
  for (const [index, event] of events.entries()) {
    const start = Math.max(0, event.at - origin);
    const next = events[index + 1];
    const end = next ? Math.min(plan.duration, next.at - origin) : plan.duration;
    if (end <= start) continue;
    if ('issue' in event.harmony) {
      plan.issue = { kind: event.harmony.issue, token: event.harmony.token };
      plan.duration = start;
      plan.bars = plan.bars.filter(span => span.start < start);
      const last = plan.bars.at(-1);
      if (last) last.end = start;
      break;
    }
    if (event.harmony.notes.length) plan.sounds.push({ start, end, notes: event.harmony.notes });
  }
  return plan;
}
const rest = /^(?:N\.?C\.?|0(?:_|h|w)?|R(?:_|h|w)?|rest(?:_|h|w)?|(?:whole|half|quarter|eighth|8th)_rest|\|\d{0,3}\|)$/i;

/** Work in printed order. The prefix supplies harmonic context, but never contributes elapsed playback time. */
export function buildChordAudition(song: Song, target: AuditionTarget, scope: AuditionScope): AuditionPlan {
  const plan: AuditionPlan = { sounds: [], bars: [], duration: 0, fallbackTempo: false };
  const sectionIndex = song.sections.map((section, index) => section.id === target.sectionId ? index : -1)
    .filter(index => index >= 0)[target.sectionOccurrence ?? 0];
  const startBar = song.sections[sectionIndex]?.bars.findIndex(bar => bar.id === target.barId) ?? -1;
  if (startBar < 0) return { ...plan, issue: { kind: 'empty' } };
  const written = getSongKeyStates(song).barActiveKeys;
  const sounding = getSongDisplayKeyStates(song).barActiveKeys;
  const meters = getSongTimeSignatureStates(song).barActiveTimeSignatures;
  const tempos = getSongTempoStates(song).barTempos;
  let meterKnown = !song.timeSignatureUnspecified;
  let keyKnown = !song.originalKeyUnspecified;
  let current: Harmony = { notes: [] };
  let previous: { attacks: Attack[]; meter: string } | undefined;
  const timeline: TimedAttack[] = [];
  let previousQuarterSeconds: number | undefined;
  let downbeat = 0;
  let origin = 0;
  let latestAttack = -Infinity;

  for (let s = 0; s <= sectionIndex; s++) {
    const section = song.sections[s];
    if (section.keyChangeTo) keyKnown = true;
    for (const [b, bar] of section.bars.entries()) {
      if (isClosedBar(bar)) continue;
      if (bar.keyChangeTo) keyKnown = true;
      const selected = s === sectionIndex && b === startBar;
      const audible = s === sectionIndex && b >= startBar;
      // The next downbeat can be anticipated inside the selected measure.
      const lookahead = scope === 'bar' && plan.bars.length > 0;
      const meter = meters[s][b];
      const [beats, denominator] = meter.split('/').map(Number);
      if (bar.timeSignature && !bar.partialMeasure) meterKnown = true;
      const known = meterKnown || Boolean(bar.timeSignature);
      const untimed = hasUnmeteredChords(bar) || bar.chordTimingUnspecified;
      const read = (token: string): Harmony => rest.test(token) ? { notes: [] }
        : resolveAuditionChord(token, written[s][b], sounding[s][b], Boolean(bar.chordKeyUnspecified) || !keyKnown);
      const offset = target.offset ?? 0;
      const cursor = target.slotIndex + offset;
      const single = selected && scope === 'chord';
      const bpm = tempos[s][b];
      const quarterSeconds = 60 / (bpm ?? 80);
      const beatSeconds = quarterSeconds * 4 / denominator;
      // For an anticipated downbeat the preceding tempo is still in effect.
      const attackTime = (position: number) => downbeat + position * (position < 0 && previousQuarterSeconds !== undefined
        ? previousQuarterSeconds * 4 / denominator : beatSeconds);
      let attacks: Attack[] = [];
      let repeated = false;
      let count = 1;
      const raw = getChordEvents(bar, beats).filter(event => event.beat >= 0 && event.beat < beats);
      const repeat = raw.some(event => event.chord === '%');

      if (single && untimed) {
        const tokens = bar.unmeteredChordLines?.flat() ?? bar.chords.filter(chord => chord.trim());
        const token = tokens[target.orderedIndex ?? 0];
        current = token ? read(token) : { notes: [] };
      } else if (!single && (untimed || !known || bar.chords.includes('||'))) {
        if (audible) {
          if (!lookahead) plan.issue = { kind: 'timing' };
          return renderAttacks(plan, timeline, origin);
        }
        current = { notes: [] };
        previous = undefined;
        previousQuarterSeconds = undefined;
        timeline.length = 0;
        latestAttack = -Infinity;
        continue;
      } else if (repeat) {
        if (!previous || previous.meter !== meter) {
          if (audible) {
            if (!lookahead) plan.issue = { kind: 'repeat' };
            return renderAttacks(plan, timeline, origin);
          }
          previous = undefined;
          current = { notes: [] };
          timeline.length = 0;
          latestAttack = -Infinity;
          continue;
        }
        attacks = previous.attacks;
        repeated = true;
      } else {
        let preceding = current;
        for (const event of raw) {
          const token = event.chord.trim();
          if (token === '/') continue;
          const multi = /^\|(\d{1,3})\|$/.exec(token);
          if (multi) count = Math.max(1, Number(multi[1]));
          let harmony = read(token);
          if (token.startsWith('/') && 'notes' in harmony && 'notes' in preceding) {
            harmony = { notes: [...harmony.notes, ...preceding.notes.slice(1)] };
          }
          const written = event.beat + event.offset;
          attacks.push({ written, position: written + halfBeatShift(token), harmony });
          preceding = harmony;
        }
        if (!raw.length) attacks.push({ position: 0, written: 0, harmony: { notes: [] } });
      }

      if (single) {
        if (!untimed) {
          // A shifted primary belongs to the selected beat even when its attack is later.
          const picked = !repeated && raw.find(e => e.beat === target.slotIndex &&
            (target.offset !== undefined ? e.offset === offset : e.subdivisionIndex === null));
          const selectedAttack = picked && attacks.find(event => event.written === picked.beat + picked.offset);
          if (selectedAttack) current = selectedAttack.harmony;
          else {
            // A held beat can inherit a late subdivision after an anticipated downbeat.
            for (const event of attacks) {
              const at = attackTime(event.position);
              if (at >= latestAttack && event.position <= cursor) {
                latestAttack = at;
                current = event.harmony;
              }
            }
          }
        }
        if ('issue' in current) plan.issue = { kind: current.issue, token: current.token };
        else if (!current.notes.length) plan.issue = { kind: 'empty' };
        else {
          plan.duration = 1.5;
          plan.sounds.push({ start: 0, end: plan.duration, notes: current.notes });
          plan.bars.push({ barId: bar.id!, start: 0, end: plan.duration, firstBeat: target.slotIndex, beats, beatSeconds: Infinity });
        }
        return plan;
      }

      attacks.sort((a, b) => a.position - b.position);
      // Repeat the original opening harmony as well as its later attacks.
      previous = { meter, attacks: attacks.length && attacks[0].position <= 0 ? attacks
        : [{ position: 0, written: 0, harmony: current }, ...attacks] };

      const first = selected && scope === 'section' ? cursor : 0;
      if (selected) origin = downbeat + first * beatSeconds;
      const nextDownbeat = downbeat + beats * count * beatSeconds;
      for (const event of attacks) {
        const at = attackTime(event.position);
        timeline.push({ at, harmony: event.harmony });
        if (at >= latestAttack) {
          latestAttack = at;
          current = event.harmony;
        }
      }
      if (lookahead) return renderAttacks(plan, timeline, origin);
      if (audible) {
        plan.fallbackTempo ||= bpm === undefined;
        const start = plan.duration;
        const end = nextDownbeat - origin;
        plan.bars.push({ barId: bar.id!, start, end, firstBeat: first, beats, beatSeconds });
        plan.duration = end;
      }
      downbeat = nextDownbeat;
      previousQuarterSeconds = quarterSeconds;
    }
  }
  return renderAttacks(plan, timeline, origin);
}
