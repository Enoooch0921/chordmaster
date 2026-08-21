import React from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Delete,
  Eraser,
  Keyboard,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  X
} from 'lucide-react';
import type { AnnotationColorId, AppLanguage, Bar, Key, NavigationMarker, Song } from '../../types';
import {
  PREVIEW_NOTATION_MODES,
  type PreviewEditSession,
  type PreviewNotationCursor,
  type PreviewNotationMode
} from '../../lib/previewEditSession';
import type { PreviewEditorDeviceLayout } from '../../lib/previewEditorLayout';
import { getRestGlyph, parseTimeSignature } from '../../utils/rhythmUtils';
import type { JianpuInputMode } from '../../utils/jianpuUtils';
import KeyPicker from '../KeyPicker';
import {
  applyJianpuCommand,
  DEFAULT_JIANPU_INPUT_MODE,
  getJianpuInputModeAtCursor,
  type JianpuPitchContext,
  type JianpuAction
} from '../../lib/jianpuEditing';
import {
  applyRhythmEdit,
  getRhythmEventAtCursor,
  type RhythmEditAction
} from '../../lib/rhythmEditing';
import {
  ANNOTATION_COLOR_OPTIONS,
  DEFAULT_RHYTHM_MARK_COLOR,
  DEFAULT_SPECIAL_CHORD_COLOR,
  DEFAULT_UNISON_MARK_COLOR,
  getAnnotationColorOption
} from '../../constants/annotationColors';
import {
  applyBarKeyChange,
  convertDisplayedChordToStoredChord,
  convertStoredChordToDisplayedChord,
  findSongBar,
  getBeatCount,
  getChordBeatSlots,
  getChordPlacementError,
  getEffectiveTimeSignatureForBar,
  getMultiMeasureRestPlacementError,
  getSongKeyStates,
  insertChordBeatBeforeSlot,
  isBarCompletelyEmpty,
  normalizeChordTextInput,
  setBarChordText,
  setChordAtBeatSlot,
  setMultiMeasureRestAtBar,
  toggleEndingNumber,
  updateEditableBarFields
} from '../../lib/songEditing';
import { getTransposeOffset, transposeKeyPreservingSpelling, transposeKeyWithPreference } from '../../utils/musicUtils';
import {
  JianpuInputGlyph,
  JianpuTripletKeyGlyph,
  RhythmStaffKeyGlyph
} from './NotationKeyGlyphs';
import BeatSlashGlyph from '../BeatSlashGlyph';

type KeyboardMode = 'common' | 'advanced' | 'symbols' | 'text';
type KeyboardPicker = 'quality' | 'time' | 'special' | 'articulation' | 'ending' | 'navigation' | 'barline' | 'structure' | 'bar' | null;
type StructureAction = 'insert-before' | 'insert-after' | 'duplicate' | 'copy-bar' | 'paste-bar-after' | 'delete' | 'split-section' | 'insert-section-after';

interface PickerAnchor {
  left: number;
  top: number;
  width: number;
  height?: number;
}

interface PreviewBarEditorProps {
  session: PreviewEditSession;
  language: AppLanguage;
  deviceLayout: PreviewEditorDeviceLayout;
  storedKey: Key;
  displayedKey: Key;
  storageMode: 'letters' | 'nashville';
  onApplyDraft: (song: Song, options?: { mergeKey?: string }) => void;
  onInputModeChange: (mode: 'letters' | 'nashville') => void;
  onNotationModeChange: (mode: PreviewNotationMode) => void;
  onNotationCursorChange: (cursor: PreviewNotationCursor) => void;
  onJianpuInputAbsoluteChange: (value: boolean) => void;
  jianpuPitchContext?: JianpuPitchContext;
  onNavigate: (
    direction: 'previous' | 'next',
    cursor?: PreviewNotationCursor,
    options?: { bar: boolean }
  ) => void;
  onStructure: (action: StructureAction) => void;
  hasCopiedBar?: boolean;
  hasCopiedJianpu?: boolean;
  onCopyJianpu?: () => void;
  onPasteJianpu?: () => void;
  hasCopiedRhythm?: boolean;
  onCopyRhythm?: () => void;
  onPasteRhythm?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDone: () => void;
  onCancel: () => void;
  onPanelHeightChange?: (height: number) => void;
}

const QUALITY_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const EXPANDED_QUALITIES = ['9', 'maj9', 'm9', '11', 'm11', '13', 'm13', 'mMaj7', 'm7b5', '7sus4', '7b5', '7#5', '7b9', '7#9', '7#11', '7b13', 'add2', 'add11'];
const PICKER_QUALITIES = ['m6', 'sus2', 'dim7', 'aug', ...EXPANDED_QUALITIES];
const TIME_SIGNATURES = ['2/2', '3/2', '2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '3/8', '5/8', '6/8', '7/8', '9/8', '12/8'];
const ENDINGS = ['1', '2', '3', '1,2'];

const getEndingShortcutDigit = (key: string, code: string) => {
  const codeMatch = code.match(/^(?:Digit|Numpad)([1-9])$/);
  if (codeMatch) return codeMatch[1];
  return /^[1-9]$/.test(key) ? key : null;
};

const trailingModifiers = (value: string) => value.match(/[<>^~]+$/)?.[0] ?? '';
const withoutModifiers = (value: string) => value.replace(/[<>^~]+$/, '');

const parseChordParts = (value: string, mode: 'letters' | 'nashville') => {
  const modifiers = trailingModifiers(value);
  const clean = withoutModifiers(value);
  const slashAt = clean.indexOf('/');
  const main = slashAt >= 0 ? clean.slice(0, slashAt) : clean;
  const bass = slashAt >= 0 ? clean.slice(slashAt + 1) : '';
  const match = mode === 'letters'
    ? main.match(/^([A-G])([#b]?)(.*)$/i)
    : main.match(/^([b#]?)([1-7])(.*)$/);
  if (!match) return { root: '', accidental: '', quality: '', bass, modifiers };
  return mode === 'letters'
    ? { root: match[1].toUpperCase(), accidental: match[2], quality: match[3], bass, modifiers }
    : { root: match[2], accidental: match[1], quality: match[3], bass, modifiers };
};

const buildChord = ({
  root,
  accidental,
  quality,
  bass,
  modifiers,
  mode
}: ReturnType<typeof parseChordParts> & { mode: 'letters' | 'nashville' }) => {
  const main = mode === 'letters' ? `${root}${accidental}${quality}` : `${accidental}${root}${quality}`;
  return `${main}${bass ? `/${bass}` : ''}${modifiers}`;
};

const appendAccidental = (
  parts: ReturnType<typeof parseChordParts>,
  accidental: 'b' | '#'
) => (
  parts.accidental || parts.quality
    ? { ...parts, quality: `${parts.quality}${accidental}` }
    : { ...parts, accidental }
);

const EndingGlyph: React.FC<{ value: string }> = ({ value }) => (
  <span data-ending-glyph className="relative block h-6 w-full border-l-[3px] border-t-[3px] border-current">
    <span className="absolute left-1 top-1 inline-flex min-w-[1.15rem] items-center justify-center rounded-[2px] border border-current bg-white px-1 py-[1px] text-[11px] font-black leading-none">
      {value.split(',').map((part) => `${part.trim()}.`).join(' ')}
    </span>
  </span>
);

const TimeSignatureGlyph: React.FC<{ value: string }> = ({ value }) => {
  const [beats, unit] = value.split('/');
  return (
    <span data-time-signature-glyph className="inline-flex min-w-5 flex-col items-center text-base font-black leading-[0.72]" aria-hidden="true">
      <span>{beats}</span>
      <span className="mt-0.5 w-full border-t border-current pt-0.5 text-center">{unit}</span>
    </span>
  );
};

const DirectionGlyph: React.FC<{ direction: 'push' | 'pull' }> = ({ direction }) => (
  <svg viewBox="0 0 32 24" className="h-6 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {direction === 'push'
      ? <><path d="M16 20c0-8 4-10 12-10" /><path d="M25 7l3 3-3 3" /></>
      : <><path d="M16 20c0-8-4-10-12-10" /><path d="M7 7l-3 3 3 3" /></>}
  </svg>
);

const MultiMeasureRestGlyph: React.FC = () => (
  <span className="flex w-full items-center justify-center leading-none" aria-hidden="true">
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-3.5 w-12">
      <line x1="3" y1="1" x2="3" y2="19" stroke="currentColor" strokeWidth="2" />
      <line x1="97" y1="1" x2="97" y2="19" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="7" width="94" height="6" fill="currentColor" />
    </svg>
  </span>
);

const CodaGlyph: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2v20M2 12h20" />
  </svg>
);

const SegnoGlyph: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 7.5C7 4.8 9.2 3 12.1 3c2.7 0 4.7 1.3 5.4 3.5M16.9 16.3c0 2.8-2.2 4.7-5.2 4.7-2.8 0-4.8-1.4-5.4-3.7" />
    <path d="M7 7.5c0 2.7 2.5 3.5 5.1 4.3 2.5.8 4.8 1.7 4.8 4.5M5 20L19 4" />
    <circle cx="5.2" cy="8.2" r="1" fill="currentColor" stroke="none" />
    <circle cx="18.8" cy="15.8" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const modeForField = (field: PreviewEditSession['target']['field']): KeyboardMode => (
  field === 'text' ? 'text' : 'common'
);

const getCleanChordMarks = (marks: Bar['chordMarks']) => (
  marks && Object.keys(marks).length > 0 ? marks : undefined
);

const PreviewBarEditor: React.FC<PreviewBarEditorProps> = ({
  session,
  language,
  deviceLayout,
  storedKey,
  displayedKey,
  storageMode,
  onApplyDraft,
  onInputModeChange,
  onNotationModeChange,
  onNotationCursorChange,
  onJianpuInputAbsoluteChange,
  jianpuPitchContext,
  onNavigate,
  onStructure,
  hasCopiedBar = false,
  hasCopiedJianpu = false,
  onCopyJianpu,
  onPasteJianpu,
  hasCopiedRhythm = false,
  onCopyRhythm,
  onPasteRhythm,
  onUndo,
  onRedo,
  onDone,
  onCancel,
  onPanelHeightChange
}) => {
  const [mode, setMode] = React.useState<KeyboardMode>(() => modeForField(session.target.field));
  const [activePicker, setActivePicker] = React.useState<KeyboardPicker>(null);
  const [pickerAnchor, setPickerAnchor] = React.useState<PickerAnchor | null>(null);
  const [bassMode, setBassMode] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [desktopKeysVisible, setDesktopKeysVisible] = React.useState(() => (
    deviceLayout !== 'desktop' || session.target.field !== 'chords'
  ));
  const [barText, setBarText] = React.useState('');
  const [barTextError, setBarTextError] = React.useState<string | null>(null);
  const [multiRestCount, setMultiRestCount] = React.useState('4');
  const [multiRestActionError, setMultiRestActionError] = React.useState<string | null>(null);
  const [notationActionError, setNotationActionError] = React.useState<string | null>(null);
  const [jianpuInputMode, setJianpuInputMode] = React.useState<JianpuInputMode>(() => ({
    ...DEFAULT_JIANPU_INPUT_MODE
  }));
  const [, forceViewportUpdate] = React.useReducer((value) => value + 1, 0);
  const panelRef = React.useRef<HTMLElement>(null);
  const chordCaptureRef = React.useRef<HTMLInputElement>(null);
  const multiRestInputRef = React.useRef<HTMLInputElement>(null);

  const located = findSongBar(session.draftSong, session.target);
  const bar = located?.bar;
  const section = located?.section
    ?? session.draftSong.sections.find((candidate) => candidate.id === session.target.sectionId);
  const beatCount = bar ? getBeatCount(session.draftSong, bar) : 4;
  const notationMode = session.notationMode;
  const chordInputMode = session.chordInputMode;
  const rhythmCursor = session.cursorByMode.rhythm;
  const jianpuCursor = session.cursorByMode.jianpu;
  const storedChord = bar ? getChordBeatSlots(bar, beatCount)[session.target.slotIndex]?.chord ?? '' : '';
  const displayedChord = convertStoredChordToDisplayedChord({
    chord: storedChord,
    storageMode,
    outputMode: chordInputMode,
    storedKey,
    displayedKey
  });
  const chordParts = parseChordParts(displayedChord, chordInputMode);
  const rootChoices = chordInputMode === 'letters'
    ? ['C', 'D', 'E', 'F', 'G', 'A', 'B']
    : ['1', '2', '3', '4', '5', '6', '7'];
  const multiRestPlacementError = getMultiMeasureRestPlacementError(session.draftSong, session.target);
  const halfRestPlacementError = getChordPlacementError(session.draftSong, session.target, '0h');
  const multiRestCountNumber = Number.parseInt(multiRestCount, 10);
  const hasValidMultiRestCount = Number.isInteger(multiRestCountNumber) && multiRestCountNumber >= 1 && multiRestCountNumber <= 999;
  const selectedRhythmEvent = bar
    ? getRhythmEventAtCursor(session.draftSong, session.target, rhythmCursor)
    : null;
  const effectiveBarTimeSignature = bar
    ? getEffectiveTimeSignatureForBar(session.draftSong, bar)
    : session.draftSong.timeSignature || '4/4';
  const keyStates = getSongKeyStates(session.draftSong);
  const sectionIndex = located?.sectionIndex ?? -1;
  const barIndex = located?.barIndex ?? -1;
  const globalKeyShift = getTransposeOffset(session.draftSong.originalKey, session.draftSong.currentKey);
  const barBaseKey = sectionIndex >= 0 && barIndex >= 0
    ? keyStates.barBaseKeys[sectionIndex]?.[barIndex]
      ?? keyStates.sectionActiveKeys[sectionIndex]
      ?? session.draftSong.originalKey
    : session.draftSong.originalKey;
  const barWrittenKey = sectionIndex >= 0 && barIndex >= 0
    ? keyStates.barActiveKeys[sectionIndex]?.[barIndex] ?? barBaseKey
    : barBaseKey;
  const barDisplayBaseKey = transposeKeyWithPreference(barBaseKey, globalKeyShift, session.draftSong.currentKey);
  const barTargetKey = bar?.keyChangeTo
    ? transposeKeyPreservingSpelling(bar.keyChangeTo, globalKeyShift)
    : undefined;
  const barDisplayKey = barTargetKey ?? transposeKeyWithPreference(barWrittenKey, globalKeyShift, session.draftSong.currentKey);

  React.useEffect(() => {
    setMode(modeForField(session.target.field));
    setActivePicker(null);
    setPickerAnchor(null);
    setNotationActionError(null);
    if (deviceLayout === 'desktop' && (notationMode !== 'chords' || session.target.field !== 'chords')) {
      setDesktopKeysVisible(true);
    }
  }, [deviceLayout, notationMode, session.target.barId, session.target.field, session.target.slotIndex]);

  React.useEffect(() => {
    setBassMode(false);
  }, [session.target.barId, session.target.slotIndex]);

  React.useEffect(() => {
    if (notationMode !== 'jianpu' || !bar) return;
    const selectedMode = getJianpuInputModeAtCursor(
      session.draftSong,
      session.target,
      {
        beatIndex: jianpuCursor.beatIndex,
        unitIndex: jianpuCursor.unitIndex,
        noteIndex: jianpuCursor.noteIndex ?? null
      },
      jianpuPitchContext
    );
    if (selectedMode) setJianpuInputMode(selectedMode);
  }, [bar, jianpuCursor.beatIndex, jianpuCursor.noteIndex, jianpuCursor.unitIndex, jianpuPitchContext, notationMode, session.draftSong, session.target]);

  React.useEffect(() => {
    setBarText(bar?.chords.filter((token) => token.trim()).join(' ') ?? '');
    setBarTextError(null);
    setMultiRestActionError(null);
    setNotationActionError(null);
    const existingCount = bar?.chords.find((token) => /^\|\d{1,3}\|$/.test(token.trim()))?.match(/\d+/)?.[0];
    if (existingCount) setMultiRestCount(existingCount);
  }, [bar?.id, bar?.chords]);

  React.useEffect(() => {
    if (deviceLayout !== 'desktop' || notationMode !== 'chords' || session.target.field !== 'chords') return;
    const capture = chordCaptureRef.current;
    capture?.focus({ preventScroll: true });
    capture?.setSelectionRange(capture.value.length, capture.value.length);
  }, [deviceLayout, notationMode, session.previewIdentity, session.target.barId, session.target.field, session.target.slotIndex]);

  React.useEffect(() => {
    const node = panelRef.current;
    if (!node || !onPanelHeightChange) return;
    const report = () => onPanelHeightChange(node.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === 'undefined') {
      return () => onPanelHeightChange(0);
    }
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => {
      observer.disconnect();
      onPanelHeightChange(0);
    };
  }, [onPanelHeightChange]);

  React.useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => forceViewportUpdate();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  React.useEffect(() => {
    if (!activePicker) return;
    const closePickerOnOutsidePress = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-preview-picker-popover]')) return;
      if (event.target.closest(`[data-picker-trigger="${activePicker}"]`)) return;
      setActivePicker(null);
      setPickerAnchor(null);
    };
    document.addEventListener('pointerdown', closePickerOnOutsidePress, true);
    return () => document.removeEventListener('pointerdown', closePickerOnOutsidePress, true);
  }, [activePicker]);

  function applyDisplayedChord(value: string, mergeKey?: string) {
    const normalizedInput = normalizeChordTextInput(value, chordInputMode);
    const stored = convertDisplayedChordToStoredChord({
      input: normalizedInput,
      inputMode: chordInputMode,
      storageMode,
      displayedKey,
      storedKey
    });
    const placementError = getChordPlacementError(session.draftSong, session.target, stored);
    if (placementError) {
      setMultiRestActionError(placementError);
      return false;
    }
    setMultiRestActionError(null);
    onApplyDraft(setChordAtBeatSlot(session.draftSong, session.target, stored), mergeKey ? { mergeKey } : undefined);
    return true;
  }

  function applyRhythmAction(action: RhythmEditAction) {
    const result = applyRhythmEdit(session.draftSong, session.target, rhythmCursor, action);
    setNotationActionError(result.error);
    onNotationCursorChange({ kind: 'rhythm', cursorUnit: result.cursor.cursorUnit });
    if (result.changed) onApplyDraft(result.song);
    if (
      action.type === 'insert'
      && result.changed
      && !result.error
      && result.cursor.cursorUnit >= parseTimeSignature(effectiveBarTimeSignature).barUnits
    ) {
      window.requestAnimationFrame(() => {
        onNavigate('next', undefined, { bar: true });
      });
    }
    return result;
  }

  function applyJianpuAction(action: JianpuAction) {
    const result = applyJianpuCommand(session.draftSong, session.target, {
      beatIndex: jianpuCursor.beatIndex,
      unitIndex: jianpuCursor.unitIndex,
      noteIndex: jianpuCursor.noteIndex ?? null
    }, action, jianpuInputMode, jianpuPitchContext);
    setNotationActionError(result.error);
    setJianpuInputMode(result.inputMode);
    const movedToAnotherBar = result.target.sectionId !== session.target.sectionId
      || result.target.barId !== session.target.barId;
    if (movedToAnotherBar) {
      const direction = action.type === 'move'
        ? action.direction < 0 ? 'previous' : 'next'
        : action.type === 'delete' && action.direction === 'backward'
          ? 'previous'
          : 'next';
      onNavigate(direction, {
        kind: 'jianpu',
        beatIndex: result.cursor.beatIndex,
        unitIndex: result.cursor.unitIndex,
        noteIndex: result.cursor.noteIndex
      });
    } else {
      onNotationCursorChange({
        kind: 'jianpu',
        beatIndex: result.cursor.beatIndex,
        unitIndex: result.cursor.unitIndex,
        noteIndex: result.cursor.noteIndex
      });
    }
    if (result.song !== session.draftSong) onApplyDraft(result.song);
    return result;
  }

  function toggleJianpuDuration(duration: 'eighth' | 'sixteenth') {
    applyJianpuAction({
      type: 'set-duration',
      duration: jianpuInputMode.duration === duration ? 'quarter' : duration
    });
  }

  function applyChordBarMarkerShortcut(key: string, code: string) {
    if (key === '[' || code === 'BracketLeft') {
      updateFields({ repeatStart: !bar?.repeatStart });
      return true;
    }
    if (key === ']' || code === 'BracketRight') {
      const nextRepeatEnd = !bar?.repeatEnd;
      updateFields({
        repeatEnd: nextRepeatEnd,
        finalBar: nextRepeatEnd ? false : bar?.finalBar
      });
      return true;
    }
    if (key === '\\' || code === 'Backslash') {
      const nextFinalBar = !bar?.finalBar;
      updateFields({
        finalBar: nextFinalBar,
        repeatEnd: nextFinalBar ? false : bar?.repeatEnd
      });
      return true;
    }
    return false;
  }

  function applyChordEndingShortcut(key: string, code: string) {
    const digit = getEndingShortcutDigit(key, code);
    if (!digit) return false;
    updateFields(
      { ending: toggleEndingNumber(bar?.ending, digit) },
      `ending:${bar?.id ?? session.target.barId}`
    );
    setActivePicker(null);
    return true;
  }

  function changeNotationMode(nextMode: PreviewNotationMode) {
    if (nextMode === notationMode) return;
    setMode('common');
    setActivePicker(null);
    setPickerAnchor(null);
    setBassMode(false);
    setNotationActionError(null);
    setCollapsed(false);
    onNotationModeChange(nextMode);
  }

  function navigateNotation(direction: 'previous' | 'next') {
    if (notationMode === 'rhythm') {
      const result = applyRhythmAction({ type: 'move', direction: direction === 'previous' ? -1 : 1 });
      if (result.cursor.cursorUnit === rhythmCursor.cursorUnit) onNavigate(direction);
      return;
    }
    if (notationMode === 'jianpu') {
      const result = applyJianpuAction({ type: 'move', direction: direction === 'previous' ? -1 : 1 });
      const movedToAnotherBar = result.target.sectionId !== session.target.sectionId
        || result.target.barId !== session.target.barId;
      if (movedToAnotherBar) return;
      const didMove = result.cursor.beatIndex !== jianpuCursor.beatIndex
        || result.cursor.unitIndex !== jianpuCursor.unitIndex
        || result.cursor.noteIndex !== (jianpuCursor.noteIndex ?? null);
      if (!didMove) onNavigate(direction);
      return;
    }
    onNavigate(direction);
  }

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      const isTyping = element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT' || element?.isContentEditable;
      const isButtonActivation = element?.tagName === 'BUTTON' && (event.key === 'Enter' || event.key === ' ');
      const meta = event.metaKey || event.ctrlKey;
      const isChordEditing = notationMode === 'chords' && session.target.field === 'chords';
      if (event.defaultPrevented) return;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) onRedo(); else onUndo();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onDone();
        return;
      }
      if (meta && event.key === 'Enter') {
        event.preventDefault();
        return;
      }
      if (
        !isTyping
        && !isButtonActivation
        && isChordEditing
        && event.altKey
        && !event.shiftKey
        && !meta
        && applyChordEndingShortcut(event.key, event.code)
      ) {
        event.preventDefault();
        return;
      }
      if (isTyping || isButtonActivation || event.altKey || meta) return;
      if (isChordEditing && event.shiftKey && event.key === ' ') {
        event.preventDefault();
        onApplyDraft(
          insertChordBeatBeforeSlot(session.draftSong, session.target),
          { mergeKey: `insert-beat-before:${bar?.id ?? session.target.barId}:${session.target.slotIndex}` }
        );
      } else if (isChordEditing && event.shiftKey && event.key === 'Enter') {
        event.preventDefault();
        onStructure('insert-before');
      } else if (isChordEditing && !event.shiftKey && event.key === 'Enter') {
        event.preventDefault();
        onNavigate('next', undefined, { bar: true });
      } else if (isChordEditing && !event.shiftKey && event.key === ' ') {
        event.preventDefault();
        onNavigate('next');
      } else if (isChordEditing && event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        onNavigate('previous', undefined, { bar: true });
      } else if (isChordEditing && event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault();
        onNavigate('next', undefined, { bar: true });
      } else if (isChordEditing && !event.shiftKey && applyChordBarMarkerShortcut(event.key, event.code)) {
        event.preventDefault();
      } else if (notationMode === 'rhythm' && !event.shiftKey && event.key === 'Enter') {
        event.preventDefault();
        onNavigate('next', undefined, { bar: true });
      } else if (notationMode === 'rhythm' && !event.shiftKey && event.key === ' ') {
        event.preventDefault();
        navigateNotation('next');
      } else if (notationMode === 'jianpu' && !event.shiftKey && event.key === 'Enter') {
        event.preventDefault();
        onNavigate('next', undefined, { bar: true });
      } else if (notationMode === 'jianpu' && !event.shiftKey && event.key === ' ') {
        event.preventDefault();
        navigateNotation('next');
      } else if (event.key === 'ArrowLeft' || (event.key === 'Enter' && event.shiftKey)) {
        event.preventDefault();
        navigateNotation('previous');
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        navigateNotation('next');
      } else if (notationMode === 'rhythm' && (event.key === 'Home' || event.key === 'End')) {
        event.preventDefault();
        applyRhythmAction({ type: event.key === 'Home' ? 'home' : 'end' });
      } else if (notationMode === 'rhythm' && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        if (!deleteEmptyBarIfPossible()) {
          applyRhythmAction({ type: 'delete', mode: event.key === 'Backspace' ? 'backspace' : 'delete' });
        }
      } else if (notationMode === 'rhythm' && ['w', 'h', 'q', 'e', 's'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        applyRhythmAction({ type: 'insert', token: event.key.toLowerCase() });
      } else if (notationMode === 'rhythm' && event.key === '/') {
        event.preventDefault();
        applyRhythmAction({ type: 'insert', token: '/' });
      } else if (notationMode === 'rhythm' && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        applyRhythmAction({ type: 'insert', token: 'qr' });
      } else if (notationMode === 'rhythm' && event.key === '3') {
        event.preventDefault();
        applyRhythmAction({ type: 'insert', token: 'q3' });
      } else if (notationMode === 'rhythm' && event.key === '.') {
        event.preventDefault();
        applyRhythmAction({ type: 'toggle-dot' });
      } else if (notationMode === 'rhythm' && event.key === '^') {
        event.preventDefault();
        applyRhythmAction({ type: 'toggle-accent' });
      } else if (notationMode === 'rhythm' && (event.key === '~' || event.key.toLowerCase() === 't')) {
        event.preventDefault();
        applyRhythmAction({ type: 'toggle-tie' });
      } else if (notationMode === 'jianpu' && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        if (!deleteEmptyBarIfPossible()) {
          applyJianpuAction({ type: 'delete', direction: event.key === 'Backspace' ? 'backward' : 'forward' });
        }
      } else if (notationMode === 'jianpu' && /^[1-7]$/.test(event.key)) {
        event.preventDefault();
        applyJianpuAction({ type: 'insert-pitch', pitch: event.key as '1' | '2' | '3' | '4' | '5' | '6' | '7' });
      } else if (notationMode === 'jianpu' && event.key === '0') {
        event.preventDefault();
        applyJianpuAction({ type: 'insert-rest' });
      } else if (notationMode === 'jianpu' && event.key === '-') {
        event.preventDefault();
        applyJianpuAction({ type: 'insert-hold' });
      } else if (notationMode === 'jianpu' && ['q', 'e', 's'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key.toLowerCase() === 'q') {
          applyJianpuAction({ type: 'set-duration', duration: 'quarter' });
        } else {
          toggleJianpuDuration(event.key.toLowerCase() === 'e' ? 'eighth' : 'sixteenth');
        }
      } else if (notationMode === 'jianpu' && (event.key === 'ArrowDown' || event.key.toLowerCase() === 'l')) {
        event.preventDefault();
        applyJianpuAction({ type: 'set-octave', octave: jianpuInputMode.octave < 0 ? 0 : -1 });
      } else if (notationMode === 'jianpu' && (event.key === 'ArrowUp' || event.key.toLowerCase() === 'h')) {
        event.preventDefault();
        applyJianpuAction({ type: 'set-octave', octave: jianpuInputMode.octave > 0 ? 0 : 1 });
      } else if (notationMode === 'jianpu' && (event.key === '#' || event.key.toLowerCase() === 'b')) {
        event.preventDefault();
        const accidental = event.key === '#' ? '#' : 'b';
        applyJianpuAction({
          type: 'set-accidental',
          accidental: jianpuInputMode.accidental === accidental ? '' : accidental
        });
      } else if (notationMode === 'jianpu' && event.key === '.') {
        event.preventDefault();
        applyJianpuAction({ type: 'toggle-dot' });
	      } else if (notationMode === 'jianpu' && event.key.toLowerCase() === 't') {
	        event.preventDefault();
	        applyJianpuAction({ type: event.shiftKey ? 'toggle-triplet' : 'toggle-slur' });
      } else if (isChordEditing && event.key === 'Backspace') {
        event.preventDefault();
        if (displayedChord) deleteLastChordCharacter();
        else if (!deleteEmptyBarIfPossible()) onNavigate('previous');
      } else if (isChordEditing && event.key === 'Delete') {
        event.preventDefault();
        if (displayedChord) deleteLastChordCharacter();
        else deleteEmptyBarIfPossible();
      } else if (isChordEditing && event.key === '%') {
        event.preventDefault();
        applyDisplayedChord('%');
      } else if (isChordEditing && event.key.length === 1 && event.key.trim()) {
        event.preventDefault();
        applyDisplayedChord(
          `${displayedChord}${event.key}`,
          `slot-hardware:${bar?.id ?? session.target.barId}:${session.target.slotIndex}`
        );
        window.requestAnimationFrame(() => {
          const capture = chordCaptureRef.current;
          if (!capture) return;
          capture.focus({ preventScroll: true });
          capture.setSelectionRange(capture.value.length, capture.value.length);
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const applyRoot = (root: string) => {
    if (bassMode) {
      const main = withoutModifiers(displayedChord).split('/')[0] || (chordInputMode === 'letters' ? 'C' : '1');
      applyDisplayedChord(`${main}/${root}${trailingModifiers(displayedChord)}`);
      setBassMode(false);
      return;
    }
    applyDisplayedChord(buildChord({
      ...chordParts,
      root,
      accidental: '',
      quality: chordParts.root ? chordParts.quality : '',
      mode: chordInputMode
    }));
  };

  const applyAccidental = (accidental: 'b' | '#') => {
    if (bassMode) {
      const [main, currentBass = rootChoices[0]] = withoutModifiers(displayedChord).split('/');
      const parsedBass = parseChordParts(currentBass, chordInputMode);
      const root = parsedBass.root || rootChoices[0];
      const bass = buildChord({
        ...appendAccidental(parsedBass, accidental),
        root,
        bass: '',
        modifiers: '',
        mode: chordInputMode
      });
      applyDisplayedChord(`${main || rootChoices[0]}/${bass}${trailingModifiers(displayedChord)}`);
      return;
    }
    applyDisplayedChord(buildChord({
      ...appendAccidental(chordParts, accidental),
      root: chordParts.root || rootChoices[0],
      mode: chordInputMode
    }));
  };

  const appendQualityFragment = (fragment: string) => applyDisplayedChord(buildChord({
    ...chordParts,
    root: chordParts.root || rootChoices[0],
    quality: `${chordParts.quality}${fragment}`,
    mode: chordInputMode
  }));

  const applyQuality = (quality: string) => applyDisplayedChord(buildChord({
    ...chordParts,
    root: chordParts.root || rootChoices[0],
    quality,
    mode: chordInputMode
  }));

  const toggleModifier = (modifier: '<' | '>' | '^' | '~') => {
    const clean = withoutModifiers(displayedChord) || rootChoices[0];
    let modifiers = trailingModifiers(displayedChord);
    if (modifier === '<') modifiers = modifiers.replace(/>/g, '');
    if (modifier === '>') modifiers = modifiers.replace(/</g, '');
    modifiers = modifiers.includes(modifier) ? modifiers.replaceAll(modifier, '') : `${modifiers}${modifier}`;
    applyDisplayedChord(`${clean}${modifiers}`);
  };

  const applyBarText = () => {
    if (!bar) return;
    const result = setBarChordText(session.draftSong, session.target, barText);
    setBarTextError(result.error);
    if (!result.error) {
      onApplyDraft(result.song, { mergeKey: `bar-text:${bar.id}` });
      setActivePicker(null);
    }
  };

  const applyMultiMeasureRest = (count = multiRestCountNumber) => {
    const result = setMultiMeasureRestAtBar(session.draftSong, session.target, count);
    setMultiRestActionError(result.error);
    if (!result.error) {
      onApplyDraft(result.song, { mergeKey: `multi-rest:${bar?.id ?? session.target.barId}` });
    }
  };

  const deleteLastChordCharacter = () => {
    if (!displayedChord) return;
    const characters = Array.from(displayedChord);
    applyDisplayedChord(characters.slice(0, -1).join(''), `slot-backspace:${bar?.id ?? session.target.barId}:${session.target.slotIndex}`);
  };

  const deleteEmptyBarIfPossible = () => {
    if (!isBarCompletelyEmpty(bar)) return false;
    onStructure('delete');
    return true;
  };

  const updateFields = (patch: Parameters<typeof updateEditableBarFields>[2], mergeKey?: string) => {
    onApplyDraft(
      updateEditableBarFields(session.draftSong, session.target, patch),
      mergeKey ? { mergeKey } : undefined
    );
  };

  const applyBarKey = (key: Key | null) => {
    const nextWrittenKey = key ? transposeKeyWithPreference(key, -globalKeyShift, key) : undefined;
    onApplyDraft(
      applyBarKeyChange(session.draftSong, session.target, nextWrittenKey),
      { mergeKey: `bar-key:${bar?.id ?? session.target.barId}` }
    );
  };

  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const keyboardOffset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
  const isDocked = deviceLayout !== 'desktop';
  const compactHardwareMode = notationMode === 'chords' && deviceLayout === 'desktop' && !desktopKeysVisible && mode === 'common';
  const panelStyle: React.CSSProperties = deviceLayout === 'phone'
    ? {
        position: 'fixed',
        left: viewportLeft,
        bottom: keyboardOffset,
        width: viewportWidth,
        height: collapsed ? 'auto' : 'min(40dvh, 360px)'
      }
    : deviceLayout === 'tablet'
      ? {
          position: 'fixed',
          left: viewportLeft,
          bottom: keyboardOffset,
          width: viewportWidth,
          height: collapsed ? 'auto' : 'min(40dvh, 420px)'
        }
      : (() => {
          const width = Math.min(520, viewportWidth - 24);
          const estimatedHeight = mode === 'text'
            ? Math.min(300, viewportHeight - 24)
            : desktopKeysVisible
              ? Math.min(340, viewportHeight - 24)
              : Math.min(190, viewportHeight - 24);
          const preferredBelow = session.target.anchorRect.bottom + 10;
          const top = preferredBelow + estimatedHeight <= viewportTop + viewportHeight - 12
            ? preferredBelow
            : Math.max(viewportTop + 12, session.target.anchorRect.top - estimatedHeight - 10);
          const left = Math.max(viewportLeft + 12, Math.min(session.target.anchorRect.left, viewportLeft + viewportWidth - width - 12));
          return {
            position: 'fixed',
            top,
            left,
            width,
            height: estimatedHeight,
            maxHeight: viewportHeight - 24
          };
        })();

  const buttonClass = 'inline-flex min-h-8 items-center justify-center rounded-[11px] border border-white/80 bg-white/95 px-2 text-[11px] font-semibold text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.18),0_2px_5px_rgba(15,23,42,0.10)] transition-[transform,background-color,box-shadow,border-color,color] duration-75 hover:bg-white active:translate-y-px active:scale-[0.98] active:bg-slate-50 active:shadow-none disabled:shadow-none disabled:opacity-40';
  const characterKeyClass = `${buttonClass} rounded-[12px] border-white/90 bg-white/95 font-semibold text-slate-900`;
  const utilityKeyClass = `${buttonClass} border-white/40 bg-slate-300/75 text-slate-700`;
  const copyKeyClass = `${utilityKeyClass} !border-sky-300/80 !bg-sky-100/90 !text-sky-800 hover:!bg-sky-100`;
  const pasteKeyClass = `${utilityKeyClass} !border-emerald-300/80 !bg-emerald-100/90 !text-emerald-800 hover:!bg-emerald-100`;
  const destructiveKeyClass = `${utilityKeyClass} !border-rose-300/80 !bg-rose-100/90 !text-rose-700 !shadow-[0_1px_0_rgba(159,18,57,0.18),0_3px_8px_rgba(190,24,93,0.12)] hover:!bg-rose-100`;
  const toolbarButtonClass = 'inline-flex min-h-8 min-w-8 items-center justify-center rounded-[11px] border border-white/80 bg-white/85 px-2 text-[11px] font-semibold text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.09)] transition-[transform,background-color,box-shadow] duration-75 hover:bg-white active:translate-y-px active:scale-[0.97] active:bg-slate-100 disabled:shadow-none disabled:opacity-35';
  const activeButtonClass = '!border-indigo-500/70 !bg-indigo-600 !text-white !shadow-[0_1px_0_rgba(49,46,129,0.8),0_3px_8px_rgba(79,70,229,0.28)] hover:!bg-indigo-600';
  const fieldClass = 'h-9 w-full rounded-xl border border-white/90 bg-white/95 px-3 text-sm font-semibold text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/70';

  const activeChordMarkIndex = bar
    ? getChordBeatSlots(bar, beatCount)[Math.max(0, Math.min(beatCount - 1, session.target.slotIndex))]?.rawChordIndex
      ?? Math.max(0, Math.min(beatCount - 1, session.target.slotIndex))
    : Math.max(0, session.target.slotIndex);
  const activeChordMark = bar?.chordMarks?.[activeChordMarkIndex];
  const activeChordColor = activeChordMark?.color ?? (activeChordMark?.special ? DEFAULT_SPECIAL_CHORD_COLOR : undefined);
  const activeRhythmColor = bar?.rhythmMark?.color ?? (bar?.rhythmMark ? DEFAULT_RHYTHM_MARK_COLOR : undefined);
  const activeUnisonColor = bar?.unisonMark?.enabled
    ? bar.unisonMark.color ?? DEFAULT_UNISON_MARK_COLOR
    : undefined;
  const selectedPreviewColor = notationMode === 'chords'
    ? activeChordColor
    : notationMode === 'rhythm'
      ? activeRhythmColor
      : activeUnisonColor;
  const previewColorLabel = notationMode === 'chords'
    ? (language === 'zh' ? '和弦色' : 'Chord color')
    : notationMode === 'rhythm'
      ? (language === 'zh' ? '節奏色' : 'Rhythm color')
      : (language === 'zh' ? '簡譜色' : 'Jianpu color');
  const previewColorDisabled = notationMode === 'rhythm' && !bar?.rhythm?.trim();

  const updateActiveChordMark = (nextMark: NonNullable<Bar['chordMarks']>[number] | undefined) => {
    if (!bar) return;
    const nextMarks = { ...(bar.chordMarks ?? {}) };
    if (nextMark?.color || nextMark?.special) {
      nextMarks[activeChordMarkIndex] = nextMark;
    } else {
      delete nextMarks[activeChordMarkIndex];
    }
    updateFields(
      { chordMarks: getCleanChordMarks(nextMarks) },
      `chord-color:${bar.id ?? session.target.barId}:${activeChordMarkIndex}`
    );
  };

  const applyPreviewColor = (color: AnnotationColorId) => {
    if (!bar || previewColorDisabled) return;
    const shouldClear = selectedPreviewColor === color;
    if (notationMode === 'chords') {
      updateActiveChordMark(shouldClear ? undefined : { color });
      return;
    }
    if (notationMode === 'rhythm') {
      updateFields(
        { rhythmMark: shouldClear ? undefined : { color } },
        `rhythm-color:${bar.id ?? session.target.barId}`
      );
      return;
    }
    updateFields(
      { unisonMark: shouldClear ? undefined : { enabled: true, color } },
      `jianpu-color:${bar.id ?? session.target.barId}`
    );
  };

  const renderPreviewColorControls = (key: string) => (
    <div
      key={key}
      data-preview-color-controls
      data-preview-color-target={notationMode}
      className="grid min-h-0 grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-1.5"
      data-key-surface="utility"
    >
      <div className="flex min-h-0 items-center justify-center rounded-[11px] border border-white/40 bg-slate-300/70 px-1 text-[9px] font-black text-slate-600 shadow-inner">
        {previewColorLabel}
      </div>
      {ANNOTATION_COLOR_OPTIONS.map((option) => {
        const selected = option.id === selectedPreviewColor;
        const title = language === 'zh' ? option.labelZh : option.label;
        const tone = getAnnotationColorOption(option.id);

        return (
          <button
            key={option.id}
            type="button"
            disabled={previewColorDisabled}
            className={`${buttonClass} min-h-0 min-w-0 !px-0 disabled:cursor-not-allowed`}
            style={{
              backgroundColor: selected ? tone.text : tone.soft,
              borderColor: selected ? tone.text : tone.border,
              color: selected ? '#fff' : tone.text,
              boxShadow: selected
                ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px ${tone.soft}, 0 3px 8px rgba(15,23,42,0.16)`
                : undefined
            }}
            onClick={() => applyPreviewColor(option.id)}
            aria-label={`${previewColorLabel}: ${title}`}
            title={`${previewColorLabel}: ${title}`}
          >
            <span
              className="h-3.5 w-3.5 rounded-full border border-white/70"
              style={{ backgroundColor: selected ? '#fff' : tone.text }}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );

  if (!bar || !section) {
    const fallbackStyle: React.CSSProperties = isDocked
      ? {
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw'
        }
      : { position: 'fixed', left: '50%', top: '50%', width: 'min(520px, calc(100vw - 24px))', transform: 'translate(-50%, -50%)' };
    const isDeleted = session.targetStatus === 'deleted';
    return (
      <section
        ref={panelRef}
        data-preview-bar-editor
        data-preview-edit-ui
        role="dialog"
        aria-label={language === 'zh' ? '預覽快捷編輯' : 'Preview quick editor'}
        className="z-[5000] rounded-t-[26px] border border-white/80 bg-slate-100/95 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.24)] backdrop-blur-xl"
        style={{ ...fallbackStyle, paddingBottom: isDocked ? 'max(12px, env(safe-area-inset-bottom))' : undefined }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-indigo-500">{section?.title}</div>
            <div className="truncate text-sm font-black text-slate-900">
              {isDeleted
                ? (language === 'zh' ? '小節已刪除，可復原或完成這次編輯' : 'Bar deleted. Undo it or finish this edit.')
                : (language === 'zh' ? '正在恢復選取位置，請重新點選小節' : 'Restoring the selection. Please tap the bar again.')}
            </div>
          </div>
          <button type="button" className={toolbarButtonClass} disabled={session.past.length === 0} onClick={onUndo} aria-label="Undo"><Undo2 size={15} /></button>
          <button type="button" className={`${toolbarButtonClass} !text-rose-700`} onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
          <button type="button" className={`${toolbarButtonClass} !border-indigo-500 !bg-indigo-600 !text-white`} onClick={onDone} aria-label={language === 'zh' ? '完成' : 'Done'}><Check size={16} /><span className="ml-1">{language === 'zh' ? '完成' : 'Done'}</span></button>
        </div>
      </section>
    );
  }

  const barlineGlyph = bar.repeatStart && bar.repeatEnd
    ? '|: :|'
    : bar.repeatEnd
      ? ':|'
      : bar.finalBar
        ? '||'
        : bar.repeatStart
          ? '|:'
          : '|';
  const pickerTitles: Record<Exclude<KeyboardPicker, null>, string> = {
    quality: language === 'zh' ? '更多和弦種類' : 'More chord qualities',
    time: language === 'zh' ? '小節拍號' : 'Time signature',
    special: language === 'zh' ? '休止與整小節符號' : 'Rests and whole-bar symbols',
    articulation: language === 'zh' ? '演奏記號' : 'Articulation',
    ending: language === 'zh' ? '房子記號' : 'Ending',
    navigation: language === 'zh' ? '導引記號' : 'Navigation',
    barline: language === 'zh' ? '小節線與反覆' : 'Barline and repeat',
    structure: language === 'zh' ? '小節操作' : 'Bar actions',
    bar: language === 'zh' ? '整小節輸入' : 'Whole bar input'
  };
  const pickerDimensions: Record<Exclude<KeyboardPicker, null>, { width: number; height: number }> = {
    quality: { width: 360, height: 210 },
    time: { width: 370, height: 174 },
    special: { width: 360, height: 126 },
    articulation: { width: 270, height: 92 },
    ending: { width: 190, height: 272 },
    navigation: { width: 360, height: 190 },
    barline: { width: 220, height: 108 },
    structure: { width: 300, height: 160 },
    bar: { width: 350, height: 170 }
  };
  const openPicker = (picker: Exclude<KeyboardPicker, null>, trigger: HTMLElement) => {
    if (activePicker === picker) {
      setActivePicker(null);
      setPickerAnchor(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setMode('common');
    setActivePicker(picker);
    setPickerAnchor({ left: rect.left, top: rect.top, width: rect.width });
    setCollapsed(false);
  };
  const pickerSize = activePicker ? pickerDimensions[activePicker] : null;
  const pickerWidth = pickerSize ? Math.min(pickerSize.width, viewportWidth - 16) : 0;
  const pickerHeight = pickerSize ? Math.min(pickerSize.height, viewportHeight - 16) : 0;
  const pickerLeft = pickerAnchor
    ? Math.max(viewportLeft + 8, Math.min(
        pickerAnchor.left + pickerAnchor.width / 2 - pickerWidth / 2,
        viewportLeft + viewportWidth - pickerWidth - 8
      ))
    : viewportLeft + 8;
  const pickerArrowLeft = pickerAnchor
    ? Math.max(16, Math.min(pickerWidth - 16, pickerAnchor.left + pickerAnchor.width / 2 - pickerLeft))
    : pickerWidth / 2;
  const pickerTop = pickerAnchor
    ? Math.max(viewportTop + 8, pickerAnchor.top - pickerHeight - 8)
    : viewportTop + 8;
  const keyboardSurfaceMode = notationMode === 'chords' ? mode : notationMode;
  const keyboardContent = (
    <div data-keyboard-mode={keyboardSurfaceMode} data-notation-mode={notationMode} data-keyboard-surface="system" className={`relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(241,245,249,0.92)_0%,rgba(203,213,225,0.82)_100%)] ${mode === 'symbols' ? 'gap-1.5 p-2' : 'gap-2 p-2.5'}`}>
      {notationMode === 'chords' && mode === 'common' && (
        <div className={`grid min-h-0 flex-1 ${compactHardwareMode ? 'grid-rows-3' : 'grid-rows-5'} gap-2`} data-keyboard-view="main" data-desktop-compact={compactHardwareMode ? 'true' : undefined}>
          {!compactHardwareMode && (
            <>
              <div className="grid min-h-0 grid-cols-10 gap-1.5" data-chord-key-row="roots" data-key-surface="character">
                {rootChoices.map((root) => <button key={root} type="button" className={`${characterKeyClass} min-h-0 px-0 text-[15px] ${chordParts.root === root && !bassMode ? activeButtonClass : ''}`} onClick={() => applyRoot(root)}>{root}</button>)}
                <button type="button" className={`${characterKeyClass} min-h-0 px-0 text-lg ${chordParts.accidental === 'b' && !chordParts.quality ? activeButtonClass : ''}`} onClick={() => applyAccidental('b')} aria-label={language === 'zh' ? '降記號' : 'Flat'}>♭</button>
                <button type="button" className={`${characterKeyClass} min-h-0 px-0 text-lg ${chordParts.accidental === '#' && !chordParts.quality ? activeButtonClass : ''}`} onClick={() => applyAccidental('#')} aria-label={language === 'zh' ? '升記號' : 'Sharp'}>♯</button>
                <button type="button" className={`${characterKeyClass} min-h-0 px-0 text-base ${chordParts.quality.startsWith('m') ? activeButtonClass : ''}`} onClick={() => appendQualityFragment('m')} aria-label={language === 'zh' ? '加入小和弦 m' : 'Append minor m'}>m</button>
              </div>

              <div className="grid min-h-0 grid-cols-[repeat(12,minmax(0,1fr))] gap-1.5" data-chord-key-row="suffixes" data-key-surface="character">
                {QUALITY_DIGITS.map((digit) => <button key={digit} type="button" className={`${characterKeyClass} min-h-0 px-0 text-[15px]`} onClick={() => appendQualityFragment(digit)} aria-label={language === 'zh' ? `加入數字 ${digit}` : `Append ${digit}`}>{digit}</button>)}
                <button type="button" className={`${characterKeyClass} min-h-0 px-0 text-lg`} onClick={() => appendQualityFragment('dim')} aria-label={language === 'zh' ? '加入減和弦符號' : 'Append diminished'}>°</button>
                <button type="button" className={`${characterKeyClass} min-h-0 px-0 text-lg`} onClick={() => appendQualityFragment('m7b5')} aria-label={language === 'zh' ? '加入半減和弦符號' : 'Append half diminished'}>ø</button>
                <button type="button" className={`${characterKeyClass} min-h-0 px-0 text-lg`} onClick={() => appendQualityFragment('maj')} aria-label={language === 'zh' ? '加入大和弦符號' : 'Append major'}>△</button>
              </div>
            </>
          )}

          <div className="grid min-h-0 grid-cols-[repeat(12,minmax(0,1fr))] gap-1.5" data-chord-key-row="modifiers" data-key-surface="utility">
            <button type="button" data-picker-trigger="time" className={`${utilityKeyClass} min-h-0 px-0 ${bar.timeSignature ? activeButtonClass : ''}`} onClick={(event) => openPicker('time', event.currentTarget)} aria-label={language === 'zh' ? '選擇小節拍號' : 'Choose time signature'}>{effectiveBarTimeSignature}</button>
            <KeyPicker
              value={barTargetKey ?? null}
              onChange={applyBarKey}
              label={language === 'zh' ? '轉調' : 'Key'}
              title={barTargetKey ? (language === 'zh' ? `轉Key：${barTargetKey}` : `Key change: ${barTargetKey}`) : (language === 'zh' ? `轉Key：沿用 ${barDisplayBaseKey}` : `Key change: inherit ${barDisplayBaseKey}`)}
              triggerLabel={barTargetKey ?? 'Key'}
              clearLabel={language === 'zh' ? '不轉' : 'Inherit'}
              originalKey={barDisplayBaseKey}
              panelMetaText={barTargetKey ? `${barDisplayBaseKey} → ${barDisplayKey}` : barDisplayBaseKey}
              align="center"
              triggerDensity="compact"
              triggerIconSize={10}
              touchOptimized={deviceLayout !== 'desktop'}
              rootClassName="col-span-2"
              buttonStyle={{ height: '100%', minWidth: 0, padding: 0, width: '100%' }}
              buttonClassName={`!h-full !min-h-0 !w-full !min-w-0 !rounded-[11px] !px-0 !shadow-[0_1px_0_rgba(15,23,42,0.18),0_2px_5px_rgba(15,23,42,0.10)] ${barTargetKey ? activeButtonClass : '!border-white/40 !bg-slate-300/75 !text-slate-700 hover:!bg-white'}`}
              valueTextClassName="!text-[11px] !font-black"
              metaTextClassName="hidden"
              hideTriggerIcon={deviceLayout === 'phone'}
              panelZIndex={5300}
            />
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 text-base`} onClick={() => applyDisplayedChord('%')} aria-label={language === 'zh' ? '重複前一小節' : 'Repeat previous bar'}>%</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => applyDisplayedChord('N.C.')} aria-label="N.C.">N.C.</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => appendQualityFragment('sus')}>sus</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => appendQualityFragment('add')}>add</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => appendQualityFragment('alt')}>alt</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 text-lg`} onClick={() => appendQualityFragment('aug')} aria-label={language === 'zh' ? '加入增和弦' : 'Append augmented'}>+</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 ${bassMode ? activeButtonClass : ''}`} onClick={() => setBassMode((value) => !value)} aria-label={language === 'zh' ? '選擇 Slash Bass' : 'Choose slash bass'}>/</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => onInputModeChange(chordInputMode === 'letters' ? 'nashville' : 'letters')} aria-label={chordInputMode === 'letters' ? (language === 'zh' ? '切換為 Nashville' : 'Switch to Nashville') : (language === 'zh' ? '切換為字母和弦' : 'Switch to letter chords')}>{chordInputMode === 'letters' ? '123' : 'ABC'}</button>
            <button type="button" data-key-emphasis="delete" className={`${destructiveKeyClass} min-h-0 px-0`} onClick={deleteLastChordCharacter} disabled={!displayedChord} aria-label={language === 'zh' ? '刪除最後一個字元' : 'Delete last character'}><Delete size={23} strokeWidth={2.4} aria-hidden="true" /></button>
          </div>

          <div className="grid min-h-0 grid-cols-10 gap-1.5" data-key-surface="utility">
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 text-[11px]`} onClick={() => { setMode('text'); setActivePicker(null); }} aria-label={language === 'zh' ? '文字欄位' : 'Text fields'}>{language === 'zh' ? '文字' : 'Text'}</button>
            <button type="button" data-picker-trigger="special" className={`${utilityKeyClass} min-h-0 px-0`} onClick={(event) => openPicker('special', event.currentTarget)} aria-label={language === 'zh' ? '休止符與整小節符號' : 'Rests and whole-bar symbols'}><span className="font-rhythm text-[22px] leading-none" aria-hidden="true">{getRestGlyph('q')}</span></button>
            <button type="button" data-picker-trigger="articulation" className={`${utilityKeyClass} min-h-0 px-0 ${trailingModifiers(displayedChord) ? activeButtonClass : ''}`} onClick={(event) => openPicker('articulation', event.currentTarget)} aria-label={language === 'zh' ? '選擇演奏記號' : 'Choose articulation'}><DirectionGlyph direction="push" /></button>
            <button type="button" data-picker-trigger="ending" className={`${utilityKeyClass} min-h-0 overflow-hidden px-1 ${bar.ending ? activeButtonClass : ''}`} onClick={(event) => openPicker('ending', event.currentTarget)} aria-label={language === 'zh' ? '選擇房子記號' : 'Choose ending'} aria-keyshortcuts="Alt+1 Alt+2 Alt+3 Alt+4 Alt+5 Alt+6 Alt+7 Alt+8 Alt+9"><EndingGlyph value={bar.ending || '1'} /></button>
            <button type="button" data-picker-trigger="navigation" className={`${utilityKeyClass} min-h-0 px-0 ${bar.leftMarker || bar.rightMarker ? activeButtonClass : ''}`} onClick={(event) => openPicker('navigation', event.currentTarget)} aria-label={language === 'zh' ? '選擇導引記號' : 'Choose navigation marker'}><span className="flex items-center gap-0.5"><SegnoGlyph className="h-4 w-4" /><CodaGlyph className="h-4 w-4" /></span></button>
            <button type="button" data-picker-trigger="barline" className={`${utilityKeyClass} min-h-0 px-0 text-base ${bar.repeatStart || bar.repeatEnd || bar.finalBar ? activeButtonClass : ''}`} onClick={(event) => openPicker('barline', event.currentTarget)} aria-label={language === 'zh' ? '選擇小節線與反覆' : 'Choose barline and repeat'}>{barlineGlyph}</button>
            <button type="button" className={`${copyKeyClass} min-h-0 px-0`} onClick={() => onStructure('copy-bar')} aria-label={language === 'zh' ? '複製小節' : 'Copy bar'}><Copy size={17} aria-hidden="true" /></button>
            <button type="button" disabled={!hasCopiedBar} className={`${pasteKeyClass} min-h-0 px-0 disabled:cursor-not-allowed disabled:opacity-40`} onClick={() => onStructure('paste-bar-after')} aria-label={language === 'zh' ? '貼上小節' : 'Paste bar'}><ClipboardPaste size={17} aria-hidden="true" /></button>
            <button type="button" data-picker-trigger="structure" className={`${utilityKeyClass} min-h-0 px-0 text-base`} onClick={(event) => openPicker('structure', event.currentTarget)} aria-label={language === 'zh' ? '小節操作' : 'Bar actions'}>+│</button>
            <button type="button" data-picker-trigger="bar" className={`${utilityKeyClass} min-h-0 px-0 text-base`} onClick={(event) => openPicker('bar', event.currentTarget)} aria-label={language === 'zh' ? '整小節輸入' : 'Whole bar input'}>•••</button>
          </div>

          {renderPreviewColorControls('chord-color-controls')}

          {activePicker && pickerAnchor && pickerSize && typeof document !== 'undefined' && createPortal(
            <div
              data-preview-picker-popover
              data-keyboard-picker={activePicker}
              data-picker-placement="anchored"
              role="dialog"
              aria-label={pickerTitles[activePicker]}
              className="fixed z-[5100]"
              style={{ left: pickerLeft, top: pickerTop, width: pickerWidth, height: pickerHeight }}
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/90 bg-slate-200/95 p-2.5 shadow-[0_18px_45px_rgba(15,23,42,0.24)] backdrop-blur-xl">

              {activePicker === 'quality' && (
                <div className="grid min-h-0 flex-1 grid-cols-6 gap-1">
                  {PICKER_QUALITIES.map((quality) => <button key={quality} type="button" className={`${buttonClass} min-h-0 px-0.5 ${chordParts.quality === quality ? activeButtonClass : ''}`} onClick={() => { applyQuality(quality); setActivePicker(null); }}>{quality}</button>)}
                </div>
              )}

              {activePicker === 'time' && (
                <div data-picker-layout="time-grid" className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <div className="grid min-h-0 flex-1 grid-cols-7 gap-1">
                    {TIME_SIGNATURES.map((value) => <button key={value} type="button" className={`${buttonClass} min-h-0 px-0 ${bar.timeSignature === value ? activeButtonClass : ''}`} onClick={() => { updateFields({ timeSignature: bar.timeSignature === value ? undefined : value }); setActivePicker(null); }} aria-label={value}><TimeSignatureGlyph value={value} /></button>)}
                  </div>
                  <div className="flex h-8 shrink-0 gap-1">
                    <button type="button" className={`${buttonClass} min-h-0 shrink-0 px-2`} onClick={() => { updateFields({ timeSignature: undefined }); setActivePicker(null); }}>{language === 'zh' ? '繼承' : 'Inherit'}</button>
                    <input className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-center text-xs font-bold outline-none focus:border-indigo-400" inputMode="numeric" value={TIME_SIGNATURES.includes(bar.timeSignature || '') ? '' : bar.timeSignature || ''} onChange={(event) => updateFields({ timeSignature: event.target.value || undefined }, `time:${bar.id}`)} placeholder={language === 'zh' ? '自訂拍號' : 'Custom signature'} aria-label={language === 'zh' ? '自訂拍號' : 'Custom time signature'} />
                  </div>
                </div>
              )}

              {activePicker === 'barline' && (
                <div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5">
                  <button type="button" className={`${buttonClass} min-h-0 text-xl ${bar.repeatStart ? activeButtonClass : ''}`} onClick={() => { updateFields({ repeatStart: !bar.repeatStart }); setActivePicker(null); }} aria-label="|: Repeat Start">|:</button>
                  <button type="button" className={`${buttonClass} min-h-0 text-xl ${bar.repeatEnd ? activeButtonClass : ''}`} onClick={() => { updateFields({ repeatEnd: !bar.repeatEnd }); setActivePicker(null); }} aria-label=":| Repeat End">:|</button>
                  <button type="button" className={`${buttonClass} min-h-0 text-xl ${bar.finalBar ? activeButtonClass : ''}`} onClick={() => { updateFields({ finalBar: !bar.finalBar }); setActivePicker(null); }} aria-label="|| Final">||</button>
                </div>
              )}

              {activePicker === 'ending' && (
                <div data-picker-layout="ending-list" className="flex min-h-0 flex-1 flex-col gap-1">
                  {ENDINGS.map((ending) => <button key={ending} type="button" className={`${buttonClass} min-h-0 flex-1 overflow-hidden px-2 ${bar.ending === ending ? activeButtonClass : ''}`} onClick={() => { updateFields({ ending: bar.ending === ending ? undefined : ending }); setActivePicker(null); }} aria-label={`Ending ${ending}`}><EndingGlyph value={ending} /></button>)}
                  <button type="button" className={`${buttonClass} min-h-0 flex-1 overflow-hidden px-2`} onClick={() => { updateFields({ ending: undefined }); setActivePicker(null); }} aria-label={language === 'zh' ? '清除房子記號' : 'Clear ending'}><EndingGlyph value="" /></button>
                  <input className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-center text-xs font-bold outline-none focus:border-indigo-400" value={ENDINGS.includes(bar.ending || '') ? '' : bar.ending || ''} onChange={(event) => updateFields({ ending: event.target.value || undefined }, `ending:${bar.id}`)} placeholder={language === 'zh' ? '自訂' : 'Custom'} aria-label={language === 'zh' ? '自訂 Ending' : 'Custom ending'} />
                </div>
              )}

              {activePicker === 'navigation' && (
                <div className="grid min-h-0 flex-1 grid-cols-4 gap-1">
                  {([['segno', 'Left Segno'], ['coda', 'Left Coda']] as const).map(([value, label]) => <button key={value} type="button" className={`${buttonClass} relative min-h-0 px-0 ${bar.leftMarker === value ? activeButtonClass : ''}`} onClick={() => { updateFields({ leftMarker: (bar.leftMarker === value ? undefined : value) as NavigationMarker | undefined }); setActivePicker(null); }} aria-label={label}><span className="absolute inset-y-1 left-0.5 border-l-2 border-current" aria-hidden="true" />{value === 'segno' ? <SegnoGlyph /> : <CodaGlyph />}</button>)}
                  {([['coda', '', 'Right Coda'], ['ds', 'D.S.', 'D.S.'], ['dc', 'D.C.', 'D.C.'], ['fine', 'Fine', 'Fine'], ['ds-al-coda', 'D.S. al', 'D.S. al Coda'], ['ds-al-fine', 'D.S. al Fine', 'D.S. al Fine']] as const).map(([value, text, label]) => <button key={value} type="button" className={`${buttonClass} relative min-h-0 px-0 text-[9px] ${bar.rightMarker === value ? activeButtonClass : ''}`} onClick={() => { updateFields({ rightMarker: (bar.rightMarker === value ? undefined : value) as NavigationMarker | undefined }); setActivePicker(null); }} aria-label={label}>{value === 'coda' ? <CodaGlyph /> : value === 'ds-al-coda' ? <span className="flex items-center gap-0.5">{text}<CodaGlyph className="h-3.5 w-3.5" /></span> : text}<span className="absolute inset-y-1 right-0.5 border-r-2 border-current" aria-hidden="true" /></button>)}
                  <button type="button" className={`${buttonClass} col-span-4 min-h-0`} onClick={() => { updateFields({ leftMarker: undefined, rightMarker: undefined }); setActivePicker(null); }}>{language === 'zh' ? '清除導引記號' : 'Clear navigation'}</button>
                </div>
              )}

              {activePicker === 'special' && (
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <div className="grid min-h-0 flex-1 grid-cols-7 gap-1.5">
                    <button type="button" className={`${buttonClass} min-h-0 px-0 text-base`} onClick={() => { applyDisplayedChord('/'); setActivePicker(null); }} aria-label={language === 'zh' ? '拍點斜線' : 'Beat slash'}>/</button>
                    <button type="button" className={`${buttonClass} min-h-0 px-0 text-base`} onClick={() => { applyDisplayedChord('%'); setActivePicker(null); }} aria-label={language === 'zh' ? '重複前一小節' : 'Repeat previous bar'}>%</button>
                    <button type="button" className={`${buttonClass} min-h-0 px-0`} onClick={() => { applyDisplayedChord('N.C.'); setActivePicker(null); }} aria-label="N.C.">N.C.</button>
                    {([['0', 'q', '四分休止'], ['0h', 'h', '二分休止'], ['0w', 'w', '全休止']] as const).map(([value, base, label]) => {
                      const disabled = value === '0h' && Boolean(halfRestPlacementError);
                      return <button key={value} type="button" disabled={disabled} title={disabled ? halfRestPlacementError ?? undefined : undefined} className={`${buttonClass} min-h-0 px-0 disabled:cursor-not-allowed disabled:opacity-40`} onClick={() => { if (applyDisplayedChord(value)) setActivePicker(null); }} aria-label={language === 'zh' ? label : `${base} rest`}><span className="font-rhythm text-[22px] leading-none" aria-hidden="true">{getRestGlyph(base)}</span></button>;
                    })}
                    <div data-multi-rest-control className={`relative min-h-0 overflow-hidden rounded-[11px] border bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.18),0_2px_5px_rgba(15,23,42,0.10)] ${multiRestPlacementError ? 'border-slate-200 opacity-45' : 'border-indigo-300'}`}>
                      <button type="button" className="h-full w-full pt-2 text-slate-700 disabled:cursor-not-allowed" disabled={Boolean(multiRestPlacementError)} onClick={() => { multiRestInputRef.current?.focus(); multiRestInputRef.current?.select(); }} aria-label={language === 'zh' ? '輸入多小節休止數量' : 'Enter multi-measure rest count'}><MultiMeasureRestGlyph /></button>
                      <input
                        ref={multiRestInputRef}
                        value={multiRestCount}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          const nextValue = event.target.value.replace(/\D/g, '').slice(0, 3);
                          setMultiRestCount(nextValue);
                          setMultiRestActionError(null);
                          const nextCount = Number.parseInt(nextValue, 10);
                          if (Number.isInteger(nextCount) && nextCount >= 1 && nextCount <= 999) applyMultiMeasureRest(nextCount);
                        }}
                        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                        inputMode="numeric"
                        enterKeyHint="done"
                        pattern="[0-9]*"
                        disabled={Boolean(multiRestPlacementError)}
                        className="absolute left-1/2 top-0 z-10 h-5 w-10 -translate-x-1/2 rounded-b-md bg-white/95 text-center text-[11px] font-black tabular-nums outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-100"
                        aria-label={language === 'zh' ? '多小節休止數量' : 'Multi-measure rest count'}
                      />
                    </div>
                  </div>
                  {(halfRestPlacementError || multiRestPlacementError || multiRestActionError) && <p role="status" className="shrink-0 truncate text-[9px] font-bold text-amber-700">{multiRestActionError || halfRestPlacementError || multiRestPlacementError}</p>}
                </div>
              )}

              {activePicker === 'articulation' && (
                <div className="grid min-h-0 flex-1 grid-cols-4 gap-1.5">
                  <button type="button" className={`${buttonClass} min-h-0 ${trailingModifiers(displayedChord).includes('<') ? activeButtonClass : ''}`} onClick={() => toggleModifier('<')} aria-label={language === 'zh' ? '搶拍' : 'Push'}><DirectionGlyph direction="push" /></button>
                  <button type="button" className={`${buttonClass} min-h-0 ${trailingModifiers(displayedChord).includes('>') ? activeButtonClass : ''}`} onClick={() => toggleModifier('>')} aria-label={language === 'zh' ? '拖拍' : 'Pull'}><DirectionGlyph direction="pull" /></button>
                  <button type="button" className={`${buttonClass} min-h-0 text-xl ${trailingModifiers(displayedChord).includes('^') ? activeButtonClass : ''}`} onClick={() => toggleModifier('^')} aria-label={language === 'zh' ? '重音' : 'Accent'}>&gt;</button>
                  <button type="button" className={`${buttonClass} min-h-0 ${trailingModifiers(displayedChord).includes('~') ? activeButtonClass : ''}`} onClick={() => toggleModifier('~')} aria-label={language === 'zh' ? '延長記號' : 'Fermata'}><span className="font-rhythm text-[22px] leading-none" aria-hidden="true">ß</span></button>
                </div>
              )}

              {activePicker === 'structure' && (
                <div data-structure-actions className="grid min-h-0 flex-1 grid-cols-7 gap-1 overflow-hidden">
                  <button type="button" className={`${buttonClass} min-h-0 flex-col px-1 text-[9px] leading-tight`} onClick={() => { onStructure('insert-before'); setActivePicker(null); }}><Plus size={14} />{language === 'zh' ? '前方插入' : 'Before'}</button>
                  <button type="button" className={`${buttonClass} min-h-0 flex-col px-1 text-[9px] leading-tight`} onClick={() => { onStructure('insert-after'); setActivePicker(null); }}><Plus size={14} />{language === 'zh' ? '後方插入' : 'After'}</button>
                  <button type="button" className={`${buttonClass} min-h-0 flex-col px-1 text-[9px] leading-tight`} onClick={() => { onStructure('duplicate'); setActivePicker(null); }} aria-label={language === 'zh' ? '複製到後方' : 'Duplicate after'}><Copy size={14} />{language === 'zh' ? '複製到後' : 'Duplicate'}</button>
                  <button type="button" className={`${copyKeyClass} min-h-0 flex-col px-1 text-[9px] leading-tight`} onClick={() => { onStructure('copy-bar'); setActivePicker(null); }} aria-label={language === 'zh' ? '複製小節' : 'Copy bar'}><Copy size={14} />{language === 'zh' ? '複製小節' : 'Copy bar'}</button>
                  <button type="button" disabled={!hasCopiedBar} className={`${pasteKeyClass} min-h-0 flex-col px-1 text-[9px] leading-tight disabled:cursor-not-allowed disabled:opacity-40`} onClick={() => { onStructure('paste-bar-after'); setActivePicker(null); }} aria-label={language === 'zh' ? '貼上小節' : 'Paste bar'}><ClipboardPaste size={14} />{language === 'zh' ? '貼上小節' : 'Paste bar'}</button>
                  <button type="button" className={`${buttonClass} min-h-0 flex-col px-1 text-[9px] leading-tight`} onClick={() => { onStructure('split-section'); setActivePicker(null); }}><Scissors size={14} />{language === 'zh' ? '拆分段落' : 'Split'}</button>
                  <button type="button" className={`${buttonClass} min-h-0 flex-col border-rose-200 px-1 text-[9px] leading-tight text-rose-700`} onClick={() => { onStructure('delete'); setActivePicker(null); }}><Trash2 size={14} />{language === 'zh' ? '刪除' : 'Delete'}</button>
                </div>
              )}

              {activePicker === 'bar' && (
                <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-2">
                  <input value={barText} onChange={(event) => setBarText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyBarText(); } }} className={fieldClass} placeholder={language === 'zh' ? `最多 ${beatCount} 個和弦` : `Up to ${beatCount} chords`} aria-label={language === 'zh' ? '整小節和弦' : 'Whole bar chords'} />
                  <button type="button" className={`${buttonClass} !border-indigo-500 !bg-indigo-600 !text-white`} onClick={applyBarText}>{language === 'zh' ? '套用整小節' : 'Apply whole bar'}</button>
                  {barTextError && <p role="alert" className="text-[10px] font-bold text-rose-600">{barTextError}</p>}
                </div>
              )}
              </div>
              <span
                data-picker-arrow
                className="absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-white/80 bg-slate-200/95"
                style={{ left: pickerArrowLeft - 6 }}
                aria-hidden="true"
              />
            </div>
          , document.body)}
        </div>
      )}

      {notationMode === 'chords' && mode === 'advanced' && (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-6 gap-1">
            {EXPANDED_QUALITIES.map((quality) => <button key={quality} type="button" className={`${buttonClass} min-h-0 px-0.5 ${chordParts.quality === quality ? activeButtonClass : ''}`} onClick={() => applyQuality(quality)}>{quality}</button>)}
          </div>
          <div className="flex shrink-0 gap-1">
            <input value={barText} onChange={(event) => setBarText(event.target.value)} onBlur={applyBarText} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyBarText(); } }} className={`${fieldClass} min-w-0 flex-1`} placeholder={language === 'zh' ? `整節輸入 · 最多 ${beatCount} 個` : `Whole bar · max ${beatCount}`} aria-label={language === 'zh' ? '整小節和弦' : 'Whole bar chords'} />
            <button type="button" className={buttonClass} onClick={applyBarText} aria-label={language === 'zh' ? '套用整節和弦' : 'Apply whole bar'}><Check size={15} /></button>
          </div>
          {barTextError && <p role="alert" className="shrink-0 text-[10px] font-bold text-rose-600">{barTextError}</p>}
        </>
      )}

      {notationMode === 'chords' && mode === 'symbols' && (
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-1" data-symbol-page="all">
          <div className="grid grid-cols-8 gap-1">
            <button type="button" className={`${buttonClass} !min-h-8 px-0 text-base`} onClick={() => applyDisplayedChord('%')} aria-label={language === 'zh' ? '重複前一小節' : 'Repeat previous bar'}>%</button>
            <button type="button" className={`${buttonClass} !min-h-8 px-0`} onClick={() => applyDisplayedChord('N.C.')} aria-label="N.C.">N.C.</button>
            <button type="button" className={`${buttonClass} !min-h-8 px-0 text-lg`} onClick={() => applyDisplayedChord('/')} aria-label={language === 'zh' ? '拍點斜線' : 'Beat slash'}>/</button>
            {([['0', 'q', '四分休止'], ['0h', 'h', '二分休止'], ['0w', 'w', '全休止']] as const).map(([value, base, label]) => (
              <button key={value} type="button" className={`${buttonClass} !min-h-8 px-0`} onClick={() => applyDisplayedChord(value)} aria-label={language === 'zh' ? label : `${base} rest`}>
                <span className="font-rhythm text-[22px] leading-none" aria-hidden="true">{getRestGlyph(base)}</span>
              </button>
            ))}
            <div
              data-multi-rest-control
              className={`relative col-span-2 min-h-8 overflow-hidden rounded-lg border bg-white ${multiRestPlacementError || !hasValidMultiRestCount ? 'border-slate-200 opacity-45' : 'border-indigo-300'}`}
              title={multiRestPlacementError || (hasValidMultiRestCount ? (language === 'zh' ? '套用多小節休止' : 'Apply multi-measure rest') : (language === 'zh' ? '輸入 1–999' : 'Enter 1–999'))}
            >
              <button type="button" className="h-full w-full pt-2 text-slate-700 disabled:cursor-not-allowed" disabled={Boolean(multiRestPlacementError) || !hasValidMultiRestCount} onClick={applyMultiMeasureRest} aria-label={language === 'zh' ? `套用 ${multiRestCount || 0} 小節休止` : `Apply ${multiRestCount || 0}-bar rest`}>
                <MultiMeasureRestGlyph />
              </button>
              <input
                value={multiRestCount}
                onChange={(event) => { setMultiRestCount(event.target.value.replace(/\D/g, '').slice(0, 3)); setMultiRestActionError(null); }}
                inputMode="numeric"
                disabled={Boolean(multiRestPlacementError)}
                className="absolute left-1/2 top-0 z-10 h-4 w-8 -translate-x-1/2 bg-white/95 text-center text-[10px] font-black tabular-nums text-slate-800 outline-none disabled:bg-slate-100"
                aria-label={language === 'zh' ? '多小節休止數量' : 'Multi-measure rest count'}
              />
              <span className="pointer-events-none absolute right-0.5 top-0.5 text-[8px] font-black text-slate-400" aria-hidden="true">①</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1">
            <button type="button" className={`${buttonClass} !min-h-7 ${trailingModifiers(displayedChord).includes('<') ? activeButtonClass : ''}`} onClick={() => toggleModifier('<')} aria-label={language === 'zh' ? '搶拍' : 'Push'}><DirectionGlyph direction="push" /></button>
            <button type="button" className={`${buttonClass} !min-h-7 ${trailingModifiers(displayedChord).includes('>') ? activeButtonClass : ''}`} onClick={() => toggleModifier('>')} aria-label={language === 'zh' ? '拖拍' : 'Pull'}><DirectionGlyph direction="pull" /></button>
            <button type="button" className={`${buttonClass} !min-h-7 text-xl ${trailingModifiers(displayedChord).includes('^') ? activeButtonClass : ''}`} onClick={() => toggleModifier('^')} aria-label={language === 'zh' ? '重音' : 'Accent'}>&gt;</button>
            <button type="button" className={`${buttonClass} !min-h-7 ${trailingModifiers(displayedChord).includes('~') ? activeButtonClass : ''}`} onClick={() => toggleModifier('~')} aria-label={language === 'zh' ? '延長記號' : 'Fermata'}><span className="font-rhythm text-[22px] leading-none" aria-hidden="true">ß</span></button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base ${bar.repeatStart ? activeButtonClass : ''}`} onClick={() => updateFields({ repeatStart: !bar.repeatStart })} aria-label="|: Repeat Start">|:</button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base ${bar.repeatEnd ? activeButtonClass : ''}`} onClick={() => updateFields({ repeatEnd: !bar.repeatEnd })} aria-label=":| Repeat End">:|</button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base ${bar.finalBar ? activeButtonClass : ''}`} onClick={() => updateFields({ finalBar: !bar.finalBar })} aria-label="|| Final">||</button>
            {ENDINGS.map((ending) => <button key={ending} type="button" className={`${buttonClass} !min-h-7 overflow-hidden px-1 ${bar.ending === ending ? activeButtonClass : ''}`} onClick={() => updateFields({ ending: bar.ending === ending ? undefined : ending })} aria-label={`Ending ${ending}`}><EndingGlyph value={ending} /></button>)}
          </div>

          <div className="grid grid-cols-8 gap-1">
            {([['segno', 'Left Segno'], ['coda', 'Left Coda']] as const).map(([value, label]) => <button key={value} type="button" className={`${buttonClass} relative !min-h-7 px-0 ${bar.leftMarker === value ? activeButtonClass : ''}`} onClick={() => updateFields({ leftMarker: (bar.leftMarker === value ? undefined : value) as NavigationMarker | undefined })} aria-label={label}><span className="absolute inset-y-1 left-0.5 border-l-2 border-current" aria-hidden="true" />{value === 'segno' ? <SegnoGlyph /> : <CodaGlyph />}</button>)}
            {([['coda', '', 'Right Coda'], ['ds', 'D.S.', 'D.S.'], ['dc', 'D.C.', 'D.C.'], ['fine', 'Fine', 'Fine'], ['ds-al-coda', 'D.S. al', 'D.S. al Coda'], ['ds-al-fine', 'D.S. al Fine', 'D.S. al Fine']] as const).map(([value, text, label]) => <button key={value} type="button" className={`${buttonClass} relative !min-h-7 px-0 text-[9px] ${bar.rightMarker === value ? activeButtonClass : ''}`} onClick={() => updateFields({ rightMarker: (bar.rightMarker === value ? undefined : value) as NavigationMarker | undefined })} aria-label={label}>{value === 'coda' ? <CodaGlyph /> : value === 'ds-al-coda' ? <span className="flex items-center gap-0.5">{text}<CodaGlyph className="h-3.5 w-3.5" /></span> : text}<span className="absolute inset-y-1 right-0.5 border-r-2 border-current" aria-hidden="true" /></button>)}
          </div>

          <div className="grid grid-cols-8 gap-1">
            {TIME_SIGNATURES.map((value) => <button key={value} type="button" className={`${buttonClass} !min-h-7 px-0 ${bar.timeSignature === value ? activeButtonClass : ''}`} onClick={() => updateFields({ timeSignature: bar.timeSignature === value ? undefined : value })}>{value}</button>)}
            <input className="min-h-7 min-w-0 rounded-lg border border-slate-200 bg-white px-1 text-center text-[10px] font-bold outline-none focus:border-indigo-400" inputMode="numeric" value={TIME_SIGNATURES.includes(bar.timeSignature || '') ? '' : bar.timeSignature || ''} onChange={(event) => updateFields({ timeSignature: event.target.value || undefined }, `time:${bar.id}`)} placeholder="…" aria-label={language === 'zh' ? '自訂拍號' : 'Custom time signature'} />
          </div>

          <div className="grid grid-cols-8 gap-1">
            <input className="min-h-7 min-w-0 rounded-lg border border-slate-200 bg-white px-1 text-center text-[10px] font-bold outline-none focus:border-indigo-400" value={ENDINGS.includes(bar.ending || '') ? '' : bar.ending || ''} onChange={(event) => updateFields({ ending: event.target.value || undefined }, `ending:${bar.id}`)} placeholder="⌜…" aria-label={language === 'zh' ? '自訂 Ending' : 'Custom ending'} />
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base`} onClick={() => onStructure('insert-before')} aria-label={language === 'zh' ? '前方插入小節' : 'Insert bar before'}>+│</button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base`} onClick={() => onStructure('insert-after')} aria-label={language === 'zh' ? '後方插入小節' : 'Insert bar after'}>│+</button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0`} onClick={() => onStructure('duplicate')} aria-label={language === 'zh' ? '複製到後方' : 'Duplicate after'}><Copy size={15} /></button>
            <button type="button" className={`${copyKeyClass} !min-h-7 px-0`} onClick={() => onStructure('copy-bar')} aria-label={language === 'zh' ? '複製小節' : 'Copy bar'}><Copy size={15} /></button>
            <button type="button" disabled={!hasCopiedBar} className={`${pasteKeyClass} !min-h-7 px-0 disabled:cursor-not-allowed disabled:opacity-40`} onClick={() => onStructure('paste-bar-after')} aria-label={language === 'zh' ? '貼上小節' : 'Paste bar'}><ClipboardPaste size={15} /></button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0`} onClick={() => onStructure('split-section')} aria-label={language === 'zh' ? '從這裡拆分段落' : 'Split section here'}><Scissors size={15} /></button>
            <button type="button" className={`${buttonClass} !min-h-7 border-rose-200 px-0 text-rose-700`} onClick={() => onStructure('delete')} aria-label={language === 'zh' ? '刪除小節' : 'Delete bar'}><Trash2 size={15} /></button>
          </div>

          {(multiRestPlacementError || multiRestActionError) && (
            <p role="status" className="shrink-0 truncate text-[9px] font-bold text-amber-700">{multiRestActionError || multiRestPlacementError}</p>
          )}
        </div>
      )}

      {notationMode === 'rhythm' && (
        <div className={`grid min-h-0 flex-1 ${notationActionError ? 'grid-rows-[1fr_1fr_0.78fr_0.54fr_0.52fr_auto]' : 'grid-rows-[1fr_1fr_0.78fr_0.54fr_0.52fr]'} gap-1.5`} data-keyboard-view="rhythm">
          <div className="grid min-h-0 grid-cols-5 gap-1.5" data-rhythm-key-row="notes" data-key-surface="character">
            {([['w', '全音符', 'Whole'], ['h', '二分音符', 'Half'], ['q', '四分音符', 'Quarter'], ['e', '八分音符', 'Eighth'], ['s', '十六分音符', 'Sixteenth']] as const).map(([token, zhLabel, enLabel]) => (
              <button key={token} type="button" className={`${characterKeyClass} min-h-0 px-0 ${selectedRhythmEvent?.base === token && !selectedRhythmEvent.isRest && !selectedRhythmEvent.isSlash && !selectedRhythmEvent.triplet ? activeButtonClass : ''}`} onClick={() => applyRhythmAction({ type: 'insert', token })} aria-label={language === 'zh' ? zhLabel : `${enLabel} note`}>
                <RhythmStaffKeyGlyph base={token} className="!h-full !min-w-0 [&_[data-rhythm-symbol]]:!text-[35px]" />
              </button>
            ))}
          </div>
          <div className="grid min-h-0 grid-cols-5 gap-1.5" data-rhythm-key-row="rests" data-key-surface="character">
            {([['w', '全休止', 'Whole rest'], ['h', '二分休止', 'Half rest'], ['q', '四分休止', 'Quarter rest'], ['e', '八分休止', 'Eighth rest'], ['s', '十六分休止', 'Sixteenth rest']] as const).map(([base, zhLabel, enLabel]) => (
              <button key={base} type="button" className={`${characterKeyClass} min-h-0 px-0 ${selectedRhythmEvent?.base === base && selectedRhythmEvent.isRest && !selectedRhythmEvent.triplet ? activeButtonClass : ''}`} onClick={() => applyRhythmAction({ type: 'insert', token: `${base}r` })} aria-label={language === 'zh' ? zhLabel : enLabel}>
                <RhythmStaffKeyGlyph base={base} isRest className="!h-full !min-w-0 [&_[data-rhythm-symbol]]:!text-[35px]" />
              </button>
            ))}
          </div>
          <div className="grid min-h-0 grid-cols-9 gap-1.5" data-rhythm-key-row="modifiers" data-key-surface="utility">
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 ${selectedRhythmEvent?.base === 'q' && selectedRhythmEvent.triplet && !selectedRhythmEvent.isRest ? activeButtonClass : ''}`} onClick={() => applyRhythmAction({ type: 'insert', token: 'q3' })} aria-label={language === 'zh' ? '四分三連音' : 'Quarter-note triplet'}><RhythmStaffKeyGlyph base="q" triplet className="!h-full !min-w-0 [&_[data-rhythm-symbol]]:!text-[26px]" /></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 ${selectedRhythmEvent?.base === 'e' && selectedRhythmEvent.triplet && !selectedRhythmEvent.isRest ? activeButtonClass : ''}`} onClick={() => applyRhythmAction({ type: 'insert', token: 'e3' })} aria-label={language === 'zh' ? '八分三連音' : 'Eighth-note triplet'}><RhythmStaffKeyGlyph base="e" triplet className="!h-full !min-w-0 [&_[data-rhythm-symbol]]:!text-[26px]" /></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => applyRhythmAction({ type: 'insert', token: 'q3r' })} aria-label={language === 'zh' ? '四分三連休止' : 'Quarter-triplet rest'}><RhythmStaffKeyGlyph base="q" isRest triplet className="!h-full !min-w-0 [&_[data-rhythm-symbol]]:!text-[26px]" /></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => applyRhythmAction({ type: 'insert', token: 'e3r' })} aria-label={language === 'zh' ? '八分三連休止' : 'Eighth-triplet rest'}><RhythmStaffKeyGlyph base="e" isRest triplet className="!h-full !min-w-0 [&_[data-rhythm-symbol]]:!text-[26px]" /></button>
            <button type="button" disabled={!selectedRhythmEvent || selectedRhythmEvent.triplet || selectedRhythmEvent.isSlash} className={`${utilityKeyClass} min-h-0 px-0 ${selectedRhythmEvent?.dotted ? activeButtonClass : ''}`} onClick={() => applyRhythmAction({ type: 'toggle-dot' })} aria-label={language === 'zh' ? '切換節奏附點' : 'Toggle rhythm dot'}><span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" /></button>
            <button type="button" disabled={!selectedRhythmEvent || selectedRhythmEvent.isRest || selectedRhythmEvent.isSlash} className={`${utilityKeyClass} min-h-0 px-0 ${selectedRhythmEvent?.accent ? activeButtonClass : ''}`} onClick={() => applyRhythmAction({ type: 'toggle-accent' })} aria-label={language === 'zh' ? '切換節奏重音' : 'Toggle rhythm accent'}><span className="text-[24px] font-black leading-none" aria-hidden="true">&gt;</span></button>
            <button type="button" disabled={!selectedRhythmEvent || selectedRhythmEvent.isRest || selectedRhythmEvent.isSlash} className={`${utilityKeyClass} min-h-0 px-0 ${selectedRhythmEvent?.tieAfter ? activeButtonClass : ''}`} onClick={() => applyRhythmAction({ type: 'toggle-tie' })} aria-label={language === 'zh' ? '切換節奏連結' : 'Toggle rhythm tie'}><svg viewBox="0 0 32 16" className="h-5 w-7" fill="none" aria-hidden="true"><path d="M3 13C8 3 24 3 29 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 ${selectedRhythmEvent?.isSlash ? activeButtonClass : ''}`} onClick={() => applyRhythmAction({ type: 'insert', token: '/' })} aria-label={language === 'zh' ? '插入節奏佔用拍' : 'Insert rhythm slash placeholder'}><span className="text-[20px] leading-none" aria-hidden="true"><BeatSlashGlyph /></span></button>
            <button type="button" data-key-emphasis="delete" className={`${destructiveKeyClass} min-h-0 px-0`} onClick={() => applyRhythmAction({ type: 'delete', mode: 'backspace' })} aria-label={language === 'zh' ? '刪除節奏事件' : 'Delete rhythm event'}><Delete size={23} strokeWidth={2.4} aria-hidden="true" /></button>
          </div>
          <div className="grid min-h-0 grid-cols-2 gap-1.5" data-rhythm-key-row="copy-paste" data-key-surface="utility">
            <button type="button" className={`${copyKeyClass} min-h-0 min-w-0 gap-1 px-2 text-[11px]`} onClick={onCopyRhythm} aria-label={language === 'zh' ? '複製節奏' : 'Copy rhythm'}><Copy size={15} aria-hidden="true" />{language === 'zh' ? '複製節奏' : 'Copy rhythm'}</button>
            <button type="button" disabled={!hasCopiedRhythm} className={`${pasteKeyClass} min-h-0 min-w-0 gap-1 px-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40`} onClick={onPasteRhythm} aria-label={language === 'zh' ? '貼上節奏' : 'Paste rhythm'}><ClipboardPaste size={15} aria-hidden="true" />{language === 'zh' ? '貼上節奏' : 'Paste rhythm'}</button>
          </div>
          {renderPreviewColorControls('rhythm-color-controls')}
          {notationActionError && <p role="status" className="shrink-0 truncate text-[10px] font-bold text-amber-700">{notationActionError}</p>}
        </div>
      )}

      {notationMode === 'jianpu' && (
        <div className={`grid min-h-0 flex-1 ${notationActionError ? 'grid-rows-[1.08fr_0.92fr_0.78fr_0.55fr_0.52fr_auto]' : 'grid-rows-[1.08fr_0.92fr_0.78fr_0.55fr_0.52fr]'} gap-1.5`} data-keyboard-view="jianpu">
          <div className="grid min-h-0 grid-cols-7 gap-1.5" data-jianpu-key-row="pitches" data-key-surface="character">
            {(['1', '2', '3', '4', '5', '6', '7'] as const).map((pitch) => (
              <button key={pitch} type="button" className={`${characterKeyClass} min-h-0 min-w-0 px-0`} onClick={() => applyJianpuAction({ type: 'insert-pitch', pitch })} aria-label={language === 'zh' ? `輸入簡譜 ${pitch}` : `Insert jianpu ${pitch}`}>
                <JianpuInputGlyph
		                  pitch={pitch}
		                  duration={jianpuInputMode.duration}
		                  className="!h-full !min-w-0 [&_[data-jianpu-pitch-symbol]]:!text-[24px] [&_[data-jianpu-pitch-symbol]]:!font-medium"
                />
              </button>
            ))}
          </div>
          <div className="grid min-h-0 grid-cols-5 gap-1.5" data-jianpu-key-row="format" data-key-surface="utility">
            <button type="button" className={`${characterKeyClass} min-h-0 min-w-0 px-0`} onClick={() => applyJianpuAction({ type: 'insert-rest' })} aria-label={language === 'zh' ? '輸入簡譜休止 0' : 'Insert jianpu rest 0'}><span className="text-[23px] font-medium leading-none" aria-hidden="true">0</span></button>
            <button type="button" className={`${characterKeyClass} min-h-0 min-w-0 px-0`} onClick={() => applyJianpuAction({ type: 'insert-hold' })} aria-label={language === 'zh' ? '輸入簡譜延音' : 'Insert jianpu hold'}><span className="text-[26px] font-medium leading-none" aria-hidden="true">−</span></button>
            {([['eighth', '八分', 'E'], ['sixteenth', '十六分', 'S']] as const).map(([duration, label, shortcut]) => (
		              <button key={duration} type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-0 ${jianpuInputMode.duration === duration ? activeButtonClass : ''}`} onClick={() => toggleJianpuDuration(duration)} aria-label={language === 'zh' ? `切換簡譜${label}音符` : `Toggle jianpu ${duration} note`} aria-keyshortcuts={shortcut} title={language === 'zh' ? `${label}音符（${shortcut}）` : `${duration} note (${shortcut})`}><JianpuInputGlyph pitch="5" duration={duration} className="!h-full !min-w-0 [&_[data-jianpu-pitch-symbol]]:!text-[23px] [&_[data-jianpu-pitch-symbol]]:!font-semibold" /></button>
	            ))}
            <button type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-1 ${session.draftSong.jianpuInputAbsolute ? activeButtonClass : ''}`} onClick={() => onJianpuInputAbsoluteChange(!Boolean(session.draftSong.jianpuInputAbsolute))} aria-label={session.draftSong.jianpuInputAbsolute ? (language === 'zh' ? '切換為首調簡譜輸入' : 'Switch to movable-do jianpu input') : (language === 'zh' ? '切換為固定調簡譜輸入' : 'Switch to fixed-do jianpu input')}><span className="text-xs font-bold leading-none">{session.draftSong.jianpuInputAbsolute ? (language === 'zh' ? '固定調' : 'Fixed') : (language === 'zh' ? '首調' : 'Movable')}</span></button>
          </div>
	          <div className="grid min-h-0 grid-cols-9 gap-1.5" data-jianpu-key-row="modifiers" data-key-surface="utility">
            <button type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-0 ${jianpuInputMode.octave < 0 ? activeButtonClass : ''}`} onClick={() => applyJianpuAction({ type: 'set-octave', octave: jianpuInputMode.octave < 0 ? 0 : -1 })} aria-label={language === 'zh' ? '切換低八度簡譜' : 'Toggle low-octave jianpu'} aria-keyshortcuts="ArrowDown L" title={language === 'zh' ? '低八度（↓ / L）' : 'Low octave (Down / L)'}><JianpuInputGlyph pitch="5" octave={-1} className="!h-full !min-w-0 [&_[data-jianpu-pitch-symbol]]:!text-[21px] [&_[data-jianpu-pitch-symbol]]:!font-semibold" /></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-0 ${jianpuInputMode.octave > 0 ? activeButtonClass : ''}`} onClick={() => applyJianpuAction({ type: 'set-octave', octave: jianpuInputMode.octave > 0 ? 0 : 1 })} aria-label={language === 'zh' ? '切換高八度簡譜' : 'Toggle high-octave jianpu'} aria-keyshortcuts="ArrowUp H" title={language === 'zh' ? '高八度（↑ / H）' : 'High octave (Up / H)'}><JianpuInputGlyph pitch="5" octave={1} className="!h-full !min-w-0 [&_[data-jianpu-pitch-symbol]]:!text-[21px] [&_[data-jianpu-pitch-symbol]]:!font-semibold" /></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-0 ${jianpuInputMode.accidental === '#' ? activeButtonClass : ''}`} onClick={() => applyJianpuAction({ type: 'set-accidental', accidental: jianpuInputMode.accidental === '#' ? '' : '#' })} aria-label={language === 'zh' ? '切換簡譜升記號' : 'Toggle jianpu sharp'}><span className="text-[22px] font-medium leading-none" aria-hidden="true">♯</span></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-0 ${jianpuInputMode.accidental === 'b' ? activeButtonClass : ''}`} onClick={() => applyJianpuAction({ type: 'set-accidental', accidental: jianpuInputMode.accidental === 'b' ? '' : 'b' })} aria-label={language === 'zh' ? '切換簡譜降記號' : 'Toggle jianpu flat'}><span className="text-[22px] font-medium leading-none" aria-hidden="true">♭</span></button>
		            <button type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-0 ${jianpuInputMode.triplet ? activeButtonClass : ''}`} onClick={() => applyJianpuAction({ type: 'toggle-triplet' })} aria-label={language === 'zh' ? '切換簡譜三連音' : 'Toggle jianpu triplet'} aria-keyshortcuts="Shift+T" title={language === 'zh' ? '三連音（Shift+T）' : 'Triplet (Shift+T)'}><JianpuTripletKeyGlyph className="!h-full !min-w-0" /></button>
	            <button type="button" disabled={jianpuInputMode.triplet} className={`${utilityKeyClass} min-h-0 min-w-0 px-0 ${jianpuInputMode.dotted ? activeButtonClass : ''} ${jianpuInputMode.triplet ? 'opacity-35 cursor-not-allowed hover:bg-transparent' : ''}`} onClick={() => applyJianpuAction({ type: 'toggle-dot' })} aria-label={language === 'zh' ? '切換簡譜附點' : 'Toggle jianpu dot'}><span className="h-2.5 w-2.5 rounded-full bg-current" aria-hidden="true" /></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-0`} onClick={() => applyJianpuAction({ type: 'toggle-slur' })} aria-label={language === 'zh' ? '切換簡譜圓滑線' : 'Toggle jianpu slur'}><svg viewBox="0 0 32 16" className="h-6 w-7" fill="none" aria-hidden="true"><path d="M3 13C8 3 24 3 29 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg></button>
            <button type="button" className={`${utilityKeyClass} min-h-0 min-w-0 px-0`} onClick={() => applyJianpuAction({ type: 'clear-formatting' })} aria-label={language === 'zh' ? '清除簡譜輸入格式' : 'Clear jianpu input formatting'}><Eraser size={21} aria-hidden="true" /></button>
            <button type="button" data-key-emphasis="delete" className={`${destructiveKeyClass} min-h-0 min-w-0 px-0`} onClick={() => applyJianpuAction({ type: 'delete', direction: 'backward' })} aria-label={language === 'zh' ? '刪除簡譜音符' : 'Delete jianpu note'}><Delete size={23} strokeWidth={2.4} aria-hidden="true" /></button>
          </div>
          <div className="grid min-h-0 grid-cols-2 gap-1.5" data-jianpu-key-row="bar-actions" data-key-surface="utility">
            <button type="button" className={`${copyKeyClass} min-h-0 min-w-0 gap-1 px-2 text-[11px]`} onClick={onCopyJianpu} aria-label={language === 'zh' ? '複製簡譜' : 'Copy jianpu'}><Copy size={15} aria-hidden="true" />{language === 'zh' ? '複製簡譜' : 'Copy jianpu'}</button>
            <button type="button" disabled={!hasCopiedJianpu} className={`${pasteKeyClass} min-h-0 min-w-0 gap-1 px-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40`} onClick={onPasteJianpu} aria-label={language === 'zh' ? '貼上簡譜' : 'Paste jianpu'}><ClipboardPaste size={15} aria-hidden="true" />{language === 'zh' ? '貼上簡譜' : 'Paste jianpu'}</button>
          </div>
          {renderPreviewColorControls('jianpu-color-controls')}
          {notationActionError && <p role="status" className="shrink-0 truncate text-[10px] font-bold text-amber-700">{notationActionError}</p>}
        </div>
      )}

      {notationMode === 'chords' && mode === 'text' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2" data-text-fields-view="all">
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className={utilityKeyClass} onClick={() => { setMode('common'); setActivePicker(null); }} aria-label={language === 'zh' ? '返回和弦鍵盤' : 'Back to chord keyboard'}>ABC</button>
            <span className="text-xs font-black text-slate-600">{language === 'zh' ? '小節文字位置' : 'Bar text positions'}</span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            {([
              ['label', language === 'zh' ? '小節標籤' : 'Label'],
              ['annotation', language === 'zh' ? '上方註記' : 'Annotation'],
              ['leftText', language === 'zh' ? '左側文字' : 'Left text'],
              ['rightText', language === 'zh' ? '右側文字' : 'Right text']
            ] as const).map(([field, label]) => (
              <label key={field} className="flex min-h-0 flex-col gap-1 text-[10px] font-bold text-slate-600" htmlFor={`preview-text-${field}`}>
                <span>{label}</span>
                <input id={`preview-text-${field}`} className={`${fieldClass} min-h-0 flex-1`} value={bar[field] || ''} onChange={(event) => updateFields({ [field]: event.target.value || undefined }, `${field}:${bar.id}`)} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const notationLabels: Record<PreviewNotationMode, string> = language === 'zh'
    ? { chords: '和弦', rhythm: '節奏', jianpu: '簡譜' }
    : { chords: 'Chords', rhythm: 'Rhythm', jianpu: 'Jianpu' };
  const compactNotationLabels: Record<PreviewNotationMode, string> = language === 'zh'
    ? notationLabels
    : { chords: 'Chord', rhythm: 'Rhy', jianpu: 'Jian' };
  const notationMeter = parseTimeSignature(effectiveBarTimeSignature);
  const rhythmBeatNumber = Math.min(
    notationMeter.beats,
    Math.floor(rhythmCursor.cursorUnit / notationMeter.beatUnits) + 1
  );
  const headerValue = notationMode === 'chords'
    ? displayedChord || (language === 'zh' ? `第 ${session.target.slotIndex + 1} 拍 · 空白` : `Beat ${session.target.slotIndex + 1} · Empty`)
    : notationMode === 'rhythm'
      ? (language === 'zh' ? `節奏 · 第 ${rhythmBeatNumber} 拍` : `Rhythm · Beat ${rhythmBeatNumber}`)
      : (language === 'zh' ? `簡譜 · 第 ${jianpuCursor.beatIndex + 1} 拍` : `Jianpu · Beat ${jianpuCursor.beatIndex + 1}`);
  const footerBeatPosition = notationMode === 'chords'
    ? session.target.slotIndex + 1
    : notationMode === 'rhythm'
      ? rhythmBeatNumber
      : jianpuCursor.beatIndex + 1;
  const footerBeatCount = notationMode === 'chords' ? beatCount : notationMeter.beats;
  const footerPositionLabel = language === 'zh' ? `第 ${footerBeatPosition} 拍` : `Beat ${footerBeatPosition}`;
  const footerPositionValue = language === 'zh' ? `共 ${footerBeatCount} 拍` : `of ${footerBeatCount}`;
  const previousLabel = notationMode === 'chords'
    ? (language === 'zh' ? '上一拍' : 'Previous beat')
    : notationMode === 'rhythm'
      ? (language === 'zh' ? '上一個節奏' : 'Previous rhythm')
      : (language === 'zh' ? '上一音' : 'Previous note');
  const nextLabel = notationMode === 'chords'
    ? (language === 'zh' ? '下一拍' : 'Next beat')
    : notationMode === 'rhythm'
      ? (language === 'zh' ? '下一個節奏' : 'Next rhythm')
      : (language === 'zh' ? '下一音' : 'Next note');

  return (
    <section
      ref={panelRef}
      data-preview-bar-editor
      data-preview-edit-ui
      data-device-layout={deviceLayout}
      data-notation-mode={notationMode}
      data-fixed-keyboard-height={isDocked ? '40dvh' : undefined}
      role="dialog"
      aria-label={language === 'zh' ? '預覽快捷編輯' : 'Preview quick editor'}
      className="z-[5000] flex flex-col overflow-hidden rounded-t-[28px] border-x border-t border-white/80 bg-slate-200/95 shadow-[0_20px_60px_rgba(15,23,42,0.24)] backdrop-blur-xl"
      style={{ ...panelStyle, paddingBottom: isDocked ? 'env(safe-area-inset-bottom)' : undefined }}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-white/70 bg-white/70 px-2.5 py-2 backdrop-blur-xl">
        {deviceLayout === 'desktop' && <button type="button" className={toolbarButtonClass} onClick={() => navigateNotation('previous')} aria-label="Previous beat"><ChevronLeft size={16} /></button>}
        <div
          data-notation-mode-segments
          className="grid h-9 w-[7.6rem] shrink-0 grid-cols-3 rounded-[13px] border border-white/80 bg-slate-300/70 p-0.5 shadow-inner sm:w-[9rem]"
          role="group"
          aria-label={language === 'zh' ? '輸入法' : 'Input mode'}
        >
          {PREVIEW_NOTATION_MODES.map((candidateMode) => {
            const selected = candidateMode === notationMode;
            return (
              <button
                key={candidateMode}
                type="button"
                aria-pressed={selected}
                className={`min-w-0 rounded-[10px] px-0.5 text-[10px] font-black leading-none transition-colors ${
                  selected
                    ? 'bg-white text-indigo-700 shadow-[0_1px_4px_rgba(15,23,42,0.14)]'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
                onClick={() => changeNotationMode(candidateMode)}
                aria-label={selected
                  ? (language === 'zh' ? `目前${notationLabels[candidateMode]}` : `Current ${notationLabels[candidateMode]}`)
                  : (language === 'zh' ? `切換到${notationLabels[candidateMode]}` : `Switch to ${notationLabels[candidateMode]}`)}
                title={notationLabels[candidateMode]}
              >
                <span className="block truncate">{compactNotationLabels[candidateMode]}</span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-indigo-500">{section.title || (language === 'zh' ? '未命名段落' : 'Untitled section')}</div>
          <div className="truncate text-xs font-black text-slate-900">{headerValue}</div>
        </div>
        {deviceLayout === 'desktop' && <button type="button" className={toolbarButtonClass} onClick={() => navigateNotation('next')} aria-label="Next beat"><ChevronRight size={16} /></button>}
        {deviceLayout === 'desktop' && notationMode === 'chords' && (
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => setDesktopKeysVisible((value) => !value)}
            aria-label={desktopKeysVisible ? (language === 'zh' ? '只顯示功能鍵' : 'Show utility keys only') : (language === 'zh' ? '顯示字母數字鍵' : 'Show letter and number keys')}
            title={desktopKeysVisible ? (language === 'zh' ? '只顯示功能鍵' : 'Show utility keys only') : (language === 'zh' ? '顯示字母數字鍵' : 'Show letter and number keys')}
          >
            <Keyboard size={14} />
          </button>
        )}
        <button type="button" className={toolbarButtonClass} disabled={session.past.length === 0} onClick={onUndo} aria-label="Undo"><Undo2 size={14} /></button>
        <button type="button" className={toolbarButtonClass} disabled={session.future.length === 0} onClick={onRedo} aria-label="Redo"><Redo2 size={14} /></button>
        <button type="button" className={`${toolbarButtonClass} !text-rose-700`} onClick={onCancel} aria-label="Cancel"><X size={15} /></button>
        <button type="button" className={`${toolbarButtonClass} !border-indigo-500 !bg-indigo-600 !text-white hover:!bg-indigo-500`} onClick={onDone} aria-label={language === 'zh' ? '完成' : 'Done'}><Check size={15} /><span className={deviceLayout === 'phone' ? 'sr-only' : 'ml-1'}>{language === 'zh' ? '完成' : 'Done'}</span></button>
      </header>

      {deviceLayout === 'desktop' && notationMode === 'chords' && session.target.field === 'chords' && (
        <input
          ref={chordCaptureRef}
          data-preview-chord-capture
          type="text"
          value={displayedChord}
          onChange={(event) => applyDisplayedChord(event.target.value, `slot-text:${bar.id}:${session.target.slotIndex}`)}
          onKeyDown={(event) => {
            const meta = event.metaKey || event.ctrlKey;
            if (meta && event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onDone();
            } else if (!meta && event.altKey && !event.shiftKey && applyChordEndingShortcut(event.key, event.code)) {
              event.preventDefault();
              event.stopPropagation();
            } else if (!meta && !event.altKey && !event.shiftKey && applyChordBarMarkerShortcut(event.key, event.code)) {
              event.preventDefault();
              event.stopPropagation();
            } else if (event.shiftKey && event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onApplyDraft(
                insertChordBeatBeforeSlot(session.draftSong, session.target),
                { mergeKey: `insert-beat-before:${bar?.id ?? session.target.barId}:${session.target.slotIndex}` }
              );
            } else if (event.shiftKey && event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              onStructure('insert-before');
            } else if (event.shiftKey && event.key === 'ArrowLeft') {
              event.preventDefault();
              event.stopPropagation();
              onNavigate('previous', undefined, { bar: true });
            } else if (event.shiftKey && event.key === 'ArrowRight') {
              event.preventDefault();
              event.stopPropagation();
              onNavigate('next', undefined, { bar: true });
            } else if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              onNavigate('next', undefined, { bar: true });
            } else if (event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onNavigate('next');
            } else if (event.key === 'Backspace' && !displayedChord) {
              event.preventDefault();
              event.stopPropagation();
              if (!deleteEmptyBarIfPossible()) onNavigate('previous');
            }
          }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          tabIndex={-1}
          className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
          aria-label={language === 'zh' ? '和弦直接輸入' : 'Direct chord input'}
        />
      )}

      {!collapsed && deviceLayout === 'desktop' && keyboardContent}
      {!collapsed && deviceLayout !== 'desktop' && keyboardContent}

      {deviceLayout !== 'desktop' && (
        <footer className="relative flex shrink-0 items-stretch gap-2 border-t border-white/70 bg-slate-200/90 px-2.5 py-2">
          <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[15px] border border-white/80 bg-white/80 text-sm font-semibold text-indigo-700 shadow-[0_1px_0_rgba(15,23,42,0.16),0_3px_7px_rgba(15,23,42,0.10)] transition-[transform,box-shadow,background-color] duration-75 active:translate-y-px active:scale-[0.99] active:bg-white active:shadow-none" onClick={() => navigateNotation('previous')} aria-label="Previous beat"><ChevronLeft size={20} className="mr-1" />{previousLabel}</button>
          <div className="flex min-w-14 flex-col items-center justify-center rounded-[15px] border border-white/40 bg-slate-300/70 px-1 text-center shadow-inner">
            <span className="text-[9px] font-black uppercase text-slate-400">{footerPositionLabel}</span>
            <span className="text-xs font-black text-slate-800">{footerPositionValue}</span>
          </div>
          <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[15px] border border-indigo-500/60 bg-indigo-600 text-sm font-semibold text-white shadow-[0_1px_0_rgba(49,46,129,0.9),0_4px_10px_rgba(79,70,229,0.28)] transition-[transform,box-shadow,background-color] duration-75 active:translate-y-px active:scale-[0.99] active:bg-indigo-700 active:shadow-none" onClick={() => navigateNotation('next')} aria-label="Next beat">{nextLabel}<ChevronRight size={20} className="ml-1" /></button>
          <button type="button" className="inline-flex min-w-10 items-center justify-center rounded-[15px] border border-white/40 bg-slate-300/70 text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.10)] transition-[transform,background-color] duration-75 active:translate-y-px active:bg-slate-300" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? (language === 'zh' ? '展開鍵盤' : 'Expand keyboard') : (language === 'zh' ? '收合鍵盤' : 'Collapse keyboard')}>
            {collapsed ? <Plus size={17} /> : <ChevronDown size={17} />}
          </button>
        </footer>
      )}
    </section>
  );
};

export default PreviewBarEditor;
