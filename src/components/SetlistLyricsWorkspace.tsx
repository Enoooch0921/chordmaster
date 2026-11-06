import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, Settings2, Pencil, Check, Download, Maximize2, Minimize2 } from 'lucide-react';
import type { AppLanguage, Song } from '../types';
import LyricsBook, { type LyricsBookEntry } from './LyricsBook';
import LyricsSheet from './LyricsSheet';
import type { LyricsBookSettings } from '../utils/lyricsBook';
import { useLyricsReadingPreferences } from '../hooks/useLyricsReadingPreferences';
import { useModalFocus } from '../hooks/useModalFocus';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getLyricsBlocks } from '../utils/lyricsDocument';
import { lyricsSectionLabel, sortLyricsSections } from '../utils/lyricsSections';
import './SetlistLyricsWorkspace.css';

export type SetlistLyricsMode = 'reading' | 'print' | 'edit';
interface Props {
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
  preferenceKey?: string;
}
interface ReadingAnchor { blockId?: string; offset: number; scrollTop: number; songId?: string }
const PAPER_WIDTH = 794;

export default function SetlistLyricsWorkspace({ title, entries, language, selectedId, onSelectSong, mode, onModeChange, printSettings, onPrintSettingsChange, onSongChange, onExport, preferenceKey = 'local' }: Props) {
  const zh = language === 'zh';
  const [readingSettings, setReadingSettings] = useLyricsReadingPreferences(preferenceKey);
  const [focused, setFocused] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string | null>(null);
  const workspaceRef = React.useRef<HTMLElement>(null);
  const backgroundRef = React.useRef<HTMLElement>(null);
  const focusTriggerRef = React.useRef<HTMLButtonElement>(null);
  const sectionNavRef = React.useRef<HTMLElement>(null);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [paperSize, setPaperSize] = React.useState({ scale: 1, height: 1123 });
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const paperAreaRef = React.useRef<HTMLDivElement>(null);
  const paperRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<ReadingAnchor | null>(null);
  const restoreRef = React.useRef(false);
  const scrollReportedIdRef = React.useRef<string | null>(null);
  const heldSelectionRef = React.useRef<string | null>(null);
  const heldSectionRef = React.useRef<string | null>(null);
  const previousRef = React.useRef<{ mode: SetlistLyricsMode; id?: string }>({ mode });
  const frameRef = React.useRef<number | null>(null);
  const optionsId = React.useId();
  const optionsTriggerRef = React.useRef<HTMLButtonElement>(null);
  const currentIndex = Math.max(0, entries.findIndex(entry => entry.id === selectedId));
  const current = entries[currentIndex];
  const currentId = current?.id;
  const isFocused = focused && mode === 'reading';
  useModalFocus(isFocused, workspaceRef);
  useModalScrollLock(isFocused, backgroundRef);
  const activeSettings = mode === 'print' ? printSettings : readingSettings;
  const sections = React.useMemo(() => current ? sortLyricsSections(getLyricsBlocks(current.song.lyricsDoc)).filter(block => {
    const language = readingSettings.language;
    return Boolean(lyricsSectionLabel(block.marker)) && (language === 'chinese' ? block.chinese.trim() : language === 'english' ? block.english.trim() : block.chinese.trim() || block.english.trim());
  }) : [], [current, readingSettings.language]);

  const captureAnchor = (): ReadingAnchor | null => {
    const root = scrollRef.current;
    if (!root || mode !== 'reading') return anchorRef.current;
    const top = root.getBoundingClientRect().top;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-book-block]'));
    const block = blocks.find(node => node.getBoundingClientRect().bottom > top + 8);
    return { blockId: block?.dataset.bookBlock, offset: block ? block.getBoundingClientRect().top - top : 0, scrollTop: root.scrollTop, songId: currentId };
  };
  const rememberPosition = () => { anchorRef.current = captureAnchor(); restoreRef.current = true; };
  const restorePosition = () => {
    const root = scrollRef.current;
    const anchor = anchorRef.current;
    if (!root || !anchor) return;
    const block = Array.from(root.querySelectorAll<HTMLElement>('[data-book-block]')).find(node => node.dataset.bookBlock === anchor.blockId);
    const bounds = block?.getBoundingClientRect();
    root.scrollTop = bounds && bounds.height > 0 ? root.scrollTop + bounds.top - root.getBoundingClientRect().top - anchor.offset : anchor.scrollTop;
  };
  const jumpToSong = (id: string) => {
    const root = scrollRef.current;
    if (!root) return;
    const song = Array.from(root.querySelectorAll<HTMLElement>('[data-setlist-preview-song-id]')).find(node => node.dataset.setlistPreviewSongId === id);
    if (song) root.scrollTop += song.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
  };
  const selectSong = (id: string) => {
    heldSelectionRef.current = id;
    heldSectionRef.current = null;
    scrollReportedIdRef.current = null;
    restoreRef.current = false;
    if (mode === 'reading') jumpToSong(id);
    onSelectSong(id);
  };
  const changeMode = (next: SetlistLyricsMode) => {
    // A queued reading scroll must not overwrite its anchor after the view changes.
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (mode === 'reading') rememberPosition();
    setFocused(false);
    setOptionsOpen(false);
    onModeChange(next);
  };
  const changeSettings = (next: LyricsBookSettings) => {
    if (mode === 'print') onPrintSettingsChange(next);
    else { rememberPosition(); setReadingSettings(next); }
  };
  const changeFocus = (next: boolean) => {
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    rememberPosition();
    setOptionsOpen(false);
    setFocused(next);
    if (!next) requestAnimationFrame(() => focusTriggerRef.current?.focus({ preventScroll: true }));
  };
  const updateActiveSection = (id: string | undefined) => {
    const root = scrollRef.current;
    const song = Array.from(root?.querySelectorAll<HTMLElement>('[data-setlist-preview-song-id]') ?? []).find(node => node.dataset.setlistPreviewSongId === id);
    const nodes = Array.from(song?.querySelectorAll<HTMLElement>('[data-book-block]') ?? []).filter(node => node.querySelector('h3'));
    const line = (root?.getBoundingClientRect().top ?? 0) + 32;
    const active = nodes.find(node => node.dataset.bookBlock === heldSectionRef.current)
      ?? nodes.filter(node => node.getBoundingClientRect().top <= line).at(-1) ?? nodes[0];
    setActiveSection(active?.dataset.bookBlock ?? null);
  };

  React.useLayoutEffect(() => {
    const previous = previousRef.current;
    if (mode === 'reading' && currentId) {
      const ownScroll = scrollReportedIdRef.current === currentId;
      const externalSelection = previous.id !== currentId && !ownScroll;
      if (externalSelection || (previous.mode !== 'reading' && anchorRef.current?.songId !== currentId)) {
        heldSelectionRef.current = currentId;
        jumpToSong(currentId);
      } else if (restoreRef.current || previous.mode !== 'reading') restorePosition();
      restoreRef.current = false;
      scrollReportedIdRef.current = null;
      updateActiveSection(currentId);
      anchorRef.current = captureAnchor();
    } else if (previous.mode !== mode && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    previousRef.current = { mode, id: currentId };
  }, [mode, currentId, readingSettings, optionsOpen, entries, isFocused]);

  React.useLayoutEffect(() => {
    const nav = sectionNavRef.current;
    const button = Array.from(nav?.querySelectorAll<HTMLElement>('[data-section-key]') ?? []).find(node => node.dataset.sectionKey === activeSection);
    if (!nav || !button) return;
    const bounds = nav.getBoundingClientRect(), target = button.getBoundingClientRect();
    if (target.left < bounds.left) nav.scrollLeft += target.left - bounds.left - 4;
    else if (target.right > bounds.right) nav.scrollLeft += target.right - bounds.right + 4;
  }, [activeSection, isFocused]);

  React.useLayoutEffect(() => {
    const root = scrollRef.current;
    if (mode !== 'reading' || !root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      restorePosition();
      updateActiveSection(currentId);
    });
    observer.observe(root);
    const reader = root.querySelector('.slw-reader');
    if (reader) observer.observe(reader);
    return () => observer.disconnect();
  }, [mode, isFocused, currentId]);

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

  React.useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, [mode, currentId, isFocused]);
  const trackReading = () => {
    if (mode !== 'reading' || frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      anchorRef.current = captureAnchor();
      const root = scrollRef.current;
      if (!root) return;
      const viewport = root.getBoundingClientRect();
      let winner = currentId;
      let largest = 0;
      for (const node of root.querySelectorAll<HTMLElement>('[data-setlist-preview-song-id]')) {
        const bounds = node.getBoundingClientRect();
        const visible = Math.max(0, Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top));
        if (visible > largest || (visible === largest && node.dataset.setlistPreviewSongId === currentId)) {
          largest = visible;
          winner = node.dataset.setlistPreviewSongId;
        }
      }
      if (heldSelectionRef.current) winner = heldSelectionRef.current;
      updateActiveSection(winner);
      if (largest > 0 && winner && winner !== currentId) {
        scrollReportedIdRef.current = winner;
        if (anchorRef.current) anchorRef.current.songId = winner;
        onSelectSong(winner);
      }
    });
  };
  const releaseSelection = () => { heldSelectionRef.current = null; heldSectionRef.current = null; };
  const jumpToSection = (blockId: string) => {
    const root = scrollRef.current;
    if (!root || !currentId) return;
    const node = Array.from(root.querySelectorAll<HTMLElement>('[data-book-block]')).find(node => node.dataset.bookBlock === JSON.stringify([currentId, blockId]));
    if (node) {
      heldSelectionRef.current = currentId;
      heldSectionRef.current = JSON.stringify([currentId, blockId]);
      setActiveSection(heldSectionRef.current);
      root.scrollTop += node.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
      anchorRef.current = captureAnchor();
    }
  };

  const content = <section ref={workspaceRef} className={`setlist-lyrics-workspace${isFocused ? ' slw-focused' : ''}`} role={isFocused ? 'dialog' : undefined} aria-modal={isFocused || undefined}
    aria-label={isFocused ? (zh ? '專注閱讀歌詞' : 'Focused lyrics reading') : (zh ? '歌單歌詞' : 'Setlist lyrics')} data-lyrics-workspace-mode={mode} data-lyrics-focused={isFocused || undefined}
    onKeyDown={event => {
      if (event.key === 'Escape' && isFocused) { event.preventDefault(); event.stopPropagation(); changeFocus(false); }
    }}>
    <header className="slw-toolbar" data-preview-only-control onKeyDown={event => {
      if (event.key === 'Escape' && optionsOpen) {
        event.preventDefault();
        event.stopPropagation();
        if (mode === 'reading') rememberPosition();
        setOptionsOpen(false);
        optionsTriggerRef.current?.focus();
      }
    }}>
      <div className="slw-toolbar-top">
        {mode !== 'reading' && <strong className="slw-title" title={title}>{title || (zh ? '歌單歌詞' : 'Setlist lyrics')}</strong>}
        {isFocused ? <button type="button" className="slw-focus-exit" aria-label={zh ? '離開專注閱讀' : 'Exit focused reading'} onClick={() => changeFocus(false)}><Minimize2 size={20} aria-hidden="true"/><span>{zh ? '離開專注' : 'Exit focus'}</span></button> : mode === 'edit' ? <button type="button" className="slw-done" onClick={() => changeMode('reading')}><Check size={18} aria-hidden="true"/>{zh ? '完成編輯' : 'Done editing'}</button> : <>
          <div className="slw-modes" role="group" aria-label={zh ? '歌詞用途' : 'Lyrics view'}>
            <button type="button" aria-pressed={mode === 'reading'} onClick={() => changeMode('reading')}>{zh ? '閱讀' : 'Read'}</button>
            <button type="button" aria-label={zh ? '列印排版' : 'Print layout'} aria-pressed={mode === 'print'} onClick={() => changeMode('print')}>{zh ? '列印' : 'Print'}</button>
          </div>
          <button ref={optionsTriggerRef} type="button" className="slw-icon" aria-label={zh ? (mode === 'print' ? '列印設定' : '閱讀設定') : (mode === 'print' ? 'Print settings' : 'Reading settings')} aria-expanded={optionsOpen} aria-controls={optionsId} onClick={() => { if (mode === 'reading') rememberPosition(); setOptionsOpen(value => !value); }}><Settings2 size={20} aria-hidden="true"/></button>
          {mode === 'reading' && onSongChange && <button type="button" className="slw-edit" aria-label={zh ? '編輯' : 'Edit'} disabled={!current} onClick={() => changeMode('edit')}><Pencil size={18} aria-hidden="true"/><span>{zh ? '編輯' : 'Edit'}</span></button>}
          {mode === 'reading' && <button ref={focusTriggerRef} type="button" className="slw-focus" disabled={!current} aria-label={zh ? '專注閱讀' : 'Focus reading'} onClick={() => changeFocus(true)}><Maximize2 size={18} aria-hidden="true"/><span>{zh ? '專注閱讀' : 'Focus'}</span></button>}
        </>}
      </div>
      {mode === 'reading' && <div className="slw-reading-tools">
        <nav ref={sectionNavRef} className="slw-sections" aria-label={zh ? '目前歌曲段落' : 'Current song sections'}>{sections.map(block => {
          const key = JSON.stringify([currentId, block.id]);
          return <button key={block.id} type="button" data-section-key={key} aria-current={activeSection === key ? 'location' : undefined} onClick={() => jumpToSection(block.id)}>{lyricsSectionLabel(block.marker)}</button>;
        })}</nav>
        {!isFocused && <div className="slw-font-controls" role="group" aria-label={zh ? '閱讀字級' : 'Reading size'}>
          <button type="button" className="slw-icon" aria-label={zh ? '縮小歌詞' : 'Smaller lyrics'} disabled={readingSettings.fontSize <= 18} onClick={() => changeSettings({ ...readingSettings, fontSize: Math.max(18, readingSettings.fontSize - 2) })}><Minus size={18} aria-hidden="true"/></button>
          <output aria-label={zh ? '目前字級' : 'Current font size'}>{readingSettings.fontSize}</output>
          <button type="button" className="slw-icon" aria-label={zh ? '放大歌詞' : 'Larger lyrics'} disabled={readingSettings.fontSize >= 40} onClick={() => changeSettings({ ...readingSettings, fontSize: Math.min(40, readingSettings.fontSize + 2) })}><Plus size={18} aria-hidden="true"/></button>
        </div>}
      </div>}
      {mode === 'print' && <div className="slw-print-actions">
        <label>{zh ? 'A4 版面' : 'A4 layout'}<select aria-label={zh ? 'A4 版面' : 'A4 layout'} value={printSettings.layout ?? 'readable'} onChange={event => onPrintSettingsChange({ ...printSettings, layout: event.target.value as LyricsBookSettings['layout'] })}><option value="readable">{zh ? '易讀版' : 'Readable'}</option><option value="compact">{zh ? '省紙版' : 'Compact'}</option></select></label>
        {onExport && <button type="button" className="slw-export" disabled={!entries.length} onClick={onExport}><Download size={18} aria-hidden="true"/>{zh ? `匯出 A4 ${printSettings.layout === 'compact' ? '省紙版' : '易讀版'}` : `Export A4 ${printSettings.layout === 'compact' ? 'compact' : 'readable'}`}</button>}
      </div>}
      {optionsOpen && mode !== 'edit' && <div className="slw-options" id={optionsId}>
        <label>{zh ? '字體' : 'Font'}<select aria-label={zh ? '歌詞字體' : 'Lyrics font'} value={activeSettings.font} onChange={event => changeSettings({ ...activeSettings, font: event.target.value as LyricsBookSettings['font'] })}><option value="sans">{zh ? '黑體' : 'Sans serif'}</option><option value="kaiti">{zh ? '楷體' : 'KaiTi'}</option></select></label>
        {mode === 'print' && <label>{zh ? '字級' : 'Size'}<select aria-label={zh ? '列印字級' : 'Print font size'} value={printSettings.fontSize} onChange={event => changeSettings({ ...printSettings, fontSize: Number(event.target.value) })}>{[14, 16, 18, 20, 24].map(size => <option key={size} value={size * 4 / 3}>{size} pt</option>)}</select></label>}
        <label>{zh ? '行距' : 'Spacing'}<select aria-label={zh ? '歌詞行距' : 'Lyrics spacing'} value={activeSettings.lineHeight} onChange={event => changeSettings({ ...activeSettings, lineHeight: Number(event.target.value) })}>{(mode === 'print' ? [1.5, 1.875, 2] : [1.5, 1.7, 2]).map((spacing, index) => <option key={spacing} value={spacing}>{zh ? ['緊密', '標準', '寬鬆'][index] : ['Compact', 'Standard', 'Spacious'][index]}</option>)}</select></label>
        <label>{zh ? '語言' : 'Language'}<select aria-label={zh ? '歌詞語言' : 'Lyrics language'} value={activeSettings.language} onChange={event => changeSettings({ ...activeSettings, language: event.target.value as LyricsBookSettings['language'] })}><option value="chinese">中文</option><option value="english">{zh ? '對照語言' : 'Translation'}</option><option value="bilingual">{zh ? '雙語對照' : 'Bilingual'}</option><option value="mixed">{zh ? '雙語逐行' : 'Alternating lines'}</option></select></label>
      </div>}
    </header>
    <div ref={scrollRef} className={`slw-scroll slw-scroll-${mode}`} tabIndex={0} aria-label={zh ? (mode === 'print' ? 'A4 歌詞預覽' : '歌詞內容') : (mode === 'print' ? 'A4 lyrics preview' : 'Lyrics content')} onScroll={trackReading} onWheel={releaseSelection} onTouchStart={releaseSelection} onPointerDown={releaseSelection} onKeyDown={releaseSelection}>
      {!entries.length ? <div className="slw-empty"><h2>{zh ? '歌單還沒有歌曲' : 'No songs in this setlist'}</h2><p>{zh ? '從歌單加入歌曲後，就能在這裡閱讀歌詞。' : 'Add songs to the setlist to read their lyrics here.'}</p></div> : mode === 'reading' ? <div className="slw-reader" data-print-preview style={{ colorScheme: 'light' }}><LyricsBook title="" entries={entries} language={language} settings={readingSettings} reading hideControls /></div> : mode === 'print' ? <div className="slw-paper-area" ref={paperAreaRef}><div className="slw-paper-size" style={{ width: PAPER_WIDTH * paperSize.scale, height: paperSize.height * paperSize.scale }}><div ref={paperRef} className="slw-paper" data-print-preview style={{ width: PAPER_WIDTH, transform: `scale(${paperSize.scale})`, colorScheme: 'light' }}><LyricsBook title={title} entries={entries} language={language} settings={printSettings} hideControls /></div></div></div> : current && <div className="slw-editor" data-print-preview style={{ colorScheme: 'light' }}><LyricsSheet key={current.id} song={current.song} setlistSongNumber={currentIndex + 1} language={language} reading hideViewToggle onChange={onSongChange ? song => onSongChange(current.id, song.lyricsDoc) : undefined}/></div>}
    </div>
    {mode !== 'print' && <div className="slw-navigation" role="group" aria-label={zh ? '切換歌曲' : 'Song navigation'}>
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
