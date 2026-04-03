import React from 'react';
import { getHeadCenterUnit, getRhythmEventGlyph, rationalizeRhythmDisplay } from '../utils/rhythmUtils';

interface RhythmNotationProps {
  notation: string;
  timeSignature: string;
  compact?: boolean;
  scale?: number;
  beamOffsetUnits?: number;
  beamVerticalOffset?: number;
  beamStrokeScale?: number;
  tieVerticalOffset?: number;
  tieFontScale?: number;
  accentVerticalOffset?: number;
  accentHorizontalOffset?: number;
  accentScale?: number;
  beamGroups?: boolean;
  renderMode?: 'preview' | 'editor';
  showSubdivisionGrid?: boolean;
  selectionMode?: 'insert' | 'event';
  className?: string;
  selectedEventIndex?: number | null;
  selectedInsertIndex?: number | null;
  onEventSelect?: (eventIndex: number) => void;
  onInsertSelect?: (insertIndex: number) => void;
}

const RhythmNotation: React.FC<RhythmNotationProps> = ({
  notation,
  timeSignature,
  compact = false,
  scale = 1,
  beamOffsetUnits = 0,
  beamVerticalOffset = 0,
  beamStrokeScale = 1,
  tieVerticalOffset = 0,
  tieFontScale = 1,
  accentVerticalOffset = 0,
  accentHorizontalOffset = 0,
  accentScale = 1,
  beamGroups = true,
  renderMode = 'preview',
  showSubdivisionGrid = false,
  selectionMode = 'insert',
  className = '',
  selectedEventIndex = null,
  selectedInsertIndex = null,
  onEventSelect,
  onInsertSelect
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const { parsed, glyphs, accents, ties } = React.useMemo(
    () => rationalizeRhythmDisplay(notation, timeSignature, { beamGroups }),
    [beamGroups, notation, timeSignature]
  );

  const isEmpty = !notation.trim();

  if (isEmpty && renderMode !== 'editor') {
    return (
      <div className={`flex items-center justify-center text-[10px] text-gray-300 italic ${className}`}>
        No Rhythm
      </div>
    );
  }

  const { beats, beatUnits, barUnits, overflow } = parsed;
  const minHeight = (compact ? 16 : 58) * scale;
  const stroke = overflow ? '#dc2626' : '#111827';
  const guide = overflow ? 'rgba(220, 38, 38, 0.16)' : 'rgba(17, 24, 39, 0.08)';
  const accentY = ((compact ? -9 : -2) + accentVerticalOffset) * scale;
  const tieAnchorY = (((compact ? 13.2 : 46.1) + (renderMode === 'editor' ? (compact ? -1.1 : -1.3) : 0)) + tieVerticalOffset) * scale;
  const tieStrokeWidth = (compact ? 0.9 : 1.15) * Math.max(0.9, Math.min(1.25, tieFontScale));
  const glyphFontSize = (compact ? 13 : 28) * scale;
  const editorGlyphFontSize = (compact ? 17 : 30) * scale;
  const editorBeamTop = (compact ? -2.8 : 6.6) * scale;
  const editorBeamGap = (compact ? 1.5 : 3.6) * scale;
  const editorBeamVisualExtension = compact ? 0.01 : 0.03;
  const useEditorStyleRenderer = renderMode === 'editor' || renderMode === 'preview';
  const previewRendererScale = renderMode === 'preview' ? 0.9 : 1;
  const effectiveBeamTop = (renderMode === 'preview' ? editorBeamTop + (compact ? 0.5 : 1.2) : editorBeamTop) + beamVerticalOffset;
  const editorBeamStroke = { primary: compact ? 1.15 : 1.55, secondary: compact ? 1.05 : 1.45 };
  const visibleEvents = parsed.events.filter((event) => !event.isHidden);
  const cursorUnits = React.useMemo(() => {
    if (visibleEvents.length === 0) {
      return [0];
    }

    const units: number[] = [];
    let cursor = 0;

    visibleEvents.forEach((event) => {
      while (cursor < event.startUnit) {
        units.push(cursor);
        cursor += 1;
      }
      units.push(event.startUnit);
      cursor = event.endUnit;
    });

    units.push(Math.min(cursor, barUnits));
    return Array.from(new Set(units)).sort((a, b) => a - b);
  }, [barUnits, visibleEvents]);
  const selectedCursorUnit = selectedInsertIndex;
  const selectedSlotVisual = React.useMemo(() => {
    if (selectedCursorUnit === null || selectedCursorUnit < 0) {
      return null;
    }

    const eventAtInsert = visibleEvents.find((event) => Math.abs(event.startUnit - selectedCursorUnit) < 0.001);
    if (eventAtInsert) {
      return {
        kind: 'event' as const,
        base: eventAtInsert.base,
        isRest: eventAtInsert.isRest,
        centerUnit: eventAtInsert.isRest
          ? eventAtInsert.startUnit + (eventAtInsert.durationUnits / 2)
          : getHeadCenterUnit(eventAtInsert)
      };
    }

    const insertUnit = selectedCursorUnit;
    const nextEvent = visibleEvents.find((event) => event.startUnit >= insertUnit + 0.001);
    const availableUnits = Math.max(0, (nextEvent?.startUnit ?? barUnits) - insertUnit);

    if (availableUnits <= 0.001) return null;

    const inferredBase =
      availableUnits >= 4 ? 'q' :
      availableUnits >= 2 ? 'e' :
      's';
    const inferredUnits = inferredBase === 'q' ? 4 : inferredBase === 'e' ? 2 : 1;

    return {
      kind: 'ghost' as const,
      startUnit: insertUnit,
      durationUnits: Math.min(availableUnits, inferredUnits),
      base: inferredBase as 'q' | 'e' | 's'
    };
  }, [barUnits, selectedCursorUnit, visibleEvents]);
  const hasSingleWholeEvent = visibleEvents.length === 1 && visibleEvents[0].base === 'w';

  const unitToPercent = (unit: number) => `${(unit * 100) / Math.max(1, barUnits)}%`;
  const unitToPercentNumber = (unit: number) => (unit * 100) / Math.max(1, barUnits);
  const getEditorBeamAnchorUnit = (event: typeof visibleEvents[number]) => getHeadCenterUnit(event) + 0.18;
  const visibleSelectableEvents = React.useMemo(
    () => visibleEvents,
    [visibleEvents]
  );
  const editorBeamGroups = React.useMemo(() => {
    if (!useEditorStyleRenderer) return [];

    const groups: Array<{
      eventIndices: number[];
      primaryStartUnit: number;
      primaryEndUnit: number;
      secondaryRuns: Array<{ startUnit: number; endUnit: number }>;
      secondaryTicks: Array<{ startUnit: number; endUnit: number }>;
    }> = [];
    let current: typeof visibleEvents = [];

    const canGroup = (event: typeof visibleEvents[number]) => (
      !event.isRest && (event.base === 'e' || event.base === 's')
    );

    const flush = () => {
      if (current.length < 2) {
        current = [];
        return;
      }

      const secondaryRuns: Array<{ startUnit: number; endUnit: number }> = [];
      const secondaryTicks: Array<{ startUnit: number; endUnit: number }> = [];
      let sixteenthRun: typeof visibleEvents = [];

      const flushSixteenthRun = () => {
        if (sixteenthRun.length >= 2) {
          secondaryRuns.push({
            startUnit: getEditorBeamAnchorUnit(sixteenthRun[0]),
            endUnit: getEditorBeamAnchorUnit(sixteenthRun[sixteenthRun.length - 1])
          });
        }
        sixteenthRun = [];
      };

      current.forEach((event, index) => {
        const next = current[index + 1];
        const previous = current[index - 1];
        if (event.base === 's') {
          sixteenthRun.push(event);

          const previousIsSixteenth = previous?.base === 's' && Math.abs(previous.endUnit - event.startUnit) < 0.001;
          const nextIsSixteenth = next?.base === 's' && Math.abs(event.endUnit - next.startUnit) < 0.001;

          if (!previousIsSixteenth && !nextIsSixteenth) {
            const center = getEditorBeamAnchorUnit(event);
            const partialLength = 0.44;
            const edgePartialLength = 0.5;
            secondaryTicks.push(
              index === 0
                ? { startUnit: center, endUnit: center + edgePartialLength }
                : index === current.length - 1
                  ? { startUnit: center - edgePartialLength, endUnit: center }
                  : { startUnit: center - (partialLength / 2), endUnit: center + (partialLength / 2) }
            );
          }
        } else {
          flushSixteenthRun();
        }

        if (!next || next.base !== 's' || Math.abs(next.startUnit - event.endUnit) > 0.001) {
          flushSixteenthRun();
        }
      });

      groups.push({
        eventIndices: current.map((event) => event.index),
        primaryStartUnit: getEditorBeamAnchorUnit(current[0]),
        primaryEndUnit: getEditorBeamAnchorUnit(current[current.length - 1]),
        secondaryRuns,
        secondaryTicks
      });

      current = [];
    };

    visibleEvents.forEach((event, index) => {
      const previous = current[current.length - 1];
      const sameBeatAsPrevious = previous
        ? Math.floor(previous.startUnit / beatUnits) === Math.floor(event.startUnit / beatUnits)
        : true;
      const contiguousWithPrevious = previous
        ? Math.abs(previous.endUnit - event.startUnit) < 0.001
        : true;

      if (
        canGroup(event)
        && sameBeatAsPrevious
        && contiguousWithPrevious
      ) {
        current.push(event);
      } else {
        flush();
        if (canGroup(event)) {
          current = [event];
        }
      }

      if (index === visibleEvents.length - 1) {
        flush();
      }
    });

    return groups;
  }, [beatUnits, useEditorStyleRenderer, visibleEvents]);
  const editorBeamedEventIndices = React.useMemo(
    () => new Set(editorBeamGroups.flatMap((group) => group.eventIndices)),
    [editorBeamGroups]
  );

  const selectNearestInsertSlot = (clientX: number) => {
    if (!onInsertSelect || !rootRef.current) return;

    const rect = rootRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const targetUnit = (relativeX / rect.width) * barUnits;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    cursorUnits.forEach((unit, index) => {
      const distance = Math.abs(unit - targetUnit);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    onInsertSelect(cursorUnits[nearestIndex] ?? 0);
  };

  const selectNearestEvent = (clientX: number) => {
    if (!onEventSelect || !rootRef.current || visibleSelectableEvents.length === 0) return;

    const rect = rootRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const targetUnit = (relativeX / rect.width) * barUnits;

    let nearestEvent = visibleSelectableEvents[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    visibleSelectableEvents.forEach((event) => {
      const centerUnit = event.startUnit + (event.durationUnits / 2);
      const distance = Math.abs(centerUnit - targetUnit);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEvent = event;
      }
    });

    onEventSelect(nearestEvent.index);
  };

  return (
    <div
      ref={rootRef}
      className={`relative w-full ${className}`}
      style={{ minHeight: `${minHeight}px` }}
      onMouseDown={(e) => {
        if (selectionMode === 'event' ? !onEventSelect : !onInsertSelect) return;
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
      }}
      onClick={(e) => {
        if (selectionMode === 'event' ? !onEventSelect : !onInsertSelect) return;
        if (e.target !== e.currentTarget) return;
        e.stopPropagation();
        if (selectionMode === 'event') {
          selectNearestEvent(e.clientX);
        } else {
          selectNearestInsertSlot(e.clientX);
        }
      }}
    >
      {!compact && Array.from({ length: beats + 1 }).map((_, idx) => {
        const left = unitToPercent(idx * beatUnits);
        return (
          <div
            key={`guide-${idx}`}
            className="absolute top-0"
            style={{
              left,
              height: '100%',
              borderLeft: `1px solid ${renderMode === 'editor' ? 'rgba(99, 102, 241, 0.08)' : guide}`,
              opacity: idx === 0 || idx === beats ? 1 : renderMode === 'editor' ? 0.52 : 0.9
            }}
          />
        );
      })}

      {showSubdivisionGrid && (
        <>
          {Array.from({ length: barUnits + 1 }).map((_, idx) => {
            const left = unitToPercent(idx);
            const isBeatBoundary = idx % beatUnits === 0;

            return (
              <div
                key={`subdivision-${idx}`}
                className="absolute top-[2px] bottom-[2px] pointer-events-none"
                style={{
                  left,
                  width: isBeatBoundary ? '2px' : '1px',
                  transform: 'translateX(-50%)',
                  backgroundColor: isBeatBoundary ? 'rgba(99, 102, 241, 0.22)' : 'rgba(99, 102, 241, 0.10)',
                  borderRadius: '999px'
                }}
              />
            );
          })}
        </>
      )}

      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          transform: `scale(${previewRendererScale})`,
          transformOrigin: 'center center'
        }}
      >
      {accents.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          viewBox={`0 0 100 ${minHeight}`}
          preserveAspectRatio="none"
        >
          {accents.map((accent) => {
            const x = (accent.centerUnit * 100) / Math.max(1, barUnits) + accentHorizontalOffset;
            return (
              <path
                key={`accent-${accent.eventIndex}`}
                d={`M ${x - (1.3 * accentScale)} ${accentY - (2.3 * accentScale)} L ${x + (1.3 * accentScale)} ${accentY} M ${x - (1.3 * accentScale)} ${accentY + (2.3 * accentScale)} L ${x + (1.3 * accentScale)} ${accentY}`}
                fill="none"
                stroke={stroke}
                strokeWidth={1 * Math.max(0.8, accentScale)}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      )}

      {ties.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          viewBox={`0 0 100 ${minHeight}`}
          preserveAspectRatio="none"
        >
          {ties.map((tie) => {
            const startX = unitToPercentNumber(tie.startHeadUnit);
            const endX = unitToPercentNumber(tie.endHeadUnit);
            const span = Math.max(1.8, endX - startX);
            const controlOffset = Math.max(1.2, span * 0.28);
            const curveDepth = Math.min(
              compact ? 4.2 : 8.6,
              Math.max(compact ? 2.3 : 4.8, span * (compact ? 0.34 : 0.24))
            ) * Math.max(0.92, Math.min(1.18, tieFontScale));
            const controlY = Math.min(minHeight - (compact ? 0.4 : 0.8), tieAnchorY + curveDepth);

            return (
              <path
                key={`tie-${tie.eventIndex}`}
                d={`M ${startX} ${tieAnchorY} C ${startX + controlOffset} ${controlY} ${endX - controlOffset} ${controlY} ${endX} ${tieAnchorY}`}
                fill="none"
                stroke={stroke}
                strokeWidth={tieStrokeWidth}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      )}

      {useEditorStyleRenderer && editorBeamGroups.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          viewBox={`0 0 100 ${minHeight}`}
          preserveAspectRatio="none"
        >
          {editorBeamGroups.map((group, index) => (
            <g key={`editor-beam-${index}`}>
              <line
                x1={unitToPercentNumber(Math.max(0, group.primaryStartUnit - editorBeamVisualExtension + beamOffsetUnits))}
                y1={effectiveBeamTop}
                x2={unitToPercentNumber(Math.min(barUnits, group.primaryEndUnit + editorBeamVisualExtension + beamOffsetUnits))}
                y2={effectiveBeamTop}
                stroke={stroke}
                strokeWidth={editorBeamStroke.primary * beamStrokeScale}
                strokeLinecap="butt"
                vectorEffect="non-scaling-stroke"
              />
              {group.secondaryRuns.map((run, runIndex) => (
                <line
                  key={`editor-beam-secondary-${index}-${runIndex}`}
                  x1={unitToPercentNumber(Math.max(0, run.startUnit - editorBeamVisualExtension + beamOffsetUnits))}
                  y1={effectiveBeamTop + editorBeamGap}
                  x2={unitToPercentNumber(Math.min(barUnits, run.endUnit + editorBeamVisualExtension + beamOffsetUnits))}
                  y2={effectiveBeamTop + editorBeamGap}
                  stroke={stroke}
                  strokeWidth={editorBeamStroke.secondary * beamStrokeScale}
                  strokeLinecap="butt"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {group.secondaryTicks.map((tick, tickIndex) => (
                <line
                  key={`editor-beam-secondary-tick-${index}-${tickIndex}`}
                  x1={unitToPercentNumber(Math.max(0, tick.startUnit - editorBeamVisualExtension + beamOffsetUnits))}
                  y1={effectiveBeamTop + editorBeamGap}
                  x2={unitToPercentNumber(Math.min(barUnits, tick.endUnit + editorBeamVisualExtension + beamOffsetUnits))}
                  y2={effectiveBeamTop + editorBeamGap}
                  stroke={stroke}
                  strokeWidth={editorBeamStroke.secondary * beamStrokeScale}
                  strokeLinecap="butt"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ))}
        </svg>
      )}

      {selectionMode === 'insert' && selectedSlotVisual && (
        selectedSlotVisual.kind === 'event' ? (
          <div
            className="absolute top-0 bottom-0 z-[1] pointer-events-none"
            style={{ left: unitToPercent(selectedSlotVisual.centerUnit), width: 0 }}
          >
            <span
              className={`${selectedSlotVisual.base === 's' ? 'rounded-[12px]' : 'rounded-[8px]'} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-400/18 ring-1 ring-indigo-400/45`}
              style={{
                width:
                  selectedSlotVisual.base === 'w' ? (compact ? '24px' : '30px')
                  : selectedSlotVisual.base === 'h' ? (compact ? '20px' : '26px')
                  : selectedSlotVisual.base === 'q' ? (compact ? '17px' : '22px')
                  : selectedSlotVisual.base === 'e' ? (compact ? '15px' : '19px')
                  : (compact ? '14px' : '17px'),
                height:
                  selectedSlotVisual.base === 's' ? (compact ? '28px' : '34px')
                  : selectedSlotVisual.isRest ? (compact ? '26px' : '32px')
                  : (compact ? '30px' : '36px')
              }}
            />
          </div>
        ) : (
          <div
            className="absolute top-0 bottom-0 z-[1] pointer-events-none"
            style={{
              left: unitToPercent(selectedSlotVisual.startUnit),
              width: unitToPercent(selectedSlotVisual.durationUnits)
            }}
          >
            {selectedSlotVisual.base === 's' ? (
              <span
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/18 ring-1 ring-indigo-400/45"
                style={{
                  width: '72%',
                  maxWidth: compact ? '14px' : '18px',
                  height: compact ? '26px' : '34px'
                }}
              />
            ) : selectedSlotVisual.base === 'e' ? (
              <span
                className="absolute top-[2px] bottom-[2px] left-[14%] right-[14%] rounded-[10px] bg-indigo-400/18 ring-1 ring-indigo-400/45"
              />
            ) : (
              <span
                className="absolute top-[2px] bottom-[2px] left-[8%] right-[8%] rounded-[10px] bg-indigo-400/18 ring-1 ring-indigo-400/45"
              />
            )}
          </div>
        )
      )}

      {onInsertSelect && selectionMode === 'insert' && (
        <>
          {cursorUnits.map((unit, insertIndex) => {
            const previousUnit = insertIndex === 0 ? 0 : cursorUnits[insertIndex - 1];
            const nextUnit = insertIndex === cursorUnits.length - 1 ? barUnits : cursorUnits[insertIndex + 1];
            const regionStart = insertIndex === 0 ? 0 : (previousUnit + unit) / 2;
            const regionEnd = insertIndex === cursorUnits.length - 1 ? barUnits : (unit + nextUnit) / 2;
            return (
              <button
                key={`insert-slot-${insertIndex}`}
                type="button"
                className="group absolute top-0 bottom-0 z-[2]"
                style={{
                  left: unitToPercent(regionStart),
                  width: unitToPercent(Math.max(0.001, regionEnd - regionStart))
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertSelect(unit);
                }}
                aria-label={`Insert rhythm note at position ${insertIndex + 1}`}
              >
                <span className="absolute inset-0 opacity-0" />
              </button>
            );
          })}
        </>
      )}

      {onEventSelect && parsed.events.filter((event) => !event.isHidden).map((event) => {
        const isSelected = selectedEventIndex === event.index;
        const isSixteenth = event.base === 's';
        return (
          <button
            key={`event-hit-${event.index}`}
            type="button"
            className="absolute top-0 bottom-0 z-[1] rounded-[6px] transition-colors"
            style={{
              left: unitToPercent(event.startUnit),
              width: unitToPercent(event.durationUnits),
              backgroundColor: isSelected && !isSixteenth ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
              boxShadow: isSelected && !isSixteenth ? 'inset 0 0 0 1px rgba(99, 102, 241, 0.22)' : 'none'
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              if (selectionMode === 'insert') {
                onInsertSelect?.(event.startUnit);
              } else {
                onEventSelect(event.index);
              }
            }}
            aria-label={`Select rhythm note ${event.index + 1}`}
          >
            {selectionMode === 'event' && isSelected && isSixteenth && (
              <span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/18 ring-1 ring-indigo-400/45"
                style={{
                  left: '50%',
                  width: '72%',
                  maxWidth: compact ? '14px' : '18px',
                  height: compact ? '26px' : '34px'
                }}
              />
            )}
          </button>
        );
      })}

      <div
        className="relative z-[2] grid items-center pointer-events-none"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, barUnits)}, minmax(0, 1fr))`,
          minHeight: `${minHeight}px`
        }}
      >
        {useEditorStyleRenderer
          ? visibleEvents.map((event) => {
              const isEditorBeamed = editorBeamedEventIndices.has(event.index) && !event.isRest && (event.base === 'e' || event.base === 's');
              const isWholeDuration = event.durationUnits >= parsed.barUnits;
              const isHalfDuration = event.base === 'h';
              const centerUnit = (
                event.isRest
                ? event.startUnit + (event.durationUnits / 2)
                : isWholeDuration
                  ? event.startUnit + (event.durationUnits / 2)
                  : getHeadCenterUnit(event)
              );
              const displayGlyph = isEditorBeamed
                ? getRhythmEventGlyph({
                    base: 'q',
                    isRest: false,
                    dotted: false,
                    isHidden: false
                  })
                : getRhythmEventGlyph({
                    ...event,
                    dotted: false
                  });

              return (
                <React.Fragment key={`editor-glyph-${event.index}`}>
                  <span
                    className="absolute z-[2] select-none font-rhythm leading-none whitespace-pre"
                    style={{
                      left: unitToPercent(centerUnit),
                      top: '50%',
                      color: stroke,
                    transform: `translate(-50%, ${
                      event.isRest
                        ? '-62%'
                        : isWholeDuration
                          ? '-53%'
                          : isHalfDuration
                            ? '-50%'
                            : (isEditorBeamed || event.base === 'e' || event.base === 's')
                              ? '-54%'
                              : '-48.5%'
                    })`,
                      fontSize: `${hasSingleWholeEvent && isWholeDuration ? editorGlyphFontSize * 1.16 : editorGlyphFontSize}px`
                    }}
                  >
                    {displayGlyph}
                  </span>
                  {event.dotted && (
                    <span
                      className="absolute z-[3] select-none leading-none"
                      style={{
                        left: unitToPercent(centerUnit),
                        top: '50%',
                        color: stroke,
                        transform: `translate(${compact ? '3px' : '4px'}, ${
                          event.isRest
                            ? '-62%'
                            : isEditorBeamed
                              ? '-32%'
                              : '-10%'
                        })`,
                        fontSize: `${compact ? 5 : 7}px`
                      }}
                    >
                      •
                    </span>
                  )}
                </React.Fragment>
              );
            })
          : glyphs.map((glyph, idx) => {
          const span = Math.max(1, Math.round(glyph.spanUnits));
          const start = Math.max(1, Math.round(glyph.startUnit) + 1);
          const isWholeDuration = span >= parsed.barUnits;
          const isHalfDuration = span === 8;
          const anchorToStartBeat = isHalfDuration;
          const alignAbsolutely = isWholeDuration || isHalfDuration;
          const currentGlyphFontSize = hasSingleWholeEvent && isWholeDuration ? glyphFontSize * 1.18 : glyphFontSize;

          if (alignAbsolutely) {
            const anchorUnit = anchorToStartBeat
              ? glyph.startUnit + (beatUnits / 2)
              : glyph.startUnit + (glyph.spanUnits / 2);

            return (
              <span
                key={`glyph-${idx}-${glyph.startUnit}-${glyph.text}`}
                className="absolute z-[2] select-none font-rhythm leading-none whitespace-pre"
                style={{
                  left: unitToPercent(anchorUnit),
                  top: '50%',
                  color: stroke,
                  transform: 'translate(-50%, -50%)',
                  fontSize: `${currentGlyphFontSize}px`
                }}
              >
                {glyph.text}
              </span>
            );
          }

          return (
            <span
              key={`glyph-${idx}-${glyph.startUnit}-${glyph.text}`}
              className="justify-self-center self-center select-none font-rhythm leading-none whitespace-pre"
              style={{
                gridColumn: `${start} / span ${span}`,
                color: stroke,
                fontSize: `${currentGlyphFontSize}px`
              }}
            >
              {glyph.text}
            </span>
          );
        })}
      </div>
      </div>

      {isEmpty && renderMode === 'editor' && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-gray-300 italic">Click to start entering rhythm</span>
        </div>
      )}
    </div>
  );
};

export default RhythmNotation;
