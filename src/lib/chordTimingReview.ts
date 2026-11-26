import type { Bar, ChordMark, Song } from '../types';
import { canOffsetChord, getChordBeatOffset, normalizeChordBeatOffset } from '../utils/chordBeatOffsets';
import { getChordDisplaySlotEntries, getChordDisplaySlotOwnership } from '../utils/chordSlots';
import { hasUnmeteredChords } from '../utils/unmeteredChords';
import { findSongBar, getBeatCount, updateBarById, getSongKeyStates, getSongTimeSignatureStates, type SongBarIdentity } from './songEditing';

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

export type ChordBeatOffsetValue = 0 | 0.25 | 0.5 | 0.75;

export type ChartTimingEdit =
  | { kind: 'review'; review: TimingReview; positions: number[] }
  | { kind: 'move'; source: BeatMove; to: number; toOffset?: ChordBeatOffsetValue; beats: number }
  | { kind: 'transfer'; source: BeatMove; beats: number; destination: ChartBeatTarget | null };

export interface ChartBeatTarget extends SongBarIdentity {
  beat: number;
  beats: number;
  offset?: ChordBeatOffsetValue;
}

export interface MoveChordOptions {
  targetOffset?: ChordBeatOffsetValue;
  swap?: boolean;
}

export type ChordDropOutcome = 'same' | 'allow' | 'swap' | 'blocked';

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

const isValidOffset = (value: number): value is ChordBeatOffsetValue =>
  value === 0 || value === 0.25 || value === 0.5 || value === 0.75;

const canHoldOffset = (chord: string, offset: ChordBeatOffsetValue) =>
  offset === 0 || (canOffsetChord(chord) && !/[<>]/.test(chord));

const hasVisualMark = (mark?: ChordMark) => Boolean(mark?.color || mark?.special);

function markWithOffset(mark: ChordMark | undefined, offset: ChordBeatOffsetValue): ChordMark | undefined {
  const next: ChordMark = { ...mark };
  const beatOffset = normalizeChordBeatOffset(offset);
  if (beatOffset) next.beatOffset = beatOffset;
  else delete next.beatOffset;
  return Object.values(next).some(value => value !== undefined && value !== false) ? next : undefined;
}

// Expand legacy compact measures before changing one slot so the other chords keep their beats.
function writePrimary(bar: Bar, beats: number, beat: number, chord: string, mark?: ChordMark): Bar {
  const entries = getChordDisplaySlotEntries(bar.chords, beats);
  const chords = entries.map(entry => entry?.chord ?? '');
  const marks: NonNullable<Bar['chordMarks']> = {};
  entries.forEach((entry, index) => {
    const existing = entry && bar.chordMarks?.[entry.rawIndex];
    if (index !== beat && existing) marks[index] = existing;
  });
  chords[beat] = chord;
  if (mark) marks[beat] = mark;
  return { ...bar, chords, chordMarks: Object.keys(marks).length ? marks : undefined };
}

interface LocatedBarEvent {
  kind: 'primary' | 'subdivision';
  chord: string;
  beat: number;
  offset: ChordBeatOffsetValue;
  mark?: ChordMark;
}

function locateBarEvent(bar: Bar, beats: number, beat: number, offset: ChordBeatOffsetValue, expectedChord?: string): LocatedBarEvent | null {
  const ownership = getChordDisplaySlotOwnership(bar.chords, beats);
  const owner = ownership[beat];
  if (owner?.covered) return null;
  const extras = bar.chordSubdivisions ?? [];
  const additional = extras.find(e => e.beat === beat && e.offset === offset && (expectedChord === undefined || e.chord === expectedChord));
  const primaryOffset = owner ? (getChordBeatOffset(bar, owner.rawIndex) ?? 0) : 0;
  const primaryMatches = Boolean(owner && primaryOffset === offset && (expectedChord === undefined || owner.chord === expectedChord));
  if (primaryMatches && additional) return null;
  if (primaryMatches && owner) {
    return { kind: 'primary', chord: owner.chord, beat, offset, mark: bar.chordMarks?.[owner.rawIndex] };
  }
  if (additional) {
    return { kind: 'subdivision', chord: additional.chord, beat, offset };
  }
  return null;
}

function removeBarEvent(bar: Bar, beats: number, event: LocatedBarEvent, replacement = ''): Bar {
  if (event.kind === 'subdivision') {
    const remaining = (bar.chordSubdivisions ?? []).filter(
      e => !(e.beat === event.beat && e.offset === event.offset && e.chord === event.chord)
    );
    return { ...bar, chordSubdivisions: remaining.length ? remaining : undefined };
  }
  return writePrimary(bar, beats, event.beat, replacement);
}

function placeBarEvent(
  bar: Bar,
  beats: number,
  beat: number,
  offset: ChordBeatOffsetValue,
  chord: string,
  mark: ChordMark | undefined,
  preferPrimary: boolean
): Bar | null {
  if (!canHoldOffset(chord, offset)) return null;
  const ownership = getChordDisplaySlotOwnership(bar.chords, beats);
  const owner = ownership[beat];
  const extras = bar.chordSubdivisions ?? [];
  if (owner?.covered || (owner && /^(?:0|%|\|)/.test(owner.chord))) return null;
  if (extras.some(e => e.beat === beat && e.offset === offset)) return null;
  const ownerOffset = owner ? (getChordBeatOffset(bar, owner.rawIndex) ?? 0) : 0;
  const ownerIsPlainSlash = Boolean(owner && owner.chord === '/' && !bar.chordMarks?.[owner.rawIndex]);

  if (offset === 0) {
    if (owner && !ownerIsPlainSlash) {
      if (ownerOffset === 0) return null;
      if (hasVisualMark(bar.chordMarks?.[owner.rawIndex])) return null;
      const subdivisions = [...extras, { beat, offset: ownerOffset as 0.25 | 0.5 | 0.75, chord: owner.chord }]
        .sort((a, b) => a.beat - b.beat || a.offset - b.offset);
      return { ...writePrimary(bar, beats, beat, chord, markWithOffset(mark, 0)), chordSubdivisions: subdivisions };
    }
    return writePrimary(bar, beats, beat, chord, markWithOffset(mark, 0));
  }

  if (preferPrimary || hasVisualMark(mark)) {
    if (!owner || ownerIsPlainSlash) {
      return writePrimary(bar, beats, beat, chord, markWithOffset(mark, offset));
    }
    if (hasVisualMark(mark) || ownerOffset === offset) return null;
    const subdivisions = [...extras, { beat, offset, chord }]
      .sort((a, b) => a.beat - b.beat || a.offset - b.offset);
    return { ...bar, chordSubdivisions: subdivisions };
  }

  if (owner && ownerOffset === offset) return null;
  const subdivisions = [...extras, { beat, offset, chord }]
    .sort((a, b) => a.beat - b.beat || a.offset - b.offset);
  return { ...bar, chordSubdivisions: subdivisions };
}

export function moveChordToBeat(bar: Bar, beats: number, source: BeatMove, to: number, options: MoveChordOptions = {}): Bar {
  const targetOffset = (options.targetOffset ?? source.offset) as ChordBeatOffsetValue;
  if (bar.closed || hasUnmeteredChords(bar) || bar.chordTimingUnspecified || !movableHarmony(source.chord)
      || !Number.isInteger(to) || to < 0 || to >= beats || !isValidOffset(source.offset) || !isValidOffset(targetOffset)
      || (to === source.beat && targetOffset === source.offset)
      || bar.chords.slice(beats).some(chord => chord.trim())) return bar;

  const sourceEvent = locateBarEvent(bar, beats, source.beat, source.offset, source.chord);
  if (!sourceEvent) return bar;

  const existingDest = locateBarEvent(bar, beats, to, targetOffset);
  const destIsPlainSlash = Boolean(existingDest && existingDest.kind === 'primary' && existingDest.chord === '/' && !existingDest.mark);

  if (existingDest && !destIsPlainSlash) {
    if (!options.swap || !movableHarmony(existingDest.chord)) return bar;
    const cleared = removeBarEvent(removeBarEvent(bar, beats, sourceEvent), beats, existingDest);
    const withSource = placeBarEvent(
      cleared, beats, to, targetOffset, sourceEvent.chord, sourceEvent.mark,
      targetOffset === 0 || sourceEvent.kind === 'primary'
    );
    if (!withSource) return bar;
    const withBoth = placeBarEvent(
      withSource, beats, source.beat, source.offset, existingDest.chord, existingDest.mark,
      source.offset === 0 || existingDest.kind === 'primary'
    );
    return withBoth ?? bar;
  }

  const slashToSource = destIsPlainSlash && sourceEvent.kind === 'primary' && source.offset === 0 && to !== source.beat ? '/' : '';
  const withoutSource = removeBarEvent(bar, beats, sourceEvent, slashToSource);
  const placed = placeBarEvent(
    withoutSource, beats, to, targetOffset, sourceEvent.chord, sourceEvent.mark,
    targetOffset === 0 || sourceEvent.kind === 'primary'
  );
  return placed ?? bar;
}

function editableBeat(song: Song, target: ChartBeatTarget) {
  const bar = findSongBar(song, target)?.bar;
  if (!bar || bar.closed || bar.chordTimingUnspecified || hasUnmeteredChords(bar)
      || getBeatCount(song, bar) !== target.beats || !Number.isInteger(target.beat)
      || target.beat < 0 || target.beat >= target.beats || bar.chords.slice(target.beats).some(c => c.trim())) return null;
  return bar;
}

/** Move within or between two measures, optionally swapping, or remove a single event as one history entry. */
export function transferChartChord(
  song: Song,
  origin: ChartBeatTarget,
  source: BeatMove,
  destination: ChartBeatTarget | null,
  options: { swap?: boolean } = {}
): Song {
  const bar = editableBeat(song, origin);
  if (!bar || source.beat !== origin.beat || !movableHarmony(source.chord) || !isValidOffset(source.offset)) return song;
  const sourceEvent = locateBarEvent(bar, origin.beats, source.beat, source.offset, source.chord);
  if (!sourceEvent) return song;

  if (!destination) {
    return updateBarById(song, origin, () => removeBarEvent(bar, origin.beats, sourceEvent));
  }

  const targetOffset = (destination.offset ?? source.offset) as ChordBeatOffsetValue;
  if (!isValidOffset(targetOffset)) return song;

  if (destination.barId === origin.barId && destination.sectionId === origin.sectionId) {
    const moved = moveChordToBeat(bar, origin.beats, source, destination.beat, { targetOffset, swap: options.swap });
    return moved === bar ? song : updateBarById(song, origin, () => moved);
  }

  const dest = editableBeat(song, destination);
  if (!dest) return song;

  const existingDest = locateBarEvent(dest, destination.beats, destination.beat, targetOffset);
  const destIsPlainSlash = Boolean(existingDest && existingDest.kind === 'primary' && existingDest.chord === '/' && !existingDest.mark);

  if (existingDest && !destIsPlainSlash) {
    if (!options.swap || !movableHarmony(existingDest.chord)) return song;
    const nextDest = placeBarEvent(
      removeBarEvent(dest, destination.beats, existingDest),
      destination.beats, destination.beat, targetOffset,
      sourceEvent.chord, sourceEvent.mark,
      targetOffset === 0 || sourceEvent.kind === 'primary'
    );
    const nextOrigin = placeBarEvent(
      removeBarEvent(bar, origin.beats, sourceEvent),
      origin.beats, source.beat, source.offset,
      existingDest.chord, existingDest.mark,
      source.offset === 0 || existingDest.kind === 'primary'
    );
    if (!nextDest || !nextOrigin) return song;
    return updateBarById(updateBarById(song, destination, () => nextDest), origin, () => nextOrigin);
  }

  const nextDest = placeBarEvent(
    dest, destination.beats, destination.beat, targetOffset,
    sourceEvent.chord, sourceEvent.mark,
    targetOffset === 0 || sourceEvent.kind === 'primary'
  );
  if (!nextDest) return song;
  const nextOrigin = removeBarEvent(bar, origin.beats, sourceEvent);
  return updateBarById(updateBarById(song, destination, () => nextDest), origin, () => nextOrigin);
}

/** Classify a candidate drop target without mutating the score. */
export function inspectChartChordDrop(
  song: Song,
  origin: ChartBeatTarget,
  source: BeatMove,
  destination: ChartBeatTarget,
  options: { swap?: boolean } = {}
): ChordDropOutcome {
  const targetOffset = (destination.offset ?? source.offset) as ChordBeatOffsetValue;
  if (destination.barId === origin.barId && destination.sectionId === origin.sectionId
      && destination.beat === source.beat && targetOffset === source.offset) {
    return 'same';
  }
  const next = transferChartChord(song, origin, source, destination, options);
  if (next === song) return 'blocked';
  const destBar = findSongBar(song, destination)?.bar;
  if (!destBar) return 'allow';
  const existing = locateBarEvent(destBar, destination.beats, destination.beat, targetOffset);
  const plainSlash = Boolean(existing && existing.kind === 'primary' && existing.chord === '/' && !existing.mark);
  return existing && !plainSlash ? 'swap' : 'allow';
}
