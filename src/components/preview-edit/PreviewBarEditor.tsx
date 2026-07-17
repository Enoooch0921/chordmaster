import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Keyboard,
  Plus,
  Redo2,
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
  getMultiMeasureRestPlacementError,
  normalizeChordTextInput,
  setBarChordText,
  setChordAtBeatSlot,
  setMultiMeasureRestAtBar,
  updateEditableBarFields
} from '../../lib/songEditing';

type KeyboardMode = 'common' | 'advanced' | 'symbols' | 'text';
type TextField = 'label' | 'annotation' | 'leftText' | 'rightText';
type StructureAction = 'insert-before' | 'insert-after' | 'duplicate' | 'delete';

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

const KEYBOARD_MODES: KeyboardMode[] = ['common', 'advanced', 'symbols', 'text'];
const COMMON_QUALITIES = ['', 'm', '5', '6', 'm6', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'dim7', 'aug', 'add9'];
const EXPANDED_QUALITIES = ['9', 'maj9', 'm9', '11', 'm11', '13', 'm13', 'mMaj7', 'm7b5', '7sus4', '7b5', '7#5', '7b9', '7#9', '7#11', '7b13', 'add2', 'add11'];
const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8'];
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
  field === 'symbols' ? 'symbols' : field === 'text' ? 'text' : 'common'
);

const getModeLabel = (mode: KeyboardMode, language: AppLanguage) => {
  if (language !== 'zh') {
    return mode === 'common' ? 'Chord' : mode === 'advanced' ? 'More' : mode === 'symbols' ? 'Symbols' : 'Text';
  }
  return mode === 'common' ? '常用' : mode === 'advanced' ? '進階' : mode === 'symbols' ? '符號' : '文字';
};

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
  const [activeTextField, setActiveTextField] = React.useState<TextField>('label');
  const [bassMode, setBassMode] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [desktopKeysVisible, setDesktopKeysVisible] = React.useState(() => (
    deviceLayout !== 'desktop' || session.target.field !== 'chords'
  ));
  const [modeMenuOpen, setModeMenuOpen] = React.useState(false);
  const [barText, setBarText] = React.useState('');
  const [barTextError, setBarTextError] = React.useState<string | null>(null);
  const [multiRestCount, setMultiRestCount] = React.useState('4');
  const [multiRestActionError, setMultiRestActionError] = React.useState<string | null>(null);
  const [, forceViewportUpdate] = React.useReducer((value) => value + 1, 0);
  const panelRef = React.useRef<HTMLElement>(null);
  const chordCaptureRef = React.useRef<HTMLInputElement>(null);
  const replaceChordOnNextHardwareKeyRef = React.useRef(true);
  const modePressTimerRef = React.useRef<number | null>(null);
  const longPressTriggeredRef = React.useRef(false);

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
  const multiRestCountNumber = Number.parseInt(multiRestCount, 10);
  const hasValidMultiRestCount = Number.isInteger(multiRestCountNumber) && multiRestCountNumber >= 1 && multiRestCountNumber <= 999;

  React.useEffect(() => {
    const nextMode = modeForField(session.target.field);
    setMode(nextMode);
    if (deviceLayout === 'desktop' && session.target.field !== 'chords') setDesktopKeysVisible(true);
  }, [deviceLayout, session.target.field]);

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

  React.useEffect(() => () => {
    if (modePressTimerRef.current !== null) window.clearTimeout(modePressTimerRef.current);
  }, []);

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
    onApplyDraft(setChordAtBeatSlot(session.draftSong, session.target, stored), mergeKey ? { mergeKey } : undefined);
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

  const applyAccidental = (accidental: '' | 'b' | '#') => {
    if (bassMode) {
      const [main, currentBass = rootChoices[0]] = withoutModifiers(displayedChord).split('/');
      const parsedBass = parseChordParts(currentBass, session.inputMode);
      const root = parsedBass.root || rootChoices[0];
      const bass = session.inputMode === 'letters' ? `${root}${accidental}` : `${accidental}${root}`;
      applyDisplayedChord(`${main || rootChoices[0]}/${bass}${trailingModifiers(displayedChord)}`);
      return;
    }
    applyDisplayedChord(buildChord({
      ...chordParts,
      root: chordParts.root || rootChoices[0],
      accidental,
      mode: session.inputMode
    }));
  };

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
    if (!result.error) onApplyDraft(result.song, { mergeKey: `bar-text:${bar.id}` });
  };

  const applyMultiMeasureRest = () => {
    const result = setMultiMeasureRestAtBar(session.draftSong, session.target, multiRestCountNumber);
    setMultiRestActionError(result.error);
    if (!result.error) onApplyDraft(result.song);
  };

  const updateFields = (patch: Parameters<typeof updateEditableBarFields>[2], mergeKey?: string) => {
    onApplyDraft(
      updateEditableBarFields(session.draftSong, session.target, patch),
      mergeKey ? { mergeKey } : undefined
    );
  };

  const selectMode = (nextMode: KeyboardMode) => {
    setMode(nextMode);
    setModeMenuOpen(false);
    setCollapsed(false);
  };

  const cycleMode = () => {
    const index = KEYBOARD_MODES.indexOf(mode);
    selectMode(KEYBOARD_MODES[(index + 1) % KEYBOARD_MODES.length]);
  };

  const clearModePressTimer = () => {
    if (modePressTimerRef.current !== null) {
      window.clearTimeout(modePressTimerRef.current);
      modePressTimerRef.current = null;
    }
  };

  const handleModePointerDown = () => {
    clearModePressTimer();
    longPressTriggeredRef.current = false;
    modePressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setModeMenuOpen(true);
      modePressTimerRef.current = null;
    }, 350);
  };

  const handleModeClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    cycleMode();
  };

  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const keyboardOffset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
  const isDocked = deviceLayout !== 'desktop';
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
          left: viewportLeft + viewportWidth / 2,
          transform: 'translateX(-50%)',
          bottom: keyboardOffset,
          width: 'min(820px, 100vw)',
          height: collapsed ? 'auto' : 'min(40dvh, 420px)'
        }
      : (() => {
          const width = Math.min(520, viewportWidth - 24);
          const estimatedHeight = desktopKeysVisible ? Math.min(430, viewportHeight - 24) : 64;
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
            height: desktopKeysVisible ? estimatedHeight : 'auto',
            maxHeight: viewportHeight - 24
          };
        })();

  const buttonClass = 'inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 active:bg-indigo-100 disabled:opacity-40';
  const activeButtonClass = '!border-indigo-500 !bg-indigo-600 !text-white hover:!bg-indigo-600';
  const fieldClass = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

  const modeMenu = modeMenuOpen && (
    <div
      role="menu"
      aria-label={language === 'zh' ? '選擇鍵盤模式' : 'Choose keyboard mode'}
      className="absolute bottom-full left-0 z-20 mb-2 grid min-w-36 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
    >
      {KEYBOARD_MODES.map((value) => (
        <button
          key={value}
          type="button"
          role="menuitem"
          className={`min-h-9 rounded-lg px-3 text-left text-xs font-black ${mode === value ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          onClick={() => selectMode(value)}
        >
          {getModeLabel(value, language)}
        </button>
      ))}
    </div>
  );

  if (!bar || !section) {
    const fallbackStyle: React.CSSProperties = isDocked
      ? {
          position: 'fixed',
          left: deviceLayout === 'phone' ? 0 : '50%',
          right: deviceLayout === 'phone' ? 0 : undefined,
          bottom: 0,
          width: deviceLayout === 'tablet' ? 'min(820px, 100vw)' : undefined,
          transform: deviceLayout === 'tablet' ? 'translateX(-50%)' : undefined
        }
      : { position: 'fixed', left: '50%', top: '50%', width: 'min(520px, calc(100vw - 24px))', transform: 'translate(-50%, -50%)' };
    const isDeleted = session.targetStatus === 'deleted';
    return (
      <section
        ref={panelRef}
        data-preview-bar-editor
        role="dialog"
        aria-label={language === 'zh' ? '預覽快捷編輯' : 'Preview quick editor'}
        className="z-[5000] rounded-t-2xl border border-slate-200 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
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
          <button type="button" className={buttonClass} disabled={session.past.length === 0} onClick={onUndo} aria-label="Undo"><Undo2 size={15} /></button>
          <button type="button" className={`${buttonClass} border-rose-200 text-rose-700`} onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
          <button type="button" className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white`} onClick={onDone} aria-label={language === 'zh' ? '完成' : 'Done'}><Check size={16} /><span className="ml-1">{language === 'zh' ? '完成' : 'Done'}</span></button>
        </div>
      </section>
    );
  }

  const keyboardContent = (
    <div data-keyboard-mode={mode} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${mode === 'symbols' ? 'gap-1 p-1.5' : 'gap-1.5 p-2'}`}>
      {mode === 'common' && (
        <>
          <div className="grid grid-cols-7 gap-1">
            {rootChoices.map((root) => <button key={root} type="button" className={`${buttonClass} px-0 text-sm ${chordParts.root === root && !bassMode ? activeButtonClass : ''}`} onClick={() => applyRoot(root)}>{root}</button>)}
          </div>
          <div className="grid grid-cols-5 gap-1">
            <button type="button" className={`${buttonClass} ${chordParts.accidental === 'b' ? activeButtonClass : ''}`} onClick={() => applyAccidental('b')}>♭</button>
            <button type="button" className={`${buttonClass} ${chordParts.accidental === '' ? activeButtonClass : ''}`} onClick={() => applyAccidental('')}>♮</button>
            <button type="button" className={`${buttonClass} ${chordParts.accidental === '#' ? activeButtonClass : ''}`} onClick={() => applyAccidental('#')}>♯</button>
            <button type="button" className={`${buttonClass} ${bassMode ? activeButtonClass : ''}`} onClick={() => setBassMode((value) => !value)}>{bassMode ? (language === 'zh' ? '選 Bass' : 'Pick bass') : '/ Bass'}</button>
            <button
              type="button"
              className={buttonClass}
              aria-label={session.inputMode === 'letters' ? (language === 'zh' ? '切換為 Nashville' : 'Switch to Nashville') : (language === 'zh' ? '切換為字母和弦' : 'Switch to letter chords')}
              onClick={() => onInputModeChange(session.inputMode === 'letters' ? 'nashville' : 'letters')}
            >
              {session.inputMode === 'letters' ? '123' : 'ABC'}
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 gap-1">
            {COMMON_QUALITIES.map((quality) => <button key={quality || 'major'} type="button" className={`${buttonClass} min-h-0 px-0.5 ${chordParts.quality === quality ? activeButtonClass : ''}`} onClick={() => applyQuality(quality)}>{quality || 'Major'}</button>)}
          </div>
        </>
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

          <div className="grid grid-cols-5 gap-1">
            <input className="min-h-7 min-w-0 rounded-lg border border-slate-200 bg-white px-1 text-center text-[10px] font-bold outline-none focus:border-indigo-400" value={ENDINGS.includes(bar.ending || '') ? '' : bar.ending || ''} onChange={(event) => updateFields({ ending: event.target.value || undefined }, `ending:${bar.id}`)} placeholder="⌜…" aria-label={language === 'zh' ? '自訂 Ending' : 'Custom ending'} />
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base`} onClick={() => onStructure('insert-before')} aria-label={language === 'zh' ? '前方插入小節' : 'Insert bar before'}>+│</button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0 text-base`} onClick={() => onStructure('insert-after')} aria-label={language === 'zh' ? '後方插入小節' : 'Insert bar after'}>│+</button>
            <button type="button" className={`${buttonClass} !min-h-7 px-0`} onClick={() => onStructure('duplicate')} aria-label={language === 'zh' ? '複製小節' : 'Duplicate bar'}><Copy size={15} /></button>
            <button type="button" className={`${buttonClass} !min-h-7 border-rose-200 px-0 text-rose-700`} onClick={() => onStructure('delete')} aria-label={language === 'zh' ? '刪除小節' : 'Delete bar'}><Trash2 size={15} /></button>
          </div>

          {(multiRestPlacementError || multiRestActionError) && (
            <p role="status" className="shrink-0 truncate text-[9px] font-bold text-amber-700">{multiRestActionError || multiRestPlacementError}</p>
          )}
        </div>
      )}

      {mode === 'text' && (
        <>
          <div className="grid grid-cols-4 gap-1">
            {([
              ['label', language === 'zh' ? '標籤' : 'Label'],
              ['annotation', language === 'zh' ? '上方註記' : 'Annotation'],
              ['leftText', language === 'zh' ? '左側文字' : 'Left text'],
              ['rightText', language === 'zh' ? '右側文字' : 'Right text']
            ] as const).map(([field, label]) => <button key={field} type="button" className={`${buttonClass} ${activeTextField === field ? activeButtonClass : ''}`} onClick={() => setActiveTextField(field)}>{label}</button>)}
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
            <label className="text-xs font-bold text-slate-600" htmlFor={`preview-text-${activeTextField}`}>
              {activeTextField === 'label'
                ? (language === 'zh' ? '小節標籤' : 'Label')
                : activeTextField === 'annotation'
                  ? (language === 'zh' ? '上方註記' : 'Annotation')
                  : activeTextField === 'leftText'
                    ? (language === 'zh' ? '左側文字' : 'Left text')
                    : (language === 'zh' ? '右側文字' : 'Right text')}
            </label>
            <input id={`preview-text-${activeTextField}`} className={fieldClass} value={bar[activeTextField] || ''} onChange={(event) => updateFields({ [activeTextField]: event.target.value || undefined }, `${activeTextField}:${bar.id}`)} />
          </div>
        </>
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
      className="z-[5000] flex flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-slate-50/98 shadow-[0_24px_70px_rgba(15,23,42,0.28)] backdrop-blur-xl"
      style={{ ...panelStyle, paddingBottom: isDocked ? 'env(safe-area-inset-bottom)' : undefined }}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1.5">
        {deviceLayout === 'desktop' && <button type="button" className={buttonClass} onClick={() => onNavigate('previous')} aria-label="Previous beat"><ChevronLeft size={16} /></button>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-indigo-500">{section.title || (language === 'zh' ? '未命名段落' : 'Untitled section')}</div>
          <div className="truncate text-xs font-black text-slate-900">{displayedChord || (language === 'zh' ? `第 ${session.target.slotIndex + 1} 拍 · 空白` : `Beat ${session.target.slotIndex + 1} · Empty`)}</div>
        </div>
        {deviceLayout === 'desktop' && <button type="button" className={buttonClass} onClick={() => onNavigate('next')} aria-label="Next beat"><ChevronRight size={16} /></button>}
        {deviceLayout === 'desktop' && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => setDesktopKeysVisible((value) => !value)}
            aria-label={desktopKeysVisible ? (language === 'zh' ? '隱藏按鍵' : 'Hide keys') : (language === 'zh' ? '顯示按鍵' : 'Show keys')}
            title={desktopKeysVisible ? (language === 'zh' ? '隱藏按鍵' : 'Hide keys') : (language === 'zh' ? '顯示按鍵' : 'Show keys')}
          >
            <Keyboard size={14} />
          </button>
        )}
        <button type="button" className={buttonClass} disabled={session.past.length === 0} onClick={onUndo} aria-label="Undo"><Undo2 size={14} /></button>
        <button type="button" className={buttonClass} disabled={session.future.length === 0} onClick={onRedo} aria-label="Redo"><Redo2 size={14} /></button>
        <button type="button" className={`${buttonClass} border-rose-200 text-rose-700`} onClick={onCancel} aria-label="Cancel"><X size={15} /></button>
        <button type="button" className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white hover:!bg-indigo-500`} onClick={onDone} aria-label={language === 'zh' ? '完成' : 'Done'}><Check size={15} /><span className={deviceLayout === 'phone' ? 'sr-only' : 'ml-1'}>{language === 'zh' ? '完成' : 'Done'}</span></button>
      </header>

      <input
        ref={chordCaptureRef}
        data-preview-chord-capture
        type="text"
        value={displayedChord}
        onChange={(event) => applyDisplayedChord(event.target.value, `slot-text:${bar.id}:${session.target.slotIndex}`)}
        onFocus={() => {
          if (isDocked) setCollapsed(true);
        }}
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

      {!collapsed && deviceLayout === 'desktop' && desktopKeysVisible && keyboardContent}
      {!collapsed && deviceLayout !== 'desktop' && keyboardContent}

      {deviceLayout === 'desktop' && desktopKeysVisible && (
        <footer className="relative flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-2 py-1.5">
          <div className="relative">
            {modeMenu}
            <button
              type="button"
              className="min-h-8 rounded-lg bg-slate-200 px-3 text-[11px] font-black text-slate-700"
              aria-label={`${language === 'zh' ? '切換鍵盤模式' : 'Switch keyboard mode'}：${getModeLabel(mode, language)}`}
              aria-haspopup="menu"
              aria-expanded={modeMenuOpen}
              onPointerDown={handleModePointerDown}
              onPointerUp={clearModePressTimer}
              onPointerCancel={clearModePressTimer}
              onPointerLeave={clearModePressTimer}
              onContextMenu={(event) => { event.preventDefault(); clearModePressTimer(); setModeMenuOpen(true); }}
              onClick={handleModeClick}
            >
              {getModeLabel(KEYBOARD_MODES[(KEYBOARD_MODES.indexOf(mode) + 1) % KEYBOARD_MODES.length], language)}
            </button>
          </div>
          <span className="text-[10px] font-bold text-slate-400">{language === 'zh' ? '短按切換 · 長按選擇' : 'Tap to switch · hold to choose'}</span>
        </footer>
      )}

      {deviceLayout !== 'desktop' && (
        <footer className="relative flex shrink-0 items-stretch gap-1.5 border-t border-slate-200 bg-white px-2 py-1.5">
          <div className="relative">
            {modeMenu}
            <button
              type="button"
              className="flex h-full min-w-14 items-center justify-center rounded-xl bg-slate-200 px-2 text-[11px] font-black text-slate-700 active:bg-slate-300"
              aria-label={`${language === 'zh' ? '切換鍵盤模式' : 'Switch keyboard mode'}：${getModeLabel(mode, language)}`}
              aria-haspopup="menu"
              aria-expanded={modeMenuOpen}
              onPointerDown={handleModePointerDown}
              onPointerUp={clearModePressTimer}
              onPointerCancel={clearModePressTimer}
              onPointerLeave={clearModePressTimer}
              onContextMenu={(event) => { event.preventDefault(); clearModePressTimer(); setModeMenuOpen(true); }}
              onClick={handleModeClick}
            >
              {getModeLabel(KEYBOARD_MODES[(KEYBOARD_MODES.indexOf(mode) + 1) % KEYBOARD_MODES.length], language)}
            </button>
          </div>
          <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-indigo-50 text-sm font-black text-indigo-700 active:bg-indigo-100" onClick={() => onNavigate('previous')} aria-label="Previous beat"><ChevronLeft size={20} className="mr-1" />{language === 'zh' ? '上一拍' : 'Previous'}</button>
          <div className="flex min-w-14 flex-col items-center justify-center rounded-xl bg-slate-100 px-1 text-center">
            <span className="text-[9px] font-black uppercase text-slate-400">{language === 'zh' ? '拍點' : 'Beat'}</span>
            <span className="text-xs font-black text-slate-800">{session.target.slotIndex + 1}/{beatCount}</span>
          </div>
          <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-indigo-600 text-sm font-black text-white active:bg-indigo-700" onClick={() => onNavigate('next')} aria-label="Next beat">{language === 'zh' ? '下一拍' : 'Next'}<ChevronRight size={20} className="ml-1" /></button>
          <button type="button" className="inline-flex min-w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 active:bg-slate-200" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? (language === 'zh' ? '展開鍵盤' : 'Expand keyboard') : (language === 'zh' ? '收合鍵盤' : 'Collapse keyboard')}>
            {collapsed ? <Plus size={17} /> : <ChevronDown size={17} />}
          </button>
        </footer>
      )}
    </section>
  );
};

export default PreviewBarEditor;
