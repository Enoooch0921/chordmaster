import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppLanguage, Bar, Section, Song } from '../types';
import { getUiCopy, localizeSectionTitle } from '../constants/i18n';
import { getSectionColor, normalizeChordEnharmonic } from '../utils/musicUtils';
import { hasVisibleChordTokens } from '../utils/barUtils';
import {
  buildSectionLyricsDraftLayout,
  getLyricAnchors,
  normalizeBarLyrics,
  replaceLyricsPunctuationWithSpaces,
  splitSectionLyricsDraft
} from '../utils/lyricsUtils';
import { getEffectiveTimeSignature, parseTimeSignature } from '../utils/rhythmUtils';

type FocusField = 'chords' | 'riff' | 'label' | 'annotation' | 'rhythm' | 'lyrics';

interface FocusRequest {
  sIdx: number;
  bIdx: number;
  field: FocusField;
  requestId: number;
}

interface Props {
  song: Song;
  language: AppLanguage;
  onUndo?: () => void;
  onRedo?: () => void;
  onChange: (song: Song) => void;
  activeSectionId?: string | null;
  onActiveSectionChange?: (sectionId: string | null) => void;
  activeBar?: { sIdx: number; bIdx: number } | null;
  onActiveBarChange?: (bar: { sIdx: number; bIdx: number } | null) => void;
  focusRequest?: FocusRequest | null;
  onFocusRequestHandled?: (requestId: number) => void;
}

interface SectionAnchorDescriptor {
  key: string;
  sIdx: number;
  bIdx: number;
  rawIndex: number;
  segmentIndex: number;
  slotIndex: number;
  span: number;
  chord: string;
  lyric: string;
}

interface PendingFocusRequest {
  anchorKey: string;
  caret: number | 'start' | 'end';
}

interface SectionDraftLayout {
  draft: string;
  anchorRanges: Record<string, { start: number; end: number }>;
}

interface DraftCursorContext {
  anchor: SectionAnchorDescriptor;
  offset: number;
}

type LyricsEditorFocusMode = 'lyrics' | 'chords';

interface PendingTextareaSelection {
  sectionId: string;
  position: number;
}

const cleanInput = (value: string) => (
  value
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
    .replace(/…/g, '...')
);

const buildBarKey = (sIdx: number, bIdx: number) => `${sIdx}:${bIdx}`;
const buildAnchorKey = (sIdx: number, bIdx: number, rawIndex: number) => `${sIdx}:${bIdx}:${rawIndex}`;

const chunkIntoRows = <T,>(items: T[], size: number) => {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isPrintableKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => (
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
);
const countPipesBefore = (draft: string, position: number) => (
  draft.slice(0, position).split('').filter((character) => character === '|').length
);

const findLastEmptyPipeIndex = (draft: string) => {
  for (let index = draft.length - 1; index >= 0; index -= 1) {
    if (draft[index] !== '|') continue;
    const nextPipeIndex = draft.indexOf('|', index + 1);
    const nextToken = draft.slice(index + 1, nextPipeIndex === -1 ? draft.length : nextPipeIndex);
    if (!nextToken.trim()) {
      return index;
    }
  }

  return -1;
};

const LyricsEditor: React.FC<Props> = ({
  song,
  language,
  onUndo,
  onRedo,
  onChange,
  activeSectionId = null,
  onActiveSectionChange,
  activeBar = null,
  onActiveBarChange,
  focusRequest = null,
  onFocusRequestHandled
}) => {
  const copy = getUiCopy(language);
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const sectionTextareaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const barRefs = useRef(new Map<string, HTMLDivElement>());
  const chordInputRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocusRef = useRef<PendingFocusRequest | null>(null);
  const pendingTextareaSelectionRef = useRef<PendingTextareaSelection | null>(null);
  const forceDraftSyncRef = useRef(false);
  const builtSectionDraftsRef = useRef<Record<string, string>>({});
  const [selectedAnchorKeys, setSelectedAnchorKeys] = useState<Record<string, string>>({});
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});
  const [focusMode, setFocusMode] = useState<LyricsEditorFocusMode>('lyrics');

  const sectionAnchors = useMemo<SectionAnchorDescriptor[][]>(() => (
    song.sections.map((section, sIdx) => {
      let segmentIndex = 0;

      return section.bars.flatMap((bar, bIdx) => {
        const effectiveTimeSignature = getEffectiveTimeSignature(bar.timeSignature, song.timeSignature);
        const { beats } = parseTimeSignature(effectiveTimeSignature);

        return getLyricAnchors(bar.chords, bar.lyrics, beats).map((anchor) => {
          const descriptor: SectionAnchorDescriptor = {
            key: buildAnchorKey(sIdx, bIdx, anchor.rawIndex),
            sIdx,
            bIdx,
            rawIndex: anchor.rawIndex,
            segmentIndex,
            slotIndex: anchor.slotIndex,
            span: anchor.span,
            chord: anchor.chord,
            lyric: anchor.lyric
          };

          segmentIndex += 1;
          return descriptor;
        });
      });
    })
  ), [song.sections, song.timeSignature]);

  const flatAnchors = useMemo(() => sectionAnchors.flat(), [sectionAnchors]);

  const sectionDraftLayouts = useMemo<SectionDraftLayout[]>(() => (
    song.sections.map((section, sIdx) => {
      const draftLayout = buildSectionLyricsDraftLayout(section.bars, song.timeSignature);
      const anchors = sectionAnchors[sIdx] ?? [];
      const anchorRanges = anchors.reduce<Record<string, { start: number; end: number }>>((ranges, anchor, index) => {
        const start = draftLayout.segmentStarts[index] ?? draftLayout.draft.length;
        ranges[anchor.key] = {
          start,
          end: start + anchor.lyric.length
        };
        return ranges;
      }, {});

      return {
        draft: draftLayout.draft,
        anchorRanges
      };
    })
  ), [sectionAnchors, song.sections, song.timeSignature]);

  const getSectionId = (section: Section, sIdx: number) => section.id || `section-${sIdx}`;

  useEffect(() => {
    setSelectedAnchorKeys((current) => {
      const next: Record<string, string> = {};

      song.sections.forEach((section, sIdx) => {
        const sectionId = getSectionId(section, sIdx);
        const anchors = sectionAnchors[sIdx] ?? [];
        if (!anchors.length) return;

        const currentKey = current[sectionId];
        next[sectionId] = anchors.some((anchor) => anchor.key === currentKey)
          ? currentKey
          : anchors[0].key;
      });

      const hasChanged = Object.keys(next).length !== Object.keys(current).length
        || Object.entries(next).some(([key, value]) => current[key] !== value);

      return hasChanged ? next : current;
    });
  }, [song.sections, sectionAnchors]);

  useEffect(() => {
    setSectionDrafts((current) => {
      const next: Record<string, string> = {};
      const forceDraftSync = forceDraftSyncRef.current;

      song.sections.forEach((section, sIdx) => {
        const sectionId = getSectionId(section, sIdx);
        const builtDraft = sectionDraftLayouts[sIdx]?.draft ?? '';
        const previousBuiltDraft = builtSectionDraftsRef.current[sectionId];
        const currentDraft = current[sectionId];

        next[sectionId] = forceDraftSync || currentDraft === undefined || currentDraft === previousBuiltDraft
          ? builtDraft
          : currentDraft;
      });

      const nextBuiltDrafts: Record<string, string> = {};
      song.sections.forEach((section, sIdx) => {
        nextBuiltDrafts[getSectionId(section, sIdx)] = sectionDraftLayouts[sIdx]?.draft ?? '';
      });
      builtSectionDraftsRef.current = nextBuiltDrafts;

      const hasChanged = Object.keys(next).length !== Object.keys(current).length
        || Object.entries(next).some(([key, value]) => current[key] !== value);

      forceDraftSyncRef.current = false;
      return hasChanged ? next : current;
    });
  }, [sectionDraftLayouts, song.sections]);

  const setSectionRef = (sectionId: string, node: HTMLElement | null) => {
    if (node) {
      sectionRefs.current.set(sectionId, node);
      return;
    }
    sectionRefs.current.delete(sectionId);
  };

  const setSectionTextareaRef = (sectionId: string, node: HTMLTextAreaElement | null) => {
    if (node) {
      sectionTextareaRefs.current.set(sectionId, node);
      return;
    }
    sectionTextareaRefs.current.delete(sectionId);
  };

  const setBarRef = (barKey: string, node: HTMLDivElement | null) => {
    if (node) {
      barRefs.current.set(barKey, node);
      return;
    }
    barRefs.current.delete(barKey);
  };

  const setChordInputRef = (barKey: string, node: HTMLInputElement | null) => {
    if (node) {
      chordInputRefs.current.set(barKey, node);
      return;
    }
    chordInputRefs.current.delete(barKey);
  };

  const scrollNodeIntoView = (node: HTMLElement | null, behavior: ScrollBehavior = 'smooth') => {
    if (!node) return;

    const scrollRoot = rootRef.current?.closest('[data-editor-scroll-root]') as HTMLElement | null;
    if (!scrollRoot) {
      node.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
      return;
    }

    const rootRect = scrollRoot.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const nextTop = scrollRoot.scrollTop + (nodeRect.top - rootRect.top) - ((rootRect.height - nodeRect.height) / 2);
    const maxTop = Math.max(0, scrollRoot.scrollHeight - rootRect.height);

    scrollRoot.scrollTo({
      top: Math.max(0, Math.min(maxTop, nextTop)),
      behavior
    });
  };

  const markActiveSection = (sectionId: string | null) => {
    onActiveSectionChange?.(sectionId);
  };

  const markActiveBar = (sIdx: number, bIdx: number) => {
    onActiveBarChange?.({ sIdx, bIdx });
  };

  const getSelectedAnchorForSection = (sIdx: number) => {
    const section = song.sections[sIdx];
    if (!section) return null;
    const sectionId = getSectionId(section, sIdx);
    const anchors = sectionAnchors[sIdx] ?? [];
    return anchors.find((anchor) => anchor.key === selectedAnchorKeys[sectionId]) ?? anchors[0] ?? null;
  };

  const getAnchorContextAtDraftPosition = (sIdx: number, position: number, draftOverride?: string): DraftCursorContext | null => {
    const anchors = sectionAnchors[sIdx] ?? [];
    const draft = draftOverride ?? sectionDrafts[getSectionId(song.sections[sIdx], sIdx)] ?? sectionDraftLayouts[sIdx]?.draft ?? '';
    if (!anchors.length) return null;

    const clampedPosition = clamp(position, 0, draft.length);
    const pipeCount = countPipesBefore(draft, clampedPosition);
    const anchorIndex = clamp(pipeCount - 1, 0, anchors.length - 1);
    const anchor = anchors[anchorIndex];

    const previousPipeIndex = draft.lastIndexOf('|', Math.max(0, clampedPosition - 1));
    const tokenStart = previousPipeIndex === -1 ? 0 : previousPipeIndex + 1;

    return {
      anchor,
      offset: Math.max(0, clampedPosition - tokenStart)
    };
  };

  const moveLastEmptyPipeToPosition = (draft: string, selectionStart: number) => {
    const pipeIndex = findLastEmptyPipeIndex(draft);
    if (pipeIndex === -1) return null;

    const withoutPipe = `${draft.slice(0, pipeIndex)}${draft.slice(pipeIndex + 1)}`;
    const insertAt = clamp(pipeIndex < selectionStart ? selectionStart - 1 : selectionStart, 0, withoutPipe.length);
    return `${withoutPipe.slice(0, insertAt)}|${withoutPipe.slice(insertAt)}`;
  };

  const movePipeToDraftEnd = (draft: string, pipeIndex: number) => {
    if (pipeIndex < 0 || pipeIndex >= draft.length || draft[pipeIndex] !== '|') return null;

    const withoutPipe = `${draft.slice(0, pipeIndex)}${draft.slice(pipeIndex + 1)}`;
    return `${withoutPipe}|`;
  };

  const applyAnchorLyricUpdates = (updates: Array<{ anchor: SectionAnchorDescriptor; lyric: string }>) => {
    const nextSections = [...song.sections];
    const sectionCopies = new Map<number, Section>();
    const barCopies = new Map<string, Bar>();

    const getMutableBar = (anchor: SectionAnchorDescriptor) => {
      let mutableSection = sectionCopies.get(anchor.sIdx);
      if (!mutableSection) {
        mutableSection = {
          ...song.sections[anchor.sIdx],
          bars: [...song.sections[anchor.sIdx].bars]
        };
        sectionCopies.set(anchor.sIdx, mutableSection);
        nextSections[anchor.sIdx] = mutableSection;
      }

      const barKey = buildBarKey(anchor.sIdx, anchor.bIdx);
      let mutableBar = barCopies.get(barKey);
      if (!mutableBar) {
        mutableBar = {
          ...mutableSection.bars[anchor.bIdx],
          lyrics: [...normalizeBarLyrics(mutableSection.bars[anchor.bIdx].lyrics)]
        };
        barCopies.set(barKey, mutableBar);
        mutableSection.bars[anchor.bIdx] = mutableBar;
      }

      return mutableBar;
    };

    updates.forEach(({ anchor, lyric }) => {
      const mutableBar = getMutableBar(anchor);
      const nextLyrics = [...normalizeBarLyrics(mutableBar.lyrics)];
      nextLyrics[anchor.rawIndex] = lyric.replace(/\r\n?/g, ' ');
      mutableBar.lyrics = normalizeBarLyrics(nextLyrics);
    });

    onChange({ ...song, sections: nextSections });
  };

  const activateAnchor = (anchor: SectionAnchorDescriptor) => {
    const sectionId = getSectionId(song.sections[anchor.sIdx], anchor.sIdx);
    setFocusMode('lyrics');
    setSelectedAnchorKeys((current) => (
      current[sectionId] === anchor.key
        ? current
        : {
            ...current,
            [sectionId]: anchor.key
          }
    ));
    markActiveSection(sectionId);
    markActiveBar(anchor.sIdx, anchor.bIdx);
  };

  const focusAnchor = (anchor: SectionAnchorDescriptor, caret: number | 'start' | 'end' = 'end') => {
    activateAnchor(anchor);
    pendingFocusRef.current = { anchorKey: anchor.key, caret };
  };

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (!pendingFocus) return;

    const anchor = flatAnchors.find((entry) => entry.key === pendingFocus.anchorKey);
    if (!anchor) {
      pendingFocusRef.current = null;
      return;
    }

    const sectionId = getSectionId(song.sections[anchor.sIdx], anchor.sIdx);
    const draftLayout = sectionDraftLayouts[anchor.sIdx];
    const anchorRange = draftLayout?.anchorRanges[anchor.key];
    const textarea = sectionTextareaRefs.current.get(sectionId) ?? null;
    const sectionNode = sectionRefs.current.get(sectionId) ?? null;
    if (!textarea || !anchorRange) return;

    pendingFocusRef.current = null;
    scrollNodeIntoView(sectionNode);

    window.requestAnimationFrame(() => {
      try {
        textarea.focus({ preventScroll: true });
      } catch {
        textarea.focus();
      }

      const position = pendingFocus.caret === 'start'
        ? anchorRange.start
        : pendingFocus.caret === 'end'
          ? anchorRange.end
          : clamp(anchorRange.start + pendingFocus.caret, anchorRange.start, anchorRange.end);

      textarea.setSelectionRange(position, position);
      scrollNodeIntoView(sectionNode, 'auto');
    });
  }, [flatAnchors, sectionDraftLayouts, selectedAnchorKeys, song.sections]);

  useEffect(() => {
    const pendingSelection = pendingTextareaSelectionRef.current;
    if (!pendingSelection) return;

    const textarea = sectionTextareaRefs.current.get(pendingSelection.sectionId) ?? null;
    if (!textarea) return;

    pendingTextareaSelectionRef.current = null;
    window.requestAnimationFrame(() => {
      try {
        textarea.focus({ preventScroll: true });
      } catch {
        textarea.focus();
      }

      const nextPosition = clamp(pendingSelection.position, 0, textarea.value.length);
      textarea.setSelectionRange(nextPosition, nextPosition);
      const sectionIndex = song.sections.findIndex((section, index) => getSectionId(section, index) === pendingSelection.sectionId);
      if (sectionIndex !== -1) {
        const context = getAnchorContextAtDraftPosition(sectionIndex, nextPosition, textarea.value);
        if (context) {
          activateAnchor(context.anchor);
        }
      }
    });
  }, [sectionDrafts, song.sections]);

  const updateSectionDraft = (sIdx: number, draft: string, normalizeDisplay = false) => {
    const section = song.sections[sIdx];
    if (!section) return;
    const sectionId = getSectionId(section, sIdx);

    const nextBarLyrics = splitSectionLyricsDraft(draft, section.bars, song.timeSignature);
    const nextBars = section.bars.map((bar, bIdx) => ({
      ...bar,
      lyrics: nextBarLyrics[bIdx] ?? []
    }));
    const normalizedDraft = normalizeDisplay
      ? buildSectionLyricsDraftLayout(nextBars, song.timeSignature).draft
      : draft;

    setSectionDrafts((current) => ({
      ...current,
      [sectionId]: normalizedDraft
    }));

    const nextSections = [...song.sections];
    nextSections[sIdx] = {
      ...section,
      bars: nextBars
    };

    onChange({ ...song, sections: nextSections });
  };

  const copySectionDraft = async (draft: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText || !draft) return;

    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      // Ignore clipboard failures and leave the UI unchanged.
    }
  };

  const focusChordInput = (sIdx: number, bIdx: number) => {
    const barKey = buildBarKey(sIdx, bIdx);
    const barNode = barRefs.current.get(barKey) ?? null;
    const input = chordInputRefs.current.get(barKey) ?? null;
    if (!input) return;
    setFocusMode('chords');

    scrollNodeIntoView(barNode);
    window.requestAnimationFrame(() => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      const length = input.value.length;
      input.setSelectionRange(length, length);
      scrollNodeIntoView(barNode);
    });
  };

  const getAdjacentAnchor = (anchor: SectionAnchorDescriptor, direction: -1 | 1) => {
    const anchorsInSection = sectionAnchors[anchor.sIdx] ?? [];
    const currentIndex = anchorsInSection.findIndex((entry) => entry.key === anchor.key);
    if (currentIndex === -1) return null;
    return anchorsInSection[currentIndex + direction] ?? null;
  };

  const splitAnchorToNext = (
    anchor: SectionAnchorDescriptor,
    value: string,
    selectionStart: number,
    selectionEnd: number
  ) => {
    const nextAnchor = getAdjacentAnchor(anchor, 1);
    if (!nextAnchor) return;

    const head = value.slice(0, selectionStart);
    const tail = value.slice(selectionEnd);
    const nextLyric = tail ? `${tail}${nextAnchor.lyric}` : nextAnchor.lyric;

    applyAnchorLyricUpdates([
      { anchor, lyric: head },
      { anchor: nextAnchor, lyric: nextLyric }
    ]);

    focusAnchor(nextAnchor, 'start');
  };

  const mergeAnchorToPrevious = (anchor: SectionAnchorDescriptor, value: string) => {
    const previousAnchor = getAdjacentAnchor(anchor, -1);
    if (!previousAnchor) return;

    const previousLength = previousAnchor.lyric.length;
    const mergedLyric = `${previousAnchor.lyric}${value}`;

    applyAnchorLyricUpdates([
      { anchor: previousAnchor, lyric: mergedLyric },
      { anchor, lyric: '' }
    ]);

    focusAnchor(previousAnchor, previousLength);
  };

  const updateChordValue = (section: Section, bar: Bar, sIdx: number, bIdx: number, value: string) => {
    const normalizedValue = cleanInput(value);
    const isNashvillePattern = (token: string) => /^([b#]?)([1-7])/.test(token.trim());
    const sectionHasNashville = section.bars.some((existingBar, existingBarIndex) => (
      existingBarIndex !== bIdx && existingBar.chords.some(isNashvillePattern)
    ));
    const currentInputIsNashville = isNashvillePattern(normalizedValue.split(' ')[0] || '');
    const isNashvilleMode = sectionHasNashville || currentInputIsNashville;

    let processedValue = normalizedValue;
    if (!isNashvilleMode) {
      processedValue = processedValue.replace(/(^|\s|\/)([a-g])/g, (full, prefix, chordRoot) => prefix + chordRoot.toUpperCase());
    } else {
      processedValue = processedValue.replace(/(^|\s|\/)([ac-g])/g, (full, prefix, chordRoot) => prefix + chordRoot.toUpperCase());
    }

    const nextChords = processedValue
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => (isNashvilleMode ? token : normalizeChordEnharmonic(token)));

    const nextBars = [...section.bars];
    nextBars[bIdx] = {
      ...bar,
      chords: hasVisibleChordTokens(nextChords) ? nextChords : [],
      lyrics: normalizeBarLyrics((bar.lyrics ?? []).slice(0, nextChords.length))
    };
    const nextSections = [...song.sections];
    nextSections[sIdx] = { ...section, bars: nextBars };
    onChange({ ...song, sections: nextSections });
  };

  useEffect(() => {
    if (!focusRequest) return;

    const { sIdx, bIdx, field, requestId } = focusRequest;
    const targetAnchor = (sectionAnchors[sIdx] ?? []).find((anchor) => anchor.bIdx === bIdx) ?? null;

    if (field === 'lyrics' && targetAnchor) {
      focusAnchor(targetAnchor, 'end');
    } else {
      focusChordInput(sIdx, bIdx);
    }

    onFocusRequestHandled?.(requestId);
  }, [focusRequest, onFocusRequestHandled, sectionAnchors]);

  return (
    <div ref={rootRef} className="relative pb-12">
      <div className="mb-6 rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,0.94),rgba(255,255,255,0.96))] p-5 shadow-sm">
        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-700">
          {copy.editor.lyricsModeTitle}
        </div>
        <div className="mt-2 text-sm font-medium leading-6 text-amber-900">
          {copy.editor.lyricsModeHint}
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-6 mb-6 flex items-center gap-2 overflow-x-auto border-b border-gray-200 bg-white/95 px-6 py-3 backdrop-blur-sm md:-mx-8 md:px-8">
        {song.sections.map((section, sIdx) => {
          const sectionId = getSectionId(section, sIdx);
          const colors = getSectionColor(section.title, true);
          const isActiveSection = activeSectionId === sectionId;

          return (
            <button
              key={sectionId}
              type="button"
              onClick={() => {
                markActiveSection(sectionId);
                scrollNodeIntoView(sectionRefs.current.get(sectionId) ?? null);
              }}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-all ${
                isActiveSection ? 'shadow-sm' : 'hover:-translate-y-[1px]'
              }`}
              style={{
                backgroundColor: isActiveSection ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.9)',
                borderColor: colors.accent === 'amber' ? 'rgba(180,83,9,0.28)' : 'rgba(99,102,241,0.18)',
                color: colors.accent === 'amber' ? '#92400e' : '#4338ca',
                boxShadow: isActiveSection ? '0 10px 20px rgba(15,23,42,0.08)' : 'none'
              }}
            >
              {localizeSectionTitle(section.title, language)}
            </button>
          );
        })}
      </div>

      <div className="space-y-8">
        {song.sections.map((section, sIdx) => {
          const sectionId = getSectionId(section, sIdx);
          const colors = getSectionColor(section.title, true);
          const sectionBarCountLabel = language === 'zh' ? `${section.bars.length} 小節` : `${section.bars.length} Bars`;
          const anchors = sectionAnchors[sIdx] ?? [];
          const activeAnchor = getSelectedAnchorForSection(sIdx);
          const sectionDraft = sectionDrafts[sectionId] ?? sectionDraftLayouts[sIdx]?.draft ?? '';
          const rows = chunkIntoRows(section.bars.map((bar, bIdx) => ({ bar, bIdx })), 4);
          const isActiveSection = activeSectionId === sectionId;

          return (
            <section
              key={sectionId}
              ref={(node) => setSectionRef(sectionId, node)}
              className="space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div
                  className="inline-flex items-center rounded-full border px-4 py-2 text-sm font-black tracking-[0.02em]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.96)',
                    borderColor: colors.accent === 'amber' ? 'rgba(180,83,9,0.24)' : 'rgba(99,102,241,0.16)',
                    color: colors.accent === 'amber' ? '#92400e' : '#4338ca'
                  }}
                >
                  {localizeSectionTitle(section.title, language)}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
                  {sectionBarCountLabel}
                </div>
              </div>

              <div className={`rounded-[26px] border bg-white/95 p-4 shadow-sm transition-all ${
                isActiveSection
                  ? 'border-amber-300 shadow-[0_16px_32px_rgba(245,158,11,0.12)]'
                  : 'border-gray-200'
              }`}>
                {activeAnchor ? (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                          {copy.editor.lyrics}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">
                          {language === 'zh'
                            ? `小節 ${activeAnchor.bIdx + 1} · 和弦 ${activeAnchor.chord}`
                            : `Bar ${activeAnchor.bIdx + 1} · Chord ${activeAnchor.chord}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copySectionDraft(sectionDraft)}
                          disabled={!sectionDraft}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold tracking-[0.02em] text-slate-600 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {copy.editor.copySectionLyrics}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextDraft = replaceLyricsPunctuationWithSpaces(sectionDraft);
                            updateSectionDraft(sIdx, nextDraft);
                            focusAnchor(activeAnchor, activeAnchor.lyric.length);
                          }}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold tracking-[0.02em] text-slate-600 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                        >
                          {copy.editor.replacePunctuationWithSpaces}
                        </button>
                      </div>
                    </div>

                    <textarea
                      ref={(node) => setSectionTextareaRef(sectionId, node)}
                      value={sectionDraft}
                      onFocus={() => activateAnchor(activeAnchor)}
                      onPaste={(event) => {
                        const pastedText = event.clipboardData.getData('text');
                        if (!pastedText) return;

                        event.preventDefault();
                        const selectionStart = event.currentTarget.selectionStart ?? sectionDraft.length;
                        const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
                        const nextDraft = `${sectionDraft.slice(0, selectionStart)}${pastedText}${sectionDraft.slice(selectionEnd)}`;
                        pendingTextareaSelectionRef.current = {
                          sectionId,
                          position: Math.min(selectionStart + pastedText.length, nextDraft.length)
                        };

                        updateSectionDraft(sIdx, nextDraft, true);
                      }}
                      onClick={(event) => {
                        const position = event.currentTarget.selectionStart ?? 0;
                        const context = getAnchorContextAtDraftPosition(sIdx, position, event.currentTarget.value);
                        if (context) activateAnchor(context.anchor);
                      }}
                      onKeyUp={(event) => {
                        const position = event.currentTarget.selectionStart ?? 0;
                        const context = getAnchorContextAtDraftPosition(sIdx, position, event.currentTarget.value);
                        if (context) activateAnchor(context.anchor);
                      }}
                      onChange={(event) => {
                        updateSectionDraft(sIdx, event.target.value);
                        const position = event.target.selectionStart ?? event.target.value.length;
                        const context = getAnchorContextAtDraftPosition(sIdx, position, event.target.value);
                        if (context) activateAnchor(context.anchor);
                      }}
                      onKeyDown={(event) => {
                        if ((event.nativeEvent as KeyboardEvent).isComposing) {
                          return;
                        }

                        const selectionStart = event.currentTarget.selectionStart ?? 0;
                        const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
                        const selectedText = event.currentTarget.value.slice(selectionStart, selectionEnd);

                        const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z';
                        if (isUndoShortcut) {
                          event.preventDefault();
                          forceDraftSyncRef.current = true;
                          if (event.shiftKey) {
                            onRedo?.();
                          } else {
                            onUndo?.();
                          }
                          return;
                        }

                        if (event.key === '|' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                          event.preventDefault();
                          return;
                        }

                        if (selectedText.includes('|') && (isPrintableKey(event) || event.key === 'Backspace' || event.key === 'Delete')) {
                          event.preventDefault();
                          return;
                        }

                        if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                          event.preventDefault();
                          const movedDraft = moveLastEmptyPipeToPosition(event.currentTarget.value, selectionStart);
                          if (!movedDraft) return;

                          pendingTextareaSelectionRef.current = {
                            sectionId,
                            position: Math.min(selectionStart + 1, movedDraft.length)
                          };
                          updateSectionDraft(sIdx, movedDraft);
                          return;
                        }

                        if (
                          event.key === 'Backspace'
                          && !event.shiftKey
                          && !event.altKey
                          && !event.ctrlKey
                          && !event.metaKey
                        ) {
                          if (selectionStart !== selectionEnd) {
                            return;
                          }

                          if (selectionStart > 0 && event.currentTarget.value[selectionStart - 1] === '|') {
                            event.preventDefault();
                            const movedDraft = movePipeToDraftEnd(event.currentTarget.value, selectionStart - 1);
                            if (!movedDraft) return;

                            pendingTextareaSelectionRef.current = {
                              sectionId,
                              position: Math.max(0, selectionStart - 1)
                            };
                            updateSectionDraft(sIdx, movedDraft);
                            return;
                          }

                          const context = getAnchorContextAtDraftPosition(sIdx, selectionStart, event.currentTarget.value);
                          if (context?.offset === 0) {
                            event.preventDefault();
                            mergeAnchorToPrevious(context.anchor, context.anchor.lyric);
                          }
                        }

                        if (
                          event.key === 'Delete'
                          && !event.shiftKey
                          && !event.altKey
                          && !event.ctrlKey
                          && !event.metaKey
                          && selectionStart === selectionEnd
                          && event.currentTarget.value[selectionStart] === '|'
                        ) {
                          event.preventDefault();
                        }
                      }}
                      placeholder={copy.editor.lyricsPlaceholder}
                      className="min-h-[172px] w-full rounded-[22px] border border-amber-100 bg-[linear-gradient(180deg,rgba(255,251,235,0.7),rgba(255,255,255,0.96))] px-4 py-4 font-mono text-[17px] font-semibold leading-8 text-slate-800 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                      spellCheck={false}
                    />
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
                    {copy.editor.lyricsEmptyBarHint}
                  </div>
                )}

                {anchors.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {rows.map((row, rowIndex) => (
                      <div key={`${sectionId}-row-${rowIndex}`} className="overflow-x-auto">
                        <div className="grid min-w-[760px] grid-cols-4 gap-3">
                          {row.map(({ bar, bIdx }) => {
                            const barKey = buildBarKey(sIdx, bIdx);
                            const barAnchors = anchors.filter((anchor) => anchor.bIdx === bIdx);
                            const effectiveTimeSignature = getEffectiveTimeSignature(bar.timeSignature, song.timeSignature);
                            const isActiveBar = focusMode === 'chords' && activeBar?.sIdx === sIdx && activeBar?.bIdx === bIdx;

                            return (
                              <div
                                key={bar.id || barKey}
                                ref={(node) => setBarRef(barKey, node)}
                                className={`rounded-[20px] border px-3 py-3 transition-all ${
                                  isActiveBar ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-slate-50/80'
                                }`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-black tracking-[0.12em] text-gray-500">
                                    {bIdx + 1}
                                  </div>
                                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
                                    {effectiveTimeSignature}
                                  </div>
                                </div>

                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                                  {copy.editor.chords}
                                </label>
                                <input
                                  ref={(node) => setChordInputRef(barKey, node)}
                                  type="text"
                                  value={bar.chords.join(' ')}
                                  lang="en"
                                  spellCheck={false}
                                  onFocus={() => {
                                    setFocusMode('chords');
                                    markActiveSection(sectionId);
                                    markActiveBar(sIdx, bIdx);
                                  }}
                                  onChange={(event) => updateChordValue(section, bar, sIdx, bIdx, event.target.value)}
                                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm text-gray-800 outline-none transition-colors focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                                  placeholder="C G/B Am"
                                />

                                {barAnchors.length > 0 ? (
                                  <div
                                    className="mt-3 grid gap-2"
                                    style={{ gridTemplateColumns: `repeat(${barAnchors.length}, minmax(0, 1fr))` }}
                                  >
                                    {barAnchors.map((anchor) => {
                                      const isSelectedAnchor = activeAnchor?.key === anchor.key;

                                      return (
                                        <div key={anchor.key} className="min-w-0">
                                          <div className="mb-1 truncate text-[11px] font-mono font-semibold text-slate-500">
                                            {anchor.chord}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => focusAnchor(anchor, 'end')}
                                            className={`w-full rounded-xl border px-2 py-2 text-left text-sm font-semibold transition-all ${
                                              isSelectedAnchor
                                                ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-[0_10px_22px_rgba(245,158,11,0.14)]'
                                                : 'border-white bg-white text-slate-600 shadow-[0_6px_14px_rgba(15,23,42,0.05)] hover:border-amber-200 hover:bg-amber-50'
                                            }`}
                                          >
                                            <span className="block truncate">
                                              {anchor.lyric || copy.editor.lyricsPlaceholder}
                                            </span>
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-400">
                                    {copy.editor.lyricsEmptyBarHint}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {row.length < 4 && Array.from({ length: 4 - row.length }, (_, emptyIndex) => (
                            <div key={`${sectionId}-row-${rowIndex}-empty-${emptyIndex}`} className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/60" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default LyricsEditor;
