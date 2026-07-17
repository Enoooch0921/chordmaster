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
import {
  convertDisplayedChordToStoredChord,
  convertStoredChordToDisplayedChord,
  findSongBar,
  getBeatCount,
  getChordBeatSlots,
  normalizeChordTextInput,
  setBarChordText,
  setChordAtBeatSlot,
  updateEditableBarFields
} from '../../lib/songEditing';

type KeyboardMode = 'common' | 'advanced' | 'symbols' | 'text';
type AdvancedCategory = 'qualities' | 'tokens' | 'bar';
type SymbolCategory = 'repeats' | 'markers' | 'time' | 'structure';
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
const LEFT_MARKERS: Array<{ value: NavigationMarker | undefined; label: string }> = [
  { value: undefined, label: '—' },
  { value: 'segno', label: 'Segno' },
  { value: 'coda', label: 'Coda' }
];
const RIGHT_MARKERS: Array<{ value: NavigationMarker | undefined; label: string }> = [
  { value: undefined, label: '—' },
  { value: 'coda', label: 'Coda' },
  { value: 'ds', label: 'D.S.' },
  { value: 'dc', label: 'D.C.' },
  { value: 'fine', label: 'Fine' },
  { value: 'ds-al-coda', label: 'D.S. al Coda' },
  { value: 'ds-al-fine', label: 'D.S. al Fine' }
];

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
  const [advancedCategory, setAdvancedCategory] = React.useState<AdvancedCategory>('qualities');
  const [symbolCategory, setSymbolCategory] = React.useState<SymbolCategory>('repeats');
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
  const [, forceViewportUpdate] = React.useReducer((value) => value + 1, 0);
  const panelRef = React.useRef<HTMLElement>(null);
  const chordInputRef = React.useRef<HTMLInputElement>(null);
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
  }, [bar?.id, bar?.chords]);

  React.useEffect(() => {
    if (deviceLayout !== 'desktop' || session.target.field !== 'chords') return;
    chordInputRef.current?.focus({ preventScroll: true });
  }, [deviceLayout, session.previewIdentity, session.target.barId, session.target.field, session.target.slotIndex]);

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
      const isTyping = element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.isContentEditable;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) onRedo(); else onUndo();
        return;
      }
      if (isTyping || event.altKey || meta) return;
      if (event.key === 'ArrowLeft' || (event.key === 'Enter' && event.shiftKey)) {
        event.preventDefault();
        onNavigate('previous');
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        onNavigate('next');
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        if (displayedChord) applyDisplayedChord(''); else onNavigate('previous');
      } else if (event.key === 'Delete') {
        event.preventDefault();
        applyDisplayedChord('');
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
          const estimatedHeight = desktopKeysVisible ? Math.min(430, viewportHeight - 24) : 150;
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
  const categoryButtonClass = 'min-h-7 rounded-lg px-2 text-[10px] font-black';

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

  const chordInputRow = (
    <div className="flex shrink-0 gap-1.5">
      <input
        ref={chordInputRef}
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
        className={`${fieldClass} min-w-0 flex-1`}
        aria-label={language === 'zh' ? '目前和弦文字' : 'Current chord text'}
        placeholder={language === 'zh' ? '點這裡使用文字輸入' : 'Tap to type a chord'}
      />
      <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5">
        <button type="button" onClick={() => onInputModeChange('letters')} className={`rounded-md px-2 text-xs font-black ${session.inputMode === 'letters' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>ABC</button>
        <button type="button" onClick={() => onInputModeChange('nashville')} className={`rounded-md px-2 text-xs font-black ${session.inputMode === 'nashville' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>123</button>
      </div>
      {deviceLayout === 'desktop' && (
        <button type="button" className={buttonClass} onClick={() => setDesktopKeysVisible((value) => !value)}>
          <Keyboard size={14} className="mr-1" />
          {desktopKeysVisible ? (language === 'zh' ? '隱藏按鍵' : 'Hide keys') : (language === 'zh' ? '顯示按鍵' : 'Show keys')}
        </button>
      )}
    </div>
  );

  const keyboardContent = (
    <div data-keyboard-mode={mode} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2">
      {deviceLayout !== 'desktop' && (mode === 'common' || mode === 'advanced') && chordInputRow}

      {mode === 'common' && (
        <>
          <div className="grid grid-cols-7 gap-1">
            {rootChoices.map((root) => <button key={root} type="button" className={`${buttonClass} px-0 text-sm ${chordParts.root === root && !bassMode ? activeButtonClass : ''}`} onClick={() => applyRoot(root)}>{root}</button>)}
          </div>
          <div className="grid grid-cols-4 gap-1">
            <button type="button" className={`${buttonClass} ${chordParts.accidental === 'b' ? activeButtonClass : ''}`} onClick={() => applyAccidental('b')}>♭</button>
            <button type="button" className={`${buttonClass} ${chordParts.accidental === '' ? activeButtonClass : ''}`} onClick={() => applyAccidental('')}>♮</button>
            <button type="button" className={`${buttonClass} ${chordParts.accidental === '#' ? activeButtonClass : ''}`} onClick={() => applyAccidental('#')}>♯</button>
            <button type="button" className={`${buttonClass} ${bassMode ? activeButtonClass : ''}`} onClick={() => setBassMode((value) => !value)}>{bassMode ? (language === 'zh' ? '選 Bass' : 'Pick bass') : '/ Bass'}</button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 gap-1">
            {COMMON_QUALITIES.map((quality) => <button key={quality || 'major'} type="button" className={`${buttonClass} min-h-0 px-0.5 ${chordParts.quality === quality ? activeButtonClass : ''}`} onClick={() => applyQuality(quality)}>{quality || 'Major'}</button>)}
          </div>
        </>
      )}

      {mode === 'advanced' && (
        <>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200/70 p-0.5">
            {([
              ['qualities', language === 'zh' ? 'Quality' : 'Quality'],
              ['tokens', language === 'zh' ? '特殊' : 'Tokens'],
              ['bar', language === 'zh' ? '整節輸入' : 'Whole bar']
            ] as const).map(([value, label]) => <button key={value} type="button" className={`${categoryButtonClass} ${advancedCategory === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setAdvancedCategory(value)}>{label}</button>)}
          </div>
          {advancedCategory === 'qualities' && (
            <div className="grid min-h-0 flex-1 grid-cols-6 gap-1">
              {EXPANDED_QUALITIES.map((quality) => <button key={quality} type="button" className={`${buttonClass} min-h-0 px-0.5 ${chordParts.quality === quality ? activeButtonClass : ''}`} onClick={() => applyQuality(quality)}>{quality}</button>)}
            </div>
          )}
          {advancedCategory === 'tokens' && (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <div className="grid min-h-0 flex-1 grid-cols-4 gap-1">
                {([['%', '%'], ['N.C.', 'N.C.'], ['0', '¼ Rest'], ['0h', '½ Rest'], ['0w', 'Whole Rest'], ['/', '/']] as const).map(([value, label]) => <button key={value} type="button" className={`${buttonClass} min-h-0`} onClick={() => applyDisplayedChord(value)}>{label}</button>)}
                <button type="button" className={`${buttonClass} min-h-0`} onClick={() => applyDisplayedChord(`|${Math.max(1, Number.parseInt(multiRestCount, 10) || 1)}|`)}>|N|</button>
                <input value={multiRestCount} onChange={(event) => setMultiRestCount(event.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" className={`${fieldClass} h-auto min-h-0 text-center`} aria-label="Multi measure rest count" />
              </div>
              <div className="grid grid-cols-4 gap-1">
                {([['<', 'Push'], ['>', 'Pull'], ['^', 'Accent'], ['~', 'Fermata']] as const).map(([value, label]) => <button key={value} type="button" className={`${buttonClass} ${trailingModifiers(displayedChord).includes(value) ? activeButtonClass : ''}`} onClick={() => toggleModifier(value)}>{label}</button>)}
              </div>
            </div>
          )}
          {advancedCategory === 'bar' && (
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">{language === 'zh' ? `整小節和弦（最多 ${beatCount} 個）` : `Whole bar chords (max ${beatCount})`}</label>
              <div className="flex gap-1.5"><input value={barText} onChange={(event) => setBarText(event.target.value)} onBlur={applyBarText} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyBarText(); } }} className={fieldClass} /><button type="button" className={buttonClass} onClick={applyBarText}>{language === 'zh' ? '套用' : 'Apply'}</button></div>
              {barTextError && <p role="alert" className="text-xs font-bold text-rose-600">{barTextError}</p>}
            </div>
          )}
        </>
      )}

      {mode === 'symbols' && (
        <>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-200/70 p-0.5">
            {([
              ['repeats', language === 'zh' ? '反覆' : 'Repeats'],
              ['markers', language === 'zh' ? '記號' : 'Markers'],
              ['time', language === 'zh' ? '拍號' : 'Time'],
              ['structure', language === 'zh' ? '小節' : 'Bar']
            ] as const).map(([value, label]) => <button key={value} type="button" className={`${categoryButtonClass} ${symbolCategory === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setSymbolCategory(value)}>{label}</button>)}
          </div>
          {symbolCategory === 'repeats' && (
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
              <div className="grid grid-cols-3 gap-1">
                <button type="button" className={`${buttonClass} ${bar.repeatStart ? activeButtonClass : ''}`} onClick={() => updateFields({ repeatStart: !bar.repeatStart })}>|: Repeat Start</button>
                <button type="button" className={`${buttonClass} ${bar.repeatEnd ? activeButtonClass : ''}`} onClick={() => updateFields({ repeatEnd: !bar.repeatEnd })}>:| Repeat End</button>
                <button type="button" className={`${buttonClass} ${bar.finalBar ? activeButtonClass : ''}`} onClick={() => updateFields({ finalBar: !bar.finalBar })}>|| Final</button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {ENDINGS.map((ending) => <button key={ending} type="button" className={`${buttonClass} ${bar.ending === ending ? activeButtonClass : ''}`} onClick={() => updateFields({ ending: bar.ending === ending ? undefined : ending })}>{ending}</button>)}
                <input className={fieldClass} value={ENDINGS.includes(bar.ending || '') ? '' : bar.ending || ''} onChange={(event) => updateFields({ ending: event.target.value || undefined }, `ending:${bar.id}`)} placeholder={language === 'zh' ? '自訂' : 'Custom'} aria-label={language === 'zh' ? '自訂 Ending' : 'Custom ending'} />
              </div>
            </div>
          )}
          {symbolCategory === 'markers' && (
            <div className="grid min-h-0 flex-1 grid-cols-2 content-center gap-2">
              <label className="text-xs font-bold text-slate-600">{language === 'zh' ? '左側 Marker' : 'Left marker'}<select className={`${fieldClass} mt-1`} value={bar.leftMarker || ''} onChange={(event) => updateFields({ leftMarker: (event.target.value || undefined) as NavigationMarker | undefined })}>{LEFT_MARKERS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">{language === 'zh' ? '右側 Marker' : 'Right marker'}<select className={`${fieldClass} mt-1`} value={bar.rightMarker || ''} onChange={(event) => updateFields({ rightMarker: (event.target.value || undefined) as NavigationMarker | undefined })}>{RIGHT_MARKERS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}</select></label>
            </div>
          )}
          {symbolCategory === 'time' && (
            <div className="grid min-h-0 flex-1 grid-cols-4 gap-1">
              {TIME_SIGNATURES.map((value) => <button key={value} type="button" className={`${buttonClass} min-h-0 ${bar.timeSignature === value ? activeButtonClass : ''}`} onClick={() => updateFields({ timeSignature: bar.timeSignature === value ? undefined : value })}>{value}</button>)}
              <input className={`${fieldClass} h-auto min-h-0`} inputMode="numeric" value={TIME_SIGNATURES.includes(bar.timeSignature || '') ? '' : bar.timeSignature || ''} onChange={(event) => updateFields({ timeSignature: event.target.value || undefined }, `time:${bar.id}`)} placeholder={language === 'zh' ? '自訂' : 'Custom'} aria-label={language === 'zh' ? '自訂拍號' : 'Custom time signature'} />
            </div>
          )}
          {symbolCategory === 'structure' && (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
              <button type="button" className={`${buttonClass} min-h-0`} onClick={() => onStructure('insert-before')}><Plus size={14} className="mr-1" />{language === 'zh' ? '前方插入' : 'Insert before'}</button>
              <button type="button" className={`${buttonClass} min-h-0`} onClick={() => onStructure('insert-after')}><Plus size={14} className="mr-1" />{language === 'zh' ? '後方插入' : 'Insert after'}</button>
              <button type="button" className={`${buttonClass} min-h-0`} onClick={() => onStructure('duplicate')}><Copy size={14} className="mr-1" />{language === 'zh' ? '複製小節' : 'Duplicate'}</button>
              <button type="button" className={`${buttonClass} min-h-0 border-rose-200 text-rose-700`} onClick={() => onStructure('delete')}><Trash2 size={14} className="mr-1" />{language === 'zh' ? '刪除小節' : 'Delete'}</button>
            </div>
          )}
        </>
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
        <button type="button" className={buttonClass} disabled={session.past.length === 0} onClick={onUndo} aria-label="Undo"><Undo2 size={14} /></button>
        <button type="button" className={buttonClass} disabled={session.future.length === 0} onClick={onRedo} aria-label="Redo"><Redo2 size={14} /></button>
        <button type="button" className={`${buttonClass} border-rose-200 text-rose-700`} onClick={onCancel} aria-label="Cancel"><X size={15} /></button>
        <button type="button" className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white hover:!bg-indigo-500`} onClick={onDone} aria-label={language === 'zh' ? '完成' : 'Done'}><Check size={15} /><span className={deviceLayout === 'phone' ? 'sr-only' : 'ml-1'}>{language === 'zh' ? '完成' : 'Done'}</span></button>
      </header>

      {!collapsed && deviceLayout === 'desktop' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 p-2">{chordInputRow}</div>
          {desktopKeysVisible && keyboardContent}
        </div>
      )}
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
