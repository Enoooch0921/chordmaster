/**
 * Pure immutable rhythm-editing commands shared by the legacy editor and the
 * preview-first editor. Long-lived targets use section/bar ids; rhythm cursors
 * use musical time units instead of token or string offsets.
 */
import type { Bar, Song } from '../types';
import {
  getEffectiveTimeSignature,
  normalizeRhythmInput,
  normalizeRhythmToken,
  parseRhythmNotation,
  rhythmEndsWithTieToNext,
  rhythmUnitsEqual,
  rhythmUnitsGreater,
  type RhythmBase
} from '../utils/rhythmUtils';
import {
  findSongBar,
  updateBarById,
  type LocatedSongBar,
  type SongBarIdentity
} from './songEditing';

const RHYTHM_EPSILON = 0.001;

const RHYTHM_BASE_UNITS: Record<RhythmBase, number> = {
  w: 16,
  h: 8,
  q: 4,
  e: 2,
  s: 1
};

export interface RhythmCursor {
  cursorUnit: number;
}

export interface RhythmEditableEvent {
  startUnit: number;
  endUnit: number;
  durationUnits: number;
  base: RhythmBase;
  isRest: boolean;
  isSlash: boolean;
  dotted: boolean;
  triplet: boolean;
  accent: boolean;
  tieAfter: boolean;
}

export type RhythmDeleteMode = 'backspace' | 'delete';

export type RhythmEditAction =
  | { type: 'insert'; token: string }
  | { type: 'toggle-dot' }
  | { type: 'toggle-accent' }
  | { type: 'toggle-tie' }
  | { type: 'delete'; mode?: RhythmDeleteMode }
  | { type: 'move'; direction: -1 | 1 }
  | { type: 'home' }
  | { type: 'end' };

export interface RhythmEditResult {
  song: Song;
  cursor: RhythmCursor;
  error: string | null;
  changed: boolean;
}

export interface RhythmTieContext {
  tieFromPrevious: boolean;
  tieToNext: boolean;
  nextNotation: string | undefined;
  nextTimeSignature: string;
}

interface RhythmBarContext {
  located: LocatedSongBar;
  timeSignature: string;
  events: RhythmEditableEvent[];
  barUnits: number;
}

const HIDDEN_GAP_TOKEN_CANDIDATES = [
  { sixthUnits: 144, token: 'wx.' },
  { sixthUnits: 96, token: 'wx' },
  { sixthUnits: 72, token: 'hx.' },
  { sixthUnits: 48, token: 'hx' },
  { sixthUnits: 36, token: 'qx.' },
  { sixthUnits: 24, token: 'qx' },
  { sixthUnits: 18, token: 'ex.' },
  { sixthUnits: 16, token: 'q3x' },
  { sixthUnits: 12, token: 'ex' },
  { sixthUnits: 9, token: 'sx.' },
  { sixthUnits: 8, token: 'e3x' },
  { sixthUnits: 6, token: 'sx' }
] as const;

const getBarTimeSignature = (song: Song, bar: Bar) => (
  getEffectiveTimeSignature(bar.timeSignature, song.timeSignature)
);

const toEditableEvents = (notation: string, timeSignature: string): RhythmEditableEvent[] => (
  parseRhythmNotation(notation, timeSignature).events
    .filter((event) => !event.isHidden)
    .map((event) => ({
      startUnit: event.startUnit,
      endUnit: event.endUnit,
      durationUnits: event.durationUnits,
      base: event.base,
      isRest: event.isRest,
      isSlash: event.isSlash,
      dotted: event.dotted,
      triplet: event.triplet,
      accent: event.accent,
      tieAfter: event.tieAfter
    }))
);

const getRhythmBarContext = (
  song: Song,
  target: SongBarIdentity,
  notationOverride?: string
): RhythmBarContext | null => {
  const located = findSongBar(song, target);
  if (!located) return null;
  const timeSignature = getBarTimeSignature(song, located.bar);
  const notation = notationOverride ?? located.bar.rhythm ?? '';
  const parsed = parseRhythmNotation(notation, timeSignature);
  return {
    located,
    timeSignature,
    events: toEditableEvents(notation, timeSignature),
    barUnits: parsed.barUnits
  };
};

const getCursorUnitsForNotation = (notation: string, timeSignature: string): number[] => {
  const parsed = parseRhythmNotation(notation, timeSignature);
  const events = parsed.events.filter((event) => !event.isHidden);
  if (events.length === 0) return [0];

  const cursorUnits: number[] = [];
  let cursor = 0;
  events.forEach((event) => {
    // This intentionally mirrors the existing editor/renderer cursor grid.
    while (cursor + 1 < event.startUnit) {
      cursorUnits.push(cursor);
      cursor += 1;
    }
    cursorUnits.push(event.startUnit);
    cursor = event.endUnit;
  });
  cursorUnits.push(Math.min(cursor, parsed.barUnits));

  return cursorUnits
    .filter((unit, index, units) => !units.slice(0, index).some((existing) => rhythmUnitsEqual(existing, unit)))
    .sort((left, right) => left - right);
};

const sanitizeCursor = (cursor: RhythmCursor, cursorUnits: number[]): RhythmCursor => {
  const requestedUnit = Number.isFinite(cursor.cursorUnit) ? cursor.cursorUnit : 0;
  const exactUnit = cursorUnits.find((unit) => rhythmUnitsEqual(unit, requestedUnit));
  if (exactUnit !== undefined) return { cursorUnit: exactUnit };

  return {
    cursorUnit: cursorUnits.reduce((closest, unit) => (
      Math.abs(unit - requestedUnit) < Math.abs(closest - requestedUnit) ? unit : closest
    ), cursorUnits[0] ?? 0)
  };
};

const findEventIndexAtCursor = (events: RhythmEditableEvent[], cursorUnit: number) => (
  events.findIndex((event) => rhythmUnitsEqual(event.startUnit, cursorUnit))
);

const findEditableEventIndex = (events: RhythmEditableEvent[], cursorUnit: number) => {
  const exactIndex = findEventIndexAtCursor(events, cursorUnit);
  if (exactIndex !== -1) return exactIndex;

  return [...events.keys()]
    .reverse()
    .find((index) => rhythmUnitsEqual(events[index].endUnit, cursorUnit)) ?? -1;
};

const getNextBoundary = (events: RhythmEditableEvent[], cursorUnit: number, barUnits: number) => (
  events.find((event) => event.startUnit > cursorUnit + RHYTHM_EPSILON)?.startUnit ?? barUnits
);

const buildRhythmToken = (event: RhythmEditableEvent) => {
  if (event.isSlash) return '/';
  return normalizeRhythmToken(
    `${event.base}${event.triplet ? '3' : ''}${event.isRest ? 'r' : ''}${event.dotted && !event.triplet ? '.' : ''}${!event.isRest && event.accent ? '^' : ''}${!event.isRest && event.tieAfter ? '~' : ''}`
  );
};

const parseEditableToken = (token: string, timeSignature: string): RhythmEditableEvent | null => {
  const normalized = normalizeRhythmToken(token);
  const parsed = parseRhythmNotation(normalized, timeSignature);
  if (parsed.invalidTokens.length > 0 || parsed.events.length !== 1 || parsed.events[0].isHidden) {
    return null;
  }

  const event = parsed.events[0];
  return {
    startUnit: 0,
    endUnit: event.durationUnits,
    durationUnits: event.durationUnits,
    base: event.base,
    isRest: event.isRest,
    isSlash: event.isSlash,
    dotted: event.dotted,
    triplet: event.triplet,
    accent: event.accent,
    tieAfter: event.tieAfter
  };
};

const positionEvent = (event: RhythmEditableEvent, startUnit: number): RhythmEditableEvent => ({
  ...event,
  startUnit,
  endUnit: startUnit + event.durationUnits
});

const preserveEventModifiers = (
  existingEvent: RhythmEditableEvent,
  nextEvent: RhythmEditableEvent,
  timeSignature: string
): RhythmEditableEvent => {
  if (nextEvent.isRest || nextEvent.isSlash) {
    const keepTripletRest = existingEvent.triplet
      && existingEvent.base === nextEvent.base
      && nextEvent.isRest
      && !nextEvent.triplet;
    const replacement = keepTripletRest
      ? parseEditableToken(`${nextEvent.base}3r`, timeSignature)
      : nextEvent;
    return {
      ...positionEvent(replacement ?? nextEvent, nextEvent.startUnit),
      dotted: nextEvent.isSlash ? false : (replacement ?? nextEvent).dotted,
      triplet: nextEvent.isSlash ? false : (replacement ?? nextEvent).triplet,
      accent: false,
      tieAfter: false
    };
  }

  const dotted = nextEvent.triplet ? false : existingEvent.dotted;
  const durationUnits = nextEvent.triplet
    ? nextEvent.durationUnits
    : RHYTHM_BASE_UNITS[nextEvent.base] * (dotted ? 1.5 : 1);
  return {
    ...nextEvent,
    dotted,
    durationUnits,
    endUnit: nextEvent.startUnit + durationUnits,
    accent: existingEvent.accent,
    tieAfter: existingEvent.tieAfter
  };
};

/** Convert a musical gap into the canonical hidden rhythm tokens used by the editor. */
export const buildRhythmHiddenGapTokens = (durationUnits: number): string[] => {
  const targetSixthUnits = Math.max(0, Math.round(durationUnits * 6));
  const memo = new Map<string, string[] | null>();

  const solve = (remainingSixthUnits: number, startIndex: number): string[] | null => {
    if (remainingSixthUnits === 0) return [];
    if (remainingSixthUnits < 0 || startIndex >= HIDDEN_GAP_TOKEN_CANDIDATES.length) return null;

    const key = `${remainingSixthUnits}:${startIndex}`;
    if (memo.has(key)) return memo.get(key) ?? null;

    for (let index = startIndex; index < HIDDEN_GAP_TOKEN_CANDIDATES.length; index += 1) {
      const candidate = HIDDEN_GAP_TOKEN_CANDIDATES[index];
      if (candidate.sixthUnits > remainingSixthUnits) continue;
      const next = solve(remainingSixthUnits - candidate.sixthUnits, index);
      if (next) {
        const result = [candidate.token, ...next];
        memo.set(key, result);
        return result;
      }
    }

    memo.set(key, null);
    return null;
  };

  return solve(targetSixthUnits, 0) ?? [];
};

const serializeEvents = (
  events: RhythmEditableEvent[],
  timeSignature: string
): { notation: string; error: string | null } => {
  const sortedEvents = [...events]
    .filter((event) => event.durationUnits > 0)
    .sort((left, right) => left.startUnit - right.startUnit);
  if (sortedEvents.length === 0) return { notation: '', error: null };

  const tokens: string[] = [];
  let cursor = 0;
  for (const event of sortedEvents) {
    if (event.startUnit > cursor + RHYTHM_EPSILON) {
      const gapTokens = buildRhythmHiddenGapTokens(event.startUnit - cursor);
      if (gapTokens.length === 0) {
        return { notation: '', error: '無法保留這個節拍位置。' };
      }
      tokens.push(...gapTokens);
    }
    tokens.push(buildRhythmToken(event));
    cursor = Math.max(cursor, event.endUnit);
  }

  const notation = normalizeRhythmInput(tokens.join(' '));
  const parsed = parseRhythmNotation(notation, timeSignature);
  return parsed.events.some((event) => !event.isHidden)
    ? { notation, error: null }
    : { notation: '', error: null };
};

const writeNotation = (song: Song, target: SongBarIdentity, notation: string): Song => (
  updateBarById(song, target, (bar) => {
    const currentNotation = bar.rhythm?.trim() ?? '';
    if (currentNotation === notation) return bar;
    return { ...bar, rhythm: notation || undefined };
  })
);

const result = (
  song: Song,
  cursor: RhythmCursor,
  error: string | null,
  originalSong: Song = song
): RhythmEditResult => ({
  song,
  cursor,
  error,
  changed: song !== originalSong
});

/** Cursor locations exposed by the existing rhythm renderer for this bar. */
export const getRhythmCursorUnits = (song: Song, target: SongBarIdentity): number[] => {
  const context = getRhythmBarContext(song, target);
  return context ? getCursorUnitsForNotation(context.located.bar.rhythm ?? '', context.timeSignature) : [0];
};

/** Default to the append/end position, matching focus behavior in SongEditor. */
export const getDefaultRhythmCursor = (song: Song, target: SongBarIdentity): RhythmCursor => {
  const units = getRhythmCursorUnits(song, target);
  return { cursorUnit: units.at(-1) ?? 0 };
};

/** Resolve the event owned by a cursor, including the event immediately before an end cursor. */
export const getRhythmEventAtCursor = (
  song: Song,
  target: SongBarIdentity,
  cursor: RhythmCursor
): RhythmEditableEvent | null => {
  const context = getRhythmBarContext(song, target);
  if (!context) return null;
  const safeCursor = sanitizeCursor(cursor, getCursorUnitsForNotation(context.located.bar.rhythm ?? '', context.timeSignature));
  const eventIndex = findEditableEventIndex(context.events, safeCursor.cursorUnit);
  return eventIndex >= 0 ? context.events[eventIndex] : null;
};

const getAdjacentBar = (
  song: Song,
  located: LocatedSongBar,
  direction: -1 | 1
): Bar | undefined => {
  let sectionIndex = located.sectionIndex;
  let barIndex = located.barIndex + direction;
  while (sectionIndex >= 0 && sectionIndex < song.sections.length) {
    const bars = song.sections[sectionIndex].bars;
    if (barIndex >= 0 && barIndex < bars.length) return bars[barIndex];
    sectionIndex += direction;
    if (sectionIndex < 0 || sectionIndex >= song.sections.length) break;
    barIndex = direction < 0 ? song.sections[sectionIndex].bars.length - 1 : 0;
  }
  return undefined;
};

/** Rendering context for ties that cross a bar or section boundary. */
export const getRhythmTieContext = (song: Song, target: SongBarIdentity): RhythmTieContext => {
  const context = getRhythmBarContext(song, target);
  if (!context) {
    return {
      tieFromPrevious: false,
      tieToNext: false,
      nextNotation: undefined,
      nextTimeSignature: getEffectiveTimeSignature(song.timeSignature)
    };
  }

  const previousBar = getAdjacentBar(song, context.located, -1);
  const nextBar = getAdjacentBar(song, context.located, 1);
  return {
    tieFromPrevious: Boolean(previousBar?.rhythm)
      && rhythmEndsWithTieToNext(previousBar?.rhythm, getBarTimeSignature(song, previousBar!)),
    tieToNext: rhythmEndsWithTieToNext(context.located.bar.rhythm, context.timeSignature),
    nextNotation: nextBar?.rhythm,
    nextTimeSignature: nextBar ? getBarTimeSignature(song, nextBar) : getEffectiveTimeSignature(song.timeSignature)
  };
};

/**
 * Apply one rhythm keyboard/navigation command without mutating the input song.
 * Failed commands return the original song and a user-facing error.
 */
export const applyRhythmEdit = (
  song: Song,
  target: SongBarIdentity,
  cursor: RhythmCursor,
  action: RhythmEditAction
): RhythmEditResult => {
  const context = getRhythmBarContext(song, target);
  if (!context) return result(song, { cursorUnit: Math.max(0, cursor.cursorUnit || 0) }, '找不到要編輯的小節。');

  const currentNotation = context.located.bar.rhythm ?? '';
  const currentCursorUnits = getCursorUnitsForNotation(currentNotation, context.timeSignature);
  const safeCursor = sanitizeCursor(cursor, currentCursorUnits);

  if (action.type === 'home') return result(song, { cursorUnit: currentCursorUnits[0] ?? 0 }, null);
  if (action.type === 'end') return result(song, { cursorUnit: currentCursorUnits.at(-1) ?? 0 }, null);
  if (action.type === 'move') {
    const currentIndex = currentCursorUnits.findIndex((unit) => rhythmUnitsEqual(unit, safeCursor.cursorUnit));
    const nextIndex = Math.max(0, Math.min(currentCursorUnits.length - 1, currentIndex + action.direction));
    return result(song, { cursorUnit: currentCursorUnits[nextIndex] ?? safeCursor.cursorUnit }, null);
  }

  if (action.type === 'insert') {
    const template = parseEditableToken(action.token, context.timeSignature);
    if (!template) return result(song, safeCursor, '無效的節奏符號。');

    const cursorUnit = safeCursor.cursorUnit;
    const existingIndex = findEventIndexAtCursor(context.events, cursorUnit);
    const nextEvents = [...context.events];
    let committedEvent: RhythmEditableEvent;

    if (existingIndex !== -1) {
      const existingEvent = context.events[existingIndex];
      const positionedTemplate = positionEvent(template, existingEvent.startUnit);
      const replacement = preserveEventModifiers(existingEvent, positionedTemplate, context.timeSignature);
      const nextBoundary = context.events[existingIndex + 1]?.startUnit ?? context.barUnits;
      if (rhythmUnitsGreater(replacement.endUnit, nextBoundary)) {
        return result(song, safeCursor, '這個位置沒有足夠的節拍空間。');
      }
      nextEvents.splice(existingIndex, 1, replacement);
      committedEvent = replacement;
    } else {
      const insertedEvent = positionEvent(template, cursorUnit);
      const nextBoundary = getNextBoundary(context.events, cursorUnit, context.barUnits);
      if (rhythmUnitsGreater(insertedEvent.endUnit, nextBoundary)) {
        return result(song, safeCursor, '這個位置沒有足夠的節拍空間。');
      }
      const insertAt = context.events.findIndex((event) => event.startUnit > cursorUnit + RHYTHM_EPSILON);
      if (insertAt === -1) nextEvents.push(insertedEvent);
      else nextEvents.splice(insertAt, 0, insertedEvent);
      committedEvent = insertedEvent;
    }

    const serialized = serializeEvents(nextEvents, context.timeSignature);
    if (serialized.error) return result(song, safeCursor, serialized.error);
    const nextSong = writeNotation(song, target, serialized.notation);
    const nextCursor = sanitizeCursor(
      { cursorUnit: Math.min(context.barUnits, committedEvent.endUnit) },
      getCursorUnitsForNotation(serialized.notation, context.timeSignature)
    );
    return result(nextSong, nextCursor, null, song);
  }

  const targetIndex = findEditableEventIndex(context.events, safeCursor.cursorUnit);
  if (action.type === 'delete') {
    let deleteIndex = findEventIndexAtCursor(context.events, safeCursor.cursorUnit);
    if (deleteIndex === -1) {
      deleteIndex = [...context.events.keys()]
        .reverse()
        .find((index) => context.events[index].startUnit < safeCursor.cursorUnit - RHYTHM_EPSILON) ?? -1;
    }
    if (deleteIndex === -1 && (action.mode ?? 'delete') === 'delete') {
      deleteIndex = context.events.findIndex((event) => event.startUnit > safeCursor.cursorUnit + RHYTHM_EPSILON);
    }
    if (deleteIndex === -1) return result(song, safeCursor, null);

    const deletedEvent = context.events[deleteIndex];
    const nextEvents = context.events.filter((_, index) => index !== deleteIndex);
    const serialized = serializeEvents(nextEvents, context.timeSignature);
    if (serialized.error) return result(song, safeCursor, serialized.error);
    const previousEvent = nextEvents
      .filter((event) => event.startUnit < deletedEvent.startUnit - RHYTHM_EPSILON)
      .at(-1);
    const nextSong = writeNotation(song, target, serialized.notation);
    const nextCursor = sanitizeCursor(
      { cursorUnit: previousEvent?.startUnit ?? 0 },
      getCursorUnitsForNotation(serialized.notation, context.timeSignature)
    );
    return result(nextSong, nextCursor, null, song);
  }

  if (targetIndex === -1) return result(song, safeCursor, null);
  const event = context.events[targetIndex];

  if (action.type === 'toggle-dot') {
    if (event.isSlash) return result(song, safeCursor, '/ 不能加附點。');
    if (event.triplet) return result(song, safeCursor, '三連音不能加附點。');
    const token = `${event.base}${event.isRest ? 'r' : ''}${event.dotted ? '' : '.'}${!event.isRest && event.accent ? '^' : ''}${!event.isRest && event.tieAfter ? '~' : ''}`;
    const nextEvent = parseEditableToken(token, context.timeSignature);
    if (!nextEvent) return result(song, safeCursor, '無效的節奏符號。');
    const positionedEvent = positionEvent(nextEvent, event.startUnit);
    const nextBoundary = context.events[targetIndex + 1]?.startUnit ?? context.barUnits;
    if (rhythmUnitsGreater(positionedEvent.endUnit, nextBoundary)) {
      return result(song, safeCursor, '這個位置沒有足夠的節拍空間。');
    }

    const nextEvents = [...context.events];
    nextEvents.splice(targetIndex, 1, positionedEvent);
    const serialized = serializeEvents(nextEvents, context.timeSignature);
    if (serialized.error) return result(song, safeCursor, serialized.error);
    const nextSong = writeNotation(song, target, serialized.notation);
    const nextCursor = sanitizeCursor(
      { cursorUnit: positionedEvent.endUnit },
      getCursorUnitsForNotation(serialized.notation, context.timeSignature)
    );
    return result(nextSong, nextCursor, null, song);
  }

  if (event.isRest || event.isSlash) {
    return result(song, safeCursor, action.type === 'toggle-accent'
      ? `${event.isSlash ? '/' : '休止符'}不能加上重音。`
      : `${event.isSlash ? '/' : '休止符'}不能加上連結。`);
  }

  const nextEvents = [...context.events];
  nextEvents.splice(targetIndex, 1, {
    ...event,
    accent: action.type === 'toggle-accent' ? !event.accent : event.accent,
    tieAfter: action.type === 'toggle-tie' ? !event.tieAfter : event.tieAfter
  });
  const serialized = serializeEvents(nextEvents, context.timeSignature);
  if (serialized.error) return result(song, safeCursor, serialized.error);
  const nextSong = writeNotation(song, target, serialized.notation);
  return result(nextSong, { cursorUnit: event.startUnit }, null, song);
};
