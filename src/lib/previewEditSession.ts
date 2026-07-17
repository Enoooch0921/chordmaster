import type { Song } from '../types';
import type { ChordInputMode } from './songEditing';

export interface PreviewEditAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type PreviewBarEditField = 'chords' | 'symbols' | 'text';
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
  inputMode: ChordInputMode;
  past: Song[];
  future: Song[];
  dirty: boolean;
  lastMergeKey: string | null;
  lastMutationAt: number;
  targetStatus: 'active' | 'deleted';
}

const songHasTarget = (song: Song, target: PreviewEditTarget) => (
  song.sections.some((section) => (
    section.id === target.sectionId
    && (target.kind === 'section' || section.bars.some((bar) => bar.id === target.barId))
  ))
);

export const createPreviewEditSession = ({
  song,
  target,
  inputMode
}: {
  song: Song;
  target: PreviewEditTarget;
  inputMode: ChordInputMode;
}): PreviewEditSession => ({
  previewIdentity: target.previewIdentity,
  baseSong: song,
  draftSong: song,
  target,
  inputMode,
  past: [],
  future: [],
  dirty: false,
  lastMergeKey: null,
  lastMutationAt: 0,
  targetStatus: 'active'
});

export const retargetPreviewEditSession = (
  session: PreviewEditSession,
  target: PreviewEditTarget
): PreviewEditSession => ({
  ...session,
  target,
  lastMergeKey: null,
  lastMutationAt: 0,
  targetStatus: 'active'
});

export const markPreviewTargetDeleted = (
  session: PreviewEditSession
): PreviewEditSession => ({
  ...session,
  targetStatus: 'deleted',
  lastMergeKey: null,
  lastMutationAt: 0
});

export const setPreviewEditInputMode = (
  session: PreviewEditSession,
  inputMode: ChordInputMode
): PreviewEditSession => ({ ...session, inputMode });

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
