import type { PickupMeasure } from '../types';
import {
  applyJianpuAutoDurationShorthand, buildJianpuPlaceholderFromUnits,
  findJianpuNoteRanges, findJianpuPlaceholderRanges, getJianpuDurationUnits,
  rebuildJianpuNote, serializeJianpuBeatTokens, splitJianpuTokens
} from './jianpuUtils';
import { parseRhythmNotation, parseTimeSignature } from './rhythmUtils';

const EPSILON = 0.001;
export const PICKUP_EDITOR_SECTION_ID = '__chordmaster_pickup__';
export const PICKUP_EDITOR_BAR_ID = '__chordmaster_pickup_bar__';
type NoteEvent = { start: number; end: number; text: string };

/** This meter describes only the pickup's capacity; it never changes the song meter. */
export function normalizePickupTimeSignature(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^(\d+)\s*\/\s*(1|2|4|8|16)$/);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 32) return undefined;
  return `${Number(match[1])}/${match[2]}`;
}

export const getPickupTimeSignature = (pickup: PickupMeasure | undefined, meter: string) =>
  normalizePickupTimeSignature(pickup?.timeSignature) ?? meter;

export function pickupTimeSignatureForUnits(units: number): string {
  // Keep familiar quarter-note grouping whenever the duration allows it.
  for (const denominator of [4, 8, 16]) {
    const numerator = units / (16 / denominator);
    if (Math.abs(numerator - Math.round(numerator)) < EPSILON) return `${Math.round(numerator)}/${denominator}`;
  }
  return `${Math.ceil(units)}/16`;
}

function readNotes(notation: string | undefined, meter: string, literal = false): NoteEvent[] {
  const normalized = notation?.trim() ?? '';
  const tokens = normalized.includes('|') ? normalized.split('|') : splitJianpuTokens(normalized);
  const { beatUnits } = parseTimeSignature(meter);
  const events: NoteEvent[] = [];
  let end = 0;
  tokens.forEach((token, index) => {
    let cursor = Math.max(index * beatUnits, end);
    const placeholders = findJianpuPlaceholderRanges(token);
    const raw = findJianpuNoteRanges(token);
    const notes = literal ? raw : applyJianpuAutoDurationShorthand(raw, raw.length + placeholders.length, placeholders.length > 0, beatUnits);
    const items = [
      ...notes.map(note => ({ position: note.start, units: getJianpuDurationUnits(note.duration, note.dotted, note.triplet),
        text: rebuildJianpuNote(note, {}) })),
      ...placeholders.map(p => ({ position: p.start, units: p.units, text: '' }))
    ].sort((a, b) => a.position - b.position);
    items.forEach(item => {
      if (item.text) events.push({ start: cursor, end: cursor + item.units, text: item.text });
      cursor += item.units;
    });
    end = cursor;
  });
  return events;
}

function writeNotes(events: NoteEvent[], meter: string, offset = 0): string {
  const { beats, beatUnits } = parseTimeSignature(meter);
  const tokens = Array.from({ length: beats }, () => '');
  let end = 0;
  events.forEach(event => {
    const start = event.start - offset;
    const index = Math.max(0, Math.floor((start + EPSILON) / beatUnits));
    const cursor = Math.max(index * beatUnits, end);
    tokens[index] = (tokens[index] ?? '') + buildJianpuPlaceholderFromUnits(start - cursor) + event.text;
    end = event.end - offset;
  });
  return serializeJianpuBeatTokens(tokens);
}

function hasUnknownNotation(notation: string | undefined): boolean {
  const text = notation ?? '';
  const ranges = [...findJianpuNoteRanges(text), ...findJianpuPlaceholderRanges(text)].sort((a, b) => b.start - a.start);
  let remainder = text;
  ranges.forEach(range => { remainder = remainder.slice(0, range.start) + remainder.slice(range.end); });
  return Boolean(remainder.replace(/[\s|]/g, ''));
}

function sliceRhythm(notation: string, meter: string, start: number, end: number): string {
  const hidden: Record<string, string> = { q: 'qx', e: 'ex', s: 'sx', Q: 'qx.', E: 'ex.', S: 'sx.', x: 's3x', y: 'y' };
  return parseRhythmNotation(notation, meter).events.flatMap(event => {
    if (event.endUnit <= start + EPSILON || event.startUnit >= end - EPSILON) return [];
    if (!event.isHidden) return [event.token];
    const units = Math.min(end, event.endUnit) - Math.max(start, event.startUnit);
    return [...buildJianpuPlaceholderFromUnits(units)].map(char => hidden[char]);
  }).join(' ');
}

export function getPickupContentUnits(pickup: PickupMeasure, meter: string): number {
  const sourceMeter = getPickupTimeSignature(pickup, meter);
  return Math.max(0,
    ...[pickup.riff, ...(pickup.riffVoices ?? []).map(v => v.riff)].flatMap(riff => readNotes(riff, sourceMeter, Boolean(pickup.timeSignature)).map(n => n.end)),
    parseRhythmNotation(pickup.rhythm ?? '', sourceMeter).visibleEndUnit);
}

/** Returns null instead of discarding music when shortening an existing pickup. */
export function resizePickup(pickup: PickupMeasure, meter: string, timeSignature: string): PickupMeasure | null {
  const nextMeter = normalizePickupTimeSignature(timeSignature);
  if (!nextMeter) return null;
  const sourceMeter = getPickupTimeSignature(pickup, meter);
  const next = parseTimeSignature(nextMeter);
  const rhythm = parseRhythmNotation(pickup.rhythm ?? '', sourceMeter);
  if ([pickup.riff, ...(pickup.riffVoices ?? []).map(v => v.riff)].some(hasUnknownNotation)) return null;
  if (rhythm.invalidTokens.length) return null;
  if (!pickup.timeSignature && !rhythm.events.some(e => e.isSlash)) {
    const display = getPickupDisplay(pickup, meter);
    // On an explicit resize, remove the legacy grid's unused leading slots too.
    // Rests remain notes, so they are never mistaken for unused space.
    return resizePickup({ ...pickup, timeSignature: display.timeSignature,
      riff: display.riff, riffVoices: display.riffVoices, rhythm: display.rhythm }, meter, nextMeter);
  }
  if (getPickupContentUnits(pickup, meter) > next.barUnits + EPSILON) return null;
  if (rhythm.events.some(e => e.isSlash) && parseTimeSignature(sourceMeter).beatUnits !== next.beatUnits) return null;
  const reflow = (riff: string | undefined) => riff?.trim()
    ? serializeJianpuBeatTokens(writeNotes(readNotes(riff, sourceMeter, Boolean(pickup.timeSignature)), nextMeter).split('|').map(t => t.trim()), true)
    : riff;
  return {
    ...pickup, timeSignature: nextMeter, riff: reflow(pickup.riff),
    riffVoices: pickup.riffVoices?.map(voice => ({ ...voice, riff: reflow(voice.riff) ?? '' })),
    // Only remove trailing invisible editing slots, never rests or notes.
    rhythm: pickup.rhythm ? sliceRhythm(pickup.rhythm, sourceMeter, 0, next.barUnits) : pickup.rhythm
  };
}

/** Old pickups retain their stored timing; only the display drops unused outer slots. */
export function getPickupDisplay(pickup: PickupMeasure, meter: string) {
  const sourceMeter = getPickupTimeSignature(pickup, meter);
  const lines = [pickup.riff, ...(pickup.riffVoices ?? []).map(v => v.riff)].map(riff => readNotes(riff, sourceMeter, Boolean(pickup.timeSignature)));
  const rhythm = parseRhythmNotation(pickup.rhythm ?? '', sourceMeter);
  const visibleRhythm = rhythm.events.filter(e => !e.isHidden);
  const starts = [...lines.flatMap(notes => notes.map(n => n.start)), ...visibleRhythm.map(e => e.startUnit)];
  const hasContent = starts.length > 0;
  const explicit = Boolean(normalizePickupTimeSignature(pickup.timeSignature));
  // Keep sub-beat offsets intact; strip only complete, unused source beats.
  const offset = !explicit && hasContent
    ? Math.floor(Math.min(...starts) / parseTimeSignature(sourceMeter).beatUnits) * parseTimeSignature(sourceMeter).beatUnits : 0;
  const durationUnits = Math.max(1, explicit ? parseTimeSignature(sourceMeter).barUnits : getPickupContentUnits(pickup, meter) - offset);
  const timeSignature = explicit ? sourceMeter : pickupTimeSignatureForUnits(durationUnits);
  const displayRhythm = rhythm.invalidTokens.length ? pickup.rhythm : sliceRhythm(pickup.rhythm ?? '', sourceMeter, offset, offset + durationUnits);
  return {
    hasContent, durationUnits, timeSignature,
    riff: writeNotes(lines[0], timeSignature, offset),
    riffVoices: pickup.riffVoices?.map((voice, index) => ({ ...voice, riff: writeNotes(lines[index + 1], timeSignature, offset) })),
    // Slash lengths depend on the original beat grouping.
    rhythm: displayRhythm,
    rhythmTimeSignature: rhythm.events.some(e => e.isSlash) ? sourceMeter : timeSignature
  };
}
