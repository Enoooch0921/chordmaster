import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Song, Section, Bar, Key } from '../types';
import { Plus, Trash2, ChevronDown, ChevronUp, Music2, Link, Hash, Copy, ArrowUpRight, ArrowDownRight, GripHorizontal } from 'lucide-react';
import { motion, AnimatePresence, Reorder, LayoutGroup } from 'motion/react';
import Jianpu from './Jianpu';
import RhythmNotation from './RhythmNotation';
import { ALL_KEYS, getSectionColor } from '../utils/musicUtils';
import { JianpuDuration, JianpuInputMode, JianpuNoteRange, JianpuOctave, buildJianpuNoteFromMode, buildJianpuPlaceholder, findJianpuNoteRanges, findJianpuPlaceholderRanges, rebuildJianpuNote, replaceJianpuRange } from '../utils/jianpuUtils';
import { getEffectiveTimeSignature, getRestGlyph, normalizeRhythmInput, normalizeRhythmToken, parseRhythmNotation, parseTimeSignature } from '../utils/rhythmUtils';


interface Props {
  song: Song;
  history: { past: Song[]; future: Song[] };
  onUndo: () => void;
  onRedo: () => void;
  onChange: (song: Song) => void;
  activeSectionId?: string | null;
  onActiveSectionChange?: (sectionId: string | null) => void;
  activeBar?: { sIdx: number; bIdx: number } | null;
  onActiveBarChange?: (bar: { sIdx: number; bIdx: number } | null) => void;
}

interface SelectionInfo {
  sIdx: number;
  bIdx: number;
  start: number;
  end: number;
  text: string;
  type: 'riff' | 'chord' | 'rhythm';
}

interface DragBarPayload {
  sourceSectionIdx: number;
  sourceBarIdx: number;
}

interface CopiedBarHighlight {
  sIdx: number;
  bIdx: number;
}

interface PendingSwapAnimation {
  barRects: Array<{
    barId: string;
    rect: DOMRect;
  }>;
}

interface RhythmCursor {
  sIdx: number;
  bIdx: number;
  cursorUnit: number;
}

interface JianpuCursor {
  sIdx: number;
  bIdx: number;
  beatIndex: number;
}

interface RhythmEditorEvent {
  startUnit: number;
  durationUnits: number;
  base: 'w' | 'h' | 'q' | 'e' | 's';
  isRest: boolean;
  dotted: boolean;
  accent: boolean;
  tieAfter: boolean;
}

interface BarPanelState {
  riff?: boolean;
  barTime?: boolean;
  rhythm?: boolean;
  more?: boolean;
}

type BarInsertPosition = 'before' | 'after';

const SECTION_TITLE_PRESETS = [
  'Intro',
  'Count-In',
  'Verse',
  'Verse 1',
  'Verse 2',
  'Verse 3',
  'Verse 4',
  'Pre-Chorus',
  'Pre-Chorus 1',
  'Pre-Chorus 2',
  'Chorus',
  'Chorus 1',
  'Chorus 2',
  'Post-Chorus',
  'Refrain',
  'Turnaround',
  'Bridge',
  'Bridge 1',
  'Bridge 2',
  'Interlude',
  'Tag',
  'Vamp',
  'Rap',
  'Outro',
  'Ending'
];

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const getVersionValue = (song: Song) =>
  Array.from(new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))).join(' / ');

const splitTimeSignatureInput = (value: string | undefined) => {
  const [numerator = '', denominator = ''] = (value || '').split('/', 2);
  return {
    numerator: numerator.trim(),
    denominator: denominator.trim()
  };
};

const buildTimeSignatureInput = (numerator: string, denominator: string) => {
  const cleanNumerator = numerator.replace(/\D+/g, '');
  const cleanDenominator = denominator.replace(/\D+/g, '');

  if (!cleanNumerator && !cleanDenominator) return '';
  return `${cleanNumerator}/${cleanDenominator}`;
};

const getAccentHighlight = (accent: string) => {
  switch (accent) {
    case 'blue':
      return { ring: 'rgba(59, 130, 246, 0.18)', glow: 'rgba(59, 130, 246, 0.10)', dot: '#60a5fa', barRing: 'rgba(59, 130, 246, 0.34)', barGlow: 'rgba(59, 130, 246, 0.22)', barFill: 'rgba(59, 130, 246, 0.08)' };
    case 'rose':
      return { ring: 'rgba(244, 63, 94, 0.18)', glow: 'rgba(244, 63, 94, 0.10)', dot: '#fb7185', barRing: 'rgba(244, 63, 94, 0.34)', barGlow: 'rgba(244, 63, 94, 0.22)', barFill: 'rgba(244, 63, 94, 0.08)' };
    case 'amber':
      return { ring: 'rgba(245, 158, 11, 0.20)', glow: 'rgba(245, 158, 11, 0.10)', dot: '#fbbf24', barRing: 'rgba(245, 158, 11, 0.36)', barGlow: 'rgba(245, 158, 11, 0.22)', barFill: 'rgba(245, 158, 11, 0.10)' };
    case 'emerald':
      return { ring: 'rgba(16, 185, 129, 0.18)', glow: 'rgba(16, 185, 129, 0.10)', dot: '#34d399', barRing: 'rgba(16, 185, 129, 0.34)', barGlow: 'rgba(16, 185, 129, 0.22)', barFill: 'rgba(16, 185, 129, 0.08)' };
    case 'slate':
      return { ring: 'rgba(100, 116, 139, 0.16)', glow: 'rgba(100, 116, 139, 0.10)', dot: '#94a3b8', barRing: 'rgba(100, 116, 139, 0.28)', barGlow: 'rgba(100, 116, 139, 0.18)', barFill: 'rgba(100, 116, 139, 0.08)' };
    default:
      return { ring: 'rgba(99, 102, 241, 0.18)', glow: 'rgba(99, 102, 241, 0.10)', dot: '#818cf8', barRing: 'rgba(99, 102, 241, 0.34)', barGlow: 'rgba(99, 102, 241, 0.22)', barFill: 'rgba(99, 102, 241, 0.08)' };
  }
};

const SongEditor: React.FC<Props> = ({ song, history, onUndo, onRedo, onChange, activeSectionId = null, onActiveSectionChange, activeBar = null, onActiveBarChange }) => {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [rhythmCursor, setRhythmCursor] = useState<RhythmCursor | null>(null);
  const [jianpuCursor, setJianpuCursor] = useState<JianpuCursor | null>(null);
  const [jianpuInputMode, setJianpuInputMode] = useState<JianpuInputMode>({ duration: 'quarter', octave: 'mid', dotted: false });
  const [barPanels, setBarPanels] = useState<Record<string, BarPanelState>>({});
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [copiedBarHighlight, setCopiedBarHighlight] = useState<CopiedBarHighlight | null>(null);
  const [tempoDraft, setTempoDraft] = useState<string>(String(song.tempo));
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef(new Map<string, HTMLDivElement>());
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingSwapAnimationRef = useRef<PendingSwapAnimation | null>(null);
  const suppressAddBarClickRef = useRef<string | null>(null);

  const notifyChange = (newSong: Song) => {
    onChange(newSong);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMetaKey = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isMetaKey && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
      } else if (isMetaKey && key === 'y') {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRedo, onUndo]);

  const cleanInput = (val: string) => {
    return val
      .replace(/，/g, ',')
      .replace(/。/g, '.')
      .replace(/？/g, '?')
      .replace(/！/g, '!')
      .replace(/；/g, ';')
      .replace(/：/g, ':')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/【/g, '[')
      .replace(/】/g, ']')
      .replace(/、/g, '/')
      .replace(/—/g, '-')
      .replace(/…/g, '...');
  };

  const createBarId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `bar-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const createEmptyBar = (): Bar => ({
    id: createBarId(),
    chords: []
  });

  useEffect(() => {
    const needsIds = song.sections.some(s => !s.id || s.bars.some(bar => !bar.id));
    if (needsIds) {
      const newSections = song.sections.map((s, i) => ({
        ...s,
        id: s.id || `s-init-${i}`,
        bars: s.bars.map((bar) => ({
          ...bar,
          id: bar.id || createBarId()
        }))
      }));
      onChange({ ...song, sections: newSections });
    }
  }, []);

  useEffect(() => {
    if (!selection || selection.type !== 'rhythm') {
      setRhythmCursor(null);
    }
  }, [selection]);

  useEffect(() => {
    if (!selection || selection.type !== 'riff') {
      setJianpuCursor(null);
    }
  }, [selection]);

  useEffect(() => {
    setTempoDraft(String(song.tempo));
  }, [song.tempo]);

  const updateField = (field: keyof Song, value: any) => {
    notifyChange({ ...song, [field]: value });
  };

  const commitTempoDraft = () => {
    const digitsOnly = tempoDraft.replace(/\D+/g, '').slice(0, 3);
    const nextTempo = Math.min(400, Math.max(20, parseInt(digitsOnly, 10) || 120));
    setTempoDraft(String(nextTempo));
    updateField('tempo', nextTempo);
  };

  const updateSection = (sIdx: number, section: Section) => {
    const newSections = [...song.sections];
    newSections[sIdx] = section;
    notifyChange({ ...song, sections: newSections });
  };

  const updateBar = (sIdx: number, bIdx: number, updates: Partial<Bar>) => {
    const section = song.sections[sIdx];
    const newBars = [...section.bars];
    newBars[bIdx] = { ...section.bars[bIdx], ...updates };
    const newSections = [...song.sections];
    newSections[sIdx] = { ...section, bars: newBars };
    notifyChange({ ...song, sections: newSections });
  };

  const clearSelectionIfFocusLeftEditor = () => {
    window.setTimeout(() => {
      const active = document.activeElement as Node | null;
      const root = rootRef.current;
      const toolbar = toolbarRef.current;

      if ((active && root?.contains(active)) || (active && toolbar?.contains(active))) {
        return;
      }

      setSelection(null);
    }, 0);
  };

  const getBarTimeSignature = (bar?: Bar) => getEffectiveTimeSignature(bar?.timeSignature, song.timeSignature);
  const getBarPanelKey = (bar: Bar, sIdx: number, bIdx: number) => bar.id || `${sIdx}-${bIdx}`;
  const getBarPanelState = (bar: Bar, sIdx: number, bIdx: number) => {
    const state = barPanels[getBarPanelKey(bar, sIdx, bIdx)];
    return {
      riff: state?.riff ?? Boolean(bar.riff || bar.riffLabel),
      barTime: state?.barTime ?? Boolean(bar.timeSignature),
      rhythm: state?.rhythm ?? Boolean(bar.rhythm),
      more: state?.more ?? Boolean(
        bar.riffLabel ||
        bar.rhythmLabel ||
        bar.annotation ||
        bar.repeatStart ||
        bar.repeatEnd ||
        bar.finalBar ||
        bar.ending
      )
    };
  };
  const updateBarPanelState = (bar: Bar, sIdx: number, bIdx: number, patch: BarPanelState) => {
    const key = getBarPanelKey(bar, sIdx, bIdx);
    setBarPanels(current => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch
      }
    }));
  };
  const songTimeSignatureParts = splitTimeSignatureInput(song.timeSignature);

  const cloneBar = (bar: Bar): Bar => ({
    ...bar,
    id: createBarId(),
    chords: [...bar.chords]
  });

  const setBarRef = (barId: string | undefined, node: HTMLDivElement | null) => {
    if (!barId) return;
    if (node) {
      barRefs.current.set(barId, node);
    } else {
      barRefs.current.delete(barId);
    }
  };

  const setSectionRef = (sectionId: string | undefined, node: HTMLDivElement | null) => {
    if (!sectionId) return;
    if (node) {
      sectionRefs.current.set(sectionId, node);
    } else {
      sectionRefs.current.delete(sectionId);
    }
  };

  const markActiveSection = (sectionId: string | null) => {
    onActiveSectionChange?.(sectionId);
  };

  const markActiveBar = (sIdx: number, bIdx: number) => {
    onActiveBarChange?.({ sIdx, bIdx });
  };

  const queueChordInputFocus = (sIdx: number, bIdx: number, sectionId: string | null) => {
    markActiveSection(sectionId);
    markActiveBar(sIdx, bIdx);
    setSelection({
      sIdx,
      bIdx,
      start: 0,
      end: 0,
      text: '',
      type: 'chord'
    });
  };

  const insertEmptyBarAt = (sIdx: number, insertIndex: number) => {
    const section = song.sections[sIdx];
    if (!section) return;

    const newBars = [...section.bars];
    newBars.splice(insertIndex, 0, createEmptyBar());
    updateSection(sIdx, { ...section, bars: newBars });
    queueChordInputFocus(sIdx, insertIndex, section.id ?? null);
  };

  useEffect(() => {
    const rootNode = rootRef.current;
    const scrollRoot = rootNode?.closest('[data-editor-scroll-root]') as HTMLElement | null;
    if (!rootNode || !scrollRoot) return;

    let frameId: number | null = null;

    const updateActiveSectionFromScroll = () => {
      frameId = null;
      const rootRect = scrollRoot.getBoundingClientRect();
      const anchorY = rootRect.top + Math.min(rootRect.height * 0.25, 180);
      let nextSectionId: string | null = null;
      let bestScore = -Infinity;

      song.sections.forEach((section, idx) => {
        const sectionId = section.id || `section-${idx}`;
        const node = sectionRefs.current.get(sectionId);
        if (!node) return;

        const rect = node.getBoundingClientRect();
        const visibleTop = Math.max(rect.top, rootRect.top);
        const visibleBottom = Math.min(rect.bottom, rootRect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        if (visibleHeight <= 0) return;

        const distancePenalty = Math.abs(rect.top - anchorY) * 0.35;
        const score = visibleHeight - distancePenalty;
        if (score > bestScore) {
          bestScore = score;
          nextSectionId = sectionId;
        }
      });

      if (nextSectionId) {
        markActiveSection(nextSectionId);
      }
    };

    const requestUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateActiveSectionFromScroll);
    };

    requestUpdate();
    scrollRoot.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      scrollRoot.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, [song.sections, onActiveSectionChange]);

  useLayoutEffect(() => {
    const pending = pendingSwapAnimationRef.current;
    if (!pending) return;

    pendingSwapAnimationRef.current = null;
    pending.barRects.forEach(({ barId, rect }) => {
      const node = barRefs.current.get(barId);
      if (!node) return;
      const nextRect = node.getBoundingClientRect();
      const deltaX = rect.left - nextRect.left;
      const deltaY = rect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      node.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px) scale(1.02)`, boxShadow: '0 12px 28px rgba(79, 70, 229, 0.16)' },
          { transform: 'translate(0, 0) scale(1)', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)' }
        ],
        { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    });
  }, [song.sections]);

  const captureBarRects = (sectionIndices: number[]) => {
    const uniqueBarIds = Array.from(new Set(
      sectionIndices.flatMap((sectionIndex) =>
        song.sections[sectionIndex]?.bars.map((bar) => bar.id).filter((id): id is string => Boolean(id)) || []
      )
    ));

    return uniqueBarIds
      .map((barId) => {
        const node = barRefs.current.get(barId);
        const rect = node?.getBoundingClientRect();
        return rect ? { barId, rect } : null;
      })
      .filter((entry): entry is { barId: string; rect: DOMRect } => Boolean(entry));
  };

  const getDraggedBar = (event: React.DragEvent): DragBarPayload | null => {
    const payload = event.dataTransfer.getData('application/x-chordmaster-bar');
    if (!payload) return null;

    try {
      const parsed = JSON.parse(payload) as DragBarPayload;
      return Number.isInteger(parsed?.sourceSectionIdx) && Number.isInteger(parsed?.sourceBarIdx) ? parsed : null;
    } catch {
      return null;
    }
  };

  const handleBarDragStart = (event: React.DragEvent, sIdx: number, bIdx: number) => {
    const payload: DragBarPayload = {
      sourceSectionIdx: sIdx,
      sourceBarIdx: bIdx
    };
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('application/x-chordmaster-bar', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', `Bar ${bIdx + 1}`);
  };

  const getBarInsertPosition = (event: React.DragEvent<HTMLElement>): BarInsertPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    return relativeX < rect.width / 2 ? 'before' : 'after';
  };

  const handleBarDrop = (event: React.DragEvent, sIdx: number, bIdx: number) => {
    event.preventDefault();
    const payload = getDraggedBar(event);
    setDragOverTarget(null);
    if (!payload) return;
    if (payload.sourceSectionIdx === sIdx && payload.sourceBarIdx === bIdx) return;

    const sourceSection = song.sections[payload.sourceSectionIdx];
    const targetSection = song.sections[sIdx];
    const sourceBar = sourceSection?.bars[payload.sourceBarIdx];
    if (!sourceBar || !targetSection) return;
    const insertPosition = getBarInsertPosition(event);
    const insertingAfter = insertPosition === 'after';

    const newSections = [...song.sections];
    const sourceBars = [...sourceSection.bars];
    const [movedBar] = sourceBars.splice(payload.sourceBarIdx, 1);
    if (!movedBar) return;

    if (payload.sourceSectionIdx === sIdx) {
      const destinationBars = sourceBars;
      let insertIndex = bIdx + (insertingAfter ? 1 : 0);
      if (payload.sourceBarIdx < insertIndex) {
        insertIndex -= 1;
      }
      insertIndex = Math.max(0, Math.min(destinationBars.length, insertIndex));
      destinationBars.splice(insertIndex, 0, movedBar);
      const barRects = captureBarRects([sIdx]);
      newSections[sIdx] = { ...targetSection, bars: destinationBars };
      if (barRects.length > 0) {
        pendingSwapAnimationRef.current = { barRects };
      }
      notifyChange({ ...song, sections: newSections });
      setCopiedBarHighlight({ sIdx, bIdx: insertIndex });
      return;
    }

    const destinationBars = [...targetSection.bars];
    const insertIndex = Math.max(0, Math.min(destinationBars.length, bIdx + (insertingAfter ? 1 : 0)));
    destinationBars.splice(insertIndex, 0, movedBar);
    const barRects = captureBarRects([payload.sourceSectionIdx, sIdx]);
    newSections[payload.sourceSectionIdx] = { ...sourceSection, bars: sourceBars };
    newSections[sIdx] = { ...targetSection, bars: destinationBars };
    if (barRects.length > 0) {
      pendingSwapAnimationRef.current = { barRects };
    }
    notifyChange({ ...song, sections: newSections });
    setCopiedBarHighlight({ sIdx, bIdx: insertIndex });
  };

  const handleAppendBarDrop = (event: React.DragEvent, sIdx: number) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = getDraggedBar(event);
    setDragOverTarget(null);
    if (!payload) return;

    const sourceSection = song.sections[payload.sourceSectionIdx];
    const sourceBar = sourceSection?.bars[payload.sourceBarIdx];
    if (!sourceBar) return;

    const targetSection = song.sections[sIdx];
    suppressAddBarClickRef.current = `append-${sIdx}`;
    updateSection(sIdx, { ...targetSection, bars: [...targetSection.bars, cloneBar(sourceBar)] });
    setCopiedBarHighlight({ sIdx, bIdx: targetSection.bars.length });
    window.setTimeout(() => {
      if (suppressAddBarClickRef.current === `append-${sIdx}`) {
        suppressAddBarClickRef.current = null;
      }
    }, 0);
  };

  const duplicateBarAfter = (sIdx: number, bIdx: number) => {
    const targetSection = song.sections[sIdx];
    const newBars = [...targetSection.bars];
    newBars.splice(bIdx + 1, 0, cloneBar(targetSection.bars[bIdx]));
    updateSection(sIdx, { ...targetSection, bars: newBars });
    setCopiedBarHighlight({ sIdx, bIdx: bIdx + 1 });
  };

  useEffect(() => {
    if (!copiedBarHighlight) return;
    const timer = window.setTimeout(() => setCopiedBarHighlight(null), 900);
    return () => window.clearTimeout(timer);
  }, [copiedBarHighlight]);

  const getRhythmSegments = (value: string) => {
    return Array.from(value.matchAll(/\S+/g)).map((match) => ({
      value: match[0],
      start: match.index || 0,
      end: (match.index || 0) + match[0].length
    }));
  };

  const getRhythmTokens = (sIdx: number, bIdx: number) => {
    const value = song.sections[sIdx]?.bars[bIdx]?.rhythm || '';
    return normalizeRhythmInput(value).split(/\s+/).filter(Boolean);
  };

  const getRhythmEditorEvents = (sIdx: number, bIdx: number, rhythmValue?: string): RhythmEditorEvent[] => {
    const bar = song.sections[sIdx]?.bars[bIdx];
    const parsed = parseRhythmNotation(rhythmValue ?? (bar?.rhythm || ''), getBarTimeSignature(bar));
    return parsed.events
      .filter((event) => !event.isHidden)
      .map((event) => ({
        startUnit: event.startUnit,
        durationUnits: event.durationUnits,
        base: event.base,
        isRest: event.isRest,
        dotted: event.dotted,
        accent: event.accent,
        tieAfter: event.tieAfter
      }));
  };

  const getRhythmEditorCursorUnits = (sIdx: number, bIdx: number, rhythmValue?: string) => {
    const bar = song.sections[sIdx]?.bars[bIdx];
    const parsed = parseRhythmNotation(rhythmValue ?? (bar?.rhythm || ''), getBarTimeSignature(bar));
    const events = parsed.events.filter((event) => !event.isHidden);

    if (events.length === 0) {
      return [0];
    }

    const cursorUnits: number[] = [];
    let cursor = 0;

    events.forEach((event) => {
      while (cursor < event.startUnit) {
        cursorUnits.push(cursor);
        cursor += 1;
      }
      cursorUnits.push(event.startUnit);
      cursor = event.endUnit;
    });

    cursorUnits.push(Math.min(cursor, parsed.barUnits));
    return Array.from(new Set(cursorUnits)).sort((a, b) => a - b);
  };

  const parseToolbarRhythmToken = (sIdx: number, bIdx: number, token: string): RhythmEditorEvent | null => {
    const normalized = normalizeRhythmToken(token);
    const match = normalized.match(/^(w|h|q|e|s)(r)?(\.)?(\^)?(~)?$/);
    if (!match) return null;
    const parsed = parseRhythmNotation(normalized, getBarTimeSignature(song.sections[sIdx]?.bars[bIdx]));
    const event = parsed.events[0];
    if (!event) return null;

    return {
      startUnit: 0,
      durationUnits: event.durationUnits,
      base: event.base,
      isRest: event.isRest,
      dotted: event.dotted,
      accent: event.accent,
      tieAfter: event.tieAfter
    };
  };

  const buildRhythmEditorToken = (event: RhythmEditorEvent) => (
    normalizeRhythmToken(
      `${event.base}${event.isRest ? 'r' : ''}${event.dotted ? '.' : ''}${!event.isRest && event.accent ? '^' : ''}${!event.isRest && event.tieAfter ? '~' : ''}`
    )
  );

  const createRhythmEditorEvent = (sIdx: number, bIdx: number, token: string, startUnit: number): RhythmEditorEvent | null => {
    const event = parseToolbarRhythmToken(sIdx, bIdx, token);
    if (!event) return null;
    return { ...event, startUnit };
  };

  const preserveRhythmEventModifiers = (existingEvent: RhythmEditorEvent, nextEvent: RhythmEditorEvent): RhythmEditorEvent => {
    if (nextEvent.isRest) {
      return {
        ...nextEvent,
        accent: false,
        tieAfter: false
      };
    }

    return {
      ...nextEvent,
      dotted: existingEvent.dotted,
      accent: existingEvent.accent,
      tieAfter: existingEvent.tieAfter
    };
  };

  const finalizeRhythmNotationForBar = (sIdx: number, bIdx: number, tokens: string[]) => {
    const normalized = normalizeRhythmInput(tokens.join(' '));
    if (!normalized) return '';

    const bar = song.sections[sIdx]?.bars[bIdx];
    const parsedRhythm = parseRhythmNotation(normalized, getBarTimeSignature(bar));
    return parsedRhythm.events.some((event) => !event.isHidden) ? normalized : '';
  };

  const serializeRhythmEditorEvents = (sIdx: number, bIdx: number, events: RhythmEditorEvent[]) => {
    const sortedEvents = [...events]
      .filter((event) => event.durationUnits > 0)
      .sort((a, b) => a.startUnit - b.startUnit);

    const tokens: string[] = [];
    let cursor = 0;

    sortedEvents.forEach((event) => {
      if (event.startUnit > cursor) {
        tokens.push(...buildHiddenGapTokens(event.startUnit - cursor));
      }

      tokens.push(buildRhythmEditorToken(event));
      cursor = Math.max(cursor, event.startUnit + event.durationUnits);
    });

    return finalizeRhythmNotationForBar(sIdx, bIdx, tokens);
  };

  const getRhythmBarUnits = (sIdx: number, bIdx: number, rhythmValue?: string) => {
    const bar = song.sections[sIdx]?.bars[bIdx];
    return parseRhythmNotation(rhythmValue ?? (bar?.rhythm || ''), getBarTimeSignature(bar)).barUnits;
  };

  const findRhythmEventIndexAtCursor = (events: RhythmEditorEvent[], cursorUnit: number) => (
    events.findIndex((event) => Math.abs(event.startUnit - cursorUnit) < 0.001)
  );

  const findRhythmEditableEventIndex = (events: RhythmEditorEvent[], cursorUnit: number) => {
    const exactIndex = findRhythmEventIndexAtCursor(events, cursorUnit);
    if (exactIndex !== -1) return exactIndex;

    return [...events.keys()]
      .reverse()
      .find((index) => Math.abs(events[index].startUnit + events[index].durationUnits - cursorUnit) < 0.001) ?? -1;
  };

  const getNextRhythmBoundary = (events: RhythmEditorEvent[], cursorUnit: number, barUnits: number) => (
    events.find((event) => event.startUnit > cursorUnit + 0.001)?.startUnit ?? barUnits
  );

  const getActiveRhythmCursor = (targetSelection: SelectionInfo | null = selection) => {
    if (rhythmCursor && targetSelection?.type === 'rhythm' && rhythmCursor.sIdx === targetSelection.sIdx && rhythmCursor.bIdx === targetSelection.bIdx) {
      return rhythmCursor;
    }
    if (targetSelection?.type !== 'rhythm') return null;
    const cursorUnits = getRhythmEditorCursorUnits(targetSelection.sIdx, targetSelection.bIdx);
    const cursorUnit = cursorUnits[0] ?? 0;
    return {
      sIdx: targetSelection.sIdx,
      bIdx: targetSelection.bIdx,
      cursorUnit
    };
  };

  const getSelectedRhythmTokenIndex = (targetSelection: SelectionInfo | null = selection) => {
    const activeCursor = getActiveRhythmCursor(targetSelection);
    if (activeCursor) {
      const events = getRhythmEditorEvents(activeCursor.sIdx, activeCursor.bIdx);
      return events.findIndex((event) => Math.abs(event.startUnit - activeCursor.cursorUnit) < 0.001);
    }
    return -1;
  };

  const getSelectedRhythmInsertIndex = (targetSelection: SelectionInfo | null = selection) => {
    const activeCursor = getActiveRhythmCursor(targetSelection);
    if (activeCursor) {
      return activeCursor.cursorUnit;
    }
    return -1;
  };

  const getEditableRhythmTokenContext = (targetSelection: SelectionInfo | null = selection) => {
    if (!targetSelection || targetSelection.type !== 'rhythm') {
      return { tokenIndex: -1, cursorUnit: -1 };
    }

    const cursorUnit = getSelectedRhythmInsertIndex(targetSelection);
    const events = getRhythmEditorEvents(targetSelection.sIdx, targetSelection.bIdx);

    return {
      tokenIndex: cursorUnit === -1 ? -1 : findRhythmEditableEventIndex(events, cursorUnit),
      cursorUnit
    };
  };

  const setRhythmInsertSelection = (sIdx: number, bIdx: number, value: string, insertIndex: number) => {
    const cursorUnits = getRhythmEditorCursorUnits(sIdx, bIdx, value);
    const safeCursorUnit = cursorUnits.includes(insertIndex)
      ? insertIndex
      : cursorUnits.reduce((closest, unit) => (
        Math.abs(unit - insertIndex) < Math.abs(closest - insertIndex) ? unit : closest
      ), cursorUnits[0] ?? 0);
    setRhythmCursor({ sIdx, bIdx, cursorUnit: safeCursorUnit });

    setSelection({
      sIdx,
      bIdx,
      start: 0,
      end: 0,
      text: '',
      type: 'rhythm'
    });
  };

  const focusRhythmEditor = (sIdx: number, bIdx: number) => {
    const value = song.sections[sIdx]?.bars[bIdx]?.rhythm || '';
    if (selection?.type === 'rhythm' && selection.sIdx === sIdx && selection.bIdx === bIdx && rhythmCursor) {
      return;
    }

    const cursorUnits = getRhythmEditorCursorUnits(sIdx, bIdx, value);
    setRhythmInsertSelection(sIdx, bIdx, value, cursorUnits[cursorUnits.length - 1] ?? 0);
  };

  const moveRhythmSelection = (direction: -1 | 1) => {
    if (!selection || selection.type !== 'rhythm') return;

    const value = song.sections[selection.sIdx]?.bars[selection.bIdx]?.rhythm || '';
    const cursorUnits = getRhythmEditorCursorUnits(selection.sIdx, selection.bIdx);
    const activeCursor = getActiveRhythmCursor(selection);
    const currentUnit = activeCursor?.cursorUnit ?? getSelectedRhythmInsertIndex(selection);
    if (currentUnit === -1) return;

    const currentUnitIndex = cursorUnits.findIndex((unit) => unit === currentUnit);
    if (currentUnitIndex === -1) return;

    const nextUnitIndex = Math.max(0, Math.min(cursorUnits.length - 1, currentUnitIndex + direction));
    setRhythmInsertSelection(selection.sIdx, selection.bIdx, value, cursorUnits[nextUnitIndex]);
  };

  const getRhythmSelectionLabel = () => {
    if (!selection || selection.type !== 'rhythm') {
      return selection?.text || '';
    }

    const events = getRhythmEditorEvents(selection.sIdx, selection.bIdx);
    const activeCursor = getActiveRhythmCursor(selection);
    const cursorUnit = activeCursor?.cursorUnit ?? getSelectedRhythmInsertIndex(selection);
    const { tokenIndex } = getEditableRhythmTokenContext(selection);
    const event = tokenIndex >= 0 ? events[tokenIndex] : null;

    if (!event) {
      if (cursorUnit !== -1) {
        const cursorUnits = getRhythmEditorCursorUnits(selection.sIdx, selection.bIdx);
        return cursorUnit === (cursorUnits[cursorUnits.length - 1] ?? -1) ? 'End Slot' : 'Slot';
      }
      return 'Insert';
    }

    const baseLabel: Record<RhythmEditorEvent['base'], string> = {
      w: 'Whole',
      h: 'Half',
      q: 'Quarter',
      e: 'Eighth',
      s: 'Sixteenth'
    };
    const parts = [`${event.isRest ? 'Rest' : baseLabel[event.base]}${event.dotted ? ' dot' : ''}`];

    if (event.accent) parts.push('accent');
    if (event.tieAfter) parts.push('tie');

    return parts.join(' · ');
  };

  const getSelectedRhythmEditorEvent = (targetSelection: SelectionInfo | null = selection) => {
    if (!targetSelection || targetSelection.type !== 'rhythm') return null;
    const { tokenIndex } = getEditableRhythmTokenContext(targetSelection);
    if (tokenIndex === -1) return null;
    return getRhythmEditorEvents(targetSelection.sIdx, targetSelection.bIdx)[tokenIndex] || null;
  };

  const handleRhythmInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, sIdx: number, bIdx: number) => {
    if (e.key === 'Tab') {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-rhythm-input]'));
      const idx = inputs.indexOf(e.currentTarget);

      if (e.shiftKey) {
        if (idx > 0) {
          e.preventDefault();
          inputs[idx - 1].focus();
          focusRhythmEditor(
            Number(inputs[idx - 1].dataset.sidx),
            Number(inputs[idx - 1].dataset.bidx)
          );
        }
      } else if (idx < inputs.length - 1) {
        e.preventDefault();
        inputs[idx + 1].focus();
        focusRhythmEditor(
          Number(inputs[idx + 1].dataset.sidx),
          Number(inputs[idx + 1].dataset.bidx)
        );
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveRhythmSelection(-1);
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveRhythmSelection(1);
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      setRhythmInsertSelection(sIdx, bIdx, song.sections[sIdx]?.bars[bIdx]?.rhythm || '', 0);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      focusRhythmEditor(sIdx, bIdx);
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      clearRhythmSelection(e.key === 'Backspace' ? 'backspace' : 'delete');
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setSelection(null);
    }
  };

  const setRhythmSelection = (sIdx: number, bIdx: number, tokens: string[], tokenIndex: number) => {
    setRhythmInsertSelection(sIdx, bIdx, tokens.join(' '), tokenIndex);
  };

  const HIDDEN_GAP_TOKEN_CANDIDATES = [
    { halfUnits: 48, token: 'wx.' },
    { halfUnits: 32, token: 'wx' },
    { halfUnits: 24, token: 'hx.' },
    { halfUnits: 16, token: 'hx' },
    { halfUnits: 12, token: 'qx.' },
    { halfUnits: 8, token: 'qx' },
    { halfUnits: 6, token: 'ex.' },
    { halfUnits: 4, token: 'ex' },
    { halfUnits: 3, token: 'sx.' },
    { halfUnits: 2, token: 'sx' }
  ] as const;

  const buildHiddenGapTokens = (durationUnits: number): string[] => {
    const targetHalfUnits = Math.max(0, Math.round(durationUnits * 2));
    const memo = new Map<string, string[] | null>();

    const solve = (remainingHalfUnits: number, startIndex: number): string[] | null => {
      if (remainingHalfUnits === 0) return [];
      if (remainingHalfUnits < 0 || startIndex >= HIDDEN_GAP_TOKEN_CANDIDATES.length) return null;

      const key = `${remainingHalfUnits}:${startIndex}`;
      if (memo.has(key)) {
        return memo.get(key) || null;
      }

      for (let index = startIndex; index < HIDDEN_GAP_TOKEN_CANDIDATES.length; index += 1) {
        const candidate = HIDDEN_GAP_TOKEN_CANDIDATES[index];
        if (candidate.halfUnits > remainingHalfUnits) continue;

        const next = solve(remainingHalfUnits - candidate.halfUnits, index);
        if (next) {
          const result = [candidate.token, ...next];
          memo.set(key, result);
          return result;
        }
      }

      memo.set(key, null);
      return null;
    };

    return solve(targetHalfUnits, 0) || [];
  };


  const insertRhythmToken = (token: string) => {
    if (!selection || selection.type !== 'rhythm') return;

    const activeCursor = getActiveRhythmCursor(selection);
    const template = parseToolbarRhythmToken(selection.sIdx, selection.bIdx, token);
    if (!activeCursor || !template) return;

    const barUnits = getRhythmBarUnits(selection.sIdx, selection.bIdx);
    const events = getRhythmEditorEvents(selection.sIdx, selection.bIdx);
    const cursorUnit = activeCursor.cursorUnit;
    const existingIndex = findRhythmEventIndexAtCursor(events, cursorUnit);
    let nextEvents = [...events];
    let committedEvent: RhythmEditorEvent | null = null;

    if (existingIndex !== -1) {
      const existingEvent = events[existingIndex];
      const replacement = preserveRhythmEventModifiers(existingEvent, {
        ...template,
        startUnit: existingEvent.startUnit
      });
      const nextBoundary = events[existingIndex + 1]?.startUnit ?? barUnits;
      if (replacement.startUnit + replacement.durationUnits > nextBoundary + 0.001) return;
      nextEvents.splice(existingIndex, 1, replacement);
      committedEvent = replacement;
    } else {
      const insertedEvent = {
        ...template,
        startUnit: cursorUnit
      };
      const nextBoundary = getNextRhythmBoundary(events, cursorUnit, barUnits);
      if (insertedEvent.startUnit + insertedEvent.durationUnits > nextBoundary + 0.001) return;

      const insertAt = events.findIndex((event) => event.startUnit > cursorUnit + 0.001);
      if (insertAt === -1) {
        nextEvents.push(insertedEvent);
      } else {
        nextEvents.splice(insertAt, 0, insertedEvent);
      }
      committedEvent = insertedEvent;
    }

    const nextRhythm = serializeRhythmEditorEvents(selection.sIdx, selection.bIdx, nextEvents);
    updateBar(selection.sIdx, selection.bIdx, { rhythm: nextRhythm || undefined });
    setRhythmInsertSelection(
      selection.sIdx,
      selection.bIdx,
      nextRhythm,
      Math.min(barUnits, (committedEvent?.startUnit ?? cursorUnit) + (committedEvent?.durationUnits ?? 0))
    );
  };

  const toggleRhythmDot = () => {
    if (!selection || selection.type !== 'rhythm') return;

    const events = getRhythmEditorEvents(selection.sIdx, selection.bIdx);
    const { tokenIndex: targetIndex } = getEditableRhythmTokenContext(selection);
    if (targetIndex === -1) return;
    const event = events[targetIndex];
    const nextEvent = createRhythmEditorEvent(
      selection.sIdx,
      selection.bIdx,
      `${event.base}${event.isRest ? 'r' : ''}${event.dotted ? '' : '.'}${!event.isRest && event.accent ? '^' : ''}${!event.isRest && event.tieAfter ? '~' : ''}`,
      event.startUnit
    );
    if (!nextEvent) return;

    const barUnits = getRhythmBarUnits(selection.sIdx, selection.bIdx);
    const nextBoundary = events[targetIndex + 1]?.startUnit ?? barUnits;
    if (nextEvent.startUnit + nextEvent.durationUnits > nextBoundary + 0.001) return;

    const nextEvents = [...events];
    nextEvents.splice(targetIndex, 1, nextEvent);
    const nextRhythm = serializeRhythmEditorEvents(selection.sIdx, selection.bIdx, nextEvents);
    const nextBarUnits = getRhythmBarUnits(selection.sIdx, selection.bIdx, nextRhythm);

    updateBar(selection.sIdx, selection.bIdx, { rhythm: nextRhythm || undefined });
    setRhythmInsertSelection(
      selection.sIdx,
      selection.bIdx,
      nextRhythm,
      Math.min(nextBarUnits, nextEvent.startUnit + nextEvent.durationUnits)
    );
  };

  const toggleRhythmModifier = (modifier: '^' | '~') => {
    if (!selection || selection.type !== 'rhythm') return;

    const events = getRhythmEditorEvents(selection.sIdx, selection.bIdx);
    const { tokenIndex: targetIndex } = getEditableRhythmTokenContext(selection);
    if (targetIndex === -1) return;

    const event = events[targetIndex];
    if (event.isRest) return;

    const nextEvents = [...events];
    nextEvents.splice(targetIndex, 1, {
      ...event,
      accent: modifier === '^' ? !event.accent : event.accent,
      tieAfter: modifier === '~' ? !event.tieAfter : event.tieAfter
    });

    const nextRhythm = serializeRhythmEditorEvents(selection.sIdx, selection.bIdx, nextEvents);
    updateBar(selection.sIdx, selection.bIdx, { rhythm: nextRhythm || undefined });
    setRhythmInsertSelection(selection.sIdx, selection.bIdx, nextRhythm, event.startUnit);
  };

  const toggleRhythmAccent = () => toggleRhythmModifier('^');
  const toggleRhythmTie = () => toggleRhythmModifier('~');

  const clearRhythmSelection = (mode: 'backspace' | 'delete' = 'delete') => {
    if (!selection || selection.type !== 'rhythm') return;

    const events = getRhythmEditorEvents(selection.sIdx, selection.bIdx);
    const cursorUnit = getSelectedRhythmInsertIndex(selection);
    if (cursorUnit === -1) return;

    let deleteIndex = findRhythmEventIndexAtCursor(events, cursorUnit);
    if (deleteIndex === -1) {
      deleteIndex = [...events.keys()]
        .reverse()
        .find((index) => events[index].startUnit < cursorUnit - 0.001) ?? -1;
    }
    if (deleteIndex === -1 && mode === 'delete') {
      deleteIndex = events.findIndex((event) => event.startUnit > cursorUnit + 0.001);
    }
    if (deleteIndex === -1) return;

    const deletedEvent = events[deleteIndex];
    const nextEvents = events.filter((_, index) => index !== deleteIndex);
    const nextRhythm = serializeRhythmEditorEvents(selection.sIdx, selection.bIdx, nextEvents);
    const previousEvent = nextEvents
      .filter((event) => event.startUnit < deletedEvent.startUnit - 0.001)
      .at(-1);
    const nextCursorUnit = previousEvent?.startUnit ?? 0;

    updateBar(selection.sIdx, selection.bIdx, { rhythm: nextRhythm || undefined });
    setRhythmInsertSelection(selection.sIdx, selection.bIdx, nextRhythm, nextCursorUnit);
  };

  const getRiffValue = (sIdx: number, bIdx: number) => (
    song.sections[sIdx]?.bars[bIdx]?.riff || ''
  );

  const getJianpuBarTiming = (sIdx: number, bIdx: number) => {
    const { beats, beatUnits } = parseTimeSignature(getBarTimeSignature(song.sections[sIdx]?.bars[bIdx]));
    return { beats, beatUnits };
  };

  const getJianpuNoteUnits = (note: Pick<JianpuNoteRange, 'duration' | 'dotted'>) => {
    const baseUnits = note.duration === 'quarter' ? 4 : note.duration === 'eighth' ? 2 : 1;
    return baseUnits + (note.dotted ? baseUnits / 2 : 0);
  };

  const getJianpuDurationUnits = (duration: JianpuDuration, dotted = false) => (
    getJianpuNoteUnits({ duration, dotted })
  );

  const getCanonicalBeatTokens = (value: string, sIdx: number, bIdx: number) => {
    const { beats } = getJianpuBarTiming(sIdx, bIdx);
    const normalized = value.replace(/\s+/g, ' ').trim();
    const rawTokens = normalized.includes('|')
      ? normalized.split('|').map((token) => token.trim())
      : normalized ? normalized.split(' ').map((token) => token.trim()) : [];

    return Array.from({ length: beats }, (_, index) => rawTokens[index] || '');
  };

  const serializeBeatTokens = (tokens: string[]) => {
    const lastNonEmptyIndex = tokens.reduce((last, token, index) => (token.trim() ? index : last), -1);
    if (lastNonEmptyIndex === -1) return '';
    return tokens.slice(0, lastNonEmptyIndex + 1).join(' | ');
  };

  const getBeatTokenRanges = (value: string, sIdx: number, bIdx: number) => {
    const tokens = getCanonicalBeatTokens(value, sIdx, bIdx);
    let cursor = 0;

    return tokens.map((token, beatIndex) => {
      const start = cursor;
      const end = start + token.length;
      cursor = end + 3;
      return { beatIndex, token, start, end };
    });
  };

  const getBeatIndexFromCaret = (value: string, sIdx: number, bIdx: number, caret: number) => {
    const beatRanges = getBeatTokenRanges(value, sIdx, bIdx);
    const containing = beatRanges.find((range) => caret >= range.start && caret <= range.end);
    if (containing) return containing.beatIndex;

    return beatRanges.reduce((closest, range) => (
      Math.abs(caret - range.start) < Math.abs(caret - beatRanges[closest].start) ? range.beatIndex : closest
    ), 0);
  };

  const getBeatNoteRanges = (value: string, sIdx: number, bIdx: number) => {
    const beatRanges = getBeatTokenRanges(value, sIdx, bIdx);
    return beatRanges.map((range) => {
      const localNotes = findJianpuNoteRanges(range.token).map((note) => ({
        ...note,
        start: note.start + range.start,
        end: note.end + range.start
      }));
      const usedUnits = localNotes.reduce((sum, note) => sum + getJianpuNoteUnits(note), 0);

      return {
        beatIndex: range.beatIndex,
        token: range.token,
        start: range.start,
        end: range.end,
        notes: localNotes,
        usedUnits
      };
    });
  };

  const setRiffSelectionRange = (sIdx: number, bIdx: number, value: string, start: number, end: number) => {
    const beatIndex = getBeatIndexFromCaret(value, sIdx, bIdx, start);
    setJianpuCursor({ sIdx, bIdx, beatIndex });
    markActiveBar(sIdx, bIdx);
    setSelection({
      sIdx,
      bIdx,
      start,
      end,
      text: value.slice(start, end),
      type: 'riff'
    });
  };

  const getAdjacentRiffBarWithNotes = (sIdx: number, bIdx: number, direction: -1 | 1) => {
    const bars = song.sections[sIdx]?.bars ?? [];
    if (!bars.length) return null;

    for (
      let index = bIdx + direction;
      index >= 0 && index < bars.length;
      index += direction
    ) {
      const riff = getRiffValue(sIdx, index);
      const notes = getBeatNoteRanges(riff, sIdx, index).flatMap((beat) => beat.notes);
      if (notes.length > 0) {
        return {
          sIdx,
          bIdx: index,
          riff,
          notes
        };
      }
    }

    return null;
  };

  const getRiffNavigationTargetsInBar = (sIdx: number, bIdx: number) => {
    const riff = getRiffValue(sIdx, bIdx);
    const beatData = getBeatNoteRanges(riff, sIdx, bIdx);

    return beatData.flatMap((beat) => {
      const placeholders = findJianpuPlaceholderRanges(beat.token).map((placeholder) => ({
        sIdx,
        bIdx,
        riff,
        start: beat.start + placeholder.start,
        end: beat.start + placeholder.start
      }));
      const noteTargets = beat.notes.map((note) => ({
        sIdx,
        bIdx,
        riff,
        start: note.start,
        end: note.end
      }));
      const combinedTargets = [...noteTargets, ...placeholders].sort((a, b) => a.start - b.start || a.end - b.end);

      if (combinedTargets.length > 0) {
        return combinedTargets;
      }

      return [{
        sIdx,
        bIdx,
        riff,
        start: beat.start,
        end: beat.start
      }];
    });
  };

  const getAdjacentRiffNavigationTarget = (sIdx: number, bIdx: number, direction: -1 | 1) => {
    const bars = song.sections[sIdx]?.bars ?? [];
    if (!bars.length) return null;

    for (
      let index = bIdx + direction;
      index >= 0 && index < bars.length;
      index += direction
    ) {
      const bar = bars[index];
      if (!getBarPanelState(bar, sIdx, index).riff) continue;

      const targets = getRiffNavigationTargetsInBar(sIdx, index);
      if (targets.length === 0) continue;
      return direction > 0 ? targets[0] : targets[targets.length - 1];
    }

    return null;
  };

  const applyRiffNavigationTarget = (target: { sIdx: number; bIdx: number; riff: string; start: number; end: number }) => {
    if (target.start === target.end) {
      setRiffCaretSelection(target.sIdx, target.bIdx, target.riff, target.start);
      return;
    }

    setRiffSelectionRange(target.sIdx, target.bIdx, target.riff, target.start, target.end);
  };

  const setRiffCaretSelection = (sIdx: number, bIdx: number, value: string, caret: number) => {
    setRiffSelectionRange(sIdx, bIdx, value, caret, caret);
  };

  const getSelectedJianpuNote = (targetSelection: SelectionInfo | null = selection, sourceValue?: string): JianpuNoteRange | null => {
    if (!targetSelection || targetSelection.type !== 'riff') return null;

    const riff = sourceValue ?? getRiffValue(targetSelection.sIdx, targetSelection.bIdx);
    return findJianpuNoteRanges(riff).find((note) => (
      note.start === targetSelection.start && note.end === targetSelection.end
    )) || null;
  };

  type JianpuNoteRef = {
    sIdx: number;
    bIdx: number;
    riff: string;
    note: JianpuNoteRange;
    beatIndex: number;
    orderIndex: number;
  };

  const getJianpuNotesInBar = (sIdx: number, bIdx: number, riff: string) => (
    getBeatNoteRanges(riff, sIdx, bIdx)
      .flatMap((beat) => beat.notes.map((note) => ({
        ...note,
        beatIndex: beat.beatIndex
      })))
      .sort((a, b) => a.start - b.start || a.end - b.end)
  );

  const getJianpuNoteRefAtSelection = (
    targetSelection: SelectionInfo | null = selection,
    sourceValue?: string
  ): JianpuNoteRef | null => {
    if (!targetSelection || targetSelection.type !== 'riff') return null;

    const riff = sourceValue ?? getRiffValue(targetSelection.sIdx, targetSelection.bIdx);
    const notes = getJianpuNotesInBar(targetSelection.sIdx, targetSelection.bIdx, riff);
    const orderIndex = notes.findIndex((note) => (
      note.start === targetSelection.start && note.end === targetSelection.end
    ));
    if (orderIndex === -1) return null;

    return {
      sIdx: targetSelection.sIdx,
      bIdx: targetSelection.bIdx,
      riff,
      note: notes[orderIndex],
      beatIndex: notes[orderIndex].beatIndex,
      orderIndex
    };
  };

  const getAdjacentJianpuNoteRef = (
    noteRef: JianpuNoteRef,
    direction: -1 | 1
  ): JianpuNoteRef | null => {
    const sectionBars = song.sections[noteRef.sIdx]?.bars ?? [];
    if (!sectionBars.length) return null;

    const currentBarNotes = getJianpuNotesInBar(noteRef.sIdx, noteRef.bIdx, noteRef.riff);
    const nextIndexInBar = noteRef.orderIndex + direction;
    if (nextIndexInBar >= 0 && nextIndexInBar < currentBarNotes.length) {
      return {
        ...noteRef,
        note: currentBarNotes[nextIndexInBar],
        beatIndex: currentBarNotes[nextIndexInBar].beatIndex,
        orderIndex: nextIndexInBar
      };
    }

    for (
      let barIndex = noteRef.bIdx + direction;
      barIndex >= 0 && barIndex < sectionBars.length;
      barIndex += direction
    ) {
      const riff = getRiffValue(noteRef.sIdx, barIndex);
      const notes = getJianpuNotesInBar(noteRef.sIdx, barIndex, riff);
      if (notes.length === 0) continue;

      const targetNote = direction > 0 ? notes[0] : notes[notes.length - 1];
      return {
        sIdx: noteRef.sIdx,
        bIdx: barIndex,
        riff,
        note: targetNote,
        beatIndex: targetNote.beatIndex,
        orderIndex: direction > 0 ? 0 : notes.length - 1
      };
    }

    return null;
  };

  const getSelectedJianpuNoteContext = (
    targetSelection: SelectionInfo | null = selection,
    sourceValue?: string
  ) => {
    const noteRef = getJianpuNoteRefAtSelection(targetSelection, sourceValue);
    if (!noteRef) return null;

    const previousNoteRef = getAdjacentJianpuNoteRef(noteRef, -1);
    const nextNoteRef = getAdjacentJianpuNoteRef(noteRef, 1);
    const isTieStart = Boolean(noteRef.note.slurStart && nextNoteRef?.note.slurEnd);
    const isTieEnd = Boolean(previousNoteRef?.note.slurStart && noteRef.note.slurEnd);

    return {
      riff: noteRef.riff,
      notes: getJianpuNotesInBar(noteRef.sIdx, noteRef.bIdx, noteRef.riff),
      currentIndex: noteRef.orderIndex,
      note: noteRef.note,
      noteRef,
      previousNote: previousNoteRef?.note ?? null,
      previousNoteRef,
      nextNote: nextNoteRef?.note ?? null,
      nextNoteRef,
      isTieStart,
      isTieEnd
    };
  };

  const commitJianpuNoteUpdates = (
    updates: Array<{ sIdx: number; bIdx: number; start: number; end: number; replacement: string }>,
    selectedTarget: { sIdx: number; bIdx: number; start: number; end: number }
  ) => {
    if (updates.length === 0) return;

    const nextSections = [...song.sections];
    const updatesByBar = new Map<string, Array<{ start: number; end: number; replacement: string }>>();

    updates.forEach((update) => {
      const key = `${update.sIdx}:${update.bIdx}`;
      const existing = updatesByBar.get(key) ?? [];
      existing.push({ start: update.start, end: update.end, replacement: update.replacement });
      updatesByBar.set(key, existing);
    });

    updatesByBar.forEach((barUpdates, key) => {
      const [sIdxText, bIdxText] = key.split(':');
      const sIdx = Number(sIdxText);
      const bIdx = Number(bIdxText);
      const section = nextSections[sIdx];
      const bars = [...section.bars];
      const currentRiff = bars[bIdx].riff || '';
      let nextRiff = currentRiff;

      barUpdates
        .sort((a, b) => b.start - a.start || b.end - a.end)
        .forEach((update) => {
          nextRiff = replaceJianpuRange(nextRiff, update.start, update.end, update.replacement);
        });

      bars[bIdx] = { ...bars[bIdx], riff: nextRiff || undefined };
      nextSections[sIdx] = { ...section, bars };
    });

    const selectedRiff = nextSections[selectedTarget.sIdx]?.bars[selectedTarget.bIdx]?.riff || '';
    notifyChange({ ...song, sections: nextSections });
    setRiffSelectionRange(
      selectedTarget.sIdx,
      selectedTarget.bIdx,
      selectedRiff,
      selectedTarget.start,
      selectedTarget.end
    );
  };

  const resolveRiffSelection = (sIdx: number, bIdx: number, value: string, start: number, end: number) => {
    const notes = getBeatNoteRanges(value, sIdx, bIdx).flatMap((beat) => beat.notes);
    const overlappingNote = notes.find((note) => note.start < end && note.end > start);
    const exactNote = notes.find((note) => note.start === start && note.end === end);
    const nextSelection = exactNote || overlappingNote;

    if (nextSelection) {
      setRiffSelectionRange(sIdx, bIdx, value, nextSelection.start, nextSelection.end);
      return;
    }

    setRiffCaretSelection(sIdx, bIdx, value, start);
  };

  const commitRiffValue = (sIdx: number, bIdx: number, nextRiff: string, nextSelection?: { start: number; end: number }) => {
    updateBar(sIdx, bIdx, { riff: nextRiff || undefined });
    if (nextSelection) {
      setRiffSelectionRange(sIdx, bIdx, nextRiff, nextSelection.start, nextSelection.end);
      return;
    }

    setRiffCaretSelection(sIdx, bIdx, nextRiff, Math.min(nextRiff.length, selection?.type === 'riff' ? selection.start : nextRiff.length));
  };

  const getContinuableEmptyNextRiffBarTarget = (sIdx: number, bIdx: number) => {
    const bars = song.sections[sIdx]?.bars ?? [];
    const nextBarIndex = bIdx + 1;
    const nextBar = bars[nextBarIndex];
    if (!nextBar) return null;
    if (!getBarPanelState(nextBar, sIdx, nextBarIndex).riff) return null;

    const nextRiff = getRiffValue(sIdx, nextBarIndex);
    if (nextRiff.trim()) return null;

    return {
      sIdx,
      bIdx: nextBarIndex,
      riff: nextRiff,
      start: 0,
      end: 0
    };
  };

  const getNextRiffTargetInBar = (
    sIdx: number,
    bIdx: number,
    riff: string,
    currentStart: number,
    currentEnd: number
  ) => {
    const beatData = getBeatNoteRanges(riff, sIdx, bIdx);
    const { beatUnits } = getJianpuBarTiming(sIdx, bIdx);
    const currentBeat = beatData.find((beat) => (
      beat.notes.some((note) => note.start === currentStart && note.end === currentEnd)
    ));
    if (!currentBeat) {
      return { start: currentStart, end: currentEnd };
    }

    const beatTargets = [
      ...currentBeat.notes.map((note) => ({ start: note.start, end: note.end })),
      ...findJianpuPlaceholderRanges(currentBeat.token).map((placeholder) => ({
        start: currentBeat.start + placeholder.start,
        end: currentBeat.start + placeholder.start
      }))
    ].sort((a, b) => a.start - b.start || a.end - b.end);
    const currentBeatTargetIndex = beatTargets.findIndex((target) => target.start === currentStart && target.end === currentEnd);
    const nextTargetInBeat = currentBeatTargetIndex >= 0 ? beatTargets[currentBeatTargetIndex + 1] : null;
    if (nextTargetInBeat) {
      return {
        start: nextTargetInBeat.start,
        end: nextTargetInBeat.end
      };
    }

    if (currentBeat.usedUnits < beatUnits - 0.001) {
      return {
        start: currentBeat.end,
        end: currentBeat.end
      };
    }

    const currentBeatIndex = beatData.findIndex((beat) => beat.beatIndex === currentBeat.beatIndex);
    if (currentBeatIndex === -1) {
      return { start: currentStart, end: currentEnd };
    }

    const nextBeat = beatData[currentBeatIndex + 1];
    if (!nextBeat) {
      return { start: currentStart, end: currentEnd };
    }

    const nextBeatTargets = [
      ...nextBeat.notes.map((note) => ({ start: note.start, end: note.end })),
      ...findJianpuPlaceholderRanges(nextBeat.token).map((placeholder) => ({
        start: nextBeat.start + placeholder.start,
        end: nextBeat.start + placeholder.start
      }))
    ].sort((a, b) => a.start - b.start || a.end - b.end);

    if (nextBeatTargets.length > 0) {
      return nextBeatTargets[0];
    }

    return {
      start: nextBeat.start,
      end: nextBeat.start
    };
  };

  const getJianpuInsertSlotInfo = (sIdx: number, bIdx: number, riff: string, beatIndex: number, caret: number) => {
    const beatData = getBeatNoteRanges(riff, sIdx, bIdx);
    const beat = beatData[beatIndex];
    if (!beat) return null;
    const localCaret = Math.max(0, caret - beat.start);
    const slotItems = [
      ...beat.notes.map((note) => ({
        start: note.start - beat.start,
        end: note.end - beat.start,
        units: getJianpuNoteUnits(note)
      })),
      ...findJianpuPlaceholderRanges(beat.token).map((placeholder) => ({
        start: placeholder.start,
        end: placeholder.end,
        units: getJianpuNoteUnits(placeholder)
      }))
    ].sort((a, b) => a.start - b.start || a.end - b.end);
    const unitsBeforeCaret = slotItems.reduce((sum, item) => (
      item.end <= localCaret ? sum + item.units : sum
    ), 0);

    return {
      tokenIndex: beatIndex,
      slotIndex: Math.max(0, Math.min(3, Math.round(unitsBeforeCaret))),
      slotCount: 4
    };
  };

  const getJianpuInsertAvailability = (sIdx: number, bIdx: number, riff: string, beatIndex: number, caret?: number) => {
    const beatData = getBeatNoteRanges(riff, sIdx, bIdx);
    const beat = beatData[beatIndex];
    const { beatUnits } = getJianpuBarTiming(sIdx, bIdx);
    const localCaret = beat && typeof caret === 'number'
      ? Math.max(0, caret - beat.start)
      : null;
    const placeholderAtCaret = beat && localCaret !== null
      ? findPlaceholderAtCaret(beat.token, localCaret)
      : null;

    if (placeholderAtCaret) {
      const availablePlaceholderUnits = getAvailablePlaceholderUnitsAtCaret(beat.token, placeholderAtCaret.start);
      return {
        remainingUnits: 0,
        canQuarter: availablePlaceholderUnits + 0.001 >= getJianpuDurationUnits('quarter', jianpuInputMode.dotted),
        canEighth: availablePlaceholderUnits + 0.001 >= getJianpuDurationUnits('eighth', jianpuInputMode.dotted),
        canSixteenth: availablePlaceholderUnits + 0.001 >= getJianpuDurationUnits('sixteenth', jianpuInputMode.dotted),
        canDot: availablePlaceholderUnits + 0.001 >= getJianpuDurationUnits(jianpuInputMode.duration, true)
      };
    }

    const remainingUnits = Math.max(0, beatUnits - (beat?.usedUnits ?? 0));

    return {
      remainingUnits,
      canQuarter: remainingUnits + 0.001 >= getJianpuDurationUnits('quarter', jianpuInputMode.dotted),
      canEighth: remainingUnits + 0.001 >= getJianpuDurationUnits('eighth', jianpuInputMode.dotted),
      canSixteenth: remainingUnits + 0.001 >= getJianpuDurationUnits('sixteenth', jianpuInputMode.dotted),
      canDot: remainingUnits + 0.001 >= getJianpuDurationUnits(jianpuInputMode.duration, true)
    };
  };

  const normalizeRiffBeatTokenAfterRemoval = (token: string) => (
    findJianpuNoteRanges(token).length === 0 ? '' : token
  );

  const findPlaceholderAtCaret = (token: string, localCaret: number) => (
    findJianpuPlaceholderRanges(token).find((placeholder) => placeholder.start === localCaret)
    || findJianpuPlaceholderRanges(token).find((placeholder) => localCaret >= placeholder.start && localCaret <= placeholder.end)
    || null
  );

  const getAvailablePlaceholderUnitsAtCaret = (token: string, localCaret: number) => {
    const placeholders = findJianpuPlaceholderRanges(token)
      .filter((placeholder) => placeholder.start >= localCaret)
      .sort((a, b) => a.start - b.start);

    let expectedStart = localCaret;
    let availableUnits = 0;

    placeholders.forEach((placeholder) => {
      if (placeholder.start !== expectedStart) return;
      availableUnits += getJianpuNoteUnits(placeholder);
      expectedStart = placeholder.end;
    });

    return availableUnits;
  };

  const getBeatTokenUnitsLayout = (token: string) => {
    const noteRanges = findJianpuNoteRanges(token).map((note) => ({
      kind: 'note' as const,
      start: note.start,
      end: note.end,
      units: getJianpuNoteUnits(note)
    }));
    const placeholderRanges = findJianpuPlaceholderRanges(token).map((placeholder) => ({
      kind: 'placeholder' as const,
      start: placeholder.start,
      end: placeholder.end,
      units: getJianpuNoteUnits(placeholder)
    }));

    let unitCursor = 0;
    return [...noteRanges, ...placeholderRanges]
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .map((entry) => {
        const unitStart = unitCursor;
        unitCursor += entry.units;
        return {
          ...entry,
          unitStart,
          unitEnd: unitCursor
        };
      });
  };

  const commitRiffValueWithContinuation = (
    sIdx: number,
    bIdx: number,
    nextRiff: string,
    currentSelection: { start: number; end: number }
  ) => {
    const nextTargetInBar = getNextRiffTargetInBar(
      sIdx,
      bIdx,
      nextRiff,
      currentSelection.start,
      currentSelection.end
    );

    const advancedWithinBar = (
      nextTargetInBar.start !== currentSelection.start ||
      nextTargetInBar.end !== currentSelection.end
    );

    updateBar(sIdx, bIdx, { riff: nextRiff || undefined });

    if (advancedWithinBar) {
      setRiffSelectionRange(sIdx, bIdx, nextRiff, nextTargetInBar.start, nextTargetInBar.end);
      return;
    }

    const nextBarTarget = getContinuableEmptyNextRiffBarTarget(sIdx, bIdx);
    if (nextBarTarget) {
      setRiffCaretSelection(nextBarTarget.sIdx, nextBarTarget.bIdx, nextBarTarget.riff, nextBarTarget.start);
      return;
    }

    setRiffSelectionRange(sIdx, bIdx, nextRiff, currentSelection.start, currentSelection.end);
  };

  const updateSelectedJianpuNote = (transform: (note: JianpuNoteRange) => string) => {
    if (!selection || selection.type !== 'riff') return;

    const riff = getRiffValue(selection.sIdx, selection.bIdx);
    const note = getSelectedJianpuNote(selection, riff);
    if (!note) return;

    const beat = getBeatNoteRanges(riff, selection.sIdx, selection.bIdx)
      .find((entry) => entry.notes.some((entryNote) => entryNote.start === note.start && entryNote.end === note.end));
    if (!beat) return;

    const replacement = transform(note);
    const replacementNote = findJianpuNoteRanges(replacement)[0];
    if (!replacementNote) return;
    const nextUsedUnits = beat.usedUnits - getJianpuNoteUnits(note) + getJianpuNoteUnits(replacementNote);
    const { beatUnits } = getJianpuBarTiming(selection.sIdx, selection.bIdx);
    if (nextUsedUnits > beatUnits + 0.001) return;

    const localStart = note.start - beat.start;
    const localEnd = note.end - beat.start;
    const tokenLayout = getBeatTokenUnitsLayout(beat.token);
    const currentEntry = tokenLayout.find((entry) => entry.kind === 'note' && entry.start === localStart && entry.end === localEnd);
    if (!currentEntry) return;

    const oldUnits = getJianpuNoteUnits(note);
    const newUnits = getJianpuNoteUnits(replacementNote);
    let replacementEnd = localEnd;
    let suffix = '';

    if (newUnits > oldUnits) {
      let unitsToConsume = newUnits - oldUnits;
      const followingPlaceholders = tokenLayout.filter((entry) => (
        entry.kind === 'placeholder' &&
        entry.unitStart >= currentEntry.unitEnd
      ));

      for (const placeholder of followingPlaceholders) {
        if (placeholder.unitStart !== currentEntry.unitEnd + (newUnits - oldUnits - unitsToConsume)) break;
        replacementEnd = placeholder.end;
        unitsToConsume -= placeholder.units;
        if (unitsToConsume <= 0.001) break;
      }

      if (unitsToConsume > 0.001) return;
    } else if (newUnits < oldUnits) {
      suffix = 's'.repeat(Math.max(1, Math.round(oldUnits - newUnits)));
    }

    const nextToken = replaceJianpuRange(beat.token, localStart, replacementEnd, `${replacement}${suffix}`);
    const nextRiff = replaceJianpuRange(riff, beat.start, beat.end, nextToken);
    commitRiffValue(selection.sIdx, selection.bIdx, nextRiff, {
      start: note.start,
      end: note.start + replacement.length
    });
  };

  const moveRiffSelection = (direction: -1 | 1) => {
    if (!selection || selection.type !== 'riff') return;

    const targets = getRiffNavigationTargetsInBar(selection.sIdx, selection.bIdx);
    if (targets.length === 0) {
      const adjacentTarget = getAdjacentRiffNavigationTarget(selection.sIdx, selection.bIdx, direction);
      if (!adjacentTarget) return;
      applyRiffNavigationTarget(adjacentTarget);
      return;
    }

    const currentIndex = targets.findIndex((target) => (
      target.start === selection.start && target.end === selection.end
    ));

    if (currentIndex === -1) {
      const nextTarget = direction > 0
        ? targets.find((target) => target.start >= selection.end)
        : [...targets].reverse().find((target) => target.end <= selection.start);
      if (nextTarget) {
        applyRiffNavigationTarget(nextTarget);
        return;
      }

      const adjacentTarget = getAdjacentRiffNavigationTarget(selection.sIdx, selection.bIdx, direction);
      if (!adjacentTarget) return;
      applyRiffNavigationTarget(adjacentTarget);
      return;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < targets.length) {
      applyRiffNavigationTarget(targets[nextIndex]);
      return;
    }

    const adjacentTarget = getAdjacentRiffNavigationTarget(selection.sIdx, selection.bIdx, direction);
    if (!adjacentTarget) return;
    applyRiffNavigationTarget(adjacentTarget);
  };

  const insertOrReplaceJianpuPitch = (pitch: string) => {
    if (!selection || selection.type !== 'riff') return;

    const riff = getRiffValue(selection.sIdx, selection.bIdx);
    const selectedNote = getSelectedJianpuNote(selection, riff);
    const replacement = selectedNote
      ? rebuildJianpuNote(selectedNote, {
          pitch,
          duration: jianpuInputMode.duration,
          octave: jianpuInputMode.octave
        })
      : buildJianpuNoteFromMode(pitch, jianpuInputMode);
    const replacementNote = findJianpuNoteRanges(replacement)[0];
    if (!replacementNote) return;

    const beatTokens = getCanonicalBeatTokens(riff, selection.sIdx, selection.bIdx);
    const beatData = getBeatNoteRanges(riff, selection.sIdx, selection.bIdx);
    const { beatUnits } = getJianpuBarTiming(selection.sIdx, selection.bIdx);

    if (selectedNote) {
      const beat = beatData.find((entry) => entry.notes.some((entryNote) => entryNote.start === selectedNote.start && entryNote.end === selectedNote.end));
      if (!beat) return;

      const nextUsedUnits = beat.usedUnits - getJianpuNoteUnits(selectedNote) + getJianpuNoteUnits(replacementNote);
      if (nextUsedUnits > beatUnits + 0.001) return;

      const localNote = findJianpuNoteRanges(beat.token)
        .find((note) => beat.start + note.start === selectedNote.start && beat.start + note.end === selectedNote.end);
      if (!localNote) return;

      beatTokens[beat.beatIndex] = replaceJianpuRange(beat.token, localNote.start, localNote.end, replacement);
      const nextRiff = serializeBeatTokens(beatTokens);
      const currentSelection = {
        start: selectedNote.start,
        end: selectedNote.start + replacement.length
      };
      commitRiffValueWithContinuation(
        selection.sIdx,
        selection.bIdx,
        nextRiff,
        currentSelection
      );
      return;
    }

    const startingBeatIndex = (jianpuCursor && jianpuCursor.sIdx === selection.sIdx && jianpuCursor.bIdx === selection.bIdx)
      ? jianpuCursor.beatIndex
      : getBeatIndexFromCaret(riff, selection.sIdx, selection.bIdx, selection.start);
    const startingBeat = beatData[startingBeatIndex];
    const localCaret = startingBeat ? Math.max(0, selection.start - startingBeat.start) : 0;
    const placeholderAtCaret = startingBeat ? findPlaceholderAtCaret(startingBeat.token, localCaret) : null;
    const replacementUnits = getJianpuNoteUnits(replacementNote);

    if (startingBeat && placeholderAtCaret) {
      const availablePlaceholderUnits = getAvailablePlaceholderUnitsAtCaret(startingBeat.token, placeholderAtCaret.start);
      if (replacementUnits > availablePlaceholderUnits + 0.001) {
        return;
      }

      beatTokens[startingBeatIndex] = replaceJianpuRange(
        startingBeat.token,
        placeholderAtCaret.start,
        placeholderAtCaret.start + Math.max(1, Math.round(replacementUnits)),
        replacement
      );
      const nextRiff = serializeBeatTokens(beatTokens);
      const nextBeatRanges = getBeatTokenRanges(nextRiff, selection.sIdx, selection.bIdx);
      const insertedSelection = {
        start: (nextBeatRanges[startingBeatIndex]?.start ?? 0) + placeholderAtCaret.start,
        end: (nextBeatRanges[startingBeatIndex]?.start ?? 0) + placeholderAtCaret.start + replacement.length
      };
      commitRiffValueWithContinuation(
        selection.sIdx,
        selection.bIdx,
        nextRiff,
        insertedSelection
      );
      return;
    }

    let targetBeatIndex = -1;
    const currentBeat = beatData[startingBeatIndex];
    if ((currentBeat?.usedUnits ?? 0) > 0 && (currentBeat?.usedUnits ?? 0) < beatUnits - 0.001) {
      if ((currentBeat.usedUnits + replacementUnits) > beatUnits + 0.001) {
        return;
      }
      targetBeatIndex = startingBeatIndex;
    } else {
      for (let index = startingBeatIndex; index < beatTokens.length; index += 1) {
        const beat = beatData[index];
        const usedUnits = beat?.usedUnits ?? 0;
        if (usedUnits + replacementUnits <= beatUnits + 0.001) {
          targetBeatIndex = index;
          break;
        }
      }
    }

    if (targetBeatIndex === -1) return;

    const targetBeatRange = beatData[targetBeatIndex];
    const insertionLocalStart = targetBeatIndex === startingBeatIndex && targetBeatRange
      ? Math.max(0, Math.min(beatTokens[targetBeatIndex].length, selection.start - targetBeatRange.start))
      : beatTokens[targetBeatIndex].length;
    const nextBeatToken = replaceJianpuRange(
      beatTokens[targetBeatIndex],
      insertionLocalStart,
      insertionLocalStart,
      replacement
    );
    const filledUnits = findJianpuNoteRanges(nextBeatToken)
      .reduce((sum, note) => sum + getJianpuNoteUnits(note), 0);
    const remainingUnits = Math.max(0, beatUnits - filledUnits);
    beatTokens[targetBeatIndex] = nextBeatToken + 's'.repeat(Math.round(remainingUnits));
    const nextRiff = serializeBeatTokens(beatTokens);
    const nextBeatRanges = getBeatTokenRanges(nextRiff, selection.sIdx, selection.bIdx);
    const insertedSelection = {
      start: (nextBeatRanges[targetBeatIndex]?.start ?? 0) + insertionLocalStart,
      end: (nextBeatRanges[targetBeatIndex]?.start ?? 0) + insertionLocalStart + replacement.length
    };
    commitRiffValueWithContinuation(
      selection.sIdx,
      selection.bIdx,
      nextRiff,
      insertedSelection
    );
  };

  const setSelectedJianpuDuration = (duration: JianpuDuration) => {
    if (!selectedJianpuNote && selection?.type === 'riff') {
      const riff = getRiffValue(selection.sIdx, selection.bIdx);
      const activeBeatIndex = (jianpuCursor && jianpuCursor.sIdx === selection.sIdx && jianpuCursor.bIdx === selection.bIdx)
        ? jianpuCursor.beatIndex
        : getBeatIndexFromCaret(riff, selection.sIdx, selection.bIdx, selection.start);
      const availability = getJianpuInsertAvailability(selection.sIdx, selection.bIdx, riff, activeBeatIndex, selection.start);
      if (
        (duration === 'quarter' && !availability.canQuarter) ||
        (duration === 'eighth' && !availability.canEighth) ||
        (duration === 'sixteenth' && !availability.canSixteenth)
      ) {
        return;
      }
    }

    setJianpuInputMode((current) => {
      const nextDuration = current.duration === duration ? 'quarter' : duration;
      return { ...current, duration: nextDuration };
    });
    updateSelectedJianpuNote((note) => rebuildJianpuNote(note, {
      duration: note.duration === duration ? 'quarter' : duration
    }));
  };

  const setSelectedJianpuOctave = (octave: JianpuOctave) => {
    setJianpuInputMode((current) => {
      const nextOctave = current.octave === octave ? 'mid' : octave;
      return { ...current, octave: nextOctave };
    });
    updateSelectedJianpuNote((note) => rebuildJianpuNote(note, {
      octave: note.octave === octave ? 'mid' : octave
    }));
  };

  const toggleSelectedJianpuDot = () => {
    if (!selectedJianpuNote && selection?.type === 'riff') {
      const riff = getRiffValue(selection.sIdx, selection.bIdx);
      const activeBeatIndex = (jianpuCursor && jianpuCursor.sIdx === selection.sIdx && jianpuCursor.bIdx === selection.bIdx)
        ? jianpuCursor.beatIndex
        : getBeatIndexFromCaret(riff, selection.sIdx, selection.bIdx, selection.start);
      const availability = getJianpuInsertAvailability(selection.sIdx, selection.bIdx, riff, activeBeatIndex, selection.start);
      const nextDotted = !(selectedJianpuNote?.dotted ?? jianpuInputMode.dotted);
      if (nextDotted && !availability.canDot) {
        return;
      }
    }

    const nextDotted = !(selectedJianpuNote?.dotted ?? jianpuInputMode.dotted);
    setJianpuInputMode((current) => ({ ...current, dotted: nextDotted }));

    if (!selectedJianpuNote) return;
    updateSelectedJianpuNote((note) => rebuildJianpuNote(note, { dotted: nextDotted }));
  };

  const toggleSelectedJianpuSlur = () => {
    if (!selection || selection.type !== 'riff') return;

    const context = getSelectedJianpuNoteContext(selection);
    if (!context) return;

    const {
      note,
      noteRef,
      previousNote,
      previousNoteRef,
      nextNote,
      nextNoteRef,
      isTieStart,
      isTieEnd
    } = context;

    if (isTieStart && nextNote && nextNoteRef) {
      commitJianpuNoteUpdates(
        [
          {
            sIdx: noteRef.sIdx,
            bIdx: noteRef.bIdx,
            start: note.start,
            end: note.end,
            replacement: rebuildJianpuNote(note, { slurStart: false })
          },
          {
            sIdx: nextNoteRef.sIdx,
            bIdx: nextNoteRef.bIdx,
            start: nextNote.start,
            end: nextNote.end,
            replacement: rebuildJianpuNote(nextNote, { slurEnd: false })
          }
        ],
        {
          sIdx: noteRef.sIdx,
          bIdx: noteRef.bIdx,
          start: note.start,
          end: note.end
        }
      );
      return;
    }

    if (isTieEnd && previousNote && previousNoteRef) {
      commitJianpuNoteUpdates(
        [
          {
            sIdx: previousNoteRef.sIdx,
            bIdx: previousNoteRef.bIdx,
            start: previousNote.start,
            end: previousNote.end,
            replacement: rebuildJianpuNote(previousNote, { slurStart: false })
          },
          {
            sIdx: noteRef.sIdx,
            bIdx: noteRef.bIdx,
            start: note.start,
            end: note.end,
            replacement: rebuildJianpuNote(note, { slurEnd: false })
          }
        ],
        {
          sIdx: noteRef.sIdx,
          bIdx: noteRef.bIdx,
          start: note.start,
          end: note.end
        }
      );
      return;
    }

    if (!nextNote || !nextNoteRef) return;

    commitJianpuNoteUpdates(
      [
        {
          sIdx: noteRef.sIdx,
          bIdx: noteRef.bIdx,
          start: note.start,
          end: note.end,
          replacement: rebuildJianpuNote(note, { slurStart: true })
        },
        {
          sIdx: nextNoteRef.sIdx,
          bIdx: nextNoteRef.bIdx,
          start: nextNote.start,
          end: nextNote.end,
          replacement: rebuildJianpuNote(nextNote, { slurEnd: true })
        }
      ],
      {
        sIdx: noteRef.sIdx,
        bIdx: noteRef.bIdx,
        start: note.start,
        end: note.end
      }
    );
  };

  const clearSelectedJianpuFormatting = () => {
    updateSelectedJianpuNote((note) => rebuildJianpuNote(note, {
      duration: 'quarter',
      octave: 'mid',
      dotted: false,
      slurStart: false,
      slurEnd: false
    }));
    setJianpuInputMode((current) => ({ ...current, duration: 'quarter', octave: 'mid', dotted: false }));
  };

  const removeSelectedJianpuNote = () => {
    if (!selection || selection.type !== 'riff') return;

    const riff = getRiffValue(selection.sIdx, selection.bIdx);
    const note = getSelectedJianpuNote(selection, riff);
    if (!note) return;

    const beatTokens = getCanonicalBeatTokens(riff, selection.sIdx, selection.bIdx);
    const beat = getBeatNoteRanges(riff, selection.sIdx, selection.bIdx)
      .find((entry) => entry.notes.some((entryNote) => entryNote.start === note.start && entryNote.end === note.end));
    if (!beat) return;

    const localStart = note.start - beat.start;
    const localEnd = note.end - beat.start;
    const placeholder = buildJianpuPlaceholder(note.duration, note.dotted);
    beatTokens[beat.beatIndex] = normalizeRiffBeatTokenAfterRemoval(
      replaceJianpuRange(beat.token, localStart, localEnd, placeholder)
    );
    const nextRiff = serializeBeatTokens(beatTokens);
    const nextBeatRanges = getBeatTokenRanges(nextRiff, selection.sIdx, selection.bIdx);
    const nextCaret = (nextBeatRanges[beat.beatIndex]?.start ?? 0) + localStart;
    setJianpuInputMode((current) => ({
      ...current,
      duration: note.duration,
      octave: note.octave,
      dotted: note.dotted
    }));
    updateBar(selection.sIdx, selection.bIdx, { riff: nextRiff || undefined });
    setRiffCaretSelection(selection.sIdx, selection.bIdx, nextRiff, nextCaret);
  };

  const removeJianpuNoteNearCaret = (mode: 'backspace' | 'delete') => {
    if (!selection || selection.type !== 'riff') return false;

    const riff = getRiffValue(selection.sIdx, selection.bIdx);
    const beatData = getBeatNoteRanges(riff, selection.sIdx, selection.bIdx);
    const activeBeatIndex = (jianpuCursor && jianpuCursor.sIdx === selection.sIdx && jianpuCursor.bIdx === selection.bIdx)
      ? jianpuCursor.beatIndex
      : getBeatIndexFromCaret(riff, selection.sIdx, selection.bIdx, selection.start);
    const beat = beatData[activeBeatIndex];
    if (!beat || beat.notes.length === 0) return false;

    const caret = selection.start;
    const targetNote = mode === 'backspace'
      ? [...beat.notes].reverse().find((note) => note.end <= caret || note.start < caret)
      : beat.notes.find((note) => note.start >= caret || (note.start < caret && note.end > caret));
    if (!targetNote) return false;

    const beatTokens = getCanonicalBeatTokens(riff, selection.sIdx, selection.bIdx);
    const localStart = targetNote.start - beat.start;
    const localEnd = targetNote.end - beat.start;
    const placeholder = buildJianpuPlaceholder(targetNote.duration, targetNote.dotted);
    beatTokens[activeBeatIndex] = normalizeRiffBeatTokenAfterRemoval(
      replaceJianpuRange(beat.token, localStart, localEnd, placeholder)
    );
    const nextRiff = serializeBeatTokens(beatTokens);
    const nextBeatRanges = getBeatTokenRanges(nextRiff, selection.sIdx, selection.bIdx);
    setJianpuInputMode((current) => ({
      ...current,
      duration: targetNote.duration,
      octave: targetNote.octave,
      dotted: targetNote.dotted
    }));
    updateBar(selection.sIdx, selection.bIdx, { riff: nextRiff || undefined });
    setRiffCaretSelection(
      selection.sIdx,
      selection.bIdx,
      nextRiff,
      (nextBeatRanges[activeBeatIndex]?.start ?? 0) + localStart
    );
    return true;
  };

  const removeJianpuBeatToken = (mode: 'backspace' | 'delete') => {
    if (!selection || selection.type !== 'riff') return;

    const riff = getRiffValue(selection.sIdx, selection.bIdx);
    const beatTokens = getCanonicalBeatTokens(riff, selection.sIdx, selection.bIdx);
    const activeBeatIndex = (jianpuCursor && jianpuCursor.sIdx === selection.sIdx && jianpuCursor.bIdx === selection.bIdx)
      ? jianpuCursor.beatIndex
      : getBeatIndexFromCaret(riff, selection.sIdx, selection.bIdx, selection.start);

    const findBackwardIndex = () => {
      for (let index = activeBeatIndex; index >= 0; index -= 1) {
        if (beatTokens[index]?.trim()) return index;
      }
      return -1;
    };

    const findForwardIndex = () => {
      for (let index = activeBeatIndex; index < beatTokens.length; index += 1) {
        if (beatTokens[index]?.trim()) return index;
      }
      return -1;
    };

    const targetIndex = mode === 'backspace'
      ? findBackwardIndex()
      : findForwardIndex();

    if (targetIndex === -1) return;

    beatTokens[targetIndex] = '';
    const nextRiff = serializeBeatTokens(beatTokens);
    const nextBeatIndex = Math.max(0, Math.min(beatTokens.length - 1, targetIndex));

    updateBar(selection.sIdx, selection.bIdx, { riff: nextRiff || undefined });
    setJianpuCursor({ sIdx: selection.sIdx, bIdx: selection.bIdx, beatIndex: nextBeatIndex });
    setRiffCaretSelection(
      selection.sIdx,
      selection.bIdx,
      nextRiff,
      getBeatTokenRanges(nextRiff, selection.sIdx, selection.bIdx)[nextBeatIndex]?.start ?? nextRiff.length
    );
  };

  const insertJianpuSustainBeat = () => {
    if (!selection || selection.type !== 'riff') return;

    const riff = getRiffValue(selection.sIdx, selection.bIdx);
    const beatTokens = getCanonicalBeatTokens(riff, selection.sIdx, selection.bIdx);
    const beatData = getBeatNoteRanges(riff, selection.sIdx, selection.bIdx);
    const targetBeatIndex = (jianpuCursor && jianpuCursor.sIdx === selection.sIdx && jianpuCursor.bIdx === selection.bIdx)
      ? jianpuCursor.beatIndex
      : getBeatIndexFromCaret(riff, selection.sIdx, selection.bIdx, selection.start);

    const beat = beatData[targetBeatIndex];
    if (!beat || beat.usedUnits > 0 || beat.token.trim()) return;

    beatTokens[targetBeatIndex] = '-';
    const nextRiff = serializeBeatTokens(beatTokens);
    const nextBeatRanges = getBeatTokenRanges(nextRiff, selection.sIdx, selection.bIdx);
    const insertedSelection = {
      start: nextBeatRanges[targetBeatIndex]?.start ?? 0,
      end: (nextBeatRanges[targetBeatIndex]?.start ?? 0) + 1
    };

    commitRiffValueWithContinuation(
      selection.sIdx,
      selection.bIdx,
      nextRiff,
      insertedSelection
    );
  };

  const handleRiffInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, sIdx: number, bIdx: number) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'Tab') {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-riff-input]'));
      const idx = inputs.indexOf(e.currentTarget);
      if (e.shiftKey) {
        if (idx > 0) {
          e.preventDefault();
          inputs[idx - 1].focus();
          resolveRiffSelection(
            Number(inputs[idx - 1].dataset.sidx),
            Number(inputs[idx - 1].dataset.bidx),
            inputs[idx - 1].value,
            inputs[idx - 1].selectionStart ?? 0,
            inputs[idx - 1].selectionEnd ?? 0
          );
        }
      } else if (idx < inputs.length - 1) {
        e.preventDefault();
        inputs[idx + 1].focus();
        resolveRiffSelection(
          Number(inputs[idx + 1].dataset.sidx),
          Number(inputs[idx + 1].dataset.bidx),
          inputs[idx + 1].value,
          inputs[idx + 1].selectionStart ?? 0,
          inputs[idx + 1].selectionEnd ?? 0
        );
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveRiffSelection(-1);
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveRiffSelection(1);
      return;
    }

    if (/^[0-7]$/.test(e.key)) {
      e.preventDefault();
      insertOrReplaceJianpuPitch(e.key);
      return;
    }

    if (e.key === '-') {
      e.preventDefault();
      insertJianpuSustainBeat();
      return;
    }

    if (e.key === '.') {
      e.preventDefault();
      toggleSelectedJianpuDot();
      return;
    }

    const lowerKey = e.key.toLowerCase();

    if (lowerKey === 'l') {
      e.preventDefault();
      setSelectedJianpuOctave('low');
      return;
    }

    if (lowerKey === 'h') {
      e.preventDefault();
      setSelectedJianpuOctave('high');
      return;
    }

    if (lowerKey === 'e') {
      e.preventDefault();
      setSelectedJianpuDuration('eighth');
      return;
    }

    if (lowerKey === 's') {
      e.preventDefault();
      setSelectedJianpuDuration('sixteenth');
      return;
    }

    if (lowerKey === 't') {
      e.preventDefault();
      toggleSelectedJianpuSlur();
      return;
    }

    if (e.key.length === 1) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const hasNoteSelection = selection?.type === 'riff' && selection.sIdx === sIdx && selection.bIdx === bIdx && selection.start !== selection.end;
      if (hasNoteSelection) {
        removeSelectedJianpuNote();
      } else {
        if (!removeJianpuNoteNearCaret(e.key === 'Backspace' ? 'backspace' : 'delete')) {
          removeJianpuBeatToken(e.key === 'Backspace' ? 'backspace' : 'delete');
        }
      }
      return;
    }
  };

  useEffect(() => {
    if (selection) {
      const selector = selection.type === 'chord'
        ? `input[data-chord-input][data-sidx="${selection.sIdx}"][data-bidx="${selection.bIdx}"]`
        : selection.type === 'rhythm'
          ? `input[data-rhythm-input][data-sidx="${selection.sIdx}"][data-bidx="${selection.bIdx}"]`
          : `input[data-riff-input][data-sidx="${selection.sIdx}"][data-bidx="${selection.bIdx}"]`;
      
      const input = document.querySelector<HTMLInputElement>(selector);
      if (input) {
        input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (document.activeElement !== input) {
          input.focus();
        }
        input.setSelectionRange(selection.start, selection.end);
      }
    }
  }, [selection, song.sections]);

  const handleSelection = (sIdx: number, bIdx: number, e: React.SyntheticEvent<HTMLInputElement>, type: 'riff' | 'chord' | 'rhythm' = 'riff') => {
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    if (type === 'riff') {
      resolveRiffSelection(sIdx, bIdx, input.value, start, end);
      return;
    }

    if (start !== end || type === 'chord' || type === 'rhythm') {
      setSelection({
        sIdx,
        bIdx,
        start,
        end,
        text: input.value.substring(start, end),
        type
      });
    } else {
      setSelection(null);
    }
  };

  const applyTransformation = (type: 'sixteenth' | 'eighth' | 'dot' | 'slur' | 'clear' | 'push' | 'pull' | 'accent' | 'rest' | 'rest8' | 'rest2' | 'rest1') => {
    if (!selection) return;
    const { sIdx, bIdx, start, end, text, type: selectionType } = selection;
    const bar = song.sections[sIdx].bars[bIdx];

    if (selectionType === 'riff') {
      if (type === 'sixteenth') {
        setSelectedJianpuDuration('sixteenth');
      } else if (type === 'eighth') {
        setSelectedJianpuDuration('eighth');
      } else if (type === 'dot') {
        toggleSelectedJianpuDot();
      } else if (type === 'slur') {
        toggleSelectedJianpuSlur();
      } else if (type === 'clear') {
        clearSelectedJianpuFormatting();
      }
    } else if (selectionType === 'chord') {
      const chords = bar.chords;
      
      let currentPos = 0;
      let targetChordIdx = -1;
      
      for (let i = 0; i < chords.length; i++) {
        const chordLen = chords[i].length;
        if (start >= currentPos && start <= currentPos + chordLen) {
          targetChordIdx = i;
          break;
        }
        currentPos += chordLen + 1;
      }

      if (targetChordIdx === -1) {
        targetChordIdx = chords.length - 1;
      }

      const newChords = [...chords];
      let c = newChords[targetChordIdx];
      if (!c || c === '%' || c === '/') return;
      
      let hasPush = c.includes('<');
      let hasPull = c.includes('>');
      let hasAccent = c.includes('^');
      
      let clean = c.replace(/[><^]/g, '');
      
      if (type === 'push') {
        hasPush = !hasPush;
        hasPull = false; // mutually exclusive with pull
      } else if (type === 'pull') {
        hasPull = !hasPull;
        hasPush = false; // mutually exclusive with push
      } else if (type === 'accent') {
        hasAccent = !hasAccent;
      } else if (type === 'rest') {
        clean = '0';
        hasPush = false;
        hasPull = false;
        hasAccent = false;
      } else if (type === 'rest8') {
        clean = '0_';
        hasPush = false;
        hasPull = false;
        hasAccent = false;
      } else if (type === 'rest2') {
        clean = '0h';
        hasPush = false;
        hasPull = false;
        hasAccent = false;
      } else if (type === 'rest1') {
        clean = '0w';
        hasPush = false;
        hasPull = false;
        hasAccent = false;
      } else if (type === 'clear') {
        hasPush = false;
        hasPull = false;
        hasAccent = false;
      }
      
      let transformed = clean;
      if (hasPush) transformed += '<';
      if (hasPull) transformed += '>';
      if (hasAccent) transformed += '^';
      
      newChords[targetChordIdx] = transformed;
      
      const newBars = [...song.sections[sIdx].bars];
      newBars[bIdx] = { ...bar, chords: newChords };
      const newSections = [...song.sections];
      newSections[sIdx] = { ...song.sections[sIdx], bars: newBars };
      notifyChange({ ...song, sections: newSections });

      // Update selection to keep the toolbar visible and correctly positioned
      let newCurrentPos = 0;
      for (let i = 0; i < targetChordIdx; i++) {
        newCurrentPos += newChords[i].length + 1;
      }
      
      setSelection({
        ...selection,
        start: newCurrentPos,
        end: newCurrentPos + transformed.length,
        text: transformed
      });
    }
  };

  const selectedRhythmEditorEvent = selection?.type === 'rhythm'
    ? getSelectedRhythmEditorEvent(selection)
    : null;
  const selectedJianpuNoteContext = selection?.type === 'riff'
    ? getSelectedJianpuNoteContext(selection)
    : null;
  const selectedJianpuNote = selectedJianpuNoteContext?.note ?? null;
  const jianpuInsertAvailability = (() => {
    if (!selection || selection.type !== 'riff' || selectedJianpuNote) return null;
    const riff = getRiffValue(selection.sIdx, selection.bIdx);
    const activeBeatIndex = (jianpuCursor && jianpuCursor.sIdx === selection.sIdx && jianpuCursor.bIdx === selection.bIdx)
      ? jianpuCursor.beatIndex
      : getBeatIndexFromCaret(riff, selection.sIdx, selection.bIdx, selection.start);
    return getJianpuInsertAvailability(selection.sIdx, selection.bIdx, riff, activeBeatIndex, selection.start);
  })();
  const effectiveJianpuOctave = selectedJianpuNote?.octave ?? jianpuInputMode.octave;
  const effectiveJianpuDuration = selectedJianpuNote?.duration ?? jianpuInputMode.duration;
  const effectiveJianpuDotted = selectedJianpuNote?.dotted ?? jianpuInputMode.dotted;
  const effectiveJianpuTied = Boolean(selectedJianpuNoteContext?.isTieStart || selectedJianpuNoteContext?.isTieEnd);
  const activeJianpuShortcutBadgeClass = 'border-white/90 bg-white text-indigo-700 shadow-[0_1px_2px_rgba(15,23,42,0.16)]';
  const inactiveJianpuShortcutBadgeClass = 'border-indigo-200 bg-white text-indigo-500 group-hover:border-indigo-200 group-hover:bg-indigo-500 group-hover:text-white';
  const getActiveJianpuBeatIndex = (sIdx: number, bIdx: number, value: string) => {
    if (jianpuCursor && jianpuCursor.sIdx === sIdx && jianpuCursor.bIdx === bIdx) {
      return jianpuCursor.beatIndex;
    }
    if (selection?.type === 'riff' && selection.sIdx === sIdx && selection.bIdx === bIdx) {
      return getBeatIndexFromCaret(value, sIdx, bIdx, selection.start);
    }
    return 0;
  };

  const getJianpuSelectionLabel = () => {
    if (selectedJianpuNote) {
      const durationLabel: Record<JianpuDuration, string> = {
        quarter: '1/4',
        eighth: '1/8',
        sixteenth: '1/16'
      };
      const octaveLabel: Record<JianpuOctave, string> = {
        low: 'Low',
        mid: 'Mid',
        high: 'High'
      };
      const parts = [`${selectedJianpuNote.pitch} · ${durationLabel[selectedJianpuNote.duration]}`, octaveLabel[selectedJianpuNote.octave]];
      if (selectedJianpuNote.dotted) parts.push('Dot');
      if (selectedJianpuNoteContext?.isTieStart || selectedJianpuNoteContext?.isTieEnd) parts.push('Tie');
      return parts.join(' · ');
    }

    const beatLabel = jianpuCursor && selection?.type === 'riff'
      ? `Beat ${jianpuCursor.beatIndex + 1}`
      : 'Insert';
    const durationLabel = jianpuInputMode.duration === 'quarter'
      ? 'Default'
      : jianpuInputMode.duration === 'eighth'
        ? '1/8'
        : '1/16';
    return `${beatLabel} · ${durationLabel} · ${jianpuInputMode.octave === 'high' ? 'High' : jianpuInputMode.octave === 'low' ? 'Low' : 'Mid'}${jianpuInputMode.dotted ? ' · Dot' : ''}`;
  };

  const duplicateSection = (sIdx: number) => {
    const sectionToCopy = song.sections[sIdx];
    const newSection = {
      ...JSON.parse(JSON.stringify(sectionToCopy)),
      id: `s-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    const newSections = [...song.sections];
    newSections.splice(sIdx + 1, 0, newSection);
    notifyChange({ ...song, sections: newSections });
  };

  const addSection = () => {
    const newSectionId = `s-${Date.now()}`;
    notifyChange({
      ...song,
      sections: [...song.sections, { 
        id: newSectionId,
        title: 'New Section', 
        bars: [createEmptyBar()] 
      }]
    });
    queueChordInputFocus(song.sections.length, 0, newSectionId);
  };

  const removeSection = (sIdx: number) => {
    const newSections = song.sections.filter((_, i) => i !== sIdx);
    notifyChange({ ...song, sections: newSections });
  };

  const moveSection = (sIdx: number, direction: -1 | 1) => {
    if (sIdx + direction < 0 || sIdx + direction >= song.sections.length) return;
    const newSections = [...song.sections];
    const temp = newSections[sIdx];
    newSections[sIdx] = newSections[sIdx + direction];
    newSections[sIdx + direction] = temp;
    notifyChange({ ...song, sections: newSections });
  };

  return (
    <div ref={rootRef} className="relative pb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold text-gray-800">Edit Song</h2>
      </div>
      
      {/* Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
          <input 
            type="text" 
            value={song.title} 
            onChange={e => updateField('title', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Original Key</label>
          <select 
            value={song.originalKey} 
            onChange={e => updateField('originalKey', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            {ALL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tempo</label>
          <input 
            type="number" 
            min={20}
            max={400}
            step={1}
            value={tempoDraft}
            onChange={e => setTempoDraft(e.target.value.replace(/\D+/g, '').slice(0, 3))}
            onBlur={commitTempoDraft}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                commitTempoDraft();
                e.currentTarget.blur();
              }
            }}
            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Time Signature</label>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={songTimeSignatureParts.numerator}
                onChange={e => updateField('timeSignature', buildTimeSignatureInput(e.target.value, songTimeSignatureParts.denominator))}
                placeholder="4"
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-center"
              />
              <span className="text-lg font-bold text-gray-400">/</span>
              <input
                type="text"
                inputMode="numeric"
                value={songTimeSignatureParts.denominator}
                onChange={e => updateField('timeSignature', buildTimeSignatureInput(songTimeSignatureParts.numerator, e.target.value))}
                placeholder="4"
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-center"
              />
            </div>
            <label className="flex h-[42px] shrink-0 items-center gap-2 rounded border border-gray-300 bg-white px-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle'}
                onChange={e => onChange({ ...song, shuffle: e.target.checked, groove: undefined })}
                className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                aria-label="Shuffle"
                title="Shuffle"
              />
              <span className="text-[12px] font-medium text-gray-600 leading-none">Shuffle</span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Version</label>
          <input 
            type="text" 
            value={getVersionValue(song)} 
            onChange={e => onChange({ ...song, lyricist: e.target.value, composer: '' })}
            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Translator</label>
          <input 
            type="text" 
            value={song.translator || ''} 
            onChange={e => updateField('translator', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Display Settings */}
      <div className="flex flex-wrap gap-4 mb-8 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <label className="flex items-center gap-2 cursor-pointer group">
          <div className={`w-10 h-6 rounded-full p-1 transition-colors ${song.useSectionColors !== false ? 'bg-indigo-600' : 'bg-gray-300'}`}>
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${song.useSectionColors !== false ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <input 
            type="checkbox" 
            checked={song.useSectionColors !== false}
            onChange={e => updateField('useSectionColors', e.target.checked)}
            className="hidden"
          />
          <span className="text-sm font-bold text-gray-600 group-hover:text-indigo-600 transition-colors">Use Section Colors</span>
        </label>
      </div>

      {/* Section Navigation Bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 -mx-6 md:-mx-8 px-6 md:px-8 py-3 mb-6 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="flex-shrink-0 text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-2">Jump To:</div>
        <Reorder.Group 
          axis="x" 
          values={song.sections} 
          onReorder={(newSections) => notifyChange({ ...song, sections: newSections })}
          className="flex items-center gap-2"
        >
          {song.sections.map((section, idx) => {
            const colors = getSectionColor(section.title, song.useSectionColors !== false);
            const sectionId = section.id || `section-${idx}`;
            const isActiveSection = activeSectionId === sectionId;
            const accentHighlight = getAccentHighlight(colors.accent);
            return (
              <Reorder.Item 
                key={section.id || idx} 
                value={section}
                className="flex-shrink-0 relative group/nav pt-3 pb-1"
              >
                {/* Action Buttons Overlay - Appears above on hover */}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover/nav:opacity-100 transition-all pointer-events-none group-hover/nav:pointer-events-auto z-30">
                  <button 
                    onClick={(e) => { e.stopPropagation(); duplicateSection(idx); }}
                    className="p-1 bg-white border border-gray-200 rounded-full shadow-md text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Duplicate"
                  >
                    <Copy size={10} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeSection(idx); }}
                    className="p-1 bg-white border border-gray-200 rounded-full shadow-md text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>

                <button
                  onClick={() => {
                    markActiveSection(sectionId);
                    const el = document.getElementById(`section-${idx}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`relative px-3 py-1.5 rounded-full text-xs font-bold transition-all border cursor-grab active:cursor-grabbing ${
                    isActiveSection
                      ? `${colors.bg} ${colors.text} ${colors.border} scale-[1.03]`
                      : `${colors.bg} ${colors.text} ${colors.border} hover:shadow-sm`
                  }`}
                  style={isActiveSection ? { boxShadow: `0 0 0 2px ${accentHighlight.ring}, 0 10px 20px ${accentHighlight.glow}` } : undefined}
                >
                  {isActiveSection && <span className="absolute -top-1.5 -right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: accentHighlight.dot }} />}
                  {section.title ? toTitleCase(section.title) : `Section ${idx + 1}`}
                </button>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      </div>

      {/* Sections */}
      <LayoutGroup id="song-editor-bars">
      <div className="space-y-6">
        <datalist id="section-title-presets">
          {SECTION_TITLE_PRESETS.map((title) => (
            <option key={title} value={title} />
          ))}
        </datalist>
        {song.sections.map((section, sIdx) => {
          const colors = getSectionColor(section.title, song.useSectionColors !== false);
          const sectionId = section.id || `section-${sIdx}`;
          const isActiveSection = activeSectionId === sectionId;
          const accentHighlight = getAccentHighlight(colors.accent);
          return (
            <motion.div
              key={section.id || sIdx}
              id={`section-${sIdx}`}
              ref={node => setSectionRef(sectionId, node)}
              onMouseDownCapture={() => markActiveSection(sectionId)}
              onFocusCapture={() => markActiveSection(sectionId)}
              layout
              transition={{ layout: { type: 'spring', stiffness: 360, damping: 30 } }}
              className={`${colors.bg} border ${colors.border} rounded-lg p-4 scroll-mt-20 transition-all ${
                isActiveSection ? 'scale-[1.002]' : ''
              }`}
              style={isActiveSection ? { boxShadow: `0 0 0 2px ${accentHighlight.ring}, 0 16px 32px ${accentHighlight.glow}` } : undefined}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex flex-col bg-white border border-gray-200 rounded p-0.5">
                    <button onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} className={`p-1 text-gray-400 hover:text-${colors.accent}-600 disabled:opacity-30 transition-colors`}><ChevronUp size={14} /></button>
                    <button onClick={() => moveSection(sIdx, 1)} disabled={sIdx === song.sections.length - 1} className={`p-1 text-gray-400 hover:text-${colors.accent}-600 disabled:opacity-30 transition-colors`}><ChevronDown size={14} /></button>
                  </div>
                  <input 
                    type="text" 
                    value={section.title} 
                    list="section-title-presets"
                    onChange={e => updateSection(sIdx, { ...section, title: e.target.value })}
                    onBlur={e => updateSection(sIdx, { ...section, title: toTitleCase(e.target.value) })}
                    placeholder="Section Title"
                    className={`font-bold text-lg bg-white border border-gray-300 rounded-lg px-3 py-1.5 flex-1 sm:flex-none sm:w-64 focus:ring-2 focus:ring-${colors.accent}-500 outline-none shadow-sm`}
                  />
                </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button 
                  onClick={() => duplicateSection(sIdx)}
                  className="text-indigo-500 hover:text-indigo-700 p-2 rounded hover:bg-indigo-50 transition-colors"
                  title="Duplicate Section"
                >
                  <Copy size={18} />
                </button>
                <button 
                  onClick={() => removeSection(sIdx)}
                  className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors"
                  title="Remove Section"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {/* Bars Grid */}
            <motion.div
              layout
              transition={{ layout: { type: 'spring', stiffness: 360, damping: 30 } }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3"
            >
              {section.bars.map((bar, bIdx) => (
                (() => {
                  const isActiveBar = activeBar?.sIdx === sIdx && activeBar?.bIdx === bIdx;
                  const isCopiedHighlight = copiedBarHighlight?.sIdx === sIdx && copiedBarHighlight?.bIdx === bIdx;
                  const isDragBeforeTarget = dragOverTarget === `bar-before-${sIdx}-${bIdx}`;
                  const isDragAfterTarget = dragOverTarget === `bar-after-${sIdx}-${bIdx}`;
                  const isDragTarget = isDragBeforeTarget || isDragAfterTarget;
                  const panelState = getBarPanelState(bar, sIdx, bIdx);

                  return (
                <motion.div
                  key={bar.id || `${sIdx}-${bIdx}`}
                  ref={node => setBarRef(bar.id, node)}
                  onMouseDownCapture={() => markActiveBar(sIdx, bIdx)}
                  onFocusCapture={() => markActiveBar(sIdx, bIdx)}
                  onDragOver={e => {
                    if (e.dataTransfer.types.includes('application/x-chordmaster-bar')) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      const insertPosition = getBarInsertPosition(e);
                      setDragOverTarget(`bar-${insertPosition}-${sIdx}-${bIdx}`);
                    }
                  }}
                  onDragLeave={() => {
                    setDragOverTarget(current => (
                      current === `bar-before-${sIdx}-${bIdx}` || current === `bar-after-${sIdx}-${bIdx}`
                    ) ? null : current);
                  }}
                  onDrop={e => handleBarDrop(e, sIdx, bIdx)}
                  className={`rounded-lg p-3 relative group shadow-sm transition-all min-w-0 border ${
                    isCopiedHighlight
                      ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200 shadow-amber-100/80 scale-[1.01]'
                      : isActiveBar
                          ? `bg-white ${colors.border} scale-[1.01]`
                          : 'bg-white border-gray-200 hover:border-indigo-300'
                  }`}
                  style={isActiveBar && !isCopiedHighlight ? { boxShadow: `0 0 0 2px ${accentHighlight.barRing}, 0 14px 26px ${accentHighlight.barGlow}` } : undefined}
                >
                  {isDragBeforeTarget && (
                    <div className="absolute inset-y-2 -left-[3px] w-[4px] rounded-full bg-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.15)] z-30 pointer-events-none" />
                  )}
                  {isDragAfterTarget && (
                    <div className="absolute inset-y-2 -right-[3px] w-[4px] rounded-full bg-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.15)] z-30 pointer-events-none" />
                  )}
                  <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => duplicateBarAfter(sIdx, bIdx)}
                      className="text-gray-300 hover:text-indigo-500 transition-colors p-1"
                      title="Copy bar after this one"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      draggable
                      onDragStart={e => handleBarDragStart(e, sIdx, bIdx)}
                      onDragEnd={() => setDragOverTarget(null)}
                      className="flex h-5 w-14 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-300 hover:border-indigo-300 hover:text-indigo-500 transition-colors cursor-grab active:cursor-grabbing"
                      title="Drag to move this bar"
                    >
                      <GripHorizontal size={14} />
                    </button>
                    <button 
                      onClick={() => {
                        const newBars = section.bars.filter((_, i) => i !== bIdx);
                        updateSection(sIdx, { ...section, bars: newBars });
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
                      title="Delete Bar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  
                  <div className="space-y-3 pt-6">
                    {/* Chords */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5">Chords</label>
                      <input 
                        id={`editor-s${sIdx}-b${bIdx}-chords`}
                        type="text" 
                        value={bar.chords.join(' ')} 
                        data-chord-input
                        data-sidx={sIdx}
                        data-bidx={bIdx}
                        lang="en"
                        spellCheck={false}
                        aria-keyshortcuts="Enter"
                        onFocus={e => {
                          const input = e.currentTarget;
                          const len = input.value.length;
                          // If this is a new focus on a chord input, default to the end
                          if (!selection || selection.sIdx !== sIdx || selection.bIdx !== bIdx || selection.type !== 'chord') {
                            // Use setTimeout to ensure it happens after the browser's default focus behavior
                            setTimeout(() => {
                              input.setSelectionRange(len, len);
                            }, 0);
                          }
                          handleSelection(sIdx, bIdx, e, 'chord');
                        }}
                        onMouseUp={e => handleSelection(sIdx, bIdx, e, 'chord')}
                        onSelect={e => handleSelection(sIdx, bIdx, e, 'chord')}
                        onKeyUp={e => handleSelection(sIdx, bIdx, e, 'chord')}
                        onBlur={clearSelectionIfFocusLeftEditor}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
                            if ((e.nativeEvent as KeyboardEvent).isComposing) {
                              return;
                            }
                            e.preventDefault();
                            insertEmptyBarAt(sIdx, bIdx + 1);
                            return;
                          }

                          if (e.key === 'Tab') {
                            const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-chord-input]'));
                            const idx = inputs.indexOf(e.currentTarget);
                            if (e.shiftKey) {
                              if (idx > 0) {
                                e.preventDefault();
                                inputs[idx - 1].focus();
                                inputs[idx - 1].select();
                              }
                            } else {
                              if (idx < inputs.length - 1) {
                                e.preventDefault();
                                inputs[idx + 1].focus();
                                inputs[idx + 1].select();
                              }
                            }
                          }
                        }}
                        onChange={e => {
                          const input = e.currentTarget;
                          const start = input.selectionStart;
                          const end = input.selectionEnd;

                          const newBars = [...section.bars];
                          let val = cleanInput(e.target.value);
                          
                          // Helper to check if a string looks like a Nashville number (1-7, b1-7, #1-7)
                          const isNashvillePattern = (s: string) => /^([b#]?)([1-7])/.test(s.trim());

                          // Check if ANY other bar in this section already uses Nashville numbers
                          const sectionHasNashville = section.bars.some((b, idx) => {
                            if (idx === bIdx) return false;
                            return b.chords.some(isNashvillePattern);
                          });

                          // Check if the current input starts with a Nashville pattern
                          const currentInputIsNashville = isNashvillePattern(val.split(' ')[0] || '');

                          // If either is true, we are in Nashville Mode for this section
                          const isNashvilleMode = sectionHasNashville || currentInputIsNashville;
                          
                          let processedVal = val;
                          if (!isNashvilleMode) {
                            // Standard Chord Mode: Auto-capitalize A-G
                            // We capitalize 'b' immediately if it's clearly a chord (e.g. followed by 'm', '7', or space)
                            // or if it's at the end of a word and we're NOT in Nashville mode.
                            processedVal = val.replace(/(^|\s|\/)([a-g])/g, (m, p1, p2) => p1 + p2.toUpperCase());
                          } else {
                            // Nashville Mode: Be very conservative with 'b'
                            // Only capitalize a, c, d, e, f, g (rare in Nashville but could be notes)
                            // Keep 'b' as lowercase for flat symbols (b7, b3, etc.)
                            processedVal = val.replace(/(^|\s|\/)([ac-g])/g, (m, p1, p2) => p1 + p2.toUpperCase());
                          }
                          
                          newBars[bIdx] = { ...bar, chords: processedVal.split(' ') };
                          updateSection(sIdx, { ...section, bars: newBars });

                          // Update selection state immediately to prevent cursor jumping on re-render
                          setSelection({
                            sIdx,
                            bIdx,
                            start: start ?? 0,
                            end: end ?? 0,
                            text: input.value.substring(start ?? 0, end ?? 0),
                            type: 'chord'
                          });
                        }}
                        placeholder="e.g. C G/B Am"
                        className="w-full font-mono text-sm p-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5">
                      <button
                        type="button"
                        onClick={() => updateBarPanelState(bar, sIdx, bIdx, { riff: !panelState.riff })}
                        title="Jianpu"
                        className={`h-7 min-w-[44px] px-1.5 rounded-md border transition-colors shrink-0 flex items-center justify-center ${
                          panelState.riff
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                      >
                        <div className="w-8 scale-[0.9] origin-center">
                          <Jianpu notation="1=2=3=4=" compact className="pointer-events-none" />
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBarPanelState(bar, sIdx, bIdx, { barTime: !panelState.barTime })}
                        title="Bar Time"
                        className={`h-7 min-w-[38px] px-1.5 rounded-md border transition-colors shrink-0 flex items-center justify-center ${
                          panelState.barTime
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                      >
                        <span className="text-[11px] font-bold leading-none">
                          {bar.timeSignature || song.timeSignature || '4/4'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBarPanelState(bar, sIdx, bIdx, { rhythm: !panelState.rhythm })}
                        title="Rhythm"
                        className={`h-7 min-w-[44px] px-1.5 rounded-md border transition-colors shrink-0 flex items-center justify-center ${
                          panelState.rhythm
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                      >
                        <span className="font-rhythm text-[18px] leading-none select-none whitespace-pre -translate-y-[1px]">
                          ♬
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBarPanelState(bar, sIdx, bIdx, { more: !panelState.more })}
                        title="More"
                        className={`h-7 min-w-[30px] px-1 rounded-md border transition-colors shrink-0 flex items-center justify-center ${
                          panelState.more
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                      >
                        <span className="text-base leading-none">⋯</span>
                      </button>
                    </div>

                    {/* Riff Section */}
                    {panelState.riff && (
                    <div className="bg-gray-50 rounded p-2 border border-gray-100">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Jianpu Riff</label>

                      {(() => {
                        const riffSelected = selection?.type === 'riff' && selection.sIdx === sIdx && selection.bIdx === bIdx;
                        const riffValue = bar.riff || '';
                        const beatTokens = getCanonicalBeatTokens(riffValue, sIdx, bIdx);
                        const beatData = getBeatNoteRanges(riffValue, sIdx, bIdx);
                        const activeBeatIndex = getActiveJianpuBeatIndex(sIdx, bIdx, riffValue);
                        const beatRanges = getBeatTokenRanges(riffValue, sIdx, bIdx);
                        const selectedLayoutNote = (() => {
                          if (!riffSelected || !selectedJianpuNote) return null;

                          const beat = beatData.find((entry) => entry.notes.some((note) => (
                            note.start === selectedJianpuNote.start && note.end === selectedJianpuNote.end
                          )));
                          if (!beat) return null;

                          const noteIndex = beat.notes.findIndex((note) => (
                            note.start === selectedJianpuNote.start && note.end === selectedJianpuNote.end
                          ));
                          if (noteIndex === -1) return null;

                          return {
                            tokenIndex: beat.beatIndex,
                            noteIndex
                          };
                        })();
                        const activeInsertBeatIndex = riffSelected && !selectedLayoutNote ? activeBeatIndex : null;
                        const activeInsertPosition = riffSelected && !selectedLayoutNote
                          ? getJianpuInsertSlotInfo(sIdx, bIdx, riffValue, activeBeatIndex, selection.start)
                          : null;

                        return (
                          <div
                            className={`relative rounded border bg-white transition-all ${riffSelected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-200 hover:border-indigo-200'}`}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              const nextCaret = beatRanges[activeBeatIndex]?.start ?? riffValue.length;
                              setJianpuCursor({ sIdx, bIdx, beatIndex: activeBeatIndex });
                              setRiffCaretSelection(sIdx, bIdx, riffValue, nextCaret);
                            }}
                          >
                            <input
                              id={`editor-s${sIdx}-b${bIdx}-riff`}
                              type="text"
                              value={bar.riff || ''}
                              readOnly
                              data-riff-input
                              data-sidx={sIdx}
                              data-bidx={bIdx}
                              lang="en"
                              spellCheck={false}
                              onBlur={clearSelectionIfFocusLeftEditor}
                              onKeyDown={e => handleRiffInputKeyDown(e, sIdx, bIdx)}
                              onPaste={e => e.preventDefault()}
                              onDrop={e => e.preventDefault()}
                              className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
                              aria-label={`Jianpu editor for bar ${bIdx + 1}`}
                            />

                            <div className="min-h-[62px] px-3 py-2 flex items-center justify-center overflow-visible">
                              <Jianpu
                                tokens={beatTokens}
                                renderMode="editor"
                                activeTokenIndex={activeInsertBeatIndex}
                                activeInsertPosition={activeInsertPosition}
                                activeNote={selectedLayoutNote}
                                onTokenClick={(beatIndex) => {
                                  const nextCaret = beatRanges[beatIndex]?.start ?? riffValue.length;
                                  setJianpuCursor({ sIdx, bIdx, beatIndex });
                                  setRiffCaretSelection(sIdx, bIdx, riffValue, nextCaret);
                                }}
                                onNoteClick={(beatIndex, noteIndex) => {
                                  const note = beatData[beatIndex]?.notes[noteIndex];
                                  if (!note) return;
                                  setJianpuCursor({ sIdx, bIdx, beatIndex });
                                  setRiffSelectionRange(sIdx, bIdx, riffValue, note.start, note.end);
                                }}
                                showPlaceholders
                                className="w-full"
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    )}

                    {panelState.barTime && (
                    <div className="bg-gray-50 rounded p-2 border border-gray-100">
                      <div className="mb-2">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Bar Time Signature</label>
                        {(() => {
                          const barTimeSignatureParts = splitTimeSignatureInput(bar.timeSignature);

                          const updateBarTimeSignature = (numerator: string, denominator: string) => {
                            const newBars = [...section.bars];
                            const value = buildTimeSignatureInput(numerator, denominator);
                            newBars[bIdx] = { ...bar, timeSignature: value || undefined };
                            updateSection(sIdx, { ...section, bars: newBars });
                          };

                          return (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={barTimeSignatureParts.numerator}
                                lang="en"
                                spellCheck={false}
                                onChange={e => updateBarTimeSignature(e.target.value, barTimeSignatureParts.denominator)}
                                placeholder={splitTimeSignatureInput(song.timeSignature).numerator || '4'}
                                className="w-full text-xs p-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-center"
                              />
                              <span className="text-sm font-bold text-gray-400">/</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={barTimeSignatureParts.denominator}
                                lang="en"
                                spellCheck={false}
                                onChange={e => updateBarTimeSignature(barTimeSignatureParts.numerator, e.target.value)}
                                placeholder={splitTimeSignatureInput(song.timeSignature).denominator || '4'}
                                className="w-full text-xs p-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-center"
                              />
                            </div>
                          );
                        })()}
                        <div className="mt-1 text-[10px] text-gray-400">
                          Leave blank to use the song default. Fill in values like 2/4 or 6/8 for this bar only.
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Rhythm Section */}
                    {panelState.rhythm && (
                    <div className="bg-gray-50 rounded p-2 border border-gray-100">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Rhythm</label>
                        {(() => {
                          const effectiveTimeSignature = getBarTimeSignature(bar);
                          const parsedRhythm = parseRhythmNotation(bar.rhythm || '', effectiveTimeSignature);
                          const filledBeats = parsedRhythm.visibleEndUnit / parsedRhythm.beatUnits;
                          const totalBeats = parsedRhythm.barUnits / parsedRhythm.beatUnits;

                          return (
                            <span className={`text-[10px] font-bold ${parsedRhythm.invalidTokens.length > 0 || parsedRhythm.overflow ? 'text-red-500' : 'text-gray-400'}`}>
                              {effectiveTimeSignature} ·{' '}
                              {filledBeats.toFixed(filledBeats % 1 === 0 ? 0 : 1)} / {totalBeats.toFixed(totalBeats % 1 === 0 ? 0 : 1)} beats
                            </span>
                          );
                        })()}
                      </div>

                      {(() => {
                        const effectiveTimeSignature = getBarTimeSignature(bar);
                        const parsedRhythm = parseRhythmNotation(bar.rhythm || '', effectiveTimeSignature);
                        const hasVisibleRhythm = parsedRhythm.events.some((event) => !event.isHidden);
                        const rhythmSelected = selection?.type === 'rhythm' && selection.sIdx === sIdx && selection.bIdx === bIdx;
                        const selectedCursorUnit = rhythmSelected ? getSelectedRhythmInsertIndex(selection) : -1;

                        return (
                          <div
                            className={`relative mb-2 rounded border bg-white transition-all ${rhythmSelected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-200 hover:border-indigo-200'}`}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => focusRhythmEditor(sIdx, bIdx)}
                          >
                            <input
                              id={`editor-s${sIdx}-b${bIdx}-rhythm`}
                              type="text"
                              value={bar.rhythm || ''}
                              readOnly
                              data-rhythm-input
                              data-sidx={sIdx}
                              data-bidx={bIdx}
                              lang="en"
                              spellCheck={false}
                              onFocus={() => {
                                if (!rhythmSelected) {
                                  focusRhythmEditor(sIdx, bIdx);
                                }
                              }}
                              onBlur={clearSelectionIfFocusLeftEditor}
                              onKeyDown={(e) => handleRhythmInputKeyDown(e, sIdx, bIdx)}
                              className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
                              aria-label={`Rhythm editor for bar ${bIdx + 1}`}
                            />

                            <div className="min-h-[44px] p-1.5 flex items-center justify-center overflow-hidden">
                              {hasVisibleRhythm || rhythmSelected ? (
                                <RhythmNotation
                                  notation={bar.rhythm || ''}
                                  timeSignature={effectiveTimeSignature}
                                  compact
                                  renderMode="editor"
                                  selectionMode="insert"
                                  selectedInsertIndex={selectedCursorUnit}
                                  onInsertSelect={(cursorUnit) => setRhythmInsertSelection(sIdx, bIdx, bar.rhythm || '', cursorUnit)}
                                />
                              ) : (
                                <span className="text-[10px] text-gray-300 italic">Click to start entering rhythm</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="mt-1 text-[10px] text-gray-400">
                        Use the toolbar below to insert notes, rests, dots, accents, and ties directly into the displayed rhythm.
                      </div>
                    </div>
                    )}

                    {/* Labels & Annotations */}
                    {panelState.more && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="min-w-0">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5 truncate">Riff Label</label>
                        <input 
                          id={`editor-s${sIdx}-b${bIdx}-riffLabel`}
                          type="text" 
                          value={bar.riffLabel || ''} 
                          lang="en"
                          spellCheck={false}
                          onChange={e => {
                            const newBars = [...section.bars];
                            let val = cleanInput(e.target.value);
                            newBars[bIdx] = { ...bar, riffLabel: val || undefined };
                            updateSection(sIdx, { ...section, bars: newBars });
                          }}
                          placeholder="e.g. Pno"
                          className="w-full text-xs p-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5 truncate">Rhythm Label</label>
                        <input 
                          id={`editor-s${sIdx}-b${bIdx}-rhythmLabel`}
                          type="text" 
                          value={bar.rhythmLabel || ''} 
                          lang="en"
                          spellCheck={false}
                          onChange={e => {
                            const newBars = [...section.bars];
                            let val = cleanInput(e.target.value);
                            newBars[bIdx] = { ...bar, rhythmLabel: val || undefined };
                            updateSection(sIdx, { ...section, bars: newBars });
                          }}
                          placeholder="e.g. Dr"
                          className="w-full text-xs p-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5 truncate">Annotation</label>
                        <input 
                          id={`editor-s${sIdx}-b${bIdx}-annotation`}
                          type="text" 
                          value={bar.annotation || ''} 
                          lang="en"
                          spellCheck={false}
                          onChange={e => {
                            const newBars = [...section.bars];
                            let val = cleanInput(e.target.value);
                            newBars[bIdx] = { ...bar, annotation: val || undefined };
                            updateSection(sIdx, { ...section, bars: newBars });
                          }}
                          placeholder="e.g. Build"
                          className="w-full text-xs p-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                    )}

                    {/* Repeat & Ending Controls */}
                    {panelState.more && (
                    <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-y-2 gap-x-1">
                      <div className="flex gap-1 shrink-0">
                        <button 
                          onClick={() => {
                            const newBars = [...section.bars];
                            newBars[bIdx] = { ...bar, repeatStart: !bar.repeatStart };
                            updateSection(sIdx, { ...section, bars: newBars });
                          }}
                          className={`w-7 h-7 flex items-center justify-center border rounded transition-colors ${bar.repeatStart ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-400 hover:border-indigo-300'}`}
                          title="Start Repeat |:"
                        >
                          <span className="font-bold text-[10px]">|:</span>
                        </button>
                        <button 
                          onClick={() => {
                            const newBars = [...section.bars];
                            const nextRepeatEnd = !bar.repeatEnd;
                            newBars[bIdx] = { ...bar, repeatEnd: nextRepeatEnd, finalBar: nextRepeatEnd ? false : bar.finalBar };
                            updateSection(sIdx, { ...section, bars: newBars });
                          }}
                          className={`w-7 h-7 flex items-center justify-center border rounded transition-colors ${bar.repeatEnd ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-400 hover:border-indigo-300'}`}
                          title="End Repeat :|"
                        >
                          <span className="font-bold text-[10px]">:|</span>
                        </button>
                        <button 
                          onClick={() => {
                            const newBars = [...section.bars];
                            const nextFinalBar = !bar.finalBar;
                            newBars[bIdx] = { ...bar, finalBar: nextFinalBar, repeatEnd: nextFinalBar ? false : bar.repeatEnd };
                            updateSection(sIdx, { ...section, bars: newBars });
                          }}
                          className={`w-7 h-7 flex items-center justify-center border rounded transition-colors ${bar.finalBar ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-400 hover:border-indigo-300'}`}
                          title="Final Bar ||"
                        >
                          <span className="font-bold text-[10px]">||</span>
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
                        <span className="text-[10px] font-bold text-gray-400 uppercase shrink-0">End.</span>
                        <select 
                          value={bar.ending || ''} 
                          onChange={e => {
                            const val = e.target.value;
                            const newBars = [...section.bars];
                            newBars[bIdx] = { ...bar, ending: val ? (parseInt(val) as 1 | 2 | 3 | 4) : undefined };
                            updateSection(sIdx, { ...section, bars: newBars });
                          }}
                          className="max-w-[60px] flex-1 text-[10px] p-1 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none bg-white min-w-0"
                        >
                          <option value="">None</option>
                          <option value="1">1.</option>
                          <option value="2">2.</option>
                          <option value="3">3.</option>
                          <option value="4">4.</option>
                        </select>
                      </div>
                    </div>
                    )}
                  </div>
                </motion.div>
                  );
                })()
              ))}
              
              {/* Add Bar Button */}
              <div
                onDragOver={e => {
                  if (e.dataTransfer.types.includes('application/x-chordmaster-bar')) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                    setDragOverTarget(`append-${sIdx}`);
                  }
                }}
                onDragEnter={e => {
                  if (e.dataTransfer.types.includes('application/x-chordmaster-bar')) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverTarget(`append-${sIdx}`);
                  }
                }}
                onDragLeave={e => {
                  const nextTarget = e.relatedTarget as Node | null;
                  if (nextTarget && e.currentTarget.contains(nextTarget)) return;
                  setDragOverTarget(current => current === `append-${sIdx}` ? null : current);
                }}
                onDrop={e => handleAppendBarDrop(e, sIdx)}
                className={`border-2 border-dashed rounded min-h-[200px] ${dragOverTarget === `append-${sIdx}` ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-gray-300 hover:border-indigo-300 hover:bg-indigo-50'} transition-colors`}
              >
                <button 
                  type="button"
                  onClick={() => {
                    if (suppressAddBarClickRef.current === `append-${sIdx}`) {
                      suppressAddBarClickRef.current = null;
                      return;
                    }
                    insertEmptyBarAt(sIdx, section.bars.length);
                  }}
                  className={`w-full h-full flex flex-col items-center justify-center min-h-[196px] ${dragOverTarget === `append-${sIdx}` ? 'text-indigo-500' : 'text-gray-400 hover:text-indigo-500'} transition-colors`}
                >
                  <Plus size={24} className="mb-1" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {dragOverTarget === `append-${sIdx}` ? 'Drop To Copy Bar' : 'Add Bar'}
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
    </LayoutGroup>

      <div className="flex justify-center mt-12 pb-12">
        <button 
          onClick={addSection}
          className="px-8 py-4 bg-white border-2 border-dashed border-gray-300 rounded-2xl flex items-center justify-center gap-3 text-gray-500 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all font-bold uppercase tracking-widest text-sm shadow-sm hover:shadow-md"
        >
          <Plus size={24} />
          Add New Section
        </button>
      </div>

      {/* Floating Toolbar for Selection */}
      <AnimatePresence>
        {selection && (
          <motion.div 
            ref={toolbarRef}
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white shadow-2xl border border-gray-200 rounded-2xl p-2 flex items-center gap-2 z-[100] min-w-[300px] max-w-[calc(100vw-2rem)]"
            onMouseDown={e => e.preventDefault()} // Prevent losing focus/selection
          >
            <div className="px-3 py-1 border-r border-gray-100 mr-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Selection</span>
              <span className="text-sm font-mono font-bold text-indigo-600 truncate max-w-[100px] block">
                {selection.type === 'rhythm'
                  ? getRhythmSelectionLabel()
                  : selection.type === 'riff'
                    ? getJianpuSelectionLabel()
                    : selection.text}
              </span>
            </div>
            
            <div className={`flex items-center gap-1 ${selection.type === 'riff' ? 'flex-wrap' : ''}`}>
              {selection.type === 'riff' ? (
                <>
                  <button 
                    onClick={() => insertOrReplaceJianpuPitch('1')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Insert 1"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold">1</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Do</span>
                  </button>

                  <button 
                    onClick={() => insertOrReplaceJianpuPitch('2')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Insert 2"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold">2</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Re</span>
                  </button>

                  <button 
                    onClick={() => insertOrReplaceJianpuPitch('3')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Insert 3"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold">3</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Mi</span>
                  </button>

                  <button 
                    onClick={() => insertOrReplaceJianpuPitch('4')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Insert 4"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold">4</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Fa</span>
                  </button>

                  <button 
                    onClick={() => insertOrReplaceJianpuPitch('5')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Insert 5"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold">5</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Sol</span>
                  </button>

                  <button 
                    onClick={() => insertOrReplaceJianpuPitch('6')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Insert 6"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold">6</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">La</span>
                  </button>

                  <button 
                    onClick={() => insertOrReplaceJianpuPitch('7')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Insert 7"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold">7</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Ti</span>
                  </button>

                  <button 
                    onClick={() => insertOrReplaceJianpuPitch('0')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Insert Rest"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold">0</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest</span>
                  </button>

                  <button 
                    onClick={insertJianpuSustainBeat}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Sustain Next Beat (-)"
                  >
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                      <span className="font-bold text-lg leading-none">-</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Hold</span>
                  </button>

                  <div className="w-px h-8 bg-gray-100 mx-1 self-center" />

                  <button 
                    onClick={() => setSelectedJianpuOctave('low')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${effectiveJianpuOctave === 'low' ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
                    title="Low Octave (L)"
                    aria-keyshortcuts="L"
                  >
                    <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${effectiveJianpuOctave === 'low' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <ArrowDownRight size={16} />
                      <span className={`absolute -right-1 -top-1 min-w-[14px] h-[14px] px-1 rounded-md border text-[8px] leading-[12px] font-mono font-bold ${effectiveJianpuOctave === 'low' ? activeJianpuShortcutBadgeClass : inactiveJianpuShortcutBadgeClass}`}>L</span>
                    </div>
                    <span className={`text-[10px] font-bold ${effectiveJianpuOctave === 'low' ? 'text-indigo-600' : 'text-gray-500'}`}>Low</span>
                  </button>

                  <button 
                    onClick={() => setSelectedJianpuOctave('high')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${effectiveJianpuOctave === 'high' ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
                    title="High Octave (H)"
                    aria-keyshortcuts="H"
                  >
                    <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${effectiveJianpuOctave === 'high' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <ArrowUpRight size={16} />
                      <span className={`absolute -right-1 -top-1 min-w-[14px] h-[14px] px-1 rounded-md border text-[8px] leading-[12px] font-mono font-bold ${effectiveJianpuOctave === 'high' ? activeJianpuShortcutBadgeClass : inactiveJianpuShortcutBadgeClass}`}>H</span>
                    </div>
                    <span className={`text-[10px] font-bold ${effectiveJianpuOctave === 'high' ? 'text-indigo-600' : 'text-gray-500'}`}>High</span>
                  </button>

                  <button 
                    onClick={() => setSelectedJianpuDuration('eighth')}
                    disabled={Boolean(jianpuInsertAvailability && !jianpuInsertAvailability.canEighth)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${effectiveJianpuDuration === 'eighth' ? 'bg-indigo-50' : 'hover:bg-indigo-50'} ${jianpuInsertAvailability && !jianpuInsertAvailability.canEighth ? 'opacity-35 cursor-not-allowed hover:bg-transparent' : ''}`}
                    title="Eighth Note (E)"
                    aria-keyshortcuts="E"
                  >
                    <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${effectiveJianpuDuration === 'eighth' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <Music2 size={16} />
                      <span className={`absolute -right-1 -top-1 min-w-[14px] h-[14px] px-1 rounded-md border text-[8px] leading-[12px] font-mono font-bold ${effectiveJianpuDuration === 'eighth' ? activeJianpuShortcutBadgeClass : inactiveJianpuShortcutBadgeClass}`}>E</span>
                    </div>
                    <span className={`text-[10px] font-bold ${effectiveJianpuDuration === 'eighth' ? 'text-indigo-600' : 'text-gray-500'}`}>1/8</span>
                  </button>

                  <button 
                    onClick={() => setSelectedJianpuDuration('sixteenth')}
                    disabled={Boolean(jianpuInsertAvailability && !jianpuInsertAvailability.canSixteenth)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${effectiveJianpuDuration === 'sixteenth' ? 'bg-indigo-50' : 'hover:bg-indigo-50'} ${jianpuInsertAvailability && !jianpuInsertAvailability.canSixteenth ? 'opacity-35 cursor-not-allowed hover:bg-transparent' : ''}`}
                    title="Sixteenth Note (S)"
                    aria-keyshortcuts="S"
                  >
                    <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${effectiveJianpuDuration === 'sixteenth' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <Hash size={16} />
                      <span className={`absolute -right-1 -top-1 min-w-[14px] h-[14px] px-1 rounded-md border text-[8px] leading-[12px] font-mono font-bold ${effectiveJianpuDuration === 'sixteenth' ? activeJianpuShortcutBadgeClass : inactiveJianpuShortcutBadgeClass}`}>S</span>
                    </div>
                    <span className={`text-[10px] font-bold ${effectiveJianpuDuration === 'sixteenth' ? 'text-indigo-600' : 'text-gray-500'}`}>1/16</span>
                  </button>

                  <button 
                    onClick={toggleSelectedJianpuDot}
                    disabled={Boolean(jianpuInsertAvailability && !jianpuInsertAvailability.canDot && !effectiveJianpuDotted)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${effectiveJianpuDotted ? 'bg-indigo-50' : 'hover:bg-indigo-50'} ${jianpuInsertAvailability && !jianpuInsertAvailability.canDot && !effectiveJianpuDotted ? 'opacity-35 cursor-not-allowed hover:bg-transparent' : ''}`}
                    title="Toggle Dot (.)"
                    aria-keyshortcuts="."
                  >
                    <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${effectiveJianpuDotted ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <div className="w-1.5 h-1.5 bg-current rounded-full" />
                      <span className={`absolute -right-1 -top-1 min-w-[14px] h-[14px] px-1 rounded-md border text-[8px] leading-[12px] font-mono font-bold ${effectiveJianpuDotted ? activeJianpuShortcutBadgeClass : inactiveJianpuShortcutBadgeClass}`}>.</span>
                    </div>
                    <span className={`text-[10px] font-bold ${effectiveJianpuDotted ? 'text-indigo-600' : 'text-gray-500'}`}>Dot</span>
                  </button>

                  <button 
                    onClick={toggleSelectedJianpuSlur}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${effectiveJianpuTied ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
                    title="Toggle Tie/Slur (T)"
                    aria-keyshortcuts="T"
                  >
                    <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${effectiveJianpuTied ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <Link size={16} />
                      <span className={`absolute -right-1 -top-1 min-w-[14px] h-[14px] px-1 rounded-md border text-[8px] leading-[12px] font-mono font-bold ${effectiveJianpuTied ? activeJianpuShortcutBadgeClass : inactiveJianpuShortcutBadgeClass}`}>T</span>
                    </div>
                    <span className={`text-[10px] font-bold ${effectiveJianpuTied ? 'text-indigo-600' : 'text-gray-500'}`}>Tie</span>
                  </button>
                </>
              ) : selection.type === 'chord' ? (
                <>
                  <button 
                    onClick={() => applyTransformation('push')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Push / Anticipation (<)"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <svg viewBox="0 0 32 24" className="w-6 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 20c0-8 4-10 12-10" />
                        <path d="M25 7l3 3-3 3" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Push</span>
                  </button>

                  <button 
                    onClick={() => applyTransformation('pull')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Pull / Delay (>)"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <svg viewBox="0 0 32 24" className="w-6 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 20c0-8-4-10-12-10" />
                        <path d="M7 7l-3 3 3 3" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Pull</span>
                  </button>

                  <button 
                    onClick={() => applyTransformation('accent')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Accent (^)"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 8l12 4-12 4" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Accent</span>
                  </button>

                  <button 
                    onClick={() => applyTransformation('rest1')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Whole Rest (0w)"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-[20px] leading-none select-none whitespace-pre -translate-y-[1px]">
                        {getRestGlyph('w')}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 1</span>
                  </button>

                  <button 
                    onClick={() => applyTransformation('rest2')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Half Rest (0h)"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-[20px] leading-none select-none whitespace-pre translate-y-[1px]">
                        {getRestGlyph('h')}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 2</span>
                  </button>

                  <button 
                    onClick={() => applyTransformation('rest')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Quarter Rest (0)"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-[20px] leading-none select-none whitespace-pre -translate-y-[1px]">
                        {getRestGlyph('q')}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 4</span>
                  </button>

                  <button 
                    onClick={() => applyTransformation('rest8')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="8th Rest (0_)"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-[20px] leading-none select-none whitespace-pre translate-y-[1px]">
                        {getRestGlyph('e')}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 8</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => insertRhythmToken('w')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Whole Note"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">𝅝</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">1</span>
                  </button>

                  <button
                    onClick={() => insertRhythmToken('h')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Half Note"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">𝅗𝅥</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">1/2</span>
                  </button>

                  <button
                    onClick={() => insertRhythmToken('q')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Quarter Note"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">♩</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">1/4</span>
                  </button>

                  <button
                    onClick={() => insertRhythmToken('e')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Eighth Note"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">♪</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">1/8</span>
                  </button>

                  <button
                    onClick={() => insertRhythmToken('s')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Sixteenth Note"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">♬</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">1/16</span>
                  </button>

                  <button
                    onClick={toggleRhythmDot}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${selectedRhythmEditorEvent?.dotted ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
                    title="Toggle Dot"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${selectedRhythmEditorEvent?.dotted ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <div className="w-2 h-2 bg-current rounded-full" />
                    </div>
                    <span className={`text-[10px] font-bold ${selectedRhythmEditorEvent?.dotted ? 'text-indigo-600' : 'text-gray-500'}`}>Dot</span>
                  </button>

                  <button
                    onClick={toggleRhythmAccent}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${selectedRhythmEditorEvent?.accent ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
                    title="Toggle Accent (^)"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${selectedRhythmEditorEvent?.accent ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l12 3-12 3" />
                      </svg>
                    </div>
                    <span className={`text-[10px] font-bold ${selectedRhythmEditorEvent?.accent ? 'text-indigo-600' : 'text-gray-500'}`}>Accent</span>
                  </button>

                  <button
                    onClick={toggleRhythmTie}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group ${selectedRhythmEditorEvent?.tieAfter ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
                    title="Toggle Tie (~)"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${selectedRhythmEditorEvent?.tieAfter ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <Link size={16} />
                    </div>
                    <span className={`text-[10px] font-bold ${selectedRhythmEditorEvent?.tieAfter ? 'text-indigo-600' : 'text-gray-500'}`}>Tie</span>
                  </button>

                  <div className="w-px h-8 bg-gray-100 mx-1" />

                  <button
                    onClick={() => insertRhythmToken('wr')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Whole Rest"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">𝄻</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 1</span>
                  </button>

                  <button
                    onClick={() => insertRhythmToken('hr')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Half Rest"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">𝄼</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 1/2</span>
                  </button>

                  <button
                    onClick={() => insertRhythmToken('qr')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Quarter Rest"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">𝄽</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 4</span>
                  </button>

                  <button
                    onClick={() => insertRhythmToken('er')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Eighth Rest"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">𝄾</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 8</span>
                  </button>

                  <button
                    onClick={() => insertRhythmToken('sr')}
                    className="flex flex-col items-center gap-1 p-2 hover:bg-indigo-50 rounded-xl transition-colors group"
                    title="Sixteenth Rest"
                  >
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <span className="font-rhythm text-lg leading-none">𝄿</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">Rest 16</span>
                  </button>
                </>
              )}

              <div className="w-px h-8 bg-gray-100 mx-1" />

              <button 
                onClick={() => selection.type === 'rhythm' ? clearRhythmSelection() : applyTransformation('clear')}
                className="flex flex-col items-center gap-1 p-2 hover:bg-red-50 rounded-xl transition-colors group"
                title="Clear Formatting"
              >
                <div className="w-8 h-8 bg-red-100 text-red-600 rounded-lg flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-colors">
                  <Trash2 size={16} />
                </div>
                <span className="text-[10px] font-bold text-gray-500">Clear</span>
              </button>
            </div>

            <button 
              onClick={() => setSelection(null)}
              className="ml-2 p-2 text-gray-400 hover:text-gray-600"
            >
              <Plus size={20} className="rotate-45" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SongEditor;
