/**
 * Pure immutable jianpu commands shared by editor surfaces.
 *
 * Long-lived cursors are semantic (beat/unit/note ordinal). Character offsets
 * are deliberately kept private because canonical spacing and fixed-do display
 * conversion can change them without changing the musical target.
 */
import type { Bar, Key, Song } from '../types';
import {
  type JianpuAccidental,
  type JianpuDuration,
  type JianpuInputMode,
  type JianpuNoteRange,
  type JianpuOctave,
  absoluteJianpuPartsToRelative,
  buildJianpuNoteFromMode,
  buildJianpuPlaceholder,
  buildJianpuPlaceholderFromUnits,
  clampRelativeOctave,
  convertAbsoluteJianpuToRelativeNotation,
  convertRelativeJianpuToAbsoluteNotation,
  findJianpuNoteRanges,
  findJianpuPlaceholderRanges,
  getJianpuDurationUnits,
  getCanonicalJianpuBeatTokens,
  getCanonicalJianpuNotation,
  rebuildJianpuNote,
  replaceJianpuRange,
  serializeJianpuBeatTokens
} from '../utils/jianpuUtils';
import { getEffectiveTimeSignature, parseTimeSignature } from '../utils/rhythmUtils';
import {
  getPlayKey,
  getTransposeOffset,
  transposeKeyWithPreference
} from '../utils/musicUtils';
import { findSongBar, type SongBarIdentity } from './songEditing';

export type JianpuPitch = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7';

export interface JianpuCursor {
  /** Zero-based grouped beat index (6/8 therefore has two beats). */
  beatIndex: number;
  /** Sixteenth-note unit within the grouped beat. */
  unitIndex: number;
  /** Ordinal among notes stored in the beat; null means an insertion point. */
  noteIndex: number | null;
}

export type JianpuAction =
  | { type: 'insert-pitch'; pitch: JianpuPitch }
  | { type: 'insert-rest' }
  | { type: 'insert-hold' }
  | { type: 'set-duration'; duration: JianpuDuration }
  | { type: 'set-octave'; octave: JianpuOctave }
  | { type: 'set-accidental'; accidental: JianpuAccidental }
  | { type: 'toggle-dot' }
  | { type: 'toggle-triplet' }
  | { type: 'toggle-slur' }
  | { type: 'delete'; direction?: 'backward' | 'forward' }
  | { type: 'move'; direction: -1 | 1 }
  | { type: 'clear-formatting' };

export interface JianpuCommandResult {
  song: Song;
  target: SongBarIdentity;
  cursor: JianpuCursor;
  inputMode: JianpuInputMode;
  error: string | null;
}

export interface JianpuNoteLayout {
  noteIndex: number;
  unitStart: number;
  unitEnd: number;
  pitch: string;
  accidental: string;
  octave: JianpuOctave;
  duration: JianpuDuration;
  dotted: boolean;
  triplet: boolean;
  slurStart: boolean;
  slurEnd: boolean;
}

export interface JianpuPlaceholderLayout {
  unitStart: number;
  unitEnd: number;
  triplet: boolean;
}

export interface JianpuBeatLayout {
  beatIndex: number;
  beatUnits: number;
  carryInUnits: number;
  carryOutUnits: number;
  usedUnits: number;
  notes: JianpuNoteLayout[];
  placeholders: JianpuPlaceholderLayout[];
}

export interface JianpuBarLayout {
  timeSignature: string;
  beatUnits: number;
  tokens: string[];
  beats: JianpuBeatLayout[];
}

export interface JianpuInputAvailability {
  remainingUnits: number;
  canQuarter: boolean;
  canEighth: boolean;
  canSixteenth: boolean;
  canDot: boolean;
  canTriplet: boolean;
}

/**
 * Optional sounding-key overrides supplied by preview surfaces. Setlist
 * previews can reorder sections and apply a key/capo override without changing
 * the source-song JSON, so fixed-do conversion must use these effective keys.
 */
export interface JianpuPitchContext {
  playKeyBySectionId?: Readonly<Record<string, Key>>;
  pickupPlayKey?: Key;
}

export const DEFAULT_JIANPU_INPUT_MODE: JianpuInputMode = {
  duration: 'quarter',
  octave: 0,
  dotted: false,
  triplet: false,
  accidental: ''
};

const EPSILON = 0.001;

type InternalNoteItem = {
  kind: 'note';
  tokenIndex: number;
  noteIndex: number;
  charStart: number;
  charEnd: number;
  unitStart: number;
  unitEnd: number;
  absoluteUnitStart: number;
  absoluteUnitEnd: number;
  units: number;
  note: JianpuNoteRange;
};

type InternalPlaceholderItem = {
  kind: 'placeholder';
  tokenIndex: number;
  charStart: number;
  charEnd: number;
  unitStart: number;
  unitEnd: number;
  absoluteUnitStart: number;
  absoluteUnitEnd: number;
  units: number;
  duration: JianpuDuration;
  dotted: boolean;
  triplet: boolean;
};

type InternalItem = InternalNoteItem | InternalPlaceholderItem;

interface InternalBeatLayout extends JianpuBeatLayout {
  token: string;
  items: InternalItem[];
  occupiedEndUnits: number;
}

interface JianpuBarContext {
  sectionIndex: number;
  barIndex: number;
  bar: Bar;
  timeSignature: string;
  beatUnits: number;
  tokens: string[];
  beats: InternalBeatLayout[];
}

interface StringUpdate {
  tokenIndex: number;
  start: number;
  end: number;
  replacement: string;
}

const normalizeAccidental = (value: string | undefined): JianpuAccidental => (
  value?.includes('#') ? '#' : value?.includes('b') ? 'b' : ''
);

const getNoteUnits = (note: Pick<JianpuNoteRange, 'duration' | 'dotted' | 'triplet'>): number => (
  getJianpuDurationUnits(note.duration, note.dotted, note.triplet)
);

const normalizeInputMode = (mode: JianpuInputMode): JianpuInputMode => {
  const triplet = mode.duration !== 'sixteenth' && Boolean(mode.triplet);
  return {
    ...mode,
    octave: Number.isFinite(mode.octave) ? Math.trunc(mode.octave) : 0,
    dotted: triplet || mode.duration === 'sixteenth' ? false : mode.dotted,
    triplet,
    accidental: normalizeAccidental(mode.accidental)
  };
};

export const fitJianpuInputModeToUnits = (
  mode: JianpuInputMode,
  availableUnits: number
): JianpuInputMode => {
  const normalized = normalizeInputMode(mode);
  if (availableUnits <= EPSILON) return normalized;
  if (getJianpuDurationUnits(normalized.duration, normalized.dotted, normalized.triplet) <= availableUnits + EPSILON) {
    return normalized;
  }
  if (
    normalized.dotted &&
    getJianpuDurationUnits(normalized.duration, false, normalized.triplet) <= availableUnits + EPSILON
  ) {
    return { ...normalized, dotted: false };
  }
  const duration = (['quarter', 'eighth', 'sixteenth'] as JianpuDuration[])
    .find((candidate) => getJianpuDurationUnits(candidate, false, normalized.triplet && candidate !== 'sixteenth') <= availableUnits + EPSILON);
  return duration ? { ...normalized, duration, dotted: false, triplet: normalized.triplet && duration !== 'sixteenth' } : normalized;
};

const buildContext = (song: Song, target: SongBarIdentity): JianpuBarContext | null => {
  const located = findSongBar(song, target);
  if (!located) return null;
  const timeSignature = getEffectiveTimeSignature(located.bar.timeSignature, song.timeSignature);
  const { beatUnits } = parseTimeSignature(timeSignature);
  const tokens = getCanonicalJianpuBeatTokens(located.bar.riff, timeSignature);
  let carryUnits = 0;

  const beats: InternalBeatLayout[] = tokens.map((token, tokenIndex) => {
    const rawItems = [
      ...findJianpuNoteRanges(token).map((note) => ({
        kind: 'note' as const,
        charStart: note.start,
        charEnd: note.end,
        units: getNoteUnits(note),
        note
      })),
	      ...findJianpuPlaceholderRanges(token).map((placeholder) => ({
	        kind: 'placeholder' as const,
	        charStart: placeholder.start,
	        charEnd: placeholder.end,
	        units: getJianpuDurationUnits(placeholder.duration, placeholder.dotted, placeholder.triplet),
	        duration: placeholder.duration,
	        dotted: placeholder.dotted,
	        triplet: placeholder.triplet
	      }))
    ].sort((left, right) => left.charStart - right.charStart || left.charEnd - right.charEnd);

    const carryInUnits = carryUnits;
    let unitCursor = carryInUnits;
    let noteIndex = 0;
    const items: InternalItem[] = rawItems.map((item) => {
      const unitStart = unitCursor;
      const unitEnd = unitStart + item.units;
      unitCursor = unitEnd;
      const base = {
        tokenIndex,
        charStart: item.charStart,
        charEnd: item.charEnd,
        unitStart,
        unitEnd,
        absoluteUnitStart: tokenIndex * beatUnits + unitStart,
        absoluteUnitEnd: tokenIndex * beatUnits + unitEnd,
        units: item.units
      };
      if (item.kind === 'note') {
        return { ...base, kind: 'note', noteIndex: noteIndex++, note: item.note };
      }
      return {
        ...base,
        kind: 'placeholder',
        duration: item.duration,
        dotted: item.dotted,
        triplet: item.triplet
      };
    });
    const localNoteUnits = items
      .filter((item): item is InternalNoteItem => item.kind === 'note')
      .reduce((total, item) => total + item.units, 0);
    carryUnits = Math.max(0, unitCursor - beatUnits);

    const notes = items
      .filter((item): item is InternalNoteItem => item.kind === 'note')
      .map((item): JianpuNoteLayout => ({
        noteIndex: item.noteIndex,
        unitStart: item.unitStart,
        unitEnd: item.unitEnd,
        pitch: item.note.pitch,
        accidental: item.note.accidental,
        octave: item.note.octave,
	        duration: item.note.duration,
	        dotted: item.note.dotted,
	        triplet: item.note.triplet,
	        slurStart: item.note.slurStart,
	        slurEnd: item.note.slurEnd
      }));
    const placeholders = items
      .filter((item): item is InternalPlaceholderItem => item.kind === 'placeholder')
	      .map((item): JianpuPlaceholderLayout => ({
	        unitStart: item.unitStart,
	        unitEnd: item.unitEnd,
	        triplet: item.triplet
	      }));

    return {
      beatIndex: tokenIndex,
      beatUnits,
      token,
      items,
      carryInUnits,
      carryOutUnits: carryUnits,
      usedUnits: carryInUnits + localNoteUnits,
      occupiedEndUnits: unitCursor,
      notes,
      placeholders
    };
  });

  return {
    sectionIndex: located.sectionIndex,
    barIndex: located.barIndex,
    bar: located.bar,
    timeSignature,
    beatUnits,
    tokens,
    beats
  };
};

export const getJianpuBarLayout = (
  song: Song,
  target: SongBarIdentity
): JianpuBarLayout | null => {
  const context = buildContext(song, target);
  if (!context) return null;
  return {
    timeSignature: context.timeSignature,
    beatUnits: context.beatUnits,
    tokens: [...context.tokens],
    beats: context.beats.map((beat) => ({
      beatIndex: beat.beatIndex,
      beatUnits: beat.beatUnits,
      carryInUnits: beat.carryInUnits,
      carryOutUnits: beat.carryOutUnits,
      usedUnits: beat.usedUnits,
      notes: beat.notes.map((note) => ({ ...note })),
      placeholders: beat.placeholders.map((placeholder) => ({ ...placeholder }))
    }))
  };
};

const clampCursor = (context: JianpuBarContext, cursor: JianpuCursor): JianpuCursor => {
  const beatIndex = Math.max(0, Math.min(context.beats.length - 1, Math.trunc(cursor.beatIndex)));
  const beat = context.beats[beatIndex];
  const selectedNote = cursor.noteIndex === null
    ? null
    : beat.items.find((item): item is InternalNoteItem => (
      item.kind === 'note' && item.noteIndex === cursor.noteIndex
    )) ?? null;
  if (selectedNote) {
    return {
      beatIndex,
      unitIndex: selectedNote.unitStart,
      noteIndex: selectedNote.noteIndex
    };
  }
	  return {
	    beatIndex,
	    unitIndex: Math.max(0, Math.min(context.beatUnits - EPSILON, Number.isFinite(cursor.unitIndex) ? cursor.unitIndex : 0)),
	    noteIndex: null
	  };
};

const cursorForNote = (item: InternalNoteItem): JianpuCursor => ({
  beatIndex: item.tokenIndex,
  unitIndex: item.unitStart,
  noteIndex: item.noteIndex
});

const cursorForAbsoluteUnit = (context: JianpuBarContext, absoluteUnit: number): JianpuCursor => {
  const totalUnits = context.beats.length * context.beatUnits;
  const safeAbsoluteUnit = Math.max(0, Math.min(totalUnits - EPSILON, Number.isFinite(absoluteUnit) ? absoluteUnit : 0));
  return {
    beatIndex: Math.floor(safeAbsoluteUnit / context.beatUnits),
    unitIndex: safeAbsoluteUnit % context.beatUnits,
    noteIndex: null
  };
};

const selectedNoteAtCursor = (
  context: JianpuBarContext,
  cursor: JianpuCursor
): InternalNoteItem | null => {
  if (cursor.noteIndex === null) return null;
  return context.beats[cursor.beatIndex]?.items.find((item): item is InternalNoteItem => (
    item.kind === 'note' && item.noteIndex === cursor.noteIndex
  )) ?? null;
};

const noteEndingAtCursor = (
  context: JianpuBarContext,
  cursor: JianpuCursor
): InternalNoteItem | null => {
  const safeCursor = clampCursor(context, { ...cursor, noteIndex: null });
  const absoluteUnit = safeCursor.beatIndex * context.beatUnits + safeCursor.unitIndex;
  if (absoluteUnit <= EPSILON) return null;
  return context.beats
    .flatMap((beat) => beat.items.filter((item): item is InternalNoteItem => item.kind === 'note'))
    .reverse()
    .find((item) => Math.abs(item.absoluteUnitEnd - absoluteUnit) <= EPSILON) ?? null;
};

export const getJianpuCursorForNote = (
  song: Song,
  target: SongBarIdentity,
  beatIndex: number,
  noteIndex: number
): JianpuCursor | null => {
  const context = buildContext(song, target);
  if (!context) return null;
  const item = context.beats[beatIndex]?.items.find((candidate): candidate is InternalNoteItem => (
    candidate.kind === 'note' && candidate.noteIndex === noteIndex
  ));
  return item ? cursorForNote(item) : null;
};

const firstInsertionCursorInBeat = (beat: InternalBeatLayout): JianpuCursor | null => {
  const placeholder = beat.items.find((item): item is InternalPlaceholderItem => item.kind === 'placeholder');
  if (placeholder && placeholder.unitStart < beat.beatUnits - EPSILON) {
    return { beatIndex: beat.beatIndex, unitIndex: placeholder.unitStart, noteIndex: null };
  }
  if (beat.occupiedEndUnits < beat.beatUnits - EPSILON) {
    return {
      beatIndex: beat.beatIndex,
      unitIndex: Math.max(beat.carryInUnits, beat.occupiedEndUnits),
      noteIndex: null
    };
  }
  return null;
};

export const getDefaultJianpuCursor = (
  song: Song,
  target: SongBarIdentity
): JianpuCursor => {
  const context = buildContext(song, target);
  if (!context) return { beatIndex: 0, unitIndex: 0, noteIndex: null };
  for (const beat of context.beats) {
    const insertion = firstInsertionCursorInBeat(beat);
    if (insertion) return insertion;
  }
  const lastNote = context.beats
    .flatMap((beat) => beat.items.filter((item): item is InternalNoteItem => item.kind === 'note'))
    .at(-1);
  return lastNote ? cursorForNote(lastNote) : { beatIndex: 0, unitIndex: 0, noteIndex: null };
};

const getAvailableUnitsAtCursor = (context: JianpuBarContext, cursor: JianpuCursor): number => {
  const safeCursor = clampCursor(context, { ...cursor, noteIndex: null });
  const beat = context.beats[safeCursor.beatIndex];
  if (!beat || safeCursor.unitIndex < beat.carryInUnits - EPSILON) return 0;
  const absoluteStart = safeCursor.beatIndex * context.beatUnits + safeCursor.unitIndex;
  const itemAtCursor = beat.items.find((item) => (
    safeCursor.unitIndex >= item.unitStart && safeCursor.unitIndex < item.unitEnd
  ));
  if (itemAtCursor?.kind === 'note') return 0;
  return findContiguousPlaceholders(context, absoluteStart)
    .reduce((total, placeholder) => {
      const availableFrom = Math.max(absoluteStart, placeholder.absoluteUnitStart);
      return total + Math.max(0, placeholder.absoluteUnitEnd - availableFrom);
    }, 0);
};

export const getJianpuInputAvailability = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode = DEFAULT_JIANPU_INPUT_MODE
): JianpuInputAvailability => {
  const context = buildContext(song, target);
  if (!context) {
	    return { remainingUnits: 0, canQuarter: false, canEighth: false, canSixteenth: false, canDot: false, canTriplet: false };
  }
  const selected = selectedNoteAtCursor(context, clampCursor(context, cursor));
  const remainingUnits = selected
    ? selected.units + findContiguousPlaceholders(context, selected.absoluteUnitEnd)
      .reduce((total, placeholder) => total + placeholder.units, 0)
    : getAvailableUnitsAtCursor(context, cursor);
  const mode = normalizeInputMode(inputMode);
  return {
    remainingUnits,
	    canQuarter: remainingUnits + EPSILON >= getJianpuDurationUnits('quarter', mode.dotted, mode.triplet),
	    canEighth: remainingUnits + EPSILON >= getJianpuDurationUnits('eighth', mode.dotted, mode.triplet),
	    canSixteenth: remainingUnits + EPSILON >= getJianpuDurationUnits('sixteenth', false),
	    canDot: !mode.triplet &&
	      mode.duration !== 'sixteenth' &&
	      remainingUnits + EPSILON >= getJianpuDurationUnits(mode.duration, true),
	    canTriplet: mode.duration !== 'sixteenth' &&
	      remainingUnits + EPSILON >= getJianpuDurationUnits(mode.duration, false, true)
	  };
};

export const getJianpuSectionPlayKey = (
  song: Song,
  sectionId: string,
  pitchContext?: JianpuPitchContext
): Key => {
  const overriddenKey = pitchContext?.playKeyBySectionId?.[sectionId];
  if (overriddenKey) return overriddenKey;
  const globalKeyShift = getTransposeOffset(song.originalKey, song.currentKey);
  let writtenKey = song.originalKey;
  for (const section of song.sections) {
    if (section.keyChangeTo) writtenKey = section.keyChangeTo;
    if (section.id === sectionId) {
      const currentKey = transposeKeyWithPreference(writtenKey, globalKeyShift, song.currentKey);
      return getPlayKey(currentKey, song.capo || 0);
    }
  }
  const currentKey = transposeKeyWithPreference(song.originalKey, globalKeyShift, song.currentKey);
  return getPlayKey(currentKey, song.capo || 0);
};

const getJianpuSectionPlayKeys = (song: Song): Key[] => {
  const globalKeyShift = getTransposeOffset(song.originalKey, song.currentKey);
  let writtenKey = song.originalKey;
  return song.sections.map((section) => {
    if (section.keyChangeTo) writtenKey = section.keyChangeTo;
    return getPlayKey(
      transposeKeyWithPreference(writtenKey, globalKeyShift, song.currentKey),
      song.capo || 0
    );
  });
};

export const getJianpuPickupPlayKey = (song: Song): Key => {
  const shift = getTransposeOffset(song.originalKey, song.currentKey);
  return getPlayKey(
    transposeKeyWithPreference(song.originalKey, shift, song.currentKey),
    song.capo || 0
  );
};

export const buildJianpuPitchContext = (song: Song): JianpuPitchContext => ({
  playKeyBySectionId: Object.fromEntries(
    song.sections
      .filter((section) => Boolean(section.id))
      .map((section) => [section.id!, getJianpuSectionPlayKey(song, section.id!)])
  ),
  pickupPlayKey: getJianpuPickupPlayKey(song)
});

/**
 * Changes the interpretation mode while keeping the visible numbers unchanged.
 * Jianpu remains stored as movable-do notation.
 */
export const reinterpretSongJianpuInput = (
  song: Song,
  toAbsolute: boolean,
  pitchContext?: JianpuPitchContext
): Song => {
  if (Boolean(song.jianpuInputAbsolute) === toAbsolute) {
    return song.jianpuInputAbsolute === toAbsolute ? song : { ...song, jianpuInputAbsolute: toAbsolute };
  }
  const rewrite = (riff: string | undefined, key: Key): string | undefined => {
    if (!riff?.trim()) return riff;
    return toAbsolute
      ? convertAbsoluteJianpuToRelativeNotation(riff, key)
      : convertRelativeJianpuToAbsoluteNotation(riff, key);
  };
  const sectionPlayKeys = getJianpuSectionPlayKeys(song);
  return {
    ...song,
    jianpuInputAbsolute: toAbsolute,
    pickup: song.pickup
      ? { ...song.pickup, riff: rewrite(song.pickup.riff, pitchContext?.pickupPlayKey ?? getJianpuPickupPlayKey(song)) }
      : song.pickup,
    sections: song.sections.map((section, sectionIndex) => {
      const key = pitchContext?.playKeyBySectionId?.[section.id ?? ''] ?? sectionPlayKeys[sectionIndex];
      return {
        ...section,
        bars: section.bars.map((bar) => (
          bar.riff?.trim() ? { ...bar, riff: rewrite(bar.riff, key) } : bar
        ))
      };
    })
  };
};

const displayNoteForInputMode = (
  song: Song,
  target: SongBarIdentity,
  note: JianpuNoteRange,
  pitchContext?: JianpuPitchContext
): JianpuNoteRange => {
  if (!song.jianpuInputAbsolute) return note;
  const absolute = convertRelativeJianpuToAbsoluteNotation(
    note.text,
    getJianpuSectionPlayKey(song, target.sectionId, pitchContext)
  );
  return findJianpuNoteRanges(absolute || note.text)[0] ?? note;
};

const resolveInputParts = (
  song: Song,
  target: SongBarIdentity,
  pitch: string,
  accidental: JianpuAccidental,
  octave: JianpuOctave,
  pitchContext?: JianpuPitchContext
): { pitch: string; accidental: JianpuAccidental; octave: JianpuOctave } => (
  song.jianpuInputAbsolute
    ? absoluteJianpuPartsToRelative(
      pitch,
      accidental,
      octave,
      getJianpuSectionPlayKey(song, target.sectionId, pitchContext)
    )
    : { pitch, accidental, octave: clampRelativeOctave(octave) }
);

const applyStringUpdates = (tokens: string[], updates: StringUpdate[]): string[] => {
  const nextTokens = [...tokens];
  const grouped = new Map<number, StringUpdate[]>();
  updates.forEach((update) => {
    const existing = grouped.get(update.tokenIndex) ?? [];
    existing.push(update);
    grouped.set(update.tokenIndex, existing);
  });
  grouped.forEach((tokenUpdates, tokenIndex) => {
    let token = nextTokens[tokenIndex] || '';
    tokenUpdates
      .sort((left, right) => right.start - left.start || right.end - left.end)
      .forEach((update) => {
        token = replaceJianpuRange(token, update.start, update.end, update.replacement);
      });
    nextTokens[tokenIndex] = token;
  });
  return nextTokens;
};

const sanitizeSectionSlurs = (song: Song, sectionIndex: number): Song => {
  const section = song.sections[sectionIndex];
  if (!section) return song;
  const refs = section.bars.flatMap((bar, barIndex) => {
    const timeSignature = getEffectiveTimeSignature(bar.timeSignature, song.timeSignature);
    const riff = getCanonicalJianpuNotation(bar.riff, timeSignature, true);
    return findJianpuNoteRanges(riff).map((note) => ({ barIndex, riff, note }));
  });
  const updates = new Map<number, Array<{ start: number; end: number; replacement: string }>>();
  refs.forEach((ref, index) => {
    if (ref.note.slurStart && ref.note.slurEnd) return;
    const previous = refs[index - 1]?.note ?? null;
    const next = refs[index + 1]?.note ?? null;
    const slurStart = Boolean(ref.note.slurStart && next?.slurEnd);
    const slurEnd = Boolean(ref.note.slurEnd && previous?.slurStart);
    if (slurStart === ref.note.slurStart && slurEnd === ref.note.slurEnd) return;
    const list = updates.get(ref.barIndex) ?? [];
    list.push({
      start: ref.note.start,
      end: ref.note.end,
      replacement: rebuildJianpuNote(ref.note, { slurStart, slurEnd })
    });
    updates.set(ref.barIndex, list);
  });
  if (updates.size === 0) return song;
  const bars = [...section.bars];
  updates.forEach((barUpdates, barIndex) => {
    const bar = bars[barIndex];
    const timeSignature = getEffectiveTimeSignature(bar.timeSignature, song.timeSignature);
    let riff = getCanonicalJianpuNotation(bar.riff, timeSignature, true);
    barUpdates
      .sort((left, right) => right.start - left.start || right.end - left.end)
      .forEach((update) => {
        riff = replaceJianpuRange(riff, update.start, update.end, update.replacement);
      });
    bars[barIndex] = { ...bar, riff: riff || undefined };
  });
  const sections = [...song.sections];
  sections[sectionIndex] = { ...section, bars };
  return { ...song, sections };
};

const applyTokens = (
  song: Song,
  target: SongBarIdentity,
  context: JianpuBarContext,
  tokens: string[]
): Song => {
  const riff = serializeJianpuBeatTokens(tokens, true);
  const section = song.sections[context.sectionIndex];
  const bars = [...section.bars];
  bars[context.barIndex] = { ...bars[context.barIndex], riff: riff || undefined };
  const sections = [...song.sections];
  sections[context.sectionIndex] = { ...section, bars };
  return sanitizeSectionSlurs({ ...song, sections }, context.sectionIndex);
};

const baseResult = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode,
  error: string | null = null
): JianpuCommandResult => ({ song, target, cursor, inputMode, error });

const findContiguousPlaceholders = (
  context: JianpuBarContext,
  absoluteUnitStart: number
): InternalPlaceholderItem[] => {
  const placeholders = context.beats
    .flatMap((beat) => {
      const explicitPlaceholders = beat.items.filter((item): item is InternalPlaceholderItem => item.kind === 'placeholder');
      const implicitFreeUnits = beat.beatUnits - beat.occupiedEndUnits;
      if (implicitFreeUnits <= EPSILON) return explicitPlaceholders;
      const charIndex = beat.token.length;
      return [
        ...explicitPlaceholders,
        {
          kind: 'placeholder' as const,
          tokenIndex: beat.beatIndex,
          charStart: charIndex,
          charEnd: charIndex,
          unitStart: beat.occupiedEndUnits,
          unitEnd: beat.beatUnits,
          absoluteUnitStart: beat.beatIndex * context.beatUnits + beat.occupiedEndUnits,
	          absoluteUnitEnd: (beat.beatIndex + 1) * context.beatUnits,
	          units: implicitFreeUnits,
	          duration: 'sixteenth' as const,
	          dotted: false,
	          triplet: false
	        }
      ];
    })
    .sort((left, right) => left.absoluteUnitStart - right.absoluteUnitStart);
  const result: InternalPlaceholderItem[] = [];
  let expected = absoluteUnitStart;
  for (const placeholder of placeholders) {
    if (placeholder.absoluteUnitEnd <= absoluteUnitStart + EPSILON) continue;
    if (placeholder.absoluteUnitStart > expected + EPSILON) break;
    if (placeholder.absoluteUnitEnd <= expected + EPSILON) continue;
    result.push(placeholder);
    expected = placeholder.absoluteUnitEnd;
  }
  return result;
};

const resizeSelectedNote = (
  song: Song,
  target: SongBarIdentity,
  context: JianpuBarContext,
  selected: InternalNoteItem,
  replacement: string
): { song: Song; error: string | null } => {
  const replacementNote = findJianpuNoteRanges(replacement)[0];
  if (!replacementNote) return { song, error: '無法建立這個簡譜音符。' };
  const nextUnits = getNoteUnits(replacementNote);
  const delta = nextUnits - selected.units;
  const updates: StringUpdate[] = [{
    tokenIndex: selected.tokenIndex,
    start: selected.charStart,
    end: selected.charEnd,
	    replacement: delta < -EPSILON
	      ? `${replacement}${buildJianpuPlaceholderFromUnits(Math.abs(delta))}`
	      : replacement
  }];

  if (delta > EPSILON) {
    const placeholders = findContiguousPlaceholders(context, selected.absoluteUnitEnd);
    let remaining = delta;
    for (const placeholder of placeholders) {
      if (remaining <= EPSILON) break;
      const availableFrom = Math.max(selected.absoluteUnitEnd, placeholder.absoluteUnitStart);
      const prefixUnits = Math.max(0, availableFrom - placeholder.absoluteUnitStart);
      const available = placeholder.absoluteUnitEnd - availableFrom;
      const consumed = Math.min(remaining, available);
      const suffixUnits = Math.max(0, placeholder.units - prefixUnits - consumed);
	      updates.push({
	        tokenIndex: placeholder.tokenIndex,
	        start: placeholder.charStart,
	        end: placeholder.charEnd,
	        replacement: `${buildJianpuPlaceholderFromUnits(prefixUnits)}${buildJianpuPlaceholderFromUnits(suffixUnits)}`
	      });
      remaining -= consumed;
    }
    if (remaining > EPSILON) {
      return { song, error: '後方沒有足夠的空位可以延長這個音符。' };
    }
  }

  return {
    song: applyTokens(song, target, context, applyStringUpdates(context.tokens, updates)),
    error: null
  };
};

const cursorInputModeFromNote = (
  song: Song,
  target: SongBarIdentity,
  note: JianpuNoteRange,
  pitchContext?: JianpuPitchContext
): JianpuInputMode => {
  const display = displayNoteForInputMode(song, target, note, pitchContext);
	  return {
	    duration: display.duration,
	    octave: display.octave,
	    dotted: display.dotted,
	    triplet: display.triplet,
	    accidental: normalizeAccidental(display.accidental)
	  };
};

/** Return the visible input controls represented by a selected semantic note. */
export const getJianpuInputModeAtCursor = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  pitchContext?: JianpuPitchContext
): JianpuInputMode | null => {
  const context = buildContext(song, target);
  if (!context) return null;
  const selected = selectedNoteAtCursor(context, clampCursor(context, cursor));
  return selected
    ? cursorInputModeFromNote(song, target, selected.note, pitchContext)
    : null;
};

const getNavigationCursors = (context: JianpuBarContext): JianpuCursor[] => {
  const cursors: JianpuCursor[] = [];
  context.beats.forEach((beat) => {
    beat.items.forEach((item) => {
      if (item.kind === 'note') {
        cursors.push(cursorForNote(item));
      } else if (item.unitStart < beat.beatUnits - EPSILON) {
        cursors.push({ beatIndex: beat.beatIndex, unitIndex: item.unitStart, noteIndex: null });
      }
    });
    if (
      !beat.items.some((item) => item.kind === 'placeholder') &&
      beat.occupiedEndUnits < beat.beatUnits - EPSILON
    ) {
      cursors.push({
        beatIndex: beat.beatIndex,
        unitIndex: Math.max(beat.carryInUnits, beat.occupiedEndUnits),
        noteIndex: null
      });
    }
  });
  return cursors.sort((left, right) => (
    left.beatIndex - right.beatIndex ||
    left.unitIndex - right.unitIndex ||
    (left.noteIndex === null ? 1 : 0) - (right.noteIndex === null ? 1 : 0)
  ));
};

export const getJianpuNavigationEdgeCursor = (
  song: Song,
  target: SongBarIdentity,
  direction: -1 | 1
): JianpuCursor => {
  const context = buildContext(song, target);
  if (!context) return { beatIndex: 0, unitIndex: 0, noteIndex: null };
  const cursors = getNavigationCursors(context);
  return (direction > 0 ? cursors[0] : cursors.at(-1))
    ?? getDefaultJianpuCursor(song, target);
};

const cursorEquals = (left: JianpuCursor, right: JianpuCursor): boolean => (
  left.beatIndex === right.beatIndex &&
  left.unitIndex === right.unitIndex &&
  left.noteIndex === right.noteIndex
);

const moveCursor = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  direction: -1 | 1
): { target: SongBarIdentity; cursor: JianpuCursor } => {
  const context = buildContext(song, target);
  if (!context) return { target, cursor };
  const safeCursor = clampCursor(context, cursor);
  const localTargets = getNavigationCursors(context);
  const exactIndex = localTargets.findIndex((candidate) => cursorEquals(candidate, safeCursor));
  const candidate = exactIndex >= 0
    ? localTargets[exactIndex + direction]
    : direction > 0
      ? localTargets.find((item) => (
        item.beatIndex > safeCursor.beatIndex ||
        (item.beatIndex === safeCursor.beatIndex && item.unitIndex >= safeCursor.unitIndex)
      ))
      : [...localTargets].reverse().find((item) => (
        item.beatIndex < safeCursor.beatIndex ||
        (item.beatIndex === safeCursor.beatIndex && item.unitIndex <= safeCursor.unitIndex)
      ));
  if (candidate) return { target, cursor: candidate };

  const section = song.sections[context.sectionIndex];
  for (
    let barIndex = context.barIndex + direction;
    barIndex >= 0 && barIndex < section.bars.length;
    barIndex += direction
  ) {
    const barId = section.bars[barIndex].id;
    if (!barId) continue;
    const nextTarget = { sectionId: target.sectionId, barId };
    const nextContext = buildContext(song, nextTarget);
    if (!nextContext) continue;
    const targets = getNavigationCursors(nextContext);
    const nextCursor = direction > 0 ? targets[0] : targets.at(-1);
    if (nextCursor) return { target: nextTarget, cursor: nextCursor };
  }
  return { target, cursor: safeCursor };
};

const insertPitch = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode,
  pitch: JianpuPitch,
  pitchContext?: JianpuPitchContext
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
  const safeCursor = clampCursor(context, cursor);
  const selected = selectedNoteAtCursor(context, safeCursor);
  const normalizedMode = normalizeInputMode(inputMode);

  if (selected) {
    const display = displayNoteForInputMode(song, target, selected.note, pitchContext);
    const selectedMode = cursorInputModeFromNote(song, target, selected.note, pitchContext);
    const resolved = resolveInputParts(
      song,
      target,
      pitch,
      normalizeAccidental(display.accidental),
      display.octave,
      pitchContext
    );
    const replacement = rebuildJianpuNote(selected.note, {
      pitch: resolved.pitch,
      accidental: resolved.accidental,
      octave: resolved.octave,
      duration: selected.note.duration,
      dotted: selected.note.dotted
    });
    const resized = resizeSelectedNote(song, target, context, selected, replacement);
    return baseResult(
      resized.song,
      target,
      safeCursor,
      selectedMode,
      resized.error
    );
  }

  const availableUnits = getAvailableUnitsAtCursor(context, safeCursor);
  if (availableUnits < 1 - EPSILON) {
    return baseResult(song, target, safeCursor, normalizedMode, '這個位置沒有可用的簡譜空位。');
  }
  const fittedMode = fitJianpuInputModeToUnits(normalizedMode, availableUnits);
  const resolved = resolveInputParts(song, target, pitch, fittedMode.accidental, fittedMode.octave, pitchContext);
  const noteText = buildJianpuNoteFromMode(resolved.pitch, {
    ...fittedMode,
    accidental: resolved.accidental,
    octave: resolved.octave
  });
  const note = findJianpuNoteRanges(noteText)[0];
  if (!note) return baseResult(song, target, safeCursor, inputMode, '無法建立這個簡譜音符。');
  const requiredUnits = getNoteUnits(note);
  if (requiredUnits > availableUnits + EPSILON) {
    return baseResult(song, target, safeCursor, inputMode, '這個位置的剩餘時值不足。');
  }

  const absoluteStart = safeCursor.beatIndex * context.beatUnits + safeCursor.unitIndex;
  const placeholders = findContiguousPlaceholders(context, absoluteStart);
  let remaining = requiredUnits;
  const updates: StringUpdate[] = [];
  let inserted = false;
  for (const item of placeholders) {
    if (remaining <= EPSILON) break;
    const start = Math.max(absoluteStart, item.absoluteUnitStart);
    const prefixUnits = Math.max(0, start - item.absoluteUnitStart);
    const available = item.absoluteUnitEnd - start;
    const consumed = Math.min(remaining, available);
    const suffixUnits = Math.max(0, item.units - prefixUnits - consumed);
	    updates.push({
	      tokenIndex: item.tokenIndex,
	      start: item.charStart,
	      end: item.charEnd,
	      replacement: `${buildJianpuPlaceholderFromUnits(prefixUnits)}${inserted ? '' : noteText}${buildJianpuPlaceholderFromUnits(suffixUnits)}`
	    });
    inserted = true;
    remaining -= consumed;
  }
  if (remaining > EPSILON || !inserted) {
    return baseResult(song, target, safeCursor, inputMode, '這個空位不足以放入選擇的時值。');
  }
  const nextTokens = applyStringUpdates(context.tokens, updates);

  const nextSong = applyTokens(song, target, context, nextTokens);
  const nextContext = buildContext(nextSong, target);
  const insertedNote = nextContext?.beats[safeCursor.beatIndex]?.items.find((item): item is InternalNoteItem => (
    item.kind === 'note' && Math.abs(item.unitStart - safeCursor.unitIndex) < EPSILON
  ));
  const insertedCursor = insertedNote ? cursorForNote(insertedNote) : safeCursor;
  const advanced = moveCursor(nextSong, target, insertedCursor, 1);
  return baseResult(nextSong, advanced.target, advanced.cursor, fittedMode);
};

const updateSelectedPitchProperty = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode,
  property: 'accidental' | 'octave',
  value: JianpuAccidental | JianpuOctave,
  pitchContext?: JianpuPitchContext
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
  const safeCursor = clampCursor(context, cursor);
  const selected = selectedNoteAtCursor(context, safeCursor);
  const nextInput = normalizeInputMode({
    ...inputMode,
    [property]: property === 'octave' && !song.jianpuInputAbsolute
      ? clampRelativeOctave(value as number)
      : value
  });
  if (!selected || selected.note.pitch === '0' || selected.note.pitch === '-') {
    return baseResult(song, target, safeCursor, nextInput);
  }
  const display = displayNoteForInputMode(song, target, selected.note, pitchContext);
  const displayAccidental = property === 'accidental'
    ? value as JianpuAccidental
    : normalizeAccidental(display.accidental);
  const displayOctave = property === 'octave' ? value as number : display.octave;
  const resolved = resolveInputParts(song, target, display.pitch, displayAccidental, displayOctave, pitchContext);
  const replacement = rebuildJianpuNote(selected.note, {
    pitch: resolved.pitch,
    accidental: resolved.accidental,
    octave: resolved.octave
  });
  const resized = resizeSelectedNote(song, target, context, selected, replacement);
  return baseResult(resized.song, target, safeCursor, nextInput, resized.error);
};

const setDuration = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode,
  duration: JianpuDuration
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
	  const safeCursor = clampCursor(context, cursor);
	  const selected = selectedNoteAtCursor(context, safeCursor);
	  const triplet = duration !== 'sixteenth' && (selected?.note.triplet ?? inputMode.triplet);
	  const dotted = triplet || duration === 'sixteenth' ? false : (selected?.note.dotted ?? inputMode.dotted);
	  const nextInput = normalizeInputMode({ ...inputMode, duration, dotted, triplet });
	  if (!selected) {
	    const available = getAvailableUnitsAtCursor(context, safeCursor);
	    if (getJianpuDurationUnits(duration, dotted, triplet) > available + EPSILON) {
	      if (dotted && getJianpuDurationUnits(duration, false, triplet) <= available + EPSILON) {
	        return baseResult(song, target, safeCursor, { ...nextInput, dotted: false });
	      }
	      return baseResult(song, target, safeCursor, inputMode, '這個位置沒有足夠空位改成這個時值。');
	    }
	    return baseResult(song, target, safeCursor, nextInput);
	  }
	  const replacement = rebuildJianpuNote(selected.note, { duration, dotted, triplet });
	  const resized = resizeSelectedNote(song, target, context, selected, replacement);
	  return baseResult(resized.song, target, safeCursor, resized.error ? inputMode : nextInput, resized.error);
};

const toggleDot = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
  const safeCursor = clampCursor(context, cursor);
	  const selected = selectedNoteAtCursor(context, safeCursor);
	  const targetNote = selected ?? noteEndingAtCursor(context, safeCursor);
	  const duration = targetNote?.note.duration ?? inputMode.duration;
	  const triplet = targetNote?.note.triplet ?? inputMode.triplet;
	  const dotted = !(targetNote?.note.dotted ?? inputMode.dotted);
	  if (dotted && triplet) {
	    return baseResult(song, target, safeCursor, inputMode, '三連音不能加附點。');
	  }
	  if (dotted && duration === 'sixteenth') {
	    return baseResult(song, target, safeCursor, inputMode, '十六分音符不支援附點。');
	  }
	  const nextInput = normalizeInputMode({ ...inputMode, duration, dotted, triplet });
	  if (!targetNote) {
	    const available = getAvailableUnitsAtCursor(context, safeCursor);
	    if (getJianpuDurationUnits(duration, dotted, triplet) > available + EPSILON) {
	      return baseResult(song, target, safeCursor, inputMode, '這個位置沒有足夠空位加附點。');
	    }
    return baseResult(song, target, safeCursor, nextInput);
  }
	  const replacement = rebuildJianpuNote(targetNote.note, { dotted });
	  const resized = resizeSelectedNote(song, target, context, targetNote, replacement);
	  const resultCursor = !selected && !resized.error
	    ? cursorForAbsoluteUnit(context, targetNote.absoluteUnitStart + getJianpuDurationUnits(duration, dotted, triplet))
	    : safeCursor;
	  return baseResult(resized.song, target, resultCursor, resized.error ? inputMode : nextInput, resized.error);
};

const toggleTriplet = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
  const safeCursor = clampCursor(context, cursor);
  const selected = selectedNoteAtCursor(context, safeCursor);
  const targetNote = selected ?? noteEndingAtCursor(context, safeCursor);
  const duration = targetNote?.note.duration ?? inputMode.duration;
  if (duration === 'sixteenth') {
    return baseResult(song, target, safeCursor, inputMode, '十六分音符不支援三連音。');
  }
  const triplet = !(targetNote?.note.triplet ?? inputMode.triplet);
  const nextInput = normalizeInputMode({ ...inputMode, duration, dotted: false, triplet });
  if (!targetNote) {
    const available = getAvailableUnitsAtCursor(context, safeCursor);
    if (getJianpuDurationUnits(duration, false, triplet) > available + EPSILON) {
      return baseResult(song, target, safeCursor, inputMode, '這個位置沒有足夠空位切換三連音。');
    }
    return baseResult(song, target, safeCursor, nextInput);
  }
  const replacement = rebuildJianpuNote(targetNote.note, { dotted: false, triplet });
  const resized = resizeSelectedNote(song, target, context, targetNote, replacement);
  const resultCursor = !selected && !resized.error
    ? cursorForAbsoluteUnit(context, targetNote.absoluteUnitStart + getJianpuDurationUnits(duration, false, triplet))
    : safeCursor;
  return baseResult(resized.song, target, resultCursor, resized.error ? inputMode : nextInput, resized.error);
};

const insertHold = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
  const safeCursor = clampCursor(context, { ...cursor, noteIndex: null });
  const beat = context.beats[safeCursor.beatIndex];
  if (!beat || beat.carryInUnits > EPSILON || beat.token.trim()) {
    return baseResult(song, target, safeCursor, inputMode, '延音只能放在全空的一拍。');
  }
  const tokens = [...context.tokens];
  tokens[safeCursor.beatIndex] = '-';
  const nextSong = applyTokens(song, target, context, tokens);
  const inserted = getJianpuCursorForNote(nextSong, target, safeCursor.beatIndex, 0) ?? safeCursor;
  const advanced = moveCursor(nextSong, target, inserted, 1);
  return baseResult(nextSong, advanced.target, advanced.cursor, inputMode);
};

const toggleSlur = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
  const safeCursor = clampCursor(context, cursor);
  const selected = selectedNoteAtCursor(context, safeCursor);
  const targetNote = selected ?? noteEndingAtCursor(context, safeCursor);
  if (!targetNote) return baseResult(song, target, safeCursor, inputMode, '請先選擇一個音符。');

  const section = song.sections[context.sectionIndex];
  const refs = section.bars.flatMap((bar, barIndex) => {
    const tokens = getCanonicalJianpuBeatTokens(
      bar.riff,
      getEffectiveTimeSignature(bar.timeSignature, song.timeSignature)
    );
    return tokens.flatMap((token, tokenIndex) => (
      findJianpuNoteRanges(token).map((note, noteIndex) => ({ barIndex, tokenIndex, noteIndex, note }))
    ));
  });
  const selectedRefIndex = refs.findIndex((ref) => (
    ref.barIndex === context.barIndex &&
    ref.tokenIndex === targetNote.tokenIndex &&
    ref.noteIndex === targetNote.noteIndex
  ));
  if (selectedRefIndex < 0) return baseResult(song, target, safeCursor, inputMode, '找不到選取的音符。');
  const current = refs[selectedRefIndex];
  const previous = refs[selectedRefIndex - 1] ?? null;
  const next = refs[selectedRefIndex + 1] ?? null;
  const isStart = Boolean(current.note.slurStart && next?.note.slurEnd);
  const isEnd = Boolean(current.note.slurEnd && previous?.note.slurStart);
  const updates: Array<{ ref: typeof current; replacement: string }> = [];
  if (isStart && next) {
    updates.push(
      { ref: current, replacement: rebuildJianpuNote(current.note, { slurStart: false }) },
      { ref: next, replacement: rebuildJianpuNote(next.note, { slurEnd: false }) }
    );
  } else if (isEnd && previous) {
    updates.push(
      { ref: previous, replacement: rebuildJianpuNote(previous.note, { slurStart: false }) },
      { ref: current, replacement: rebuildJianpuNote(current.note, { slurEnd: false }) }
    );
  } else if (previous) {
    updates.push(
      { ref: previous, replacement: rebuildJianpuNote(previous.note, { slurStart: true }) },
      { ref: current, replacement: rebuildJianpuNote(current.note, { slurEnd: true }) }
    );
  } else if (next) {
    updates.push(
      { ref: current, replacement: rebuildJianpuNote(current.note, { slurStart: true }) },
      { ref: next, replacement: rebuildJianpuNote(next.note, { slurEnd: true }) }
    );
  } else {
    return baseResult(song, target, safeCursor, inputMode, '沒有下一個音符可以連線。');
  }

  const updatesByBar = new Map<number, StringUpdate[]>();
  updates.forEach((update) => {
    const list = updatesByBar.get(update.ref.barIndex) ?? [];
    list.push({
      tokenIndex: update.ref.tokenIndex,
      start: update.ref.note.start,
      end: update.ref.note.end,
      replacement: update.replacement
    });
    updatesByBar.set(update.ref.barIndex, list);
  });
  const bars = [...section.bars];
  updatesByBar.forEach((barUpdates, barIndex) => {
    const bar = bars[barIndex];
    const tokens = getCanonicalJianpuBeatTokens(
      bar.riff,
      getEffectiveTimeSignature(bar.timeSignature, song.timeSignature)
    );
    const riff = serializeJianpuBeatTokens(applyStringUpdates(tokens, barUpdates), true);
    bars[barIndex] = { ...bar, riff: riff || undefined };
  });
  const sections = [...song.sections];
  sections[context.sectionIndex] = { ...section, bars };
  const nextSong = sanitizeSectionSlurs({ ...song, sections }, context.sectionIndex);
  return baseResult(nextSong, target, safeCursor, inputMode);
};

const deleteAtCursor = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode,
  direction: 'backward' | 'forward',
  pitchContext?: JianpuPitchContext
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
  const safeCursor = clampCursor(context, cursor);
  let selected = selectedNoteAtCursor(context, safeCursor);
  if (!selected) {
    const notes = context.beats[safeCursor.beatIndex]?.items
      .filter((item): item is InternalNoteItem => item.kind === 'note') ?? [];
    selected = direction === 'backward'
      ? [...notes].reverse().find((note) => note.unitEnd <= safeCursor.unitIndex + EPSILON || note.unitStart < safeCursor.unitIndex) ?? null
      : notes.find((note) => note.unitStart >= safeCursor.unitIndex - EPSILON || note.unitEnd > safeCursor.unitIndex) ?? null;
  }
  if (selected) {
	    const placeholder = buildJianpuPlaceholder(selected.note.duration, selected.note.dotted, selected.note.triplet);
    const tokens = [...context.tokens];
    const nextToken = replaceJianpuRange(
      tokens[selected.tokenIndex],
      selected.charStart,
      selected.charEnd,
      placeholder
    );
    tokens[selected.tokenIndex] = findJianpuNoteRanges(nextToken).length === 0 ? '' : nextToken;
    const nextSong = applyTokens(song, target, context, tokens);
    return baseResult(
      nextSong,
      target,
      { beatIndex: selected.tokenIndex, unitIndex: selected.unitStart, noteIndex: null },
      cursorInputModeFromNote(song, target, selected.note, pitchContext)
    );
  }

  const findBeat = (): number => {
    if (direction === 'backward') {
      for (let index = safeCursor.beatIndex; index >= 0; index -= 1) {
        if (context.tokens[index]?.trim()) return index;
      }
    } else {
      for (let index = safeCursor.beatIndex; index < context.tokens.length; index += 1) {
        if (context.tokens[index]?.trim()) return index;
      }
    }
    return -1;
  };
  const beatIndex = findBeat();
  if (beatIndex < 0) return baseResult(song, target, safeCursor, inputMode);
  const tokens = [...context.tokens];
  tokens[beatIndex] = '';
  return baseResult(
    applyTokens(song, target, context, tokens),
    target,
    { beatIndex, unitIndex: 0, noteIndex: null },
    inputMode
  );
};

const clearFormatting = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  inputMode: JianpuInputMode,
  pitchContext?: JianpuPitchContext
): JianpuCommandResult => {
  const context = buildContext(song, target);
  if (!context) return baseResult(song, target, cursor, inputMode, '找不到要編輯的小節。');
  const safeCursor = clampCursor(context, cursor);
  const selected = selectedNoteAtCursor(context, safeCursor);
  const clearedMode = { ...DEFAULT_JIANPU_INPUT_MODE };
  if (!selected) return baseResult(song, target, safeCursor, clearedMode);
  const display = displayNoteForInputMode(song, target, selected.note, pitchContext);
  const resolved = resolveInputParts(
    song,
    target,
    display.pitch,
    '',
    0,
    pitchContext
  );
  const replacement = rebuildJianpuNote(selected.note, {
    pitch: resolved.pitch,
	    accidental: resolved.accidental,
	    duration: 'quarter',
	    octave: resolved.octave,
	    dotted: false,
	    triplet: false,
	    slurStart: false,
    slurEnd: false
  });
  const resized = resizeSelectedNote(song, target, context, selected, replacement);
  return baseResult(resized.song, target, safeCursor, resized.error ? inputMode : clearedMode, resized.error);
};

export const applyJianpuCommand = (
  song: Song,
  target: SongBarIdentity,
  cursor: JianpuCursor,
  action: JianpuAction,
  inputMode: JianpuInputMode = DEFAULT_JIANPU_INPUT_MODE,
  pitchContext?: JianpuPitchContext
): JianpuCommandResult => {
  const context = buildContext(song, target);
  const safeCursor = context ? clampCursor(context, cursor) : cursor;
  const safeInputMode = normalizeInputMode(inputMode);

  switch (action.type) {
    case 'insert-pitch':
      return insertPitch(song, target, safeCursor, safeInputMode, action.pitch, pitchContext);
    case 'insert-rest':
      return insertPitch(song, target, safeCursor, safeInputMode, '0', pitchContext);
    case 'insert-hold':
      return insertHold(song, target, safeCursor, safeInputMode);
    case 'set-duration':
      return setDuration(song, target, safeCursor, safeInputMode, action.duration);
    case 'set-octave':
      return updateSelectedPitchProperty(song, target, safeCursor, safeInputMode, 'octave', action.octave, pitchContext);
    case 'set-accidental':
      return updateSelectedPitchProperty(song, target, safeCursor, safeInputMode, 'accidental', action.accidental, pitchContext);
	    case 'toggle-dot':
	      return toggleDot(song, target, safeCursor, safeInputMode);
	    case 'toggle-triplet':
	      return toggleTriplet(song, target, safeCursor, safeInputMode);
	    case 'toggle-slur':
	      return toggleSlur(song, target, safeCursor, safeInputMode);
    case 'delete':
      return deleteAtCursor(song, target, safeCursor, safeInputMode, action.direction ?? 'backward', pitchContext);
    case 'move': {
      const moved = moveCursor(song, target, safeCursor, action.direction);
      return baseResult(song, moved.target, moved.cursor, safeInputMode);
    }
    case 'clear-formatting':
      return clearFormatting(song, target, safeCursor, safeInputMode, pitchContext);
    default:
      return baseResult(song, target, safeCursor, safeInputMode);
  }
};
