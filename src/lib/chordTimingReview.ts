import type { Bar, Song } from '../types';
import { getChordBeatOffset } from '../utils/chordBeatOffsets';
import { getChordDisplaySlotEntries, getChordDisplaySlotOwnership } from '../utils/chordSlots';
import { hasUnmeteredChords } from '../utils/unmeteredChords';
import { getSongKeyStates, getSongTimeSignatureStates, type SongBarIdentity } from './songEditing';

export interface TimingReview {
  signature: string;
  tokens: string[];
  positions: number[];
  beats: number;
  count: number;
  manual: boolean;
}

export const timingBarKey = (sectionId: string, barId: string) => JSON.stringify([sectionId, barId]);

// Repeated chords and slash basses are significant. A standalone slash sustains the previous chord.
export const movableHarmony = (token: string) => /^(?:\(?[A-G]|\(?[#b]?[1-7]|\/[A-G1-7])/.test(token.trim());

export function indexTimingReviews(song: Song) {
  const result = new Map<string, TimingReview>();
  if (!song.sections.some(section => section.bars.some(bar => bar.chordTimingUnspecified))) return result;
  const meters = getSongTimeSignatureStates(song).barActiveTimeSignatures;
  const keys = getSongKeyStates(song).barActiveKeys;
  const groups = new Map<string, { tokens: string[]; beats: number; pending: string[]; examples: Map<string, number[]> }>();

  song.sections.forEach((section, s) => section.bars.forEach((bar, b) => {
    if (!section.id || !bar.id || bar.closed || hasUnmeteredChords(bar) || bar.chordPassVariants?.length
        || bar.chordSubdivisions?.length || Object.values(bar.chordMarks ?? {}).some(mark => mark.beatOffset)) return;
    const meter = meters[s][b];
    const beats = parseInt(meter, 10);
    const written = bar.chords.map(chord => chord.trim());
    const tokens = written.filter(chord => chord && chord !== '/');
    if (!tokens.length || tokens.length > beats || !tokens.every(movableHarmony)) return;
    // A pending sequence with literal placeholders needs its own manual interpretation.
    if (bar.chordTimingUnspecified ? written.includes('/') : written.slice(beats).some(Boolean)) return;
    const signature = JSON.stringify([meter, keys[s][b], !!bar.chordKeyUnspecified, !!bar.partialMeasure, tokens]);
    const group = groups.get(signature) ?? { tokens, beats, pending: [], examples: new Map<string, number[]>() };
    groups.set(signature, group);
    if (bar.chordTimingUnspecified) {
      group.pending.push(timingBarKey(section.id, bar.id));
    }
    // A legacy sequence can already carry a proposed beat grid through empty slots.
    if (!bar.chordTimingUnspecified || (written.some(chord => !chord) && written.length <= beats)) {
      const positions = getChordDisplaySlotEntries(written, beats).flatMap((entry, i) => entry && entry.chord !== '/' ? [i] : []);
      if (positions.length === tokens.length) group.examples.set(positions.join(','), positions);
    }
  }));

  groups.forEach(({ tokens, beats, pending, examples }, signature) => {
    if (!pending.length) return;
    const agreed = examples.size === 1 ? examples.values().next().value : undefined;
    const positions = agreed ?? tokens.map((_, i) => Math.floor(i * beats / tokens.length));
    const manual = examples.size > 1 || (!examples.size && beats % tokens.length !== 0);
    const review = { signature, tokens, positions, beats, manual, count: pending.length };
    pending.forEach(id => result.set(id, review));
  });
  return result;
}

export function barWithReviewedTiming(bar: Bar, review: TimingReview, positions = review.positions): Bar {
  const chords: string[] = Array.from({ length: review.beats }, (_, beat) => beat < positions[0] ? '' : '/');
  const marks: NonNullable<Bar['chordMarks']> = {};
  let index = 0;
  bar.chords.forEach((token, raw) => {
    if (!token.trim()) return;
    const beat = positions[index++];
    chords[beat] = token;
    if (bar.chordMarks?.[raw]) marks[beat] = bar.chordMarks[raw];
  });
  return { ...bar, chords, chordTimingUnspecified: undefined, chordMarks: Object.keys(marks).length ? marks : undefined };
}

export type ChartTimingEdit =
  | { kind: 'review'; review: TimingReview; positions: number[] }
  | { kind: 'move'; source: BeatMove; to: number; beats: number };

export interface ChartTimingControls {
  reviews: Map<string, TimingReview>;
  onEdit: (target: SongBarIdentity, edit: ChartTimingEdit) => void;
}

export function confirmChordTiming(song: Song, target: SongBarIdentity, expected: TimingReview, positions: number[], matching: boolean) {
  const reviews = indexTimingReviews(song);
  const targetKey = timingBarKey(target.sectionId, target.barId);
  const review = reviews.get(targetKey);
  if (!review || review.signature !== expected.signature || (matching && review.count !== expected.count)
      || review.manual !== expected.manual || review.positions.some((beat, i) => beat !== expected.positions[i])
      || positions.length !== review.tokens.length || positions.some((beat, i) =>
        !Number.isInteger(beat) || beat < 0 || beat >= review.beats || (i > 0 && positions[i - 1] >= beat))) return song;
  const sections = song.sections.map(section => {
    let changed = false;
    const bars = section.bars.map(bar => {
      const key = timingBarKey(section.id!, bar.id!);
      if (reviews.get(key) !== review || (!matching && key !== targetKey)) return bar;
      changed = true;
      return barWithReviewedTiming(bar, review, positions);
    });
    return changed ? { ...section, bars } : section;
  });
  return { ...song, sections };
}

export interface BeatMove {
  beat: number;
  offset: number;
  chord: string;
}

export function moveChordToBeat(bar: Bar, beats: number, source: BeatMove, to: number): Bar {
  if (bar.closed || hasUnmeteredChords(bar) || bar.chordTimingUnspecified || !movableHarmony(source.chord)
      || !Number.isInteger(to) || to < 0 || to >= beats || to === source.beat || bar.chords.slice(beats).some(chord => chord.trim())) return bar;
  const ownership = getChordDisplaySlotOwnership(bar.chords, beats);
  const destination = ownership[to];
  const subdivisions = bar.chordSubdivisions ?? [];
  if (destination?.covered || subdivisions.some(entry => entry.beat === to && entry.offset === source.offset)) return bar;

  const extra = subdivisions.find(entry => entry.beat === source.beat && entry.offset === source.offset && entry.chord === source.chord);
  if (extra) {
    if (destination && (getChordBeatOffset(bar, destination.rawIndex) === source.offset || /^(?:0|%|\|)/.test(destination.chord))) return bar;
    return { ...bar, chordSubdivisions: subdivisions.map(entry => entry === extra ? { ...entry, beat: to } : entry)
      .sort((a, b) => a.beat - b.beat || a.offset - b.offset) };
  }
  const start = ownership[source.beat];
  if (!start || start.covered || start.chord !== source.chord || (getChordBeatOffset(bar, start.rawIndex) ?? 0) !== source.offset
      || (destination && destination.chord !== '/')) return bar;
  if (destination && bar.chordMarks?.[destination.rawIndex]) return bar;
  const entries = getChordDisplaySlotEntries(bar.chords, beats);
  const chords = entries.map(entry => entry?.chord ?? '');
  chords[source.beat] = destination?.chord ?? '';
  chords[to] = source.chord;
  const marks: NonNullable<Bar['chordMarks']> = {};
  entries.forEach((entry, beat) => {
    const mark = entry && bar.chordMarks?.[entry.rawIndex];
    if (mark) marks[beat === source.beat ? to : beat] = mark;
  });
  return { ...bar, chords, chordMarks: Object.keys(marks).length ? marks : undefined };
}
