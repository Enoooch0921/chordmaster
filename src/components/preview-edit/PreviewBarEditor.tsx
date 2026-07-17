import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X
} from 'lucide-react';
import type { AppLanguage, Key, NavigationMarker, Song } from '../../types';
import type { PreviewEditSession } from '../../lib/previewEditSession';
import {
  convertDisplayedChordToStoredChord,
  convertStoredChordToDisplayedChord,
  findSongBar,
  getBeatCount,
  getChordBeatSlots,
  setBarChordText,
  setChordAtBeatSlot,
  updateEditableBarFields
} from '../../lib/songEditing';

type DeviceLayout = 'phone' | 'tablet' | 'desktop';
type EditorPage = 'chord' | 'symbols' | 'text';
type StructureAction = 'insert-before' | 'insert-after' | 'duplicate' | 'delete';

interface PreviewBarEditorProps {
  session: PreviewEditSession;
  language: AppLanguage;
  deviceLayout: DeviceLayout;
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
}

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
  onCancel
}) => {
  const [page, setPage] = React.useState<EditorPage>(session.target.field === 'chords' ? 'chord' : session.target.field);
  const [showMoreQualities, setShowMoreQualities] = React.useState(false);
  const [bassMode, setBassMode] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [barText, setBarText] = React.useState('');
  const [barTextError, setBarTextError] = React.useState<string | null>(null);
  const [multiRestCount, setMultiRestCount] = React.useState('4');
  const [, forceViewportUpdate] = React.useReducer((value) => value + 1, 0);

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
    setPage(session.target.field === 'chords' ? 'chord' : session.target.field);
    setBassMode(false);
  }, [session.target.barId, session.target.field, session.target.slotIndex]);

  React.useEffect(() => {
    setBarText(bar?.chords.filter((token) => token.trim()).join(' ') ?? '');
    setBarTextError(null);
  }, [bar?.id, bar?.chords]);

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

  if (!bar || !section) {
    const fallbackStyle: React.CSSProperties = deviceLayout === 'phone'
      ? { position: 'fixed', left: 0, right: 0, bottom: 0 }
      : deviceLayout === 'tablet'
        ? { position: 'fixed', left: '50%', bottom: 12, width: 'min(820px, calc(100vw - 24px))', transform: 'translateX(-50%)' }
        : { position: 'fixed', left: '50%', top: '50%', width: 'min(560px, calc(100vw - 24px))', transform: 'translate(-50%, -50%)' };
    const fallbackButtonClass = 'inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-40';
    return (
      <section
        data-preview-bar-editor
        role="dialog"
        aria-label={language === 'zh' ? '預覽快捷編輯' : 'Preview quick editor'}
        className="z-[5000] rounded-t-2xl border border-slate-200 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.28)] sm:rounded-2xl"
        style={{ ...fallbackStyle, paddingBottom: deviceLayout === 'phone' ? 'max(12px, env(safe-area-inset-bottom))' : undefined }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-indigo-500">{section.title}</div>
            <div className="truncate text-sm font-black text-slate-900">
              {language === 'zh' ? '小節已刪除，可復原或完成這次編輯' : 'Bar deleted. Undo it or finish this edit.'}
            </div>
          </div>
          <button type="button" className={fallbackButtonClass} disabled={session.past.length === 0} onClick={onUndo} aria-label="Undo"><Undo2 size={15} /></button>
          <button type="button" className={`${fallbackButtonClass} border-rose-200 text-rose-700`} onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
          <button type="button" className={`${fallbackButtonClass} !border-indigo-600 !bg-indigo-600 !text-white`} onClick={onDone} aria-label={language === 'zh' ? '完成' : 'Done'}><Check size={16} /><span className="ml-1">{language === 'zh' ? '完成' : 'Done'}</span></button>
        </div>
      </section>
    );
  }

  function applyDisplayedChord(value: string, mergeKey?: string) {
    const stored = convertDisplayedChordToStoredChord({
      input: value,
      inputMode: session.inputMode,
      storageMode,
      displayedKey,
      storedKey
    });
    onApplyDraft(setChordAtBeatSlot(session.draftSong, session.target, stored), mergeKey ? { mergeKey } : undefined);
  }

  const applyRoot = (root: string) => {
    if (bassMode) {
      const main = withoutModifiers(displayedChord).split('/')[0] || (session.inputMode === 'letters' ? 'C' : '1');
      applyDisplayedChord(`${main}/${root}${trailingModifiers(displayedChord)}`);
      setBassMode(false);
      return;
    }
    const next = buildChord({
      ...chordParts,
      root,
      accidental: '',
      quality: chordParts.root ? chordParts.quality : '',
      mode: session.inputMode
    });
    applyDisplayedChord(next);
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

  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const panelStyle: React.CSSProperties = deviceLayout === 'phone'
    ? {
        position: 'fixed',
        left: viewportLeft,
        bottom: Math.max(0, window.innerHeight - viewportHeight - viewportTop),
        width: viewportWidth,
        maxHeight: '58dvh'
      }
    : deviceLayout === 'tablet'
      ? {
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: Math.max(12, window.innerHeight - viewportHeight - viewportTop + 12),
          width: 'min(820px, calc(100vw - 24px))',
          maxHeight: collapsed ? 82 : 'min(46dvh, 420px)'
        }
      : (() => {
          const width = Math.min(560, viewportWidth - 24);
          const preferredBelow = session.target.anchorRect.bottom + 10;
          const estimatedHeight = 430;
          const top = preferredBelow + estimatedHeight <= viewportTop + viewportHeight - 12
            ? preferredBelow
            : Math.max(viewportTop + 12, session.target.anchorRect.top - estimatedHeight - 10);
          const left = Math.max(viewportLeft + 12, Math.min(session.target.anchorRect.left, viewportLeft + viewportWidth - width - 12));
          return { position: 'fixed', top, left, width, maxHeight: Math.min(460, viewportHeight - 24) };
        })();

  const buttonClass = 'inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 active:bg-indigo-100';
  const activeButtonClass = '!border-indigo-500 !bg-indigo-600 !text-white hover:!bg-indigo-600';
  const fieldClass = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

  return (
    <section
      data-preview-bar-editor
      role="dialog"
      aria-label={language === 'zh' ? '預覽快捷編輯' : 'Preview quick editor'}
      className="z-[5000] flex flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-slate-50/98 shadow-[0_24px_70px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:rounded-2xl"
      style={{ ...panelStyle, paddingBottom: deviceLayout === 'phone' ? 'env(safe-area-inset-bottom)' : undefined }}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button type="button" className={buttonClass} onClick={() => onNavigate('previous')} aria-label="Previous beat"><ChevronLeft size={16} /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-indigo-500">{section.title || (language === 'zh' ? '未命名段落' : 'Untitled section')}</div>
          <div className="truncate text-sm font-black text-slate-900">
            {displayedChord || (language === 'zh' ? `第 ${session.target.slotIndex + 1} 拍 · 空白` : `Beat ${session.target.slotIndex + 1} · Empty`)}
          </div>
        </div>
        <button type="button" className={buttonClass} onClick={() => onNavigate('next')} aria-label="Next beat"><ChevronRight size={16} /></button>
        <button type="button" className={buttonClass} disabled={session.past.length === 0} onClick={onUndo} aria-label="Undo"><Undo2 size={15} /></button>
        <button type="button" className={buttonClass} disabled={session.future.length === 0} onClick={onRedo} aria-label="Redo"><Redo2 size={15} /></button>
        {deviceLayout === 'tablet' && (
          <button type="button" className={buttonClass} onClick={() => setCollapsed((value) => !value)} aria-label="Collapse">
            {collapsed ? <Plus size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
        <button type="button" className={`${buttonClass} border-rose-200 text-rose-700`} onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
        <button type="button" className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white hover:!bg-indigo-500`} onClick={onDone} aria-label={language === 'zh' ? '完成' : 'Done'}><Check size={16} /><span className={deviceLayout === 'phone' ? 'sr-only' : 'ml-1'}>{language === 'zh' ? '完成' : 'Done'}</span></button>
      </header>

      {!collapsed && (
        <>
          <nav className="flex shrink-0 gap-1 border-b border-slate-200 bg-white px-3 py-2">
            {(['chord', 'symbols', 'text'] as EditorPage[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPage(value)}
                className={`min-h-8 flex-1 rounded-lg px-3 text-xs font-black ${page === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {value === 'chord' ? (language === 'zh' ? '和弦' : 'Chord') : value === 'symbols' ? (language === 'zh' ? '符號' : 'Symbols') : (language === 'zh' ? '文字' : 'Text')}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            {page === 'chord' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={displayedChord}
                    onChange={(event) => applyDisplayedChord(event.target.value, `slot-text:${bar.id}:${session.target.slotIndex}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        onNavigate(event.shiftKey ? 'previous' : 'next');
                      }
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`${fieldClass} flex-1`}
                    aria-label={language === 'zh' ? '目前和弦文字' : 'Current chord text'}
                    placeholder={language === 'zh' ? '點這裡使用文字輸入' : 'Tap to type a chord'}
                  />
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                    <button type="button" onClick={() => onInputModeChange('letters')} className={`rounded-md px-2.5 text-xs font-black ${session.inputMode === 'letters' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>ABC</button>
                    <button type="button" onClick={() => onInputModeChange('nashville')} className={`rounded-md px-2.5 text-xs font-black ${session.inputMode === 'nashville' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>123</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {rootChoices.map((root) => <button key={root} type="button" className={`${buttonClass} px-0 text-sm ${chordParts.root === root && !bassMode ? activeButtonClass : ''}`} onClick={() => applyRoot(root)}>{root}</button>)}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <button type="button" className={`${buttonClass} ${chordParts.accidental === 'b' ? activeButtonClass : ''}`} onClick={() => applyAccidental('b')}>♭</button>
                  <button type="button" className={`${buttonClass} ${chordParts.accidental === '' ? activeButtonClass : ''}`} onClick={() => applyAccidental('')}>♮</button>
                  <button type="button" className={`${buttonClass} ${chordParts.accidental === '#' ? activeButtonClass : ''}`} onClick={() => applyAccidental('#')}>♯</button>
                  <button type="button" className={`${buttonClass} ${bassMode ? activeButtonClass : ''}`} onClick={() => setBassMode((value) => !value)}>{bassMode ? (language === 'zh' ? '選 Bass' : 'Pick bass') : '/ Bass'}</button>
                </div>

                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                  {COMMON_QUALITIES.map((quality) => <button key={quality || 'major'} type="button" className={`${buttonClass} px-1 ${chordParts.quality === quality ? activeButtonClass : ''}`} onClick={() => applyQuality(quality)}>{quality || 'Major'}</button>)}
                </div>
                <button type="button" className={`${buttonClass} w-full`} onClick={() => setShowMoreQualities((value) => !value)}>{showMoreQualities ? (language === 'zh' ? '收合進階 Quality' : 'Hide advanced qualities') : (language === 'zh' ? '展開進階 Quality' : 'More qualities')}</button>
                {showMoreQualities && <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">{EXPANDED_QUALITIES.map((quality) => <button key={quality} type="button" className={`${buttonClass} px-1 ${chordParts.quality === quality ? activeButtonClass : ''}`} onClick={() => applyQuality(quality)}>{quality}</button>)}</div>}

                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                  {[['%', '%'], ['N.C.', 'N.C.'], ['0', '¼ Rest'], ['0h', '½ Rest'], ['0w', 'Whole Rest']] .map(([value, label]) => <button key={value} type="button" className={buttonClass} onClick={() => applyDisplayedChord(value)}>{label}</button>)}
                  <button type="button" className={buttonClass} onClick={() => applyDisplayedChord(`|${Math.max(1, Number.parseInt(multiRestCount, 10) || 1)}|`)}>|N|</button>
                  <input value={multiRestCount} onChange={(event) => setMultiRestCount(event.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" className={`${fieldClass} text-center`} aria-label="Multi measure rest count" />
                  <button type="button" className={buttonClass} onClick={() => applyDisplayedChord('/')}>/</button>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {[['<', 'Push'], ['>', 'Pull'], ['^', 'Accent'], ['~', 'Fermata']].map(([value, label]) => <button key={value} type="button" className={`${buttonClass} ${trailingModifiers(displayedChord).includes(value) ? activeButtonClass : ''}`} onClick={() => toggleModifier(value as '<' | '>' | '^' | '~')}>{label}</button>)}
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{language === 'zh' ? `整小節文字（最多 ${beatCount} 個）` : `Whole bar text (max ${beatCount})`}</label>
                  <div className="flex gap-2"><input value={barText} onChange={(event) => setBarText(event.target.value)} onBlur={applyBarText} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyBarText(); } }} className={fieldClass} /><button type="button" className={buttonClass} onClick={applyBarText}>{language === 'zh' ? '套用' : 'Apply'}</button></div>
                  {barTextError && <p role="alert" className="mt-1 text-xs font-bold text-rose-600">{barTextError}</p>}
                </div>
              </div>
            )}

            {page === 'symbols' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" className={`${buttonClass} ${bar.repeatStart ? activeButtonClass : ''}`} onClick={() => updateFields({ repeatStart: !bar.repeatStart })}>|: Repeat Start</button>
                  <button type="button" className={`${buttonClass} ${bar.repeatEnd ? activeButtonClass : ''}`} onClick={() => updateFields({ repeatEnd: !bar.repeatEnd })}>:| Repeat End</button>
                  <button type="button" className={`${buttonClass} ${bar.finalBar ? activeButtonClass : ''}`} onClick={() => updateFields({ finalBar: !bar.finalBar })}>|| Final</button>
                </div>
                <div><div className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Ending</div><div className="grid grid-cols-5 gap-1.5">{ENDINGS.map((ending) => <button key={ending} type="button" className={`${buttonClass} ${bar.ending === ending ? activeButtonClass : ''}`} onClick={() => updateFields({ ending: bar.ending === ending ? undefined : ending })}>{ending}</button>)}<input className={fieldClass} value={ENDINGS.includes(bar.ending || '') ? '' : bar.ending || ''} onChange={(event) => updateFields({ ending: event.target.value || undefined }, `ending:${bar.id}`)} placeholder={language === 'zh' ? '自訂' : 'Custom'} /></div></div>
                <div><div className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{language === 'zh' ? '小節拍號' : 'Time signature'}</div><div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">{TIME_SIGNATURES.map((value) => <button key={value} type="button" className={`${buttonClass} ${bar.timeSignature === value ? activeButtonClass : ''}`} onClick={() => updateFields({ timeSignature: value })}>{value}</button>)}<input className={fieldClass} inputMode="numeric" value={TIME_SIGNATURES.includes(bar.timeSignature || '') ? '' : bar.timeSignature || ''} onChange={(event) => updateFields({ timeSignature: event.target.value || undefined }, `time:${bar.id}`)} placeholder={language === 'zh' ? '自訂' : 'Custom'} /></div></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">{language === 'zh' ? '左側 Marker' : 'Left marker'}<select className={`${fieldClass} mt-1`} value={bar.leftMarker || ''} onChange={(event) => updateFields({ leftMarker: (event.target.value || undefined) as NavigationMarker | undefined })}>{LEFT_MARKERS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-600">{language === 'zh' ? '右側 Marker' : 'Right marker'}<select className={`${fieldClass} mt-1`} value={bar.rightMarker || ''} onChange={(event) => updateFields({ rightMarker: (event.target.value || undefined) as NavigationMarker | undefined })}>{RIGHT_MARKERS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}</select></label>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" className={buttonClass} onClick={() => onStructure('insert-before')}><Plus size={14} className="mr-1" />{language === 'zh' ? '前方插入' : 'Insert before'}</button>
                  <button type="button" className={buttonClass} onClick={() => onStructure('insert-after')}><Plus size={14} className="mr-1" />{language === 'zh' ? '後方插入' : 'Insert after'}</button>
                  <button type="button" className={buttonClass} onClick={() => onStructure('duplicate')}><Copy size={14} className="mr-1" />{language === 'zh' ? '複製小節' : 'Duplicate'}</button>
                  <button type="button" className={`${buttonClass} border-rose-200 text-rose-700`} onClick={() => onStructure('delete')}><Trash2 size={14} className="mr-1" />{language === 'zh' ? '刪除小節' : 'Delete'}</button>
                </div>
              </div>
            )}

            {page === 'text' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {([
                  ['label', language === 'zh' ? '小節標籤' : 'Label'],
                  ['annotation', language === 'zh' ? '上方註記' : 'Annotation'],
                  ['leftText', language === 'zh' ? '左側文字' : 'Left text'],
                  ['rightText', language === 'zh' ? '右側文字' : 'Right text']
                ] as const).map(([field, label]) => (
                  <label key={field} className="text-xs font-bold text-slate-600">{label}<input className={`${fieldClass} mt-1`} value={bar[field] || ''} onChange={(event) => updateFields({ [field]: event.target.value || undefined }, `${field}:${bar.id}`)} /></label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default PreviewBarEditor;
