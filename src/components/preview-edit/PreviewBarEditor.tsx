import React from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Keyboard,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  X
} from 'lucide-react';
import type { AppLanguage, Key, NavigationMarker, Song } from '../../types';
import type { PreviewEditSession } from '../../lib/previewEditSession';
import type { PreviewEditorDeviceLayout } from '../../lib/previewEditorLayout';
import { getRestGlyph } from '../../utils/rhythmUtils';
import {
  convertDisplayedChordToStoredChord,
  convertStoredChordToDisplayedChord,
  findSongBar,
  getBeatCount,
  getChordBeatSlots,
  getChordPlacementError,
  getMultiMeasureRestPlacementError,
  normalizeChordTextInput,
  setBarChordText,
  setChordAtBeatSlot,
  setMultiMeasureRestAtBar,
  updateEditableBarFields
} from '../../lib/songEditing';

type KeyboardMode = 'common' | 'advanced' | 'symbols' | 'text';
type KeyboardPicker = 'quality' | 'time' | 'special' | 'articulation' | 'ending' | 'navigation' | 'barline' | 'structure' | 'bar' | null;
type StructureAction = 'insert-before' | 'insert-after' | 'duplicate' | 'delete' | 'split-section';

interface PickerAnchor {
  left: number;
  top: number;
  width: number;
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
  onNavigate: (direction: 'previous' | 'next') => void;
  onStructure: (action: StructureAction) => void;
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

const EndingGlyph: React.FC<{ value: string }> = ({ value }) => (
  <span data-ending-glyph className="relative block h-6 w-full border-l-2 border-t-2 border-current">
    <span className="absolute left-1 top-0.5 text-[10px] font-black leading-none">
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

const PreviewBarEditor: React.FC<PreviewBarEditorProps> = ({
  session,
  language,
  deviceLayout,
  storedKey,
  displayedKey,
  storageMode,
  onApplyDraft,
  onInputModeChange,
  onNavigate,
  onStructure,
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
  const [, forceViewportUpdate] = React.useReducer((value) => value + 1, 0);
  const panelRef = React.useRef<HTMLElement>(null);
  const chordCaptureRef = React.useRef<HTMLInputElement>(null);
  const multiRestInputRef = React.useRef<HTMLInputElement>(null);
  const replaceChordOnNextHardwareKeyRef = React.useRef(true);

  const located = findSongBar(session.draftSong, session.target);
  const bar = located?.bar;
  const section = located?.section
    ?? session.draftSong.sections.find((candidate) => candidate.id === session.target.sectionId);
  const beatCount = bar ? getBeatCount(session.draftSong, bar) : 4;
  const storedChord = bar ? getChordBeatSlots(bar, beatCount)[session.target.slotIndex]?.chord ?? '' : '';
  const displayedChord = convertStoredChordToDisplayedChord({
    chord: storedChord,
    storageMode,
    outputMode: session.inputMode,
    storedKey,
    displayedKey
  });
  const chordParts = parseChordParts(displayedChord, session.inputMode);
  const rootChoices = session.inputMode === 'letters'
    ? ['C', 'D', 'E', 'F', 'G', 'A', 'B']
    : ['1', '2', '3', '4', '5', '6', '7'];
  const multiRestPlacementError = getMultiMeasureRestPlacementError(session.draftSong, session.target);
  const halfRestPlacementError = getChordPlacementError(session.draftSong, session.target, '0h');
  const multiRestCountNumber = Number.parseInt(multiRestCount, 10);
  const hasValidMultiRestCount = Number.isInteger(multiRestCountNumber) && multiRestCountNumber >= 1 && multiRestCountNumber <= 999;

  React.useEffect(() => {
    setMode(modeForField(session.target.field));
    setActivePicker(null);
    setPickerAnchor(null);
    if (deviceLayout === 'desktop' && session.target.field !== 'chords') setDesktopKeysVisible(true);
  }, [deviceLayout, session.target.barId, session.target.field, session.target.slotIndex]);

  React.useEffect(() => {
    setBassMode(false);
  }, [session.target.barId, session.target.slotIndex]);

  React.useEffect(() => {
    setBarText(bar?.chords.filter((token) => token.trim()).join(' ') ?? '');
    setBarTextError(null);
    setMultiRestActionError(null);
    const existingCount = bar?.chords.find((token) => /^\|\d{1,3}\|$/.test(token.trim()))?.match(/\d+/)?.[0];
    if (existingCount) setMultiRestCount(existingCount);
  }, [bar?.id, bar?.chords]);

  React.useEffect(() => {
    if (deviceLayout !== 'desktop' || session.target.field !== 'chords') return;
    const capture = chordCaptureRef.current;
    capture?.focus({ preventScroll: true });
    capture?.select();
  }, [deviceLayout, session.previewIdentity, session.target.barId, session.target.field, session.target.slotIndex]);

  React.useEffect(() => {
    replaceChordOnNextHardwareKeyRef.current = true;
  }, [session.previewIdentity, session.target.barId, session.target.field, session.target.slotIndex]);

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
    replaceChordOnNextHardwareKeyRef.current = false;
    const normalizedInput = normalizeChordTextInput(value, session.inputMode);
    const stored = convertDisplayedChordToStoredChord({
      input: normalizedInput,
      inputMode: session.inputMode,
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

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      const isTyping = element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT' || element?.isContentEditable;
      const isButtonActivation = element?.tagName === 'BUTTON' && (event.key === 'Enter' || event.key === ' ');
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) onRedo(); else onUndo();
        return;
      }
      if (isTyping || isButtonActivation || event.altKey || meta) return;
      if (event.key === 'ArrowLeft' || (event.key === 'Enter' && event.shiftKey)) {
        event.preventDefault();
        onNavigate('previous');
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        onNavigate('next');
      } else if (session.target.field === 'chords' && event.key === 'Backspace') {
        event.preventDefault();
        if (displayedChord) applyDisplayedChord(''); else onNavigate('previous');
      } else if (session.target.field === 'chords' && event.key === 'Delete') {
        event.preventDefault();
        applyDisplayedChord('');
      } else if (session.target.field === 'chords' && event.key === '%') {
        event.preventDefault();
        applyDisplayedChord('%');
      } else if (session.target.field === 'chords' && event.key.length === 1 && event.key.trim()) {
        event.preventDefault();
        const nextChord = replaceChordOnNextHardwareKeyRef.current
          ? event.key
          : `${displayedChord}${event.key}`;
        applyDisplayedChord(nextChord, `slot-hardware:${bar?.id ?? session.target.barId}:${session.target.slotIndex}`);
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
      const main = withoutModifiers(displayedChord).split('/')[0] || (session.inputMode === 'letters' ? 'C' : '1');
      applyDisplayedChord(`${main}/${root}${trailingModifiers(displayedChord)}`);
      setBassMode(false);
      return;
    }
    applyDisplayedChord(buildChord({
      ...chordParts,
      root,
      accidental: '',
      quality: chordParts.root ? chordParts.quality : '',
      mode: session.inputMode
    }));
  };

  const applyAccidental = (accidental: 'b' | '#') => {
    if (bassMode) {
      const [main, currentBass = rootChoices[0]] = withoutModifiers(displayedChord).split('/');
      const parsedBass = parseChordParts(currentBass, session.inputMode);
      const root = parsedBass.root || rootChoices[0];
      const bass = session.inputMode === 'letters' ? `${root}${accidental}` : `${accidental}${root}`;
      applyDisplayedChord(`${main || rootChoices[0]}/${bass}${trailingModifiers(displayedChord)}`);
      return;
    }
    if (chordParts.quality) {
      applyDisplayedChord(buildChord({
        ...chordParts,
        root: chordParts.root || rootChoices[0],
        quality: `${chordParts.quality}${accidental}`,
        mode: session.inputMode
      }));
      return;
    }
    applyDisplayedChord(buildChord({
      ...chordParts,
      root: chordParts.root || rootChoices[0],
      accidental,
      mode: session.inputMode
    }));
  };

  const appendQualityFragment = (fragment: string) => applyDisplayedChord(buildChord({
    ...chordParts,
    root: chordParts.root || rootChoices[0],
    quality: `${chordParts.quality}${fragment}`,
    mode: session.inputMode
  }));

  const applyQuality = (quality: string) => applyDisplayedChord(buildChord({
    ...chordParts,
    root: chordParts.root || rootChoices[0],
    quality,
    mode: session.inputMode
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

  const updateFields = (patch: Parameters<typeof updateEditableBarFields>[2], mergeKey?: string) => {
    onApplyDraft(
      updateEditableBarFields(session.draftSong, session.target, patch),
      mergeKey ? { mergeKey } : undefined
    );
  };

  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const keyboardOffset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
  const isDocked = deviceLayout !== 'desktop';
  const compactHardwareMode = deviceLayout === 'desktop' && !desktopKeysVisible && mode === 'common';
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
  const toolbarButtonClass = 'inline-flex min-h-8 min-w-8 items-center justify-center rounded-[11px] border border-white/80 bg-white/85 px-2 text-[11px] font-semibold text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.09)] transition-[transform,background-color,box-shadow] duration-75 hover:bg-white active:translate-y-px active:scale-[0.97] active:bg-slate-100 disabled:shadow-none disabled:opacity-35';
  const activeButtonClass = '!border-indigo-500/70 !bg-indigo-600 !text-white !shadow-[0_1px_0_rgba(49,46,129,0.8),0_3px_8px_rgba(79,70,229,0.28)] hover:!bg-indigo-600';
  const fieldClass = 'h-9 w-full rounded-xl border border-white/90 bg-white/95 px-3 text-sm font-semibold text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/70';

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

  const effectiveBarTimeSignature = bar.timeSignature || session.draftSong.timeSignature || '4/4';
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

  const keyboardContent = (
    <div data-keyboard-mode={mode} data-keyboard-surface="system" className={`relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(241,245,249,0.92)_0%,rgba(203,213,225,0.82)_100%)] ${mode === 'symbols' ? 'gap-1.5 p-2' : 'gap-2 p-2.5'}`}>
      {mode === 'common' && (
        <div className={`grid min-h-0 flex-1 ${compactHardwareMode ? 'grid-rows-2' : 'grid-rows-4'} gap-2`} data-keyboard-view="main" data-desktop-compact={compactHardwareMode ? 'true' : undefined}>
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

          <div className="grid min-h-0 grid-cols-10 gap-1.5" data-chord-key-row="modifiers" data-key-surface="utility">
            <button type="button" data-picker-trigger="time" className={`${utilityKeyClass} min-h-0 px-0 ${bar.timeSignature ? activeButtonClass : ''}`} onClick={(event) => openPicker('time', event.currentTarget)} aria-label={language === 'zh' ? '選擇小節拍號' : 'Choose time signature'}>{effectiveBarTimeSignature}</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 text-base`} onClick={() => applyDisplayedChord('%')} aria-label={language === 'zh' ? '重複前一小節' : 'Repeat previous bar'}>%</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => applyDisplayedChord('N.C.')} aria-label="N.C.">N.C.</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => appendQualityFragment('sus')}>sus</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => appendQualityFragment('add')}>add</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => appendQualityFragment('alt')}>alt</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 text-lg`} onClick={() => appendQualityFragment('aug')} aria-label={language === 'zh' ? '加入增和弦' : 'Append augmented'}>+</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 ${bassMode ? activeButtonClass : ''}`} onClick={() => setBassMode((value) => !value)} aria-label={language === 'zh' ? '選擇 Slash Bass' : 'Choose slash bass'}>/</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0`} onClick={() => onInputModeChange(session.inputMode === 'letters' ? 'nashville' : 'letters')} aria-label={session.inputMode === 'letters' ? (language === 'zh' ? '切換為 Nashville' : 'Switch to Nashville') : (language === 'zh' ? '切換為字母和弦' : 'Switch to letter chords')}>{session.inputMode === 'letters' ? '123' : 'ABC'}</button>
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 text-lg`} onClick={deleteLastChordCharacter} disabled={!displayedChord} aria-label={language === 'zh' ? '刪除最後一個字元' : 'Delete last character'}>⌫</button>
          </div>

          <div className="grid min-h-0 grid-cols-8 gap-1.5" data-key-surface="utility">
            <button type="button" className={`${utilityKeyClass} min-h-0 px-0 text-[11px]`} onClick={() => { setMode('text'); setActivePicker(null); }} aria-label={language === 'zh' ? '文字欄位' : 'Text fields'}>{language === 'zh' ? '文字' : 'Text'}</button>
            <button type="button" data-picker-trigger="special" className={`${utilityKeyClass} min-h-0 px-0`} onClick={(event) => openPicker('special', event.currentTarget)} aria-label={language === 'zh' ? '休止符與整小節符號' : 'Rests and whole-bar symbols'}><span className="font-rhythm text-[22px] leading-none" aria-hidden="true">{getRestGlyph('q')}</span></button>
            <button type="button" data-picker-trigger="articulation" className={`${utilityKeyClass} min-h-0 px-0 ${trailingModifiers(displayedChord) ? activeButtonClass : ''}`} onClick={(event) => openPicker('articulation', event.currentTarget)} aria-label={language === 'zh' ? '選擇演奏記號' : 'Choose articulation'}><DirectionGlyph direction="push" /></button>
            <button type="button" data-picker-trigger="ending" className={`${utilityKeyClass} min-h-0 overflow-hidden px-1 ${bar.ending ? activeButtonClass : ''}`} onClick={(event) => openPicker('ending', event.currentTarget)} aria-label={language === 'zh' ? '選擇房子記號' : 'Choose ending'}><EndingGlyph value={bar.ending || '1'} /></button>
            <button type="button" data-picker-trigger="navigation" className={`${utilityKeyClass} min-h-0 px-0 ${bar.leftMarker || bar.rightMarker ? activeButtonClass : ''}`} onClick={(event) => openPicker('navigation', event.currentTarget)} aria-label={language === 'zh' ? '選擇導引記號' : 'Choose navigation marker'}><span className="flex items-center gap-0.5"><SegnoGlyph className="h-4 w-4" /><CodaGlyph className="h-4 w-4" /></span></button>
            <button type="button" data-picker-trigger="barline" className={`${utilityKeyClass} min-h-0 px-0 text-base ${bar.repeatStart || bar.repeatEnd || bar.finalBar ? activeButtonClass : ''}`} onClick={(event) => openPicker('barline', event.currentTarget)} aria-label={language === 'zh' ? '選擇小節線與反覆' : 'Choose barline and repeat'}>{barlineGlyph}</button>
            <button type="button" data-picker-trigger="structure" className={`${utilityKeyClass} min-h-0 px-0 text-base`} onClick={(event) => openPicker('structure', event.currentTarget)} aria-label={language === 'zh' ? '小節操作' : 'Bar actions'}>+│</button>
            <button type="button" data-picker-trigger="bar" className={`${utilityKeyClass} min-h-0 px-0 text-base`} onClick={(event) => openPicker('bar', event.currentTarget)} aria-label={language === 'zh' ? '整小節輸入' : 'Whole bar input'}>•••</button>
          </div>

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
                <div data-structure-actions className="grid min-h-0 flex-1 grid-cols-5 gap-1 overflow-hidden">
                  <button type="button" className={`${buttonClass} min-h-0 flex-col px-1 text-[9px] leading-tight`} onClick={() => { onStructure('insert-before'); setActivePicker(null); }}><Plus size={14} />{language === 'zh' ? '前方插入' : 'Before'}</button>
                  <button type="button" className={`${buttonClass} min-h-0 flex-col px-1 text-[9px] leading-tight`} onClick={() => { onStructure('insert-after'); setActivePicker(null); }}><Plus size={14} />{language === 'zh' ? '後方插入' : 'After'}</button>
                  <button type="button" className={`${buttonClass} min-h-0 flex-col px-1 text-[9px] leading-tight`} onClick={() => { onStructure('duplicate'); setActivePicker(null); }}><Copy size={14} />{language === 'zh' ? '複製' : 'Duplicate'}</button>
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

      {mode === 'advanced' && (
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

      {mode === 'symbols' && (
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

          <div className="grid grid-cols-6 gap-1">
            <input className="min-h-7 min-w-0 rounded-lg border border-slate-200 bg-white px-1 text-center text-[10px] font-bold outline-none focus:border-indigo-400" value={ENDINGS.includes(bar.ending || '') ? '' : bar.ending || ''} onChange={(event) => updateFields({ ending: event.target.value || undefined }, `ending:${bar.id}`)} placeholder="⌜…" aria-label={language === 'zh' ? '自訂 Ending' : 'Custom ending'} />
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base`} onClick={() => onStructure('insert-before')} aria-label={language === 'zh' ? '前方插入小節' : 'Insert bar before'}>+│</button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base`} onClick={() => onStructure('insert-after')} aria-label={language === 'zh' ? '後方插入小節' : 'Insert bar after'}>│+</button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0`} onClick={() => onStructure('duplicate')} aria-label={language === 'zh' ? '複製小節' : 'Duplicate bar'}><Copy size={15} /></button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0`} onClick={() => onStructure('split-section')} aria-label={language === 'zh' ? '從這裡拆分段落' : 'Split section here'}><Scissors size={15} /></button>
            <button type="button" className={`${buttonClass} !min-h-7 border-rose-200 px-0 text-rose-700`} onClick={() => onStructure('delete')} aria-label={language === 'zh' ? '刪除小節' : 'Delete bar'}><Trash2 size={15} /></button>
          </div>

          {(multiRestPlacementError || multiRestActionError) && (
            <p role="status" className="shrink-0 truncate text-[9px] font-bold text-amber-700">{multiRestActionError || multiRestPlacementError}</p>
          )}
        </div>
      )}

      {mode === 'text' && (
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

  return (
    <section
      ref={panelRef}
      data-preview-bar-editor
      data-device-layout={deviceLayout}
      data-fixed-keyboard-height={isDocked ? '40dvh' : undefined}
      role="dialog"
      aria-label={language === 'zh' ? '預覽快捷編輯' : 'Preview quick editor'}
      className="z-[5000] flex flex-col overflow-hidden rounded-t-[28px] border-x border-t border-white/80 bg-slate-200/95 shadow-[0_20px_60px_rgba(15,23,42,0.24)] backdrop-blur-xl"
      style={{ ...panelStyle, paddingBottom: isDocked ? 'env(safe-area-inset-bottom)' : undefined }}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-white/70 bg-white/70 px-2.5 py-2 backdrop-blur-xl">
        {deviceLayout === 'desktop' && <button type="button" className={toolbarButtonClass} onClick={() => onNavigate('previous')} aria-label="Previous beat"><ChevronLeft size={16} /></button>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-indigo-500">{section.title || (language === 'zh' ? '未命名段落' : 'Untitled section')}</div>
          <div className="truncate text-xs font-black text-slate-900">{displayedChord || (language === 'zh' ? `第 ${session.target.slotIndex + 1} 拍 · 空白` : `Beat ${session.target.slotIndex + 1} · Empty`)}</div>
        </div>
        {deviceLayout === 'desktop' && <button type="button" className={toolbarButtonClass} onClick={() => onNavigate('next')} aria-label="Next beat"><ChevronRight size={16} /></button>}
        {deviceLayout === 'desktop' && (
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

      {deviceLayout === 'desktop' && (
        <input
          ref={chordCaptureRef}
          data-preview-chord-capture
          type="text"
          value={displayedChord}
          onChange={(event) => applyDisplayedChord(event.target.value, `slot-text:${bar.id}:${session.target.slotIndex}`)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onNavigate(event.shiftKey ? 'previous' : 'next');
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              onNavigate('previous');
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              onNavigate('next');
            } else if (event.key === 'Backspace' && !displayedChord) {
              event.preventDefault();
              onNavigate('previous');
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
          <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[15px] border border-white/80 bg-white/80 text-sm font-semibold text-indigo-700 shadow-[0_1px_0_rgba(15,23,42,0.16),0_3px_7px_rgba(15,23,42,0.10)] transition-[transform,box-shadow,background-color] duration-75 active:translate-y-px active:scale-[0.99] active:bg-white active:shadow-none" onClick={() => onNavigate('previous')} aria-label="Previous beat"><ChevronLeft size={20} className="mr-1" />{language === 'zh' ? '上一拍' : 'Previous'}</button>
          <div className="flex min-w-14 flex-col items-center justify-center rounded-[15px] border border-white/40 bg-slate-300/70 px-1 text-center shadow-inner">
            <span className="text-[9px] font-black uppercase text-slate-400">{language === 'zh' ? '拍點' : 'Beat'}</span>
            <span className="text-xs font-black text-slate-800">{session.target.slotIndex + 1}/{beatCount}</span>
          </div>
          <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[15px] border border-indigo-500/60 bg-indigo-600 text-sm font-semibold text-white shadow-[0_1px_0_rgba(49,46,129,0.9),0_4px_10px_rgba(79,70,229,0.28)] transition-[transform,box-shadow,background-color] duration-75 active:translate-y-px active:scale-[0.99] active:bg-indigo-700 active:shadow-none" onClick={() => onNavigate('next')} aria-label="Next beat">{language === 'zh' ? '下一拍' : 'Next'}<ChevronRight size={20} className="ml-1" /></button>
          <button type="button" className="inline-flex min-w-10 items-center justify-center rounded-[15px] border border-white/40 bg-slate-300/70 text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.10)] transition-[transform,background-color] duration-75 active:translate-y-px active:bg-slate-300" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? (language === 'zh' ? '展開鍵盤' : 'Expand keyboard') : (language === 'zh' ? '收合鍵盤' : 'Collapse keyboard')}>
            {collapsed ? <Plus size={17} /> : <ChevronDown size={17} />}
          </button>
        </footer>
      )}
    </section>
  );
};

export default PreviewBarEditor;
