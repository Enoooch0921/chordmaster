import type { Song } from '../types';
import { getDefaultJianpuCursor } from './jianpuEditing';
import { getDefaultRhythmCursor } from './rhythmEditing';
import {
  findSongBar,
  getBeatCount,
  getChordBeatSlots,
  type ChordInputMode,
  type SongBarIdentity
} from './songEditing';

export interface PreviewEditAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export const PREVIEW_NOTATION_MODES = ['chords', 'rhythm', 'jianpu'] as const;

export type PreviewNotationMode = typeof PREVIEW_NOTATION_MODES[number];

export interface PreviewChordCursor {
  kind: 'chord';
  slotIndex: number;
  rawChordIndex: number | null;
}

export interface PreviewRhythmCursor {
  kind: 'rhythm';
  cursorUnit: number;
}

export interface PreviewJianpuCursor {
  kind: 'jianpu';
  beatIndex: number;
  unitIndex: number;
  noteIndex?: number | null;
}

export type PreviewNotationCursor = PreviewChordCursor | PreviewRhythmCursor | PreviewJianpuCursor;

export interface PreviewCursorByMode {
  chords: PreviewChordCursor;
  rhythm: PreviewRhythmCursor;
  jianpu: PreviewJianpuCursor;
}

export type PreviewNotationCursorForMode<Mode extends PreviewNotationMode> = Extract<
  PreviewNotationCursor,
  { kind: Mode extends 'chords' ? 'chord' : Mode }
>;

export type PreviewBarEditField = PreviewNotationMode | 'symbols' | 'text';
export type PreviewEditField = PreviewBarEditField | 'sectionName';

interface PreviewEditTargetBase {
  previewIdentity: string;
  sectionId: string;
  anchorKey: string;
  anchorRect: PreviewEditAnchorRect;
}

export interface PreviewBarEditTarget extends PreviewEditTargetBase {
  kind: 'bar';
  barId: string;
  field: PreviewBarEditField;
  slotIndex: number;
  rawChordIndex: number | null;
  /**
   * Semantic notation position. `slotIndex` and `rawChordIndex` remain above
   * while callers migrate from chord-only preview targets.
   */
  cursor?: PreviewNotationCursor;
}

export interface PreviewSectionEditTarget extends PreviewEditTargetBase {
  kind: 'section';
  field: 'sectionName';
  // Kept as context for focus restoration after a split. Section targets do
  // not use beat-slot semantics.
  barId: string;
  slotIndex: 0;
  rawChordIndex: null;
}

export type PreviewEditTarget = PreviewBarEditTarget | PreviewSectionEditTarget;

export interface PreviewEditSession {
  previewIdentity: string;
  baseSong: Song;
  draftSong: Song;
  target: PreviewEditTarget;
  notationMode: PreviewNotationMode;
  cursorByMode: PreviewCursorByMode;
  chordInputMode: ChordInputMode;
  /** @deprecated Use `chordInputMode`. Kept in sync for staged migration. */
  inputMode: ChordInputMode;
  past: Song[];
  future: Song[];
  dirty: boolean;
  lastMergeKey: string | null;
  lastMutationAt: number;
  targetStatus: 'active' | 'deleted';
}

export const isPreviewNotationMode = (value: string): value is PreviewNotationMode => (
  PREVIEW_NOTATION_MODES.some((mode) => mode === value)
);

export const getNextPreviewNotationMode = (mode: PreviewNotationMode): PreviewNotationMode => {
  const currentIndex = PREVIEW_NOTATION_MODES.indexOf(mode);
  return PREVIEW_NOTATION_MODES[(currentIndex + 1) % PREVIEW_NOTATION_MODES.length];
};

export const getPreviewNotationModeForCursor = (
  cursor: PreviewNotationCursor
): PreviewNotationMode => (cursor.kind === 'chord' ? 'chords' : cursor.kind);

export const getDefaultPreviewNotationCursor = <Mode extends PreviewNotationMode>(
  mode: Mode
): PreviewNotationCursorForMode<Mode> => {
  const cursor = mode === 'chords'
    ? { kind: 'chord' as const, slotIndex: 0, rawChordIndex: null }
    : mode === 'rhythm'
      ? { kind: 'rhythm' as const, cursorUnit: 0 }
      : { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null };
  return cursor as PreviewNotationCursorForMode<Mode>;
};

export const getDefaultPreviewCursorByMode = (): PreviewCursorByMode => ({
  chords: getDefaultPreviewNotationCursor('chords'),
  rhythm: getDefaultPreviewNotationCursor('rhythm'),
  jianpu: getDefaultPreviewNotationCursor('jianpu')
});

const setCursorForMode = (
  cursorByMode: PreviewCursorByMode,
  cursor: PreviewNotationCursor
): PreviewCursorByMode => {
  switch (cursor.kind) {
    case 'chord':
      return { ...cursorByMode, chords: cursor };
    case 'rhythm':
      return { ...cursorByMode, rhythm: cursor };
    case 'jianpu':
      return { ...cursorByMode, jianpu: cursor };
  }
};

/**
 * Rebuild every mode cursor when the active bar identity changes. This keeps a
 * cursor remembered in (for example) a 6/8 bar from becoming invalid after
 * navigation into a 3/4 bar, while preserving the exact cursor supplied for
 * the mode that initiated the navigation.
 */
export const getPreviewCursorByModeForBar = (
  song: Song,
  target: SongBarIdentity,
  activeCursor?: PreviewNotationCursor
): PreviewCursorByMode => {
  const located = findSongBar(song, target);
  const beatCount = located ? getBeatCount(song, located.bar) : 4;
  const cursors: PreviewCursorByMode = {
    chords: {
      kind: 'chord',
      slotIndex: 0,
      rawChordIndex: located
        ? getChordBeatSlots(located.bar, beatCount)[0]?.rawChordIndex ?? null
        : null
    },
    rhythm: { kind: 'rhythm', ...getDefaultRhythmCursor(song, target) },
    jianpu: { kind: 'jianpu', ...getDefaultJianpuCursor(song, target) }
  };
  return activeCursor ? setCursorForMode(cursors, activeCursor) : cursors;
};

const getTargetNotationCursor = (target: PreviewEditTarget): PreviewNotationCursor | null => {
  if (target.kind !== 'bar') return null;
  if (target.cursor) return target.cursor;
  if (target.field === 'chords') {
    return {
      kind: 'chord',
      slotIndex: target.slotIndex,
      rawChordIndex: target.rawChordIndex
    };
  }
  if (target.field === 'rhythm') return getDefaultPreviewNotationCursor('rhythm');
  if (target.field === 'jianpu') return getDefaultPreviewNotationCursor('jianpu');
  return null;
};

export const getPreviewNotationModeForTarget = (
  target: PreviewEditTarget,
  fallback: PreviewNotationMode = 'chords'
): PreviewNotationMode => {
  const cursor = getTargetNotationCursor(target);
  if (cursor) return getPreviewNotationModeForCursor(cursor);
  if (target.kind !== 'bar') return fallback;
  if (isPreviewNotationMode(target.field)) return target.field;
  // Symbols and text are legacy chord-keyboard tools, not notation modes.
  return 'chords';
};

const songHasTarget = (song: Song, target: PreviewEditTarget) => (
  song.sections.some((section) => (
    section.id === target.sectionId
    && (target.kind === 'section' || section.bars.some((bar) => bar.id === target.barId))
  ))
);

export const createPreviewEditSession = ({
  song,
  target,
  inputMode,
  chordInputMode,
  notationMode,
  cursorByMode
}: {
  song: Song;
  target: PreviewEditTarget;
  /** @deprecated Prefer `chordInputMode`. */
  inputMode?: ChordInputMode;
  chordInputMode?: ChordInputMode;
  notationMode?: PreviewNotationMode;
  cursorByMode?: Partial<PreviewCursorByMode>;
}): PreviewEditSession => {
  const resolvedChordInputMode = chordInputMode ?? inputMode ?? 'letters';
  const targetCursor = getTargetNotationCursor(target);
  const initialCursorByMode: PreviewCursorByMode = {
    ...getDefaultPreviewCursorByMode(),
    ...cursorByMode
  };
  const resolvedCursorByMode = targetCursor
    ? setCursorForMode(initialCursorByMode, targetCursor)
    : initialCursorByMode;
  return {
    previewIdentity: target.previewIdentity,
    baseSong: song,
    draftSong: song,
    target,
    notationMode: notationMode ?? getPreviewNotationModeForTarget(target),
    cursorByMode: resolvedCursorByMode,
    chordInputMode: resolvedChordInputMode,
    inputMode: resolvedChordInputMode,
    past: [],
    future: [],
    dirty: false,
    lastMergeKey: null,
    lastMutationAt: 0,
    targetStatus: 'active'
  };
};

export const retargetPreviewEditSession = (
  session: PreviewEditSession,
  target: PreviewEditTarget
): PreviewEditSession => {
  const cursor = getTargetNotationCursor(target);
  return {
    ...session,
    target,
    notationMode: getPreviewNotationModeForTarget(target, session.notationMode),
    cursorByMode: cursor ? setCursorForMode(session.cursorByMode, cursor) : session.cursorByMode,
    lastMergeKey: null,
    lastMutationAt: 0,
    targetStatus: 'active'
  };
};

export const markPreviewTargetDeleted = (
  session: PreviewEditSession
): PreviewEditSession => ({
  ...session,
  targetStatus: 'deleted',
  lastMergeKey: null,
  lastMutationAt: 0
});

export const setPreviewEditChordInputMode = (
  session: PreviewEditSession,
  chordInputMode: ChordInputMode
): PreviewEditSession => ({
  ...session,
  chordInputMode,
  inputMode: chordInputMode
});

export const setPreviewEditChordDisplayMode = (
  session: PreviewEditSession,
  showNashvilleNumbers: boolean
): PreviewEditSession => {
  const chordInputMode: ChordInputMode = showNashvilleNumbers ? 'nashville' : 'letters';
  const syncSongDisplayMode = (song: Song): Song => (
    Boolean(song.showNashvilleNumbers) === showNashvilleNumbers
      ? song
      : { ...song, showNashvilleNumbers }
  );
  const nextSession = setPreviewEditChordInputMode(session, chordInputMode);
  return {
    ...nextSession,
    baseSong: syncSongDisplayMode(nextSession.baseSong),
    draftSong: syncSongDisplayMode(nextSession.draftSong),
    past: nextSession.past.map(syncSongDisplayMode),
    future: nextSession.future.map(syncSongDisplayMode)
  };
};

/** @deprecated Use `setPreviewEditChordInputMode`. */
export const setPreviewEditInputMode = setPreviewEditChordInputMode;

export const setPreviewNotationCursor = (
  session: PreviewEditSession,
  cursor: PreviewNotationCursor
): PreviewEditSession => ({
  ...session,
  notationMode: getPreviewNotationModeForCursor(cursor),
  cursorByMode: setCursorForMode(session.cursorByMode, cursor)
});

export const setPreviewNotationMode = <Mode extends PreviewNotationMode>(
  session: PreviewEditSession,
  notationMode: Mode,
  cursor?: PreviewNotationCursorForMode<Mode>
): PreviewEditSession => ({
  ...session,
  notationMode,
  cursorByMode: cursor
    ? setCursorForMode(session.cursorByMode, cursor)
    : session.cursorByMode
});

export const cyclePreviewNotationMode = (
  session: PreviewEditSession
): PreviewEditSession => setPreviewNotationMode(
  session,
  getNextPreviewNotationMode(session.notationMode)
);

export const applyPreviewDraft = (
  session: PreviewEditSession,
  draftSong: Song,
  options: { mergeKey?: string; now?: number } = {}
): PreviewEditSession => {
  if (draftSong === session.draftSong) return session;
  const now = options.now ?? Date.now();
  const mergeKey = options.mergeKey ?? null;
  const canMerge = Boolean(
    mergeKey
    && session.lastMergeKey === mergeKey
    && now - session.lastMutationAt <= 500
  );
  return {
    ...session,
    draftSong,
    past: canMerge ? session.past : [...session.past, session.draftSong],
    future: [],
    dirty: draftSong !== session.baseSong,
    lastMergeKey: mergeKey,
    lastMutationAt: now
  };
};

export const undoPreviewDraft = (session: PreviewEditSession): PreviewEditSession => {
  const previous = session.past.at(-1);
  if (!previous) return session;
  return {
    ...session,
    draftSong: previous,
    past: session.past.slice(0, -1),
    future: [session.draftSong, ...session.future],
    dirty: previous !== session.baseSong,
    lastMergeKey: null,
    lastMutationAt: 0,
    targetStatus: songHasTarget(previous, session.target) ? 'active' : 'deleted'
  };
};

export const redoPreviewDraft = (session: PreviewEditSession): PreviewEditSession => {
  const next = session.future[0];
  if (!next) return session;
  return {
    ...session,
    draftSong: next,
    past: [...session.past, session.draftSong],
    future: session.future.slice(1),
    dirty: next !== session.baseSong,
    lastMergeKey: null,
    lastMutationAt: 0,
    targetStatus: songHasTarget(next, session.target) ? 'active' : 'deleted'
  };
};
