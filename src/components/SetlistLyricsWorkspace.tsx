import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, Settings2, Pencil, PenLine, Check, Download, Maximize2, Minimize2, Printer } from 'lucide-react';
import type { AppLanguage, Song } from '../types';
import LyricsBook, { type LyricsBookEntry } from './LyricsBook';
import LyricsSheet from './LyricsSheet';
import type { LyricsBookSettings } from '../utils/lyricsBook';
import { useLyricsReadingPreferences } from '../hooks/useLyricsReadingPreferences';
import { useModalFocus } from '../hooks/useModalFocus';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getLyricsBlocks, mainLyricsLabel } from '../utils/lyricsDocument';
import type { PersonalNotesOptions } from './PersonalNotes';
import AdaptiveLyricsReader from './AdaptiveLyricsReader';
import SongTitle from './SongTitle';
import type { ReadingAnchor } from '../utils/lyricsReading';
import MeasuredSlidingSelection from './ui/MeasuredSlidingSelection';
import { AnimatedDisclosure } from './ui/InteractionMotion';
import './SetlistLyricsWorkspace.css';

export type SetlistLyricsMode = 'reading' | 'print' | 'edit';
interface Props extends PersonalNotesOptions {
  title: string;
  entries: LyricsBookEntry[];
  language: AppLanguage;
  selectedId: string | null;
  onSelectSong: (id: string) => void;
  mode: SetlistLyricsMode;
  onModeChange: (mode: SetlistLyricsMode) => void;
  printSettings: LyricsBookSettings;
  onPrintSettingsChange: (settings: LyricsBookSettings) => void;
  onSongChange?: (id: string, lyrics: Song['lyricsDoc']) => void;
  onExport?: () => void;
  phoneHandwritingButton?: boolean;
  preferenceKey?: string;
  readingPositions?: Map<string, ReadingAnchor | 'last'>;
}
const PAPER_WIDTH = 794;

export default function SetlistLyricsWorkspace({ title, entries, language, selectedId, onSelectSong, mode, onModeChange, printSettings, onPrintSettingsChange, onSongChange, onExport, preferenceKey = 'local', readingPositions, phoneHandwritingButton, ...notes }: Props) {
  const zh = language === 'zh';
  const [readingSettings, setReadingSettings] = useLyricsReadingPreferences(preferenceKey);
  const [focused, setFocused] = React.useState(false);
  const workspaceRef = React.useRef<HTMLElement>(null);
  const backgroundRef = React.useRef<HTMLElement>(null);
  const focusTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [paperSize, setPaperSize] = React.useState({ scale: 1, height: 1123 });
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const paperAreaRef = React.useRef<HTMLDivElement>(null);
  const paperRef = React.useRef<HTMLDivElement>(null);
  const localAnchors = React.useRef(new Map<string, ReadingAnchor | 'last'>());
  const anchors = readingPositions ?? localAnchors.current;
  const optionsId = React.useId();
  const optionsTriggerRef = React.useRef<HTMLButtonElement>(null);
  const currentIndex = Math.max(0, entries.findIndex(entry => entry.id === selectedId));
  const current = entries[currentIndex];
  const currentId = current?.id;
  const isFocused = focused && mode === 'reading';
  useModalFocus(isFocused, workspaceRef);
  useModalScrollLock(isFocused, backgroundRef);
  React.useLayoutEffect(() => {
    if (isFocused) workspaceRef.current?.querySelector<HTMLElement>('.alr-canvas')?.focus({ preventScroll: true });
  }, [isFocused]);
  const activeSettings = mode === 'print' ? printSettings : readingSettings;
  const selectSong = (id: string, last = false) => {
    anchors.delete(id);
    if (last) anchors.set(id, 'last');
    onSelectSong(id);
  };
  const changeMode = (next: SetlistLyricsMode) => {
    setFocused(false); setOptionsOpen(false); onModeChange(next);
  };
  const changeSettings = (next: LyricsBookSettings) => {
    if (mode === 'print') onPrintSettingsChange(next);
    else setReadingSettings(next);
  };
  const changeFocus = (next: boolean) => {
    setOptionsOpen(false); setFocused(next);
    if (!next) requestAnimationFrame(() => focusTriggerRef.current?.focus({ preventScroll: true }));
  };

  React.useLayoutEffect(() => {
    if (mode !== 'print' || !paperAreaRef.current || !paperRef.current) return;
    const measure = () => {
      const width = paperAreaRef.current?.clientWidth ?? PAPER_WIDTH;
      const height = paperRef.current?.offsetHeight ?? 1123;
      const scale = Math.min(1, Math.max(1, width) / PAPER_WIDTH);
      setPaperSize(previous => previous.scale === scale && previous.height === height ? previous : { scale, height });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(paperAreaRef.current);
    observer?.observe(paperRef.current);
    return () => observer?.disconnect();
  }, [mode, entries.length]);

  const content = <section ref={workspaceRef} className={`setlist-lyrics-workspace${isFocused ? ' slw-focused' : ''}`} role={isFocused ? 'dialog' : undefined} aria-modal={isFocused || undefined}
    aria-label={isFocused ? (zh ? '專注閱讀歌詞' : 'Focused lyrics reading') : (zh ? '歌單歌詞' : 'Setlist lyrics')} data-lyrics-workspace-mode={mode} data-lyrics-focused={isFocused || undefined}
    onKeyDown={event => {
      if (event.key === 'Escape' && isFocused) { event.preventDefault(); event.stopPropagation(); changeFocus(false); }
    }}>
    <header className="slw-toolbar" data-preview-only-control onKeyDown={event => {
      if (event.key === 'Escape' && optionsOpen) {
        event.preventDefault();
        event.stopPropagation();
        setOptionsOpen(false);
        optionsTriggerRef.current?.focus();
      }
    }}>
      <div className="slw-toolbar-top">
        {mode === 'reading' && current && <div className="slw-reading-title">{entries.length > 1
          ? <select aria-label={zh ? '目前歌曲' : 'Current song'} value={current.id} onChange={event => selectSong(event.target.value)}>{entries.map((entry, index) => <option key={entry.id} value={entry.id}>{index + 1}. {entry.song.title}</option>)}</select>
          : <h1><SongTitle title={current.song.title}/></h1>}</div>}
        {mode !== 'reading' && <strong className="slw-title" title={title}>{title || (zh ? '歌單歌詞' : 'Setlist lyrics')}</strong>}
        {mode === 'reading' && (isFocused || phoneHandwritingButton) && notes.noteOwner && current && <button type="button" className="slw-icon" aria-label={zh ? '手寫筆記' : 'Handwriting'}
          title={zh ? '手寫筆記' : 'Handwriting'} aria-pressed={notes.notesOpen ?? false} onClick={() => notes.onNotesOpenChange?.(!notes.notesOpen)}><PenLine size={20}/></button>}
        {isFocused ? <button type="button" className="slw-focus-exit" aria-label={zh ? '離開專注閱讀' : 'Exit focused reading'} onClick={() => changeFocus(false)}><Minimize2 size={20} aria-hidden="true"/><span>{zh ? '離開專注' : 'Exit focus'}</span></button> : mode === 'edit' ? <button type="button" className="slw-done" onClick={() => changeMode('reading')}><Check size={18} aria-hidden="true"/>{zh ? '完成編輯' : 'Done editing'}</button> : <>
          {mode === 'reading' ? <button type="button" className="slw-print-mode" aria-label={zh ? '列印排版' : 'Print layout'} title={zh ? '列印排版' : 'Print layout'} onClick={() => changeMode('print')}><Printer size={18} aria-hidden="true"/><span>{zh ? '列印' : 'Print'}</span></button> : <div className="slw-modes ui-segmented-control" role="group" aria-label={zh ? '歌詞用途' : 'Lyrics view'}>
            <MeasuredSlidingSelection value={mode} layoutKey={language} />
            <button type="button" aria-pressed={false} onClick={() => changeMode('reading')}>{zh ? '閱讀' : 'Read'}</button>
            <button type="button" aria-label={zh ? '列印排版' : 'Print layout'} aria-pressed={mode === 'print'} onClick={() => changeMode('print')}>{zh ? '列印' : 'Print'}</button>
          </div>}
          <button ref={optionsTriggerRef} type="button" className="slw-icon" aria-label={zh ? (mode === 'print' ? '列印設定' : '閱讀設定') : (mode === 'print' ? 'Print settings' : 'Reading settings')} aria-expanded={optionsOpen} aria-controls={optionsId} onClick={() => { setOptionsOpen(value => !value); }}><Settings2 size={20} aria-hidden="true"/></button>
          {mode === 'reading' && onSongChange && <button type="button" className="slw-edit" aria-label={zh ? '編輯' : 'Edit'} disabled={!current} onClick={() => changeMode('edit')}><Pencil size={18} aria-hidden="true"/><span>{zh ? '編輯' : 'Edit'}</span></button>}
          {mode === 'reading' && <button ref={focusTriggerRef} type="button" className="slw-focus" disabled={!current} aria-label={zh ? '專注閱讀' : 'Focus reading'} onClick={() => changeFocus(true)}><Maximize2 size={18} aria-hidden="true"/><span>{zh ? '專注閱讀' : 'Focus'}</span></button>}
        </>}
      </div>
      {mode === 'print' && <div className="slw-print-actions">
        <label>{zh ? 'A4 版面' : 'A4 layout'}<select aria-label={zh ? 'A4 版面' : 'A4 layout'} value={printSettings.layout ?? 'readable'} onChange={event => onPrintSettingsChange({ ...printSettings, layout: event.target.value as LyricsBookSettings['layout'] })}><option value="readable">{zh ? '易讀版' : 'Readable'}</option><option value="compact">{zh ? '省紙版' : 'Compact'}</option></select></label>
        {onExport && <button type="button" className="slw-export" disabled={!entries.length} onClick={onExport}><Download size={18} aria-hidden="true"/>{zh ? `匯出 A4 ${printSettings.layout === 'compact' ? '省紙版' : '易讀版'}` : `Export A4 ${printSettings.layout === 'compact' ? 'compact' : 'readable'}`}</button>}
      </div>}
      <AnimatedDisclosure open={optionsOpen && mode !== 'edit'}><div className="slw-options" id={optionsId}>
        {mode === 'reading' && <div className="slw-font-controls" role="group" aria-label={zh ? '閱讀字級' : 'Reading size'}>
          <span className="slw-size-label">{zh ? '歌單字級' : 'Setlist size'}</span>
          <button type="button" className="slw-icon" aria-label={zh ? '縮小歌詞' : 'Smaller lyrics'} disabled={readingSettings.fontSize <= 20} onClick={() => changeSettings({ ...readingSettings, fontSize: Math.max(20, readingSettings.fontSize - 2) })}><Minus size={18} aria-hidden="true"/></button>
          <output aria-label={zh ? '目前字級' : 'Current font size'}>{readingSettings.fontSize}</output>
          <button type="button" className="slw-icon" aria-label={zh ? '放大歌詞' : 'Larger lyrics'} disabled={readingSettings.fontSize >= 40} onClick={() => changeSettings({ ...readingSettings, fontSize: Math.min(40, readingSettings.fontSize + 2) })}><Plus size={18} aria-hidden="true"/></button>
        </div>}

        <label>{zh ? '字體' : 'Font'}<select aria-label={zh ? '歌詞字體' : 'Lyrics font'} value={activeSettings.font} onChange={event => changeSettings({ ...activeSettings, font: event.target.value as LyricsBookSettings['font'] })}><option value="sans">{zh ? '黑體' : 'Sans serif'}</option><option value="kaiti">{zh ? '楷體' : 'KaiTi'}</option></select></label>
        {mode === 'print' && <label>{zh ? '字級' : 'Size'}<select aria-label={zh ? '列印字級' : 'Print font size'} value={printSettings.fontSize} onChange={event => changeSettings({ ...printSettings, fontSize: Number(event.target.value) })}>{[14, 16, 18, 20, 24].map(size => <option key={size} value={size * 4 / 3}>{size} pt</option>)}</select></label>}
        <label>{zh ? '行距' : 'Spacing'}<select aria-label={zh ? '歌詞行距' : 'Lyrics spacing'} value={activeSettings.lineHeight} onChange={event => changeSettings({ ...activeSettings, lineHeight: Number(event.target.value) })}>{(mode === 'print' ? [1.5, 1.875, 2] : [1.42, 1.5, 1.7, 2]).map((spacing, index) => <option key={spacing} value={spacing}>{mode === 'print' ? (zh ? ['緊密', '標準', '寬鬆'][index] : ['Compact', 'Standard', 'Spacious'][index]) : (zh ? ['緊密', '標準', '寬鬆', '加寬'][index] : ['Compact', 'Standard', 'Spacious', 'Extra spacious'][index])}</option>)}</select></label>
        <label>{zh ? '語言' : 'Language'}<select aria-label={zh ? '歌詞語言' : 'Lyrics language'} value={activeSettings.language} onChange={event => changeSettings({ ...activeSettings, language: event.target.value as LyricsBookSettings['language'] })}><option value="chinese">{mainLyricsLabel(entries.flatMap(entry => getLyricsBlocks(entry.song.lyricsDoc)), language)}</option><option value="english">{zh ? '對照語言' : 'Translation'}</option><option value="bilingual">{zh ? '雙語對照' : 'Bilingual'}</option><option value="mixed">{zh ? '雙語逐行' : 'Alternating lines'}</option></select></label>
      </div></AnimatedDisclosure>
    </header>
    <div ref={scrollRef} className={`slw-scroll slw-scroll-${mode}`} tabIndex={0} aria-label={zh ? (mode === 'print' ? 'A4 歌詞預覽' : '歌詞內容') : (mode === 'print' ? 'A4 lyrics preview' : 'Lyrics content')}>
      {!entries.length ? <div className="slw-empty"><h2>{zh ? '歌單還沒有歌曲' : 'No songs in this setlist'}</h2><p>{zh ? '從歌單加入歌曲後，就能在這裡閱讀歌詞。' : 'Add songs to the setlist to read their lyrics here.'}</p></div> : mode === 'reading' ? <AdaptiveLyricsReader {...notes} noteSongId={current.sourceSongId ?? current.id} key={current.id} identity={current.id} song={current.song} language={language} settings={readingSettings} hideHeading
        initialAnchor={anchors.get(current.id)} onAnchorChange={anchor => anchors.set(current.id, anchor)}
        onNextSong={currentIndex < entries.length - 1 ? () => selectSong(entries[currentIndex + 1].id) : undefined}
        onPreviousSong={currentIndex > 0 ? () => selectSong(entries[currentIndex - 1].id, true) : undefined}/>
         : mode === 'print' ? <div className="slw-paper-area" ref={paperAreaRef}><div className="slw-paper-size" style={{ width: PAPER_WIDTH * paperSize.scale, height: paperSize.height * paperSize.scale }}><div ref={paperRef} className="slw-paper" data-print-preview style={{ width: PAPER_WIDTH, transform: `scale(${paperSize.scale})`, colorScheme: 'light' }}><LyricsBook title={title} entries={entries} language={language} settings={printSettings} hideControls /></div></div></div> : current && <div className="slw-editor" data-print-preview style={{ colorScheme: 'light' }}><LyricsSheet key={current.id} song={current.song} setlistSongNumber={currentIndex + 1} language={language} reading hideViewToggle onChange={onSongChange ? song => onSongChange(current.id, song.lyricsDoc) : undefined}/></div>}
    </div>
    {mode === 'edit' && <div className="slw-navigation" role="group" aria-label={zh ? '切換歌曲' : 'Song navigation'}>
      <button type="button" className="slw-icon" aria-label={zh ? '上一首' : 'Previous song'} disabled={!current || currentIndex === 0} onClick={() => selectSong(entries[currentIndex - 1].id)}><ChevronLeft size={22} aria-hidden="true"/></button>
      <select aria-label={zh ? '目前歌曲' : 'Current song'} value={currentId ?? ''} disabled={!current} onChange={event => selectSong(event.target.value)}>
        {!current && <option value="">{zh ? '尚無歌曲' : 'No songs'}</option>}
        {entries.map((entry, index) => <option key={entry.id} value={entry.id}>{index + 1}. {entry.song.title}</option>)}
      </select>
      <button type="button" className="slw-icon" aria-label={zh ? '下一首' : 'Next song'} disabled={!current || currentIndex === entries.length - 1} onClick={() => selectSong(entries[currentIndex + 1].id)}><ChevronRight size={22} aria-hidden="true"/></button>
    </div>}
  </section>;
  return isFocused ? createPortal(content, document.body) : content;
}
