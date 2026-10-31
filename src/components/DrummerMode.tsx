import React, { useCallback, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cable, ChevronDown, ChevronLeft, Maximize, Minimize, Minus, Plus, Play, RotateCcw, Settings2, SkipBack, SkipForward, Square, VolumeX, X } from 'lucide-react';
import type { AppLanguage, Song } from '../types';
import ChordSheet from './ChordSheet';
import RecoveryBoundary from './RecoveryBoundary';
import { useMetronome } from '../hooks/useMetronome';
import { usePerformanceFullscreen } from '../hooks/usePerformanceFullscreen';
import { useUiMotion } from '../hooks/useUiMotion';
import { useDrummerMidi } from '../hooks/useDrummerMidi';
import type { MidiConnector } from '../lib/midiInput';
import type { KeyboardAction } from '../lib/drummerMidi';
import DrummerMidiSettings from './DrummerMidiSettings';
import RhythmNotation from './RhythmNotation';
import { BACH_QUARTER_OUTLINE_METRICS, BACH_NOTE_VERTICAL_OUTLINE_METRICS } from '../lib/bachRhythmMetrics';
import { CLICK_SOUNDS, defaultBeatLevels, isPlayableTempo, parseClickMeter, type BeatLevel, type ClickSound, type MetronomeConfig } from '../lib/metronome';
import { DrummerTapTempo } from '../utils/drummerTapTempo';
import { getRhythmEventGlyph, type RhythmBase } from '../utils/rhythmUtils';
import './DrummerMode.css';

export interface DrummerSession {
  instanceId?: string;
  id?: string;
  name: string;
  entries: { id: string; song: Song }[];
  initialId: string;
}
interface Props extends DrummerSession { language: AppLanguage; onClose: (instant?: boolean) => void; midiConnector?: MidiConnector }
type Preferences = Pick<MetronomeConfig, 'sound' | 'volume' | 'accent' | 'regular' | 'subdivisions'>;
type Subdivision = MetronomeConfig['subdivision'];
const PREFERENCE_KEY = 'chordmaster.drummer-preferences.v1';
const defaults: Preferences = { sound: 'ableton-classic', volume: 0.7, accent: 1, regular: 0.75, subdivisions: 0.4 };
function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCE_KEY) || '{}');
    const prefs = { ...defaults };
    if (saved.sound === 'multitracks' || saved.sound === 'drive' || saved.sound === 'ableton-classic') prefs.sound = saved.sound;
    for (const key of ['volume', 'accent', 'regular', 'subdivisions'] as const) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key]) && saved[key] >= 0 && saved[key] <= 1) prefs[key] = saved[key];
    }
    return prefs;
  } catch { return { ...defaults }; }
}

const subdivisionKey = (id: string, meter: string, grouped: boolean) => JSON.stringify([id, meter, grouped]);
function loadSubdivisions(key: string): Record<string, Subdivision> {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => [1, 2, 3, 4].includes(value as number))) as Record<string, Subdivision>;
  } catch { return {}; }
}

const SubdivisionSymbol = React.memo(function SubdivisionSymbol({ division, denominator, grouped }: { division: number; denominator: number; grouped: boolean }) {
  const noteDenominator = grouped ? (division === 3 ? denominator : denominator / 2 * division) : denominator * (division === 3 ? 2 : division);
  const sharedBase = ({ 2: 'h', 4: 'q', 8: 'e', 16: 's' } as const)[noteDenominator];
  if (sharedBase) {
    const token = `${sharedBase}${division === 3 && !grouped ? '3' : grouped && division !== 3 ? '.' : ''}`;
    return <span className="drummer-subdivision-symbol" data-division={division} aria-hidden="true"><RhythmNotation notation={Array(division).fill(token).join(' ')} timeSignature={`${grouped ? 3 : 1}/${denominator}`} compact scale={1.8} color="currentColor"/></span>;
  }
  // The score renderer currently stops at sixteenths. Keep rarer 32nd/64th
  // subdivisions explicit, using the same font outline anchors.
  const beams = Math.max(0, Math.min(4, Math.log2(noteDenominator / 4)));
  const base: RhythmBase = noteDenominator === 2 ? 'h' : division === 1 ? ({ 8: 'e', 16: 's' } as const)[noteDenominator] ?? 'q' : 'q';
  const glyph = getRhythmEventGlyph({ base, isRest: false, dotted: false, isHidden: false, isSlash: false });
  const positions = Array.from({ length: division }, (_, index) => (64 - (10 + (division - 1) * 14)) / 2 + index * 14);
  // Use the score's formal Bach glyphs; beams meet their measured stem center.
  const stemOffset = (BACH_QUARTER_OUTLINE_METRICS.stemLeft + BACH_QUARTER_OUTLINE_METRICS.stemRight) / 2 / BACH_QUARTER_OUTLINE_METRICS.unitsPerEm * 32;
  const beamTop = 35 - BACH_NOTE_VERTICAL_OUTLINE_METRICS.q.glyphTop / 1000 * 32;
  return <svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true">
    {positions.map(x => <g key={x}>
      <text x={x} y="35" fontFamily="Bach, NotoMusic, serif" fontSize="32" fontWeight="400" fill="currentColor">{glyph}</text>
      {grouped && division !== 3 && <circle cx={x + 12} cy="31" r="1.2" fill="currentColor"/>}
    </g>)}
    {division > 1 && Array.from({ length: beams }, (_, index) => <path key={index} d={`M ${positions[0] + stemOffset} ${beamTop + index * 3.2} H ${positions.at(-1)! + stemOffset}`} stroke="currentColor" strokeWidth="2.2"/>)}
    {division === 3 && !grouped && <text x="32" y="6" fill="currentColor" textAnchor="middle" fontSize="8">3</text>}
  </svg>;
});

type DrummerScoreControls = { turnPage: (delta: number) => void };

// Beat updates must not re-render or re-measure a multi-page chart.
const DrummerScore = React.memo(function DrummerScore({ song, language, live, controlsRef }: { song: Song; language: AppLanguage; live: boolean; controlsRef: React.Ref<DrummerScoreControls> }) {
  const viewport = useRef<HTMLDivElement>(null), paper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(794), [height, setHeight] = useState(1123), [zoom, setZoom] = useState(1);
  const [viewportHeight, setViewportHeight] = useState(1123);
  const [page, setPage] = useState(0), [pageCount, setPageCount] = useState(1);
  const swipe = useRef<{x: number; y: number} | null>(null);
  useLayoutEffect(() => { setPage(0); }, [song, live]);
  useLayoutEffect(() => {
    const pages = Array.from(paper.current?.querySelectorAll<HTMLElement>('[data-print-page]') ?? []);
    setPageCount(Math.max(1, pages.length));
    pages.forEach((node, index) => {
      const hidden = live && index !== page;
      node.dataset.drummerPageActive = String(!hidden);
      if (hidden) node.setAttribute('aria-hidden', 'true'); else node.removeAttribute('aria-hidden');
    });
    if (live && viewport.current) viewport.current.scrollTop = 0;
  }, [song, live, page]);
  const turnPage = useCallback((delta: number) => {
    if (live) { setPage(value => Math.max(0, Math.min(pageCount - 1, value + delta))); return; }
    const node = viewport.current;
    const pages = Array.from(paper.current?.querySelectorAll<HTMLElement>('[data-print-page]') ?? []);
    if (!node || !pages.length) return;
    const top = node.getBoundingClientRect().top;
    const offsets = pages.map(item => item.getBoundingClientRect().top - top + node.scrollTop);
    const current = offsets.reduce((index, offset, candidate) => offset <= node.scrollTop + 24 ? candidate : index, 0);
    node.scrollTop = offsets[Math.max(0, Math.min(pages.length - 1, current + delta))];
  }, [live, pageCount]);
  useImperativeHandle(controlsRef, () => ({ turnPage }), [turnPage]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || !node.clientWidth) return;
    const style = getComputedStyle(node);
    setWidth(node.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0'));
    setViewportHeight(node.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0'));
  }, [live, pageCount]);
  useEffect(() => {
    if (live) setZoom(1);
  }, [live]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === viewport.current && entry.contentRect.width > 0) {
          setWidth(entry.contentRect.width);
          setViewportHeight(entry.contentRect.height);
        }
      }
      if (paper.current?.offsetHeight) setHeight(paper.current.offsetHeight);
    });
    if (viewport.current) observer.observe(viewport.current);
    if (paper.current) observer.observe(paper.current);
    return () => observer.disconnect();
  }, []);
  const fittedScale = live ? Math.min(width / 794, viewportHeight / 1123) : Math.min(1, width / 794);
  const scale = fittedScale * zoom;
  return <div className="drummer-score-view" data-paged={live} data-zoomed={zoom > 1}>
    {!live && <div className="drummer-score-tools">
      <span>{language === 'zh' ? '樂譜' : 'Chart'}</span>
      <div>
        <button aria-label={language === 'zh' ? '縮小樂譜' : 'Zoom out chart'} disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.25))}><Minus size={17}/></button>
        <button aria-pressed={zoom === 1} onClick={() => setZoom(1)}>{language === 'zh' ? '適合寬度' : 'Fit width'}</button>
        <button aria-label={language === 'zh' ? '放大樂譜' : 'Zoom in chart'} disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + 0.25))}><Plus size={17}/></button>
      </div>
    </div>}
    <div ref={viewport} className="drummer-score-scroll" tabIndex={0} aria-label={language === 'zh' ? (live ? '翻頁樂譜' : '捲動樂譜') : (live ? 'Paged chart' : 'Scroll chart')}
      onPointerDown={event => { if (live && zoom === 1 && event.isPrimary !== false) swipe.current = {x:event.clientX,y:event.clientY}; }}
      onKeyDown={event => { if (live && !event.defaultPrevented && !event.repeat && ['PageUp','PageDown'].includes(event.key)) { event.preventDefault(); turnPage(event.key === 'PageDown' ? 1 : -1); } }}
      onPointerCancel={() => { swipe.current = null; }}
      onPointerUp={event => { const start = swipe.current; swipe.current = null; if (!start) return; const dx = event.clientX-start.x, dy = event.clientY-start.y; if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)*1.5) turnPage(dx < 0 ? 1 : -1);
        else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) { const bounds = event.currentTarget.getBoundingClientRect(); turnPage(event.clientX < bounds.left+bounds.width/2 ? -1 : 1); } }}>

      <div style={{ width: 794 * scale, height: height * scale }} className="drummer-scaled-paper">
        <div ref={paper} style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <RecoveryBoundary label="樂譜"><ChordSheet song={song} currentKey={song.currentKey} language={language}/></RecoveryBoundary>
        </div>
      </div>
    </div>
    {live && pageCount > 1 && <span className="sr-only" role="status">{language === 'zh' ? `第 ${page+1} 頁，共 ${pageCount} 頁` : `Page ${page+1} of ${pageCount}`}</span>}
  </div>;
});

export default function DrummerMode({ id, name, entries, initialId, language, onClose, midiConnector }: Props) {
  useUiMotion();
  const closeInstant = useRef(false);
  const zh = language === 'zh';
  const t = (chinese: string, english: string) => zh ? chinese : english;
  const [activeId, setActiveId] = useState(() => entries.find(entry => entry.id === initialId)?.id ?? entries[0]?.id);
  const [tempos, setTempos] = useState<Record<string, number>>({});
  const [meters, setMeters] = useState<Record<string, string>>({});
  const [groupings, setGroupings] = useState<Record<string, boolean>>({});
  const [patterns, setPatterns] = useState<Record<string, BeatLevel[]>>({});
  const [preferences, setPreferences] = useState(loadPreferences);
  const subdivisionStorageKey = `chordmaster.drummer-song-subdivisions.v1.${encodeURIComponent(id ?? name)}`;
  const [songSubdivisions, setSongSubdivisions] = useState(() => loadSubdivisions(subdivisionStorageKey));
  const [subdivisionOpen, setSubdivisionOpen] = useState(false);
  const [rowPicker, setRowPicker] = useState<{id: string; key: string; denominator: number; grouped: boolean; left: number; top: number} | null>(null);
  const rowMenu = useRef<HTMLDivElement>(null), rowTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!rowPicker) return;
    rowMenu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({preventScroll:true});
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !rowMenu.current?.contains(event.target) && !rowTrigger.current?.contains(event.target)) setRowPicker(null); };
    const close = () => setRowPicker(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    const list = songList.current, initialScroll = list?.scrollTop ?? 0;
    const scroll = () => { if (list && Math.abs(list.scrollTop - initialScroll) > 1) close(); };
    list?.addEventListener('scroll', scroll);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); list?.removeEventListener('scroll', scroll); };
  }, [rowPicker]);
  const subdivisionPicker = useRef<HTMLDivElement>(null);
  const subdivisionMenu = useRef<HTMLDivElement>(null);
  const subdivisionTrigger = useRef<HTMLButtonElement>(null);
  const [midiOpen, setMidiOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const soundPanel = useRef<HTMLElement>(null), soundTrigger = useRef<HTMLButtonElement>(null);
  const [loadingSound, setLoadingSound] = useState<ClickSound | null>(null);
  const confirmedSound = useRef(preferences.sound);
  const soundChangeGeneration = useRef(0), soundPickerWasPlaying = useRef(false);
  const soundOpenRef = useRef(false), wasSoundOpen = useRef(false), wasMidiOpen = useRef(false);
  soundOpenRef.current = soundOpen;
  const midiPanel = useRef<HTMLElement>(null), midiTrigger = useRef<HTMLButtonElement>(null);
  const midiOpenRef = useRef(false), activeIdRef = useRef(activeId);
  midiOpenRef.current = midiOpen; activeIdRef.current = activeId;
  const closeMidi = () => setMidiOpen(false);
  useEffect(() => {
    if (soundOpen) soundPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    else if (wasSoundOpen.current) soundTrigger.current?.focus();
    if (!soundOpen) soundPickerWasPlaying.current = false;
    wasSoundOpen.current = soundOpen;
  }, [soundOpen]);
  useEffect(() => {
    if (!midiOpen && wasMidiOpen.current) midiTrigger.current?.focus();
    wasMidiOpen.current = midiOpen;
  }, [midiOpen]);
  const [view, setView] = useState<'songs' | 'score'>('songs');
  const [stage, setStage] = useState(false);
  const stageActive = useRef(false);
  const stagePointerExit = useRef(false);
  const scoreControls = useRef<DrummerScoreControls>(null);
  const fullscreen = usePerformanceFullscreen();
  const exitStage = useCallback(() => {
    stageActive.current = false;
    setStage(false);
    fullscreen.exitFullscreen(true);
  }, [fullscreen.exitFullscreen]);
  const enterStage = () => {
    stageActive.current = true;
    setStage(true);
    setView('songs');
    fullscreen.requestFullscreen();
  };
  const hadStageFullscreen = useRef(false);
  useEffect(() => {
    if (!stage) { hadStageFullscreen.current = false; return; }
    if (fullscreen.isFullscreen) hadStageFullscreen.current = true;
    else if (hadStageFullscreen.current) exitStage();
  }, [stage, fullscreen.isFullscreen, exitStage]);
  const [tapCount, setTapCount] = useState(0);
  const taps = useRef(new DrummerTapTempo());
  const songList = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const controlFeedback = useRef(new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>());
  const releaseControl = (action: KeyboardAction) => {
    const button = dialog.current?.querySelector<HTMLButtonElement>(`[data-drummer-action="${action}"]`);
    if (!button) return;
    clearTimeout(controlFeedback.current.get(button));
    delete button.dataset.controlPressed;
    controlFeedback.current.delete(button);
  };
  const pressControl = (action: KeyboardAction) => {
    const button = dialog.current?.querySelector<HTMLButtonElement>(`[data-drummer-action="${action}"]`);
    if (!button || button.disabled) return;
    clearTimeout(controlFeedback.current.get(button));
    button.dataset.controlPressed = 'true';
    controlFeedback.current.set(button, setTimeout(() => {
      delete button.dataset.controlPressed;
      controlFeedback.current.delete(button);
    }, action === 'tap' ? 50 : 100));
  };
  useEffect(() => {
    const feedback = controlFeedback.current;
    const clear = () => { feedback.forEach((timer, button) => { clearTimeout(timer); delete button.dataset.controlPressed; }); feedback.clear(); };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => { clear(); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); };
  }, []);
  const tempoInput = useRef<HTMLInputElement>(null);
  const click = useMetronome();
  const requestClose = useCallback(() => { click.stop(); fullscreen.exitFullscreen(stageActive.current); onClose(closeInstant.current); }, [click.stop, fullscreen.exitFullscreen, onClose]);
  const activeIndex = entries.findIndex(entry => entry.id === activeId);
  const active = entries[activeIndex];
  const bpm = tempos[activeId] ?? (isPlayableTempo(active?.song.tempo) ? active.song.tempo : undefined);
  const [draft, setDraft] = useState(bpm?.toString() ?? '');
  const [invalidTempo, setInvalidTempo] = useState(false);
  const meterText = meters[activeId] ?? (active?.song.timeSignatureUnspecified ? '' : active?.song.timeSignature ?? '');
  const meter = parseClickMeter(meterText);
  const grouped = Boolean(meter?.compound && groupings[activeId]);
  const activeSubdivisionKey = subdivisionKey(activeId, meterText, grouped);
  const subdivision = songSubdivisions[activeSubdivisionKey] ?? 1;
  const beats = meter ? meter.count / (grouped ? 3 : 1) : 4;
  const patternKey = `${activeId}:${beats}`;
  const beatLevels = useMemo(() => patterns[patternKey] ?? defaultBeatLevels(beats), [patterns, patternKey, beats]);
  const config = useMemo<MetronomeConfig>(() => ({ ...preferences, subdivision, bpm: bpm ?? 120, beats, beatLevels, muted: false }), [preferences, subdivision, bpm, beats, beatLevels]);
  const busy = click.playing || click.starting;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const canPlay = bpm !== undefined && Boolean(meter);
  const previousActiveId = useRef(activeId);

  useEffect(() => { try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences)); } catch { /* Private storage. */ } }, [preferences]);
  useEffect(() => { click.update(config); }, [click.update, config]);
  useEffect(() => { setDraft(bpm?.toString() ?? ''); setInvalidTempo(false); }, [bpm, activeId]);
  useEffect(() => {
    taps.current.reset(); setTapCount(0);
  }, [activeId]);
  useEffect(() => {
    const movingBack = entries.findIndex(entry => entry.id === activeId) < entries.findIndex(entry => entry.id === previousActiveId.current);
    previousActiveId.current = activeId;
    const list = songList.current;
    if (!list) return;
    const revealCurrent = () => {
      const row = list.querySelector<HTMLElement>('[aria-current="true"]');
      if (!row) return;
      const bounds = list.getBoundingClientRect(), item = row.getBoundingClientRect();
      let top = item.top, bottom = item.bottom;
      // Reveal the adjacent visual row in the direction of travel. Entries in
      // the same grid row don't count; the selected card must stay visible too.
      if (getComputedStyle(list).display === 'grid') {
        const sibling = movingBack ? 'previousElementSibling' : 'nextElementSibling';
        let neighbor = row.closest('.drummer-song-entry')?.[sibling];
        while (neighbor) {
          const adjacent = neighbor.getBoundingClientRect();
          if (movingBack ? adjacent.top < item.top - 1 : adjacent.top > item.top + 1) {
            if (movingBack) top = Math.max(adjacent.top, item.bottom - bounds.height);
            else bottom = Math.min(adjacent.bottom, item.top + bounds.height);
            break;
          }
          neighbor = neighbor[sibling];
        }
      }
      if (top < bounds.top) list.scrollTop -= bounds.top - top;
      else if (bottom > bounds.bottom) list.scrollTop += bottom - bounds.bottom;
    };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeId, entries]);
  useEffect(() => {
    if (!subdivisionOpen) return;
    subdivisionMenu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !subdivisionPicker.current?.contains(event.target)) setSubdivisionOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [subdivisionOpen]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = document.querySelector<HTMLElement>('[data-app-root]');
    const wasInert = root?.inert;
    if (root) root.inert = true;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (midiOpenRef.current) setMidiOpen(false);
        else if (soundOpenRef.current) setSoundOpen(false);
        else if (rowMenu.current) { setRowPicker(null); rowTrigger.current?.focus({preventScroll:true}); }
        else if (subdivisionMenu.current) { setSubdivisionOpen(false); subdivisionTrigger.current?.focus(); }
        else if (stageActive.current) exitStage();
        else { closeInstant.current = true; requestClose(); }
        return;
      }
      if (event.key === 'Tab') {
        const focusScope = midiOpenRef.current ? midiPanel.current : soundOpenRef.current ? soundPanel.current : dialog.current;
        const controls = Array.from(focusScope?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (root) root.inert = Boolean(wasInert);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [requestClose, exitStage]);

  const saveSubdivision = (key: string, value: Subdivision) => {
    setSongSubdivisions(values => ({ ...values, [key]: value }));
    try {
      localStorage.setItem(subdivisionStorageKey, JSON.stringify({ ...loadSubdivisions(subdivisionStorageKey), [key]: value }));
    } catch { /* Session settings still work when storage is unavailable. */ }
  };
  const chooseSubdivision = (value: Subdivision) => {
    saveSubdivision(activeSubdivisionKey, value);
    setSubdivisionOpen(false);
    subdivisionTrigger.current?.focus();
  };

  const setTempo = (value: number) => {
    if (!isPlayableTempo(value)) return;
    setTempos(current => ({ ...current, [activeId]: Math.round(value * 100) / 100 }));
    setDraft(String(Math.round(value * 100) / 100)); setInvalidTempo(false);
  };
  const commitTempo = () => {
    const value = Number(draft);
    if (draft.trim() && isPlayableTempo(value)) setTempo(value);
    else { setInvalidTempo(true); setDraft(bpm?.toString() ?? ''); }
  };
  const tap = (timestamp = performance.now()) => {
    const estimate = taps.current.push(timestamp);
    setTapCount(estimate.count);
    if (estimate.bpm !== null) setTempo(estimate.bpm);
  };
  const songTouch = useRef<{ id: string; pointer: number; x: number; y: number; scroll: number } | null>(null);
  const handledSongTouch = useRef<{ id: string; time: number } | null>(null);
  const select = (id: string) => {
    const selected = entries.find(entry => entry.id === id);
    if (!selected) return;
    click.stop();
    activeIdRef.current = id;
    setActiveId(id);
    setSubdivisionOpen(false);
    const selectedBpm = tempos[id] ?? selected.song.tempo;
    const selectedMeterText = meters[id] ?? (selected.song.timeSignatureUnspecified ? '' : selected.song.timeSignature);
    const selectedMeter = parseClickMeter(selectedMeterText);
    busyRef.current = isPlayableTempo(selectedBpm) && Boolean(selectedMeter);
    if (isPlayableTempo(selectedBpm) && selectedMeter) {
      const selectedGrouped = Boolean(selectedMeter.compound && groupings[id]);
      const selectedBeats = selectedMeter.count / (selectedGrouped ? 3 : 1);
      void click.start({ ...config, subdivision: songSubdivisions[subdivisionKey(id, selectedMeterText, selectedGrouped)] ?? 1, bpm: selectedBpm, beats: selectedBeats, beatLevels: patterns[`${id}:${selectedBeats}`] ?? defaultBeatLevels(selectedBeats) });
    }
  };
  const adjacentSong = (offset: number) => {
    const next = entries[entries.findIndex(entry => entry.id === activeIdRef.current) + offset];
    if (next) select(next.id);
  };
  const adjustTempo = (delta: number) => {
    const target = activeIdRef.current, original = entries.find(entry => entry.id === target)?.song.tempo;
    setTempos(current => {
      const previous = current[target] ?? original;
      if (!isPlayableTempo(previous)) return current;
      return { ...current, [target]: Math.round(Math.min(400, Math.max(20, previous + delta)) * 10) / 10 };
    });
  };
  const togglePlayback = () => {
    if (busyRef.current) { busyRef.current = false; click.stop(); }
    else if (canPlay) { busyRef.current = true; void click.start(config); }
  };
  const midi = useDrummerMidi({ settingsOpen: midiOpen || soundOpen || subdivisionOpen || Boolean(rowPicker), connector: midiConnector, onAction: (action, delta, timestamp) => {
    if (action === 'tempo') adjustTempo(delta ?? 0);
    else if (action === 'tempoUp') adjustTempo(1);
    else if (action === 'tempoDown') adjustTempo(-1);
    else if (action === 'tap') tap(timestamp);
    else if (action === 'playPause') togglePlayback();
    else if (action === 'previousPage' || action === 'nextPage') scoreControls.current?.turnPage(action === 'nextPage' ? 1 : -1);
    else adjacentSong(action === 'next' ? 1 : -1);
    if (action !== 'tempo') pressControl(action);
    else if (delta) pressControl(delta > 0 ? 'tempoUp' : 'tempoDown');
  } });
  const beatUnit = grouped ? t('附點四分音符', 'Dotted quarter')
    : meter?.denominator === 8 ? t('八分音符', 'Eighth note')
    : meter?.denominator === 2 ? t('二分音符', 'Half note')
    : meter?.denominator === 16 ? t('十六分音符', 'Sixteenth note') : t('四分音符', 'Quarter note');
  const noteNames: Record<number, string> = { 2: t('二分', 'Half'), 4: t('四分', 'Quarter'), 8: t('八分', 'Eighth'), 16: t('十六分', '16th'), 32: t('三十二分', '32nd'), 64: t('六十四分', '64th') };
  const divisionLabel = (value: number, signature = meter, compound = grouped) => compound
    ? [t('附點四分', 'Dotted quarter'), t('二等分', 'Two per beat'), t('八分', 'Eighth'), t('四等分', 'Four per beat')][value - 1]
    : value === 3 ? t('三連音', 'Triplets') : noteNames[(signature?.denominator ?? 4) * value];
  const strengthNames = [t('靜音', 'Silent'), t('輕拍', 'Soft'), t('一般', 'Regular'), t('重音', 'Accent')];
  const notice = click.notice === 'hidden' ? t('回到畫面後正在恢復 Click。', 'Restoring Click after returning to the page.')
    : click.notice === 'interrupted' ? t('音訊已中斷，請確認輸出後重新播放。', 'Audio was interrupted. Check the output and press play.')
    : click.notice === 'failed' ? t('音色未能載入或啟動；若原音色仍在播放會繼續保留，否則請再按播放。', 'The sound could not load or start. A playing sound is kept; otherwise press play to retry.') : '';
  if (!active) return createPortal(<div ref={dialog} className="drummer-mode" role="dialog" aria-modal="true" aria-label={t('鼓手模式', 'Drummer mode')}><p>{t('這份歌單還沒有可播放的歌曲。', 'This setlist has no songs.')}</p><button onClick={() => onClose()}>{t('返回歌單', 'Back to setlist')}</button></div>, document.body);

  return createPortal(<div ref={dialog} className="drummer-mode" role="dialog" aria-modal="true" aria-labelledby="drummer-title" data-drummer-mode data-stage={stage} data-fullscreen={fullscreen.isFullscreen} data-view={view}
    onKeyDownCapture={event => {
      if (event.repeat || !['Enter', ' '].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-drummer-action]') : null;
      if (target?.dataset.drummerAction) pressControl(target.dataset.drummerAction as KeyboardAction);
    }} onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <div className="drummer-left-panel">
    <header className="drummer-header" inert={midiOpen || soundOpen} aria-hidden={midiOpen || soundOpen || undefined}>
      <button onClick={requestClose} aria-label={t('退出鼓手模式', 'Exit drummer mode')}><ChevronLeft size={20}/><span>{t('退出', 'Exit')}</span></button>
      <div><h1 id="drummer-title">{t('鼓手模式', 'Drummer mode')}</h1><p>{name}</p></div>
      <button ref={midiTrigger} className="drummer-midi-button" aria-label={t('設定 MIDI 控制器', 'MIDI controller settings')} aria-haspopup="dialog" data-connected={midi.source === 'keyboard' ? Object.keys(midi.keyboard).length > 0 : Boolean(midi.selectedId)} onClick={() => { setSubdivisionOpen(false); setMidiOpen(true); }}><Cable size={18}/><span>MIDI</span></button>
      {stage && !fullscreen.isFullscreen && fullscreen.canRequestFullscreen && <button className="drummer-fullscreen-retry" onClick={fullscreen.requestFullscreen} aria-label={t('進入全螢幕', 'Enter fullscreen')}><Maximize size={18}/><span>{t('全螢幕', 'Fullscreen')}</span></button>}
      <button className="drummer-stage-toggle"
        onPointerDown={event => {
          if (event.button !== 0 || event.isPrimary === false) return;
          stagePointerExit.current = stage;
          // Leaving fullscreen can move the button before pointerup. Exit on
          // press, and consume that gesture's click rather than re-entering.
          if (stage) { event.preventDefault(); exitStage(); }
        }}
        onClick={event => {
          if (event.detail > 0 && stagePointerExit.current) { stagePointerExit.current = false; return; }
          (stage ? exitStage : enterStage)();
        }} aria-pressed={stage} aria-label={stage ? t('一般模式', 'Standard mode') : t('演出模式', 'Performance mode')}>
        {stage ? <Minimize size={18}/> : <Maximize size={18}/>}<span>{stage ? t('一般模式', 'Standard') : t('演出模式', 'Performance mode')}</span>
      </button>
      <div className="drummer-view-switch" aria-label={t('檢視方式', 'View')}>
        <button aria-pressed={view === 'songs'} onClick={() => setView('songs')}>{t('歌單', 'Songs')}</button>
        <button aria-pressed={view === 'score'} onClick={() => setView('score')}>{t('樂譜', 'Chart')}</button>
      </div>
    </header>
    <div className="drummer-left-body">
    <div className="drummer-workspace" data-view={view} inert={midiOpen || soundOpen} aria-hidden={midiOpen || soundOpen || undefined}>
      <section className="drummer-controls" aria-label={t('節拍器控制', 'Metronome controls')}>
        <div className="drummer-console-layout">
        <div className="drummer-current">
          <div className="drummer-song-heading"><h2>{active.song.title || t('未命名歌曲', 'Untitled song')}</h2></div>
          <div className="drummer-tempo-meta">
            <div ref={subdivisionPicker} className="drummer-subdivision-picker">
              <button ref={subdivisionTrigger} className="drummer-subdivision-trigger" aria-label={t(`本曲節拍細分：${divisionLabel(subdivision)}`, `Song subdivision: ${divisionLabel(subdivision)}`)} aria-haspopup="menu" aria-expanded={subdivisionOpen} aria-controls={subdivisionOpen ? 'drummer-subdivision-menu' : undefined}
                onClick={() => setSubdivisionOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setSubdivisionOpen(true); } }}>
                <span className="drummer-meter-readout">{meterText || "—"}</span><SubdivisionSymbol division={subdivision} denominator={meter?.denominator ?? 4} grouped={grouped}/><ChevronDown size={13}/>
              </button>
              {subdivisionOpen && <div ref={subdivisionMenu} id="drummer-subdivision-menu" className="drummer-subdivisions" role="menu" aria-label={t('選擇本曲節拍細分', 'Choose song subdivision')}
                onKeyDown={event => {
                  const options = Array.from(subdivisionMenu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
                  const index = options.indexOf(document.activeElement as HTMLButtonElement);
                  if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + options.length) % options.length;
                    options[next]?.focus();
                  }
                  if (event.key === 'Tab') { event.preventDefault(); setSubdivisionOpen(false); subdivisionTrigger.current?.focus(); }
                }}>
                {([1, 2, 3, 4] as const).map(value => <button key={value} role="menuitemradio" aria-label={divisionLabel(value)} aria-checked={subdivision === value} onClick={() => chooseSubdivision(value)}>
                  <SubdivisionSymbol division={value} denominator={meter?.denominator ?? 4} grouped={grouped}/>
                </button>)}
              </div>}
            </div>
          </div>
          <div className="drummer-tempo">
            <button data-drummer-action="tempoDown" aria-label={t('減少 1 BPM', 'Decrease 1 BPM')} disabled={bpm === undefined || bpm <= 20} onClick={() => adjustTempo(-1)}><Minus size={24}/></button>
            <label><input ref={tempoInput} aria-label={t('節拍器速度 BPM', 'Metronome tempo BPM')} aria-describedby="drummer-beat-unit" style={{ '--tempo-digits': Math.max(3, draft.length) } as React.CSSProperties} inputMode="decimal" autoComplete="off" value={draft} placeholder="—" aria-invalid={invalidTempo || undefined}
              onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value.replace(/[^\d.]/g, ''))} onBlur={commitTempo} onKeyDown={event => { if (event.key === 'Enter') { commitTempo(); event.currentTarget.blur(); } }}/><span>BPM</span><button className="drummer-reset-tempo" aria-label={t('還原速度', 'Reset tempo')} title={isPlayableTempo(active.song.tempo) ? `${t('還原速度', 'Reset tempo')} · ${active.song.tempo} BPM` : t('未設定原始速度', 'No original tempo')} disabled={!isPlayableTempo(active.song.tempo) || bpm === active.song.tempo} onClick={event => {event.preventDefault(); if (isPlayableTempo(active.song.tempo)) setTempo(active.song.tempo!);}}><RotateCcw size={16}/></button><span id="drummer-beat-unit" className="sr-only">{t('BPM 計拍單位：', 'BPM beat unit: ')}{beatUnit}</span></label>
            <button data-drummer-action="tempoUp" aria-label={t('增加 1 BPM', 'Increase 1 BPM')} disabled={bpm === undefined || bpm >= 400} onClick={() => adjustTempo(1)}><Plus size={24}/></button>
          </div>
          <div className="drummer-beats" role="group" aria-label={t('每拍重音', 'Beat accents')} style={{ gridTemplateColumns: `repeat(${Math.min(beats, 6)}, minmax(0, 1fr))` }}>
            {beatLevels.map((strength, index) => <button key={index} className="drummer-beat" data-active={click.beat === index} aria-label={t(`第 ${index + 1} 拍：${strengthNames[strength]}，點按切換`, `Beat ${index + 1}: ${strengthNames[strength]}, tap to change`)}
              onClick={() => setPatterns(values => ({ ...values, [patternKey]: beatLevels.map((value, beatIndex) => beatIndex === index ? (value + 1) % 4 as BeatLevel : value) }))}>
              <span className="drummer-beat-stack" aria-hidden="true">{[3, 2, 1].map(level => <span key={level} data-filled={strength >= level}/>)}</span>
              <span className="drummer-beat-number" aria-hidden="true">{index + 1}{strength === 0 && <VolumeX size={12}/>}</span>
            </button>)}
          </div>
          <div className="drummer-transport">
            <button data-drummer-action="playPause" className="drummer-play" disabled={!busy && !canPlay} onClick={togglePlayback}>
              {busy ? <Square size={21}/> : <Play size={23}/>}<span>{busy ? t('停止', 'Stop') : t('播放', 'Play')}</span>
            </button>
            <button data-drummer-action="tap" className="drummer-tap" onPointerDown={event => { if (event.isPrimary !== false && event.button === 0) { pressControl('tap'); tap(event.timeStamp); } }} onPointerUp={() => releaseControl('tap')} onPointerCancel={() => releaseControl('tap')} onClick={event => { if (event.detail === 0) { pressControl('tap'); tap(event.timeStamp); } }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) tap(event.timeStamp); } }} onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') releaseControl('tap'); }} aria-label={t('TAP 點按測速', 'Tap tempo')}>TAP<span>{tapCount > 0 ? t(`${tapCount} 次`, `${tapCount} taps`) : t('點按測速', 'Tap tempo')}</span></button>
            <div className="drummer-song-navigation"><button data-drummer-action="previous" aria-label={t('上一首', 'Previous song')} title={t('上一首', 'Previous song')} disabled={activeIndex <= 0} onClick={() => adjacentSong(-1)}><SkipBack size={23}/></button><button data-drummer-action="next" aria-label={t('下一首', 'Next song')} title={t('下一首', 'Next song')} disabled={activeIndex >= entries.length - 1} onClick={() => adjacentSong(1)}><SkipForward size={23}/></button></div>
          </div>
          <p className="drummer-notice" role="status">{notice || (invalidTempo ? t('請輸入 20–400 BPM。', 'Enter 20–400 BPM.') : !canPlay ? (bpm === undefined ? '' : t('請在設定中選擇拍號。', 'Choose a meter in settings.')) : '')}</p>
        </div>
        <div className="drummer-settings">
          <button ref={soundTrigger} className="drummer-settings-toggle" aria-label={`${t('聲音與拍號', 'Sound & meter')} · ${CLICK_SOUNDS[preferences.sound]}`} aria-haspopup="dialog" onClick={() => { setSubdivisionOpen(false); setSoundOpen(true); }}><Settings2 size={18}/><span className="drummer-settings-label">{t('聲音與拍號', 'Sound & meter')}</span><span>{CLICK_SOUNDS[preferences.sound]}</span><ChevronDown size={16}/></button>
        </div>
        </div>
      </section>
      <section className="drummer-song-list" aria-label={t('鼓手歌單', 'Drummer setlist')}>
        <div className="drummer-list-heading"><h2>{t('歌單', 'Setlist')}</h2><span>{t('點歌即播放', 'Tap a song to play')} · {entries.length} {t('首', 'songs')}</span></div>
        <div ref={songList} className="drummer-list-scroll">
          {entries.map((entry, index) => {
            const text = meters[entry.id] ?? entry.song.timeSignature;
            const rowMeter = parseClickMeter(text);
            const rowGrouped = Boolean(rowMeter?.compound && groupings[entry.id]);
            const key = subdivisionKey(entry.id, text, rowGrouped);
            const value = songSubdivisions[key] ?? 1;
            return <div key={entry.id} className="drummer-song-entry" data-current={entry.id === activeId}>
            <button className="drummer-song-row" aria-label={`${index + 1} ${entry.song.title || t('未命名歌曲', 'Untitled song')} · ${tempos[entry.id] ?? (isPlayableTempo(entry.song.tempo) ? entry.song.tempo : t('速度未設定', 'No tempo'))} BPM`} aria-current={entry.id === activeId ? 'true' : undefined}
            onPointerDown={event => {
              if (!['touch', 'pen'].includes(event.pointerType) || event.isPrimary === false) return;
              songTouch.current = { id: entry.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, scroll: songList.current?.scrollTop ?? 0 };
            }}
            onPointerCancel={() => { songTouch.current = null; }}
            onPointerUp={event => {
              const touch = songTouch.current; songTouch.current = null;
              if (!touch || touch.id !== entry.id || touch.pointer !== event.pointerId) return;
              handledSongTouch.current = { id: entry.id, time: performance.now() };
              if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 10 || Math.abs((songList.current?.scrollTop ?? 0) - touch.scroll) > 10) return;
              // Select on touch release even if Safari drops the following click.
              event.preventDefault(); select(entry.id);
            }}
            onClick={event => {
              const handled = handledSongTouch.current;
              if (event.detail > 0 && handled?.id === entry.id && performance.now() - handled.time < 1000) return;
              select(entry.id);
            }}>
            <span className="drummer-song-order" aria-hidden="true">{index + 1}.</span>
            <span className="drummer-song-tempo">{tempos[entry.id] ?? (isPlayableTempo(entry.song.tempo) ? entry.song.tempo : '—')}<small>BPM</small></span>
            <span className="drummer-song-name"><small>{meters[entry.id] ?? (entry.song.timeSignatureUnspecified ? t('拍號待設定', 'Meter needed') : entry.song.timeSignature)}</small><span className="drummer-song-title" title={entry.song.title}>{entry.song.title || t('未命名歌曲', 'Untitled song')}</span></span>
          </button>
          <button className="drummer-song-subdivision" aria-label={`${entry.song.title} · ${t('節拍細分', 'Subdivision')}`} aria-haspopup="menu" aria-expanded={rowPicker?.id === entry.id} onClick={event => {
            const bounds = event.currentTarget.getBoundingClientRect(); rowTrigger.current = event.currentTarget;
            setSubdivisionOpen(false);
            setRowPicker(current => current?.id === entry.id ? null : {id:entry.id,key,denominator:rowMeter?.denominator ?? 4,grouped:rowGrouped,left:Math.max(8,Math.min(bounds.right-288,window.innerWidth-296)),top:Math.min(bounds.bottom+6,window.innerHeight-84)});
          }}>
            <SubdivisionSymbol division={value} denominator={rowMeter?.denominator ?? 4} grouped={rowGrouped}/><ChevronDown size={12}/>
          </button>
          </div>; })}
        </div>
      </section>
    </div>
    </div>
    </div>
      <section className="drummer-score" inert={midiOpen || soundOpen} aria-hidden={midiOpen || soundOpen || undefined} aria-label={t('鼓手樂譜', 'Drummer chart')}>
        <DrummerScore key={active.id} song={active.song} language={language} live={stage} controlsRef={scoreControls}/>
      </section>
    {rowPicker && <div ref={rowMenu} className="drummer-subdivisions drummer-row-subdivisions" role="menu" aria-label={t('選擇歌曲節拍細分', 'Choose song subdivision')} style={{left:rowPicker.left,top:rowPicker.top}} onKeyDown={event => {
      const options = Array.from(rowMenu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length-1 : (index + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1) + options.length) % options.length;
        options[next]?.focus();
      }
      if (event.key === 'Tab') { event.preventDefault(); setRowPicker(null); rowTrigger.current?.focus({preventScroll:true}); }
    }}>
      {([1,2,3,4] as const).map(value => <button key={value} role="menuitemradio" aria-label={divisionLabel(value,parseClickMeter(`4/${rowPicker.denominator}`),rowPicker.grouped)} aria-checked={(songSubdivisions[rowPicker.key] ?? 1) === value} onClick={() => {saveSubdivision(rowPicker.key,value);setRowPicker(null);rowTrigger.current?.focus({preventScroll:true});}}><SubdivisionSymbol division={value} denominator={rowPicker.denominator} grouped={rowPicker.grouped}/></button>)}
    </div>}
    <div className="drummer-midi-backdrop" hidden={!soundOpen} onMouseDown={event => { if (event.target === event.currentTarget) setSoundOpen(false); }}>
      <section ref={soundPanel} className="drummer-midi-panel drummer-sound-panel" role="dialog" aria-modal="true" aria-labelledby="drummer-sound-title">
        <header><h2 id="drummer-sound-title">{t('聲音與拍號', 'Sound & meter')}</h2><button aria-label={t('關閉聲音設定', 'Close sound settings')} onClick={() => setSoundOpen(false)}><X size={22}/></button></header>
          <div className="drummer-settings-body">
            <label>{t('音色', 'Click sound')}<select aria-label={t('音色', 'Click sound')} aria-busy={Boolean(loadingSound)} value={preferences.sound}
              onFocus={() => { soundPickerWasPlaying.current ||= busyRef.current; }}
              onPointerDown={() => { soundPickerWasPlaying.current = busyRef.current; }}
              onKeyDown={() => { soundPickerWasPlaying.current ||= busyRef.current; }}
              onChange={e => {
              const sound = e.target.value as ClickSound;
              const resumePlayback = busyRef.current || soundPickerWasPlaying.current;
              soundPickerWasPlaying.current = false;
              const request = ++soundChangeGeneration.current;
              if (sound === preferences.sound) return;
              const previous = confirmedSound.current;
              setPreferences(p => ({ ...p, sound }));
              if (resumePlayback && canPlay) {
                setLoadingSound(sound);
                void (async () => {
                  // One retry covers transient fetch/decode failures. Keep the old clock running.
                  const recovery = { quiet: true as const, fallbackSound: previous };
                  let started = await click.start({ ...config, sound }, recovery);
                  if (started === false && request === soundChangeGeneration.current) started = await click.start({ ...config, sound }, recovery);
                  if (request !== soundChangeGeneration.current) return;
                  if (started === false) setPreferences(p => p.sound === sound ? { ...p, sound: previous } : p);
                  else confirmedSound.current = sound;
                  setLoadingSound(null);
                })();
              } else confirmedSound.current = sound;
            }}>
              {(Object.keys(CLICK_SOUNDS) as ClickSound[]).map(sound => <option key={sound} value={sound}>{CLICK_SOUNDS[sound]}</option>)}
            </select></label>
            {loadingSound && <div className="drummer-sound-loading" role="progressbar" aria-label={t('準備音色', 'Preparing sound')}><span/>{t('準備音色…', 'Preparing sound…')}</div>}
            <p>{t('新音色準備好後會重新起拍；載入失敗時保留原音色。', 'The new sound restarts the beat when ready; a failed load keeps the previous sound.')}</p>
            <label>{t('拍號', 'Meter')}<select disabled={busy} value={meterText} onChange={e => setMeters(values => ({ ...values, [activeId]: e.target.value }))}>
              {!meter && <option value={meterText}>{t('選擇拍號', 'Choose meter')}</option>}
              {Array.from(new Set(['4/4', '3/4', '6/8', '12/8', '2/4', '5/4', '7/8', ...(meter ? [meterText] : [])])).map(value => <option key={value}>{value}</option>)}
            </select></label>
            {meter?.compound && <label>{t('BPM 計拍單位', 'BPM beat unit')}<select disabled={busy} value={grouped ? 'group' : 'base'} onChange={e => setGroupings(values => ({ ...values, [activeId]: e.target.value === 'group' }))}><option value="base">{t('八分音符', 'Eighth note')}</option><option value="group">{t('附點四分音符', 'Dotted quarter')}</option></select></label>}
            {(['volume', 'accent', 'regular', 'subdivisions'] as const).map((key, index) => <label className="drummer-volume" key={key}>{[t('總音量', 'Volume'), t('重音', 'Accent'), t('一般拍', 'Beat'), t('細分拍', 'Subdivision')][index]}<input type="range" min="0" max="1" step="0.05" value={preferences[key]} onChange={e => setPreferences(p => ({ ...p, [key]: Number(e.target.value) }))}/><output>{Math.round(preferences[key] * 100)}%</output></label>)}
            <p>{t('速度與拍號僅用於本次鼓手模式。支援的瀏覽器可在背景繼續播放；回到畫面會同步目前拍點。', 'Tempo and meter changes apply to this session only. Keep this view open; hiding the app stops playback.')}</p>
          </div>
      </section>
    </div>
    {midiOpen && <DrummerMidiSettings midi={midi} zh={zh} panelRef={midiPanel} onClose={closeMidi} onPrepareAudio={click.prepare}/>}
  </div>, document.body);
}
