import React from 'react';
import { JianpuDuration, JianpuNoteRange, findJianpuNoteRanges, findJianpuPlaceholderRanges } from '../utils/jianpuUtils';

interface JianpuProps {
  notation?: string;
  tokens?: string[];
  compact?: boolean;
  scale?: number;
  className?: string;
  renderMode?: 'preview' | 'editor';
  previousNotationForCrossBar?: string;
  nextNotationForCrossBar?: string;
  activeTokenIndex?: number | null;
  activeInsertPosition?: { tokenIndex: number; slotIndex: number; slotCount: number; spanSlots?: number } | null;
  gridSlotCount?: number;
  leadingOccupiedSlots?: number[];
  activeNote?: { tokenIndex: number; noteIndex: number } | null;
  onTokenClick?: (tokenIndex: number, slotIndex: number) => void;
  onNoteClick?: (tokenIndex: number, noteIndex: number) => void;
  showPlaceholders?: boolean;
}

interface LayoutNote extends JianpuNoteRange {
  tokenIndex: number;
  noteIndex: number;
  xUnits: number;
  unitStart: number;
  unitEnd: number;
  underlineLeftUnits: number;
  underlineRightUnits: number;
}

interface UnderlineSegment {
  key: string;
  tokenIndex: number;
  level: 1 | 2;
  leftUnits: number;
  rightUnits: number;
  noteCount: number;
}

interface SlurSegment {
  key: string;
  type: 'pair' | 'self' | 'incoming' | 'outgoing';
  start?: LayoutNote;
  end?: LayoutNote;
}

interface LayoutPlaceholder {
  start: number;
  end: number;
  duration: LayoutNote['duration'];
  dotted: boolean;
  tokenIndex: number;
  slotIndex: number;
  xUnits: number;
  unitStart: number;
  unitEnd: number;
  underlineLeftUnits: number;
  underlineRightUnits: number;
}

const TOKEN_WIDTH_UNITS = 100;
const TOKEN_CAPACITY_UNITS = 4;
const JIANPU_DIGIT_FONT = '"SF Mono", "Cascadia Mono", "Roboto Mono", "Menlo", "Consolas", ui-monospace, monospace';
const JIANPU_SYMBOL_FONT = '"Avenir Next", "PingFang TC", "Microsoft JhengHei", ui-sans-serif, system-ui, sans-serif';

const applyAutoDurationShorthand = (
  notes: JianpuNoteRange[],
  slotCount = notes.length,
  hasExplicitGrid = false
) => {
  if (notes.length === 0) return notes;
  if (hasExplicitGrid) return notes;

  const hasExplicitDurations = notes.some((note) => note.duration !== 'quarter');
  if (!hasExplicitDurations) {
    if (slotCount === 2) {
      return notes.map((note) => ({ ...note, duration: 'eighth' as const }));
    }
    if (slotCount === 4) {
      return notes.map((note) => ({ ...note, duration: 'sixteenth' as const }));
    }
    return notes;
  }

  return notes;
};

const getTokenList = (notation?: string, tokens?: string[]) => {
  if (tokens) return tokens;
  if (!notation?.trim()) return [];
  if (notation.includes('|')) {
    return notation.split('|').map((token) => token.trim());
  }
  return notation.trim().split(/\s+/).filter(Boolean);
};

const getDurationLevel = (note: Pick<JianpuNoteRange, 'duration'>) => {
  if (note.duration === 'sixteenth') return 2;
  if (note.duration === 'eighth') return 1;
  return 0;
};

const getBaseDurationUnits = (duration: JianpuDuration) => (
  duration === 'quarter' ? 4 : duration === 'eighth' ? 2 : 1
);

const getLayoutUnits = (note: Pick<JianpuNoteRange, 'duration' | 'dotted'>) => {
  const baseUnits = getBaseDurationUnits(note.duration);
  return baseUnits + (note.dotted ? baseUnits / 2 : 0);
};

const getAnchorOffsetUnits = (note: Pick<JianpuNoteRange, 'duration'> | Pick<LayoutPlaceholder, 'duration'>) => (
  getBaseDurationUnits(note.duration) / 2
);

const Jianpu: React.FC<JianpuProps> = ({
  notation = '',
  tokens,
  compact = false,
  scale = 1,
  className = '',
  renderMode = 'preview',
  previousNotationForCrossBar,
  nextNotationForCrossBar,
  activeTokenIndex = null,
  activeInsertPosition = null,
  gridSlotCount = TOKEN_CAPACITY_UNITS,
  leadingOccupiedSlots = [],
  activeNote = null,
  onTokenClick,
  onNoteClick,
  showPlaceholders = false
}) => {
  const tokenList = React.useMemo(
    () => getTokenList(notation, tokens),
    [notation, tokens]
  );
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState<number | null>(null);
  const updateContainerWidth = React.useCallback(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    const nextWidth = element.clientWidth || element.offsetWidth || 0;
    setContainerWidth((current) => (
      current !== null && Math.abs(current - nextWidth) < 0.5 ? current : nextWidth
    ));
  }, []);

  const metrics = React.useMemo(() => {
    if (compact) {
      return {
        height: 20 * scale,
        digitFontSize: 13 * scale,
        accidentalFontSize: 7 * scale,
        digitCenterY: 9.25 * scale,
        highDotY: 1.4 * scale,
        lowDotY: 16.2 * scale,
        underlineY: 15.4 * scale,
        underlineGap: 2.8 * scale,
        dottedOffsetX: 5.2 * scale,
        octaveDotOffsetX: 0,
        accidentalOffsetX: 7.2 * scale,
        noteHalfWidthUnits: 8.2,
        tokenPaddingUnits: 14,
        octaveDotSize: 1.5 * scale,
        dottedDotSize: 1.8 * scale,
        underlineStroke: 1.2 * scale,
        slurBaseY: 6 * scale,
        highlightInsetY: 1.8 * scale,
        highlightInsetXUnits: 4,
        placeholderSize: 2.4 * scale
      };
    }

    if (renderMode === 'editor') {
      return {
        height: 54 * scale,
        digitFontSize: 11.2 * scale,
        accidentalFontSize: 5.8 * scale,
        digitCenterY: 24 * scale,
        highDotY: 14.5 * scale,
        lowDotY: 33 * scale,
        underlineY: 30.8 * scale,
        underlineGap: 3.8 * scale,
        dottedOffsetX: 3.5 * scale,
        octaveDotOffsetX: 0,
        accidentalOffsetX: 5.2 * scale,
        noteHalfWidthUnits: 4.5,
        tokenPaddingUnits: 12,
        octaveDotSize: 2.3 * scale,
        dottedDotSize: 1.5 * scale,
        underlineStroke: 1.2 * scale,
        slurBaseY: 13.5 * scale,
        highlightInsetY: 2.5 * scale,
        highlightInsetXUnits: 6,
        placeholderSize: 3.2 * scale
      };
    }

    return {
      height: 72 * scale,
      digitFontSize: 24 * scale,
      accidentalFontSize: 12 * scale,
      digitCenterY: 31 * scale,
      highDotY: 8.5 * scale,
      lowDotY: 57 * scale,
      underlineY: 52 * scale,
      underlineGap: 7 * scale,
      dottedOffsetX: 10 * scale,
      octaveDotOffsetX: 0,
      accidentalOffsetX: 12 * scale,
      noteHalfWidthUnits: 5.7,
      tokenPaddingUnits: 17,
      octaveDotSize: 3.2 * scale,
      dottedDotSize: 3 * scale,
      underlineStroke: 1.7 * scale,
      slurBaseY: 16 * scale,
      highlightInsetY: 3.5 * scale,
      highlightInsetXUnits: 6,
      placeholderSize: 4 * scale
    };
  }, [compact, scale]);

  const { layoutNotes, layoutPlaceholders, underlineSegments, slurSegments } = React.useMemo(() => {
    const notes: LayoutNote[] = [];
    const placeholders: LayoutPlaceholder[] = [];
    const underlines: UnderlineSegment[] = [];
    const useCarryLayout = renderMode !== 'editor';
    let carryUnits = 0;

    tokenList.forEach((token, tokenIndex) => {
      const beatStartUnits = tokenIndex * TOKEN_WIDTH_UNITS;
      const carryInUnits = useCarryLayout ? carryUnits : 0;
      const rawNotes = findJianpuNoteRanges(token);
      const parsedPlaceholders = findJianpuPlaceholderRanges(token);
      const parsedNotes = applyAutoDurationShorthand(
        rawNotes,
        rawNotes.length + parsedPlaceholders.length,
        parsedPlaceholders.length > 0
      );
      const slotItems = [
        ...parsedNotes.map((note) => ({ kind: 'note' as const, start: note.start, end: note.end, note })),
        ...parsedPlaceholders.map((placeholder) => ({ kind: 'placeholder' as const, start: placeholder.start, end: placeholder.end, placeholder }))
      ].sort((a, b) => a.start - b.start);
      if (slotItems.length === 0) {
        carryUnits = useCarryLayout ? Math.max(0, carryInUnits - TOKEN_CAPACITY_UNITS) : 0;
        return;
      }

      let localNoteIndex = 0;
      let unitCursor = 0;
      const tokenNotes = slotItems.map((item, slotIndex) => {
        const spanUnits = item.kind === 'note' ? getLayoutUnits(item.note) : getLayoutUnits(item.placeholder);
        const unitStart = carryInUnits + unitCursor;
        const unitEnd = unitStart + spanUnits;
        const anchorOffsetUnits = renderMode === 'editor'
          ? Math.max(0.5, Math.min(spanUnits, Math.max(0, TOKEN_CAPACITY_UNITS - unitStart)) / 2)
          : getAnchorOffsetUnits(item.kind === 'note' ? item.note : item.placeholder);
        const xUnits = beatStartUnits + (TOKEN_WIDTH_UNITS * ((unitStart + anchorOffsetUnits) / TOKEN_CAPACITY_UNITS));
        unitCursor += spanUnits;

        if (item.kind === 'placeholder') {
          placeholders.push({
            ...item.placeholder,
            tokenIndex,
            slotIndex,
            xUnits,
            unitStart,
            unitEnd,
            underlineLeftUnits: xUnits - metrics.noteHalfWidthUnits,
            underlineRightUnits: xUnits + metrics.noteHalfWidthUnits
          });
          return null;
        }

        return {
          ...item.note,
          tokenIndex,
          noteIndex: localNoteIndex++,
          xUnits,
          unitStart,
          unitEnd,
          underlineLeftUnits: xUnits - metrics.noteHalfWidthUnits,
          underlineRightUnits: xUnits + metrics.noteHalfWidthUnits
        };
      }).filter((item): item is LayoutNote => Boolean(item));

      const tokenTotalUnits = slotItems.reduce((sum, item) => (
        sum + (item.kind === 'note' ? getLayoutUnits(item.note) : getLayoutUnits(item.placeholder))
      ), 0);
      carryUnits = useCarryLayout ? Math.max(0, carryInUnits + tokenTotalUnits - TOKEN_CAPACITY_UNITS) : 0;

      if (tokenNotes.length > 0) {
        for (let level = 1 as const; level <= 2; level += 1) {
          let groupStart: Pick<LayoutNote, 'underlineLeftUnits' | 'underlineRightUnits' | 'start' | 'duration'> | null = null;
          let previousItem: Pick<LayoutNote, 'underlineLeftUnits' | 'underlineRightUnits' | 'start' | 'duration'> | null = null;
          let previousUnitEnd: number | null = null;

          tokenNotes.forEach((note, noteIndex) => {
            const qualifies = getDurationLevel(note) >= level;

            if (!qualifies) {
              if (groupStart && previousItem) {
                underlines.push({
                  key: `${tokenIndex}-${level}-${groupStart.start}-${previousItem.start}`,
                  tokenIndex,
                  level,
                  leftUnits: groupStart.underlineLeftUnits,
                  rightUnits: previousItem.underlineRightUnits,
                  noteCount: 1
                });
              }
              groupStart = null;
              previousItem = null;
              previousUnitEnd = null;
              return;
            }

            const isContiguous = previousUnitEnd !== null && note.unitStart === previousUnitEnd;
            if (!groupStart || !isContiguous) {
              if (groupStart && previousItem) {
                underlines.push({
                  key: `${tokenIndex}-${level}-${groupStart.start}-${previousItem.start}`,
                  tokenIndex,
                  level,
                  leftUnits: groupStart.underlineLeftUnits,
                  rightUnits: previousItem.underlineRightUnits,
                  noteCount: 1
                });
              }
              groupStart = note;
            }

            previousItem = note;
            previousUnitEnd = note.unitEnd;

            if (noteIndex === tokenNotes.length - 1 && groupStart && previousItem) {
              underlines.push({
                key: `${tokenIndex}-${level}-${groupStart.start}-${previousItem.start}`,
                tokenIndex,
                level,
                leftUnits: groupStart.underlineLeftUnits,
                rightUnits: previousItem.underlineRightUnits,
                noteCount: 1
              });
            }
          });
        }
      }

      notes.push(...tokenNotes);
    });

    const slurs: SlurSegment[] = [];
    let openSlur: LayoutNote | null = null;

    notes.forEach((note) => {
      if (note.slurEnd && openSlur) {
        slurs.push({
          key: `pair-${openSlur.tokenIndex}-${openSlur.noteIndex}-${note.tokenIndex}-${note.noteIndex}`,
          type: 'pair',
          start: openSlur,
          end: note
        });
        openSlur = null;
      } else if (note.slurStart && note.slurEnd) {
        slurs.push({ key: `self-${note.tokenIndex}-${note.noteIndex}`, type: 'self', start: note, end: note });
      } else if (note.slurEnd) {
        slurs.push({ key: `incoming-${note.tokenIndex}-${note.noteIndex}`, type: 'incoming', end: note });
      }

      if (note.slurStart) {
        openSlur = note;
      }
    });

    if (openSlur) {
      slurs.push({
        key: `outgoing-${openSlur.tokenIndex}-${openSlur.noteIndex}`,
        type: 'outgoing',
        start: openSlur
      });
    }

    return {
      layoutNotes: notes,
      layoutPlaceholders: placeholders,
      underlineSegments: underlines,
      slurSegments: slurs
    };
  }, [metrics.noteHalfWidthUnits, metrics.tokenPaddingUnits, renderMode, tokenList]);

  const tokenCount = Math.max(1, tokenList.length);
  const totalWidthUnits = tokenCount * TOKEN_WIDTH_UNITS;
  const getTokenPixelBounds = React.useCallback((tokenIndex: number) => {
    if (containerWidth === null) return null;
    const leftPx = Math.round((tokenIndex / tokenCount) * containerWidth);
    const rightPx = Math.round(((tokenIndex + 1) / tokenCount) * containerWidth);
    return {
      leftPx,
      widthPx: Math.max(1, rightPx - leftPx)
    };
  }, [containerWidth, tokenCount]);
  const getTokenAlignedPx = React.useCallback((tokenIndex: number, tokenLocalUnits: number) => {
    const bounds = getTokenPixelBounds(tokenIndex);
    if (!bounds) return null;
    return bounds.leftPx + Math.round((tokenLocalUnits / TOKEN_WIDTH_UNITS) * bounds.widthPx);
  }, [getTokenPixelBounds]);
  const useSnappedPixelCenter = compact || renderMode === 'editor';
  const getRenderedNoteCenterX = React.useCallback((note: Pick<LayoutNote, 'xUnits' | 'tokenIndex'>) => {
    if (!(useSnappedPixelCenter && containerWidth !== null)) return note.xUnits;
    const noteLocalUnits = note.xUnits - (note.tokenIndex * TOKEN_WIDTH_UNITS);
    return getTokenAlignedPx(note.tokenIndex, noteLocalUnits) ?? note.xUnits;
  }, [containerWidth, getTokenAlignedPx, useSnappedPixelCenter]);
  const getProjectedPreviewNoteCenterX = React.useCallback((
    note: Pick<LayoutNote, 'xUnits' | 'tokenIndex'> & { xRatio: number; tokenCount: number },
    laneWidth: number
  ) => {
    if (!(useSnappedPixelCenter && containerWidth !== null)) {
      return note.xRatio * laneWidth;
    }

    const noteLocalUnits = note.xUnits - (note.tokenIndex * TOKEN_WIDTH_UNITS);
    const leftPx = Math.round((note.tokenIndex / note.tokenCount) * laneWidth);
    const rightPx = Math.round(((note.tokenIndex + 1) / note.tokenCount) * laneWidth);
    const widthPx = Math.max(1, rightPx - leftPx);
    return leftPx + Math.round((noteLocalUnits / TOKEN_WIDTH_UNITS) * widthPx);
  }, [containerWidth, useSnappedPixelCenter]);
  const getSlurAnchorY = React.useCallback(() => {
    const digitTopY = metrics.digitCenterY - (metrics.digitFontSize * 0.52);
    const octaveDotSize = renderMode === 'editor' || compact
      ? Math.max(2, Math.round(metrics.octaveDotSize))
      : metrics.octaveDotSize;
    const highDotTopY = metrics.highDotY - (octaveDotSize / 2);
    const referenceTopY = Math.min(digitTopY, highDotTopY);
    return referenceTopY + (compact ? -1.6 : renderMode === 'editor' ? -2.5 : -3.6);
  }, [compact, metrics.digitCenterY, metrics.digitFontSize, metrics.highDotY, metrics.octaveDotSize, renderMode]);
  const getNotationPreviewNotes = React.useCallback((notationText?: string) => {
    const nextTokenList = getTokenList(notationText);
    const nextTokenCount = Math.max(1, nextTokenList.length);
    const nextTotalWidthUnits = nextTokenCount * TOKEN_WIDTH_UNITS;
    const nextNotes: Array<LayoutNote & { xRatio: number; tokenCount: number }> = [];
    let carryUnits = 0;

    nextTokenList.forEach((token, tokenIndex) => {
      const beatStartUnits = tokenIndex * TOKEN_WIDTH_UNITS;
      const carryInUnits = carryUnits;
      const rawNotes = findJianpuNoteRanges(token);
      const parsedPlaceholders = findJianpuPlaceholderRanges(token);
      const parsedNotes = applyAutoDurationShorthand(
        rawNotes,
        rawNotes.length + parsedPlaceholders.length,
        parsedPlaceholders.length > 0
      );
      const slotItems = [
        ...parsedNotes.map((note) => ({ kind: 'note' as const, start: note.start, end: note.end, note })),
        ...parsedPlaceholders.map((placeholder) => ({ kind: 'placeholder' as const, start: placeholder.start, end: placeholder.end, placeholder }))
      ].sort((a, b) => a.start - b.start);
      if (slotItems.length === 0) {
        carryUnits = Math.max(0, carryInUnits - TOKEN_CAPACITY_UNITS);
        return;
      }

      let localNoteIndex = 0;
      let unitCursor = 0;

      slotItems.forEach((item) => {
        const spanUnits = item.kind === 'note' ? getLayoutUnits(item.note) : getLayoutUnits(item.placeholder);
        const unitStart = carryInUnits + unitCursor;
        const unitEnd = unitStart + spanUnits;
        const xUnits = beatStartUnits + (TOKEN_WIDTH_UNITS * ((unitStart + getAnchorOffsetUnits(item.kind === 'note' ? item.note : item.placeholder)) / TOKEN_CAPACITY_UNITS));
        unitCursor += spanUnits;

        if (item.kind !== 'note') return;

        nextNotes.push({
          ...item.note,
          tokenIndex,
          noteIndex: localNoteIndex++,
          xUnits,
          xRatio: xUnits / nextTotalWidthUnits,
          tokenCount: nextTokenCount,
          unitStart,
          unitEnd,
          underlineLeftUnits: xUnits - metrics.noteHalfWidthUnits,
          underlineRightUnits: xUnits + metrics.noteHalfWidthUnits
        });
      });

      const tokenTotalUnits = slotItems.reduce((sum, item) => (
        sum + (item.kind === 'note' ? getLayoutUnits(item.note) : getLayoutUnits(item.placeholder))
      ), 0);
      carryUnits = Math.max(0, carryInUnits + tokenTotalUnits - TOKEN_CAPACITY_UNITS);
    });

    return nextNotes;
  }, [metrics.noteHalfWidthUnits]);
  const previousCrossBarNotes = React.useMemo(
    () => getNotationPreviewNotes(previousNotationForCrossBar),
    [getNotationPreviewNotes, previousNotationForCrossBar]
  );
  const nextCrossBarNotes = React.useMemo(
    () => getNotationPreviewNotes(nextNotationForCrossBar),
    [getNotationPreviewNotes, nextNotationForCrossBar]
  );

  React.useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    updateContainerWidth();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateContainerWidth();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [updateContainerWidth]);

  React.useLayoutEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      updateContainerWidth();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [compact, notation, renderMode, scale, tokenList, updateContainerWidth]);

  if (tokenList.length === 0 && !showPlaceholders && renderMode !== 'editor') {
    return (
      <div className={`flex items-center justify-center text-[10px] text-gray-300 italic ${className}`}>
        No Jianpu
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`relative w-full overflow-visible select-none ${className}`}
      style={{ height: `${metrics.height}px` }}
    >
      {tokenList.map((_, tokenIndex) => {
        const leftPercent = ((tokenIndex * TOKEN_WIDTH_UNITS) / totalWidthUnits) * 100;
        const widthPercent = (TOKEN_WIDTH_UNITS / totalWidthUnits) * 100;
        const isActive = activeTokenIndex === tokenIndex;
        const insertBoxWidth = renderMode === 'editor' ? 10 : 8;
        const insertBoxHeight = renderMode === 'editor' ? 24 : 18;
        const occupiedSlots = Math.max(0, Math.min(gridSlotCount, leadingOccupiedSlots[tokenIndex] ?? 0));
        const insertPosition = activeInsertPosition?.tokenIndex === tokenIndex
          ? activeInsertPosition
          : null;
        const insertVisibleSpanSlots = insertPosition
          ? Math.max(0, Math.min(insertPosition.spanSlots ?? 0, insertPosition.slotCount - insertPosition.slotIndex))
          : 0;
        const insertLeft = insertPosition
          ? `${leftPercent + ((widthPercent / insertPosition.slotCount) * insertPosition.slotIndex)}%`
          : `calc(${leftPercent + (widthPercent / 2)}% - ${insertBoxWidth / 2}px)`;
        const insertWidth = insertPosition && insertVisibleSpanSlots > 0
          ? `${widthPercent * (insertVisibleSpanSlots / insertPosition.slotCount)}%`
          : `${insertBoxWidth}px`;

        return (
          <React.Fragment key={`token-${tokenIndex}`}>
            {renderMode === 'editor' && occupiedSlots > 0 && (
              <span
                className="absolute rounded-md bg-slate-200/70"
                style={{
                  left: `${leftPercent}%`,
                  top: `${metrics.digitCenterY - (insertBoxHeight / 2)}px`,
                  width: `${(widthPercent * (occupiedSlots / gridSlotCount))}%`,
                  height: `${insertBoxHeight}px`
                }}
              />
            )}

            {isActive && (
              <span
                className="absolute bg-indigo-200/45 ring-1 ring-indigo-300/90"
                style={{
                  left: insertLeft,
                  top: `${metrics.digitCenterY - (insertBoxHeight / 2)}px`,
                  width: insertWidth,
                  height: `${insertBoxHeight}px`,
                  borderRadius: '4px',
                  transform: insertPosition && insertVisibleSpanSlots > 0 ? undefined : 'translateX(-50%)'
                }}
              />
            )}

            {showPlaceholders && !tokenList[tokenIndex]?.trim() && (
              <span
                className={`absolute rounded-full ${renderMode === 'editor' ? 'bg-gray-200' : 'bg-gray-100'}`}
                style={{
                  left: `calc(${leftPercent + (widthPercent / 2)}% - ${metrics.placeholderSize / 2}px)`,
                  top: `${metrics.digitCenterY - (metrics.placeholderSize / 2)}px`,
                  width: `${metrics.placeholderSize}px`,
                  height: `${metrics.placeholderSize}px`
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {underlineSegments.map((segment) => (
        (() => {
          const leftExtendUnits = renderMode === 'editor'
            ? 3.4
            : compact
              ? 1.2
              : 0.8;
          const rightExtendUnits = renderMode === 'editor'
            ? 3.4
            : compact
              ? 1.2
              : 0.8;
          const leftUnits = segment.leftUnits - leftExtendUnits;
          const rightUnits = segment.rightUnits + rightExtendUnits;
          const underlineTop = compact
            ? Math.round(metrics.underlineY + ((segment.level - 1) * metrics.underlineGap))
            : metrics.underlineY + ((segment.level - 1) * metrics.underlineGap);
          const underlineHeight = compact
            ? Math.max(1, Math.round(metrics.underlineStroke))
            : metrics.underlineStroke;
          const leftLocalUnits = leftUnits - (segment.tokenIndex * TOKEN_WIDTH_UNITS);
          const rightLocalUnits = rightUnits - (segment.tokenIndex * TOKEN_WIDTH_UNITS);
          const snappedLeftPx = useSnappedPixelCenter && containerWidth !== null
            ? getTokenAlignedPx(segment.tokenIndex, leftLocalUnits)
            : null;
          const snappedRightPx = useSnappedPixelCenter && containerWidth !== null
            ? getTokenAlignedPx(segment.tokenIndex, rightLocalUnits)
            : null;

          return (
            <span
              key={segment.key}
              className="absolute rounded-full bg-slate-700"
              style={{
                left: snappedLeftPx !== null
                  ? `${snappedLeftPx}px`
                  : `${(leftUnits / totalWidthUnits) * 100}%`,
                width: snappedLeftPx !== null && snappedRightPx !== null
                  ? `${Math.max(1, snappedRightPx - snappedLeftPx)}px`
                  : `${((rightUnits - leftUnits) / totalWidthUnits) * 100}%`,
                top: `${underlineTop}px`,
                height: `${underlineHeight}px`
              }}
            />
          );
        })()
      ))}

      {layoutNotes.map((note) => {
        const xPercent = (note.xUnits / totalWidthUnits) * 100;
        const noteLocalUnits = note.xUnits - (note.tokenIndex * TOKEN_WIDTH_UNITS);
        const centerPx = useSnappedPixelCenter && containerWidth !== null
          ? getTokenAlignedPx(note.tokenIndex, noteLocalUnits)
          : null;
        const centerLeft = centerPx !== null ? `${centerPx}px` : `${xPercent}%`;
        const isSelectedNote = activeNote?.tokenIndex === note.tokenIndex && activeNote?.noteIndex === note.noteIndex;
        const selectionStartUnits = note.tokenIndex * TOKEN_WIDTH_UNITS
          + (TOKEN_WIDTH_UNITS * (Math.min(note.unitStart, TOKEN_CAPACITY_UNITS) / TOKEN_CAPACITY_UNITS));
        const selectionVisibleSpanUnits = Math.max(
          0,
          Math.min(note.unitEnd, TOKEN_CAPACITY_UNITS) - Math.min(note.unitStart, TOKEN_CAPACITY_UNITS)
        );
        const selectionLeftPercent = (selectionStartUnits / totalWidthUnits) * 100;
        const selectionWidthPercent = ((TOKEN_WIDTH_UNITS * (selectionVisibleSpanUnits / TOKEN_CAPACITY_UNITS)) / totalWidthUnits) * 100;
        const selectionMetrics = renderMode === 'editor'
          ? note.duration === 'sixteenth'
            ? { width: 10, height: 23, radius: '4px' }
            : note.duration === 'eighth'
              ? { width: 12, height: 25, radius: '4px' }
              : { width: 15, height: 27, radius: '4px' }
          : { width: 18, height: 20, radius: '4px' };
        const hitMetrics = renderMode === 'editor'
          ? { width: 24, height: 28 }
          : { width: 18, height: 20 };

        if (!isSelectedNote && !onNoteClick) return null;

        return (
          <React.Fragment key={`note-ui-${note.tokenIndex}-${note.noteIndex}-${note.start}`}>
            {isSelectedNote && (
              <span
                className="absolute bg-indigo-200/60 ring-1 ring-indigo-300/90"
                style={{
                  left: renderMode === 'editor' && selectionVisibleSpanUnits > 0
                    ? `${selectionLeftPercent}%`
                    : centerLeft,
                  top: `${metrics.digitCenterY}px`,
                  transform: renderMode === 'editor' && selectionVisibleSpanUnits > 0
                    ? 'translateY(-50%)'
                    : 'translate(-50%, -50%)',
                  width: renderMode === 'editor' && selectionVisibleSpanUnits > 0
                    ? `${selectionWidthPercent}%`
                    : `${selectionMetrics.width}px`,
                  height: `${selectionMetrics.height}px`,
                  borderRadius: selectionMetrics.radius
                }}
              />
            )}

            {onNoteClick && (
              <button
                type="button"
                className="absolute z-30 bg-transparent"
                style={{
                  left: centerLeft,
                  top: `${metrics.digitCenterY}px`,
                  transform: 'translate(-50%, -50%)',
                  width: `${hitMetrics.width}px`,
                  height: `${hitMetrics.height}px`
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  onNoteClick(note.tokenIndex, note.noteIndex);
                }}
                aria-label={`Select jianpu note ${note.noteIndex + 1} in beat ${note.tokenIndex + 1}`}
              />
            )}
          </React.Fragment>
        );
      })}

      {layoutNotes.map((note) => {
        const xPercent = (note.xUnits / totalWidthUnits) * 100;
        const noteLocalUnits = note.xUnits - (note.tokenIndex * TOKEN_WIDTH_UNITS);
        const centerPx = useSnappedPixelCenter && containerWidth !== null
          ? getTokenAlignedPx(note.tokenIndex, noteLocalUnits)
          : null;
        const centerLeft = centerPx !== null ? `${centerPx}px` : `${xPercent}%`;
        const showHighDot = note.octave === 'high' && note.pitch !== '0' && note.pitch !== '-';
        const showLowDot = note.octave === 'low' && note.pitch !== '0' && note.pitch !== '-';
        const digit = note.pitch;
        const isSustain = digit === '-';
        const useDirectSustainPlacement = compact || renderMode === 'editor';
        const sustainWidth = metrics.digitFontSize * (renderMode === 'editor' ? 0.68 : compact ? 0.68 : 1.12);
        const snappedSustainWidth = useDirectSustainPlacement
          ? Math.max(6, Math.round(sustainWidth))
          : sustainWidth;
        const sustainHeight = Math.max(1.4, metrics.underlineStroke * 1.4);
        const snappedSustainHeight = useDirectSustainPlacement
          ? Math.max(1, Math.round(sustainHeight))
          : sustainHeight;
        const snappedSustainTop = useDirectSustainPlacement
          ? Math.round(metrics.digitCenterY - (snappedSustainHeight / 2))
          : metrics.digitCenterY;
        const useDirectOctaveDotPlacement = renderMode === 'editor' || compact;
        const useDirectDottedPlacement = renderMode === 'editor';
        const durationLevel = getDurationLevel(note);
        const snappedOctaveDotSize = useDirectOctaveDotPlacement
          ? Math.max(2, Math.round(metrics.octaveDotSize))
          : metrics.octaveDotSize;
        const snappedDottedDotSize = useDirectDottedPlacement
          ? Math.max(2, Math.round(metrics.dottedDotSize))
          : metrics.dottedDotSize;
        const snappedDottedDotTop = useDirectDottedPlacement
          ? Math.round(metrics.digitCenterY - (snappedDottedDotSize / 2))
          : metrics.digitCenterY;
        const snappedHighDotTop = useDirectOctaveDotPlacement
          ? Math.round(metrics.highDotY - (snappedOctaveDotSize / 2))
          : metrics.highDotY;
        const lowDotCenterY = note.octave === 'low' && durationLevel > 0
          ? (
            metrics.underlineY
            + ((durationLevel - 1) * metrics.underlineGap)
            + metrics.underlineStroke
            + (compact ? 1.1 : 2.2)
            + (snappedOctaveDotSize / 2)
          )
          : metrics.lowDotY;
        const snappedLowDotTop = useDirectOctaveDotPlacement
          ? Math.round(lowDotCenterY - (snappedOctaveDotSize / 2))
          : lowDotCenterY;
        const accidentalShiftX = renderMode === 'editor'
          ? 0
          : compact
            ? 0.08 * scale
            : 0.2 * scale;
        const accidentalPreviewPullIn = renderMode === 'editor'
          ? 0
          : compact
            ? 2.6 * scale
            : 2.2 * scale;
        const accidentalTopY = renderMode === 'editor'
          ? metrics.digitCenterY
          : metrics.digitCenterY - (
            compact
              ? metrics.digitFontSize * 0.44
              : metrics.digitFontSize * 0.38
          );

        return (
          <React.Fragment key={`${note.tokenIndex}-${note.noteIndex}-${note.start}`}>
            {note.accidental && (
              <span
                className="absolute leading-none"
                style={{
                  left: centerPx !== null
                    ? `${centerPx - metrics.accidentalOffsetX - accidentalShiftX + accidentalPreviewPullIn}px`
                    : `calc(${xPercent}% - ${metrics.accidentalOffsetX + accidentalShiftX - accidentalPreviewPullIn}px)`,
                  top: `${accidentalTopY}px`,
                  transform: 'translate(-50%, -50%)',
                  fontSize: `${renderMode === 'editor'
                    ? metrics.accidentalFontSize
                    : note.accidental === '#'
                      ? metrics.accidentalFontSize * 1.14
                      : metrics.accidentalFontSize}px`,
                  fontFamily: JIANPU_SYMBOL_FONT,
                  color: note.accidental === '#' ? '#1f2937' : '#020617',
                  fontWeight: note.accidental === '#' ? 600 : 700
                }}
              >
                {note.accidental}
              </span>
            )}

            {isSustain ? (
              <span
                className="absolute rounded-full bg-slate-700"
                style={{
                  left: useDirectSustainPlacement
                    ? centerPx !== null
                      ? `${centerPx - (snappedSustainWidth / 2)}px`
                      : `calc(${xPercent}% - ${snappedSustainWidth / 2}px)`
                    : centerLeft,
                  top: useDirectSustainPlacement
                    ? `${snappedSustainTop}px`
                    : `${metrics.digitCenterY}px`,
                  transform: useDirectSustainPlacement ? undefined : 'translate(-50%, -50%)',
                  width: `${snappedSustainWidth}px`,
                  height: `${snappedSustainHeight}px`
                }}
              />
            ) : (
              <span
                className="absolute font-medium text-slate-700 leading-none"
                style={{
                  left: centerLeft,
                  top: `${metrics.digitCenterY}px`,
                  transform: 'translate(-50%, -50%)',
                  fontSize: `${metrics.digitFontSize}px`,
                fontFamily: JIANPU_DIGIT_FONT,
                fontVariantNumeric: 'lining-nums tabular-nums'
              }}
            >
                {digit}
              </span>
            )}

            {note.dotted && (
              <span
                className="absolute rounded-full bg-slate-700"
                style={{
                  left: useDirectDottedPlacement
                    ? centerPx !== null
                      ? `${centerPx + metrics.dottedOffsetX - (snappedDottedDotSize / 2)}px`
                      : `calc(${xPercent}% + ${metrics.dottedOffsetX}px - ${snappedDottedDotSize / 2}px)`
                    : centerPx !== null
                      ? `${centerPx + metrics.dottedOffsetX}px`
                      : `calc(${xPercent}% + ${metrics.dottedOffsetX}px)`,
                  top: useDirectDottedPlacement
                    ? `${snappedDottedDotTop}px`
                    : `${metrics.digitCenterY}px`,
                  transform: useDirectDottedPlacement ? undefined : 'translate(-50%, -50%)',
                  width: `${snappedDottedDotSize}px`,
                  height: `${snappedDottedDotSize}px`
                }}
              />
            )}

            {showHighDot && (
              <span
                className="absolute rounded-full bg-slate-700"
                style={{
                  left: useDirectOctaveDotPlacement
                    ? centerPx !== null
                      ? `${centerPx + metrics.octaveDotOffsetX - (snappedOctaveDotSize / 2)}px`
                      : `calc(${xPercent}% + ${metrics.octaveDotOffsetX}px - ${snappedOctaveDotSize / 2}px)`
                    : centerPx !== null
                      ? `${centerPx + metrics.octaveDotOffsetX}px`
                      : `calc(${xPercent}% + ${metrics.octaveDotOffsetX}px)`,
                  top: useDirectOctaveDotPlacement
                    ? `${snappedHighDotTop}px`
                    : `${metrics.highDotY}px`,
                  transform: useDirectOctaveDotPlacement ? undefined : 'translate(-50%, -50%)',
                  width: `${snappedOctaveDotSize}px`,
                  height: `${snappedOctaveDotSize}px`
                }}
              />
            )}

            {showLowDot && (
              <span
                className="absolute rounded-full bg-slate-700"
                style={{
                  left: useDirectOctaveDotPlacement
                    ? centerPx !== null
                      ? `${centerPx + metrics.octaveDotOffsetX - (snappedOctaveDotSize / 2)}px`
                      : `calc(${xPercent}% + ${metrics.octaveDotOffsetX}px - ${snappedOctaveDotSize / 2}px)`
                    : centerPx !== null
                      ? `${centerPx + metrics.octaveDotOffsetX}px`
                      : `calc(${xPercent}% + ${metrics.octaveDotOffsetX}px)`,
                  top: useDirectOctaveDotPlacement
                    ? `${snappedLowDotTop}px`
                    : `${metrics.lowDotY}px`,
                  transform: useDirectOctaveDotPlacement ? undefined : 'translate(-50%, -50%)',
                  width: `${snappedOctaveDotSize}px`,
                  height: `${snappedOctaveDotSize}px`
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {slurSegments.length > 0 && (
        <svg
          className="absolute inset-0 h-full w-full overflow-visible pointer-events-none"
          viewBox={`0 0 ${containerWidth ?? totalWidthUnits} ${metrics.height}`}
          preserveAspectRatio="none"
        >
          {slurSegments.map((slur) => {
            if (
              compact &&
              slur.type === 'incoming' &&
              previousCrossBarNotes[previousCrossBarNotes.length - 1]?.slurStart
            ) {
              return null;
            }

            const isSelfSlur = slur.type === 'self' && slur.start && slur.end;
            const selfSpan = renderMode === 'editor' ? 12 : compact ? 10 : 18;
            const edgeOvershoot = renderMode === 'editor' ? 8 : compact ? 5 : 10;
            const startNote = slur.start ?? null;
            const endNote = slur.end ?? null;
            const crossBarNextEnd = compact && slur.type === 'outgoing'
              ? nextCrossBarNotes.find((note) => note.slurEnd)
              : null;
            const laneWidth = containerWidth ?? totalWidthUnits;
            const crossBarGap = compact ? 18 : 20;
            const slurAnchorXBias = compact ? 0 : renderMode === 'editor' ? 0 : -1.2;
            const rawStartX = startNote
              ? getRenderedNoteCenterX(startNote) + slurAnchorXBias
              : -edgeOvershoot;
            const rawEndX = crossBarNextEnd
              ? laneWidth + crossBarGap + getProjectedPreviewNoteCenterX(crossBarNextEnd, laneWidth) + slurAnchorXBias
              : endNote
                ? getRenderedNoteCenterX(endNote) + slurAnchorXBias
                : laneWidth + edgeOvershoot;
            const startX = isSelfSlur ? rawStartX - (selfSpan / 2) : rawStartX;
            const endX = isSelfSlur ? rawEndX + (selfSpan / 2) : rawEndX;
            const anchorY = getSlurAnchorY();
            const span = Math.max(10, endX - startX);
            const curveLift = Math.min(
              compact ? 10 : 18,
              Math.max(compact ? 4.6 : 7, span * (compact ? 0.24 : 0.22))
            );
            const controlY = Math.max(compact ? -10 : 1, anchorY - curveLift);
            const controlOffset = Math.max(4, span * 0.28);

            return (
              <path
                key={slur.key}
                d={`M ${startX} ${anchorY} C ${startX + controlOffset} ${controlY} ${endX - controlOffset} ${controlY} ${endX} ${anchorY}`}
                fill="none"
                stroke="rgba(71, 85, 105, 0.9)"
                strokeWidth={compact ? 1 : renderMode === 'editor' ? 1.2 : 1.4}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      )}

      {onTokenClick && tokenList.map((_, tokenIndex) => {
        const leftPercent = ((tokenIndex * TOKEN_WIDTH_UNITS) / totalWidthUnits) * 100;
        const widthPercent = (TOKEN_WIDTH_UNITS / totalWidthUnits) * 100;

        return (
          <button
            key={`hit-${tokenIndex}`}
            type="button"
            className="absolute inset-y-0 z-10 bg-transparent"
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              const relativeX = rect.width > 0
                ? (event.clientX - rect.left) / rect.width
                : 0.5;
              const slotIndex = Math.max(
                0,
                Math.min(
                  gridSlotCount - 1,
                  Math.floor(relativeX * gridSlotCount)
                )
              );
              onTokenClick(tokenIndex, slotIndex);
            }}
            aria-label={`Select jianpu beat ${tokenIndex + 1}`}
          />
        );
      })}
    </div>
  );
};

export default Jianpu;
