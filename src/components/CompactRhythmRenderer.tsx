import React from 'react';
import {
  BACH_QUARTER_STEM_RIGHT_INSET_EM,
  getBachGlyphAnchor,
  getBachNoteheadTopFromGlyphTop
} from '../lib/bachRhythmMetrics';
import type { CompactRhythmGeometry } from '../lib/rhythmGeometry';
import { getRhythmEventGlyph, type RhythmBase } from '../utils/rhythmUtils';

export interface CompactRhythmGlyphAnchor {
  noteheadTop: number;
  noteheadBottom: number;
}

interface CompactRhythmRendererProps {
  geometry: CompactRhythmGeometry;
  color: string;
  scale: number;
  beamStrokeScale: number;
  onGlyphAnchorsChange?: (anchors: Record<number, CompactRhythmGlyphAnchor>) => void;
}

interface MeasuredGlyphAnchor {
  top: number;
  stemX: number;
  noteheadTop: number;
  noteheadBottom: number;
}

type MeasuredGlyphAnchors = Record<number, MeasuredGlyphAnchor>;

const anchorsEqual = (left: MeasuredGlyphAnchors, right: MeasuredGlyphAnchors) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => {
    const index = Number(key);
    return Math.abs(left[index].top - right[index].top) < 0.01
      && Math.abs(left[index].stemX - right[index].stemX) < 0.01
      && Math.abs(left[index].noteheadTop - right[index].noteheadTop) < 0.01
      && Math.abs(left[index].noteheadBottom - right[index].noteheadBottom) < 0.01;
  });
};

const CompactRhythmRenderer: React.FC<CompactRhythmRendererProps> = ({
  geometry,
  color,
  scale,
  beamStrokeScale,
  onGlyphAnchorsChange
}) => {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [measuredGlyphAnchors, setMeasuredGlyphAnchors] = React.useState<MeasuredGlyphAnchors>({});
  const primaryBeamWidth = 1.15 * beamStrokeScale * scale;
  const secondaryBeamWidth = 1.05 * beamStrokeScale * scale;
  const secondaryBeamGap = 2.05 * scale;
  const fontSize = 17 * scale;
  const beamedEventIndices = React.useMemo(
    () => new Set(geometry.beams.flatMap((beam) => beam.eventIndices)),
    [geometry.beams]
  );

  React.useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const next: MeasuredGlyphAnchors = {};
      svg.querySelectorAll<SVGTextElement>('[data-rhythm-formal-symbol]').forEach((symbol) => {
        const eventIndex = Number(symbol.dataset.rhythmEventIndex);
        if (typeof symbol.getBBox !== 'function') return;
        const box = symbol.getBBox();
        if (!Number.isFinite(eventIndex) || box.width <= 0 || box.height <= 0) return;
        const displayBase = (symbol.dataset.rhythmDisplayBase || 'q') as RhythmBase;
        next[eventIndex] = {
          top: box.y,
          stemX: box.x + box.width - (fontSize * BACH_QUARTER_STEM_RIGHT_INSET_EM),
          noteheadTop: getBachNoteheadTopFromGlyphTop(box.y, fontSize, displayBase),
          // Up-stem ties belong below the notehead. The bottom of Bach's
          // visible glyph box is the lower notehead contour for these glyphs,
          // so keep this as a measured font anchor rather than a view offset.
          noteheadBottom: box.y + box.height
        };
      });
      setMeasuredGlyphAnchors((current) => anchorsEqual(current, next) ? current : next);
      onGlyphAnchorsChange?.(Object.fromEntries(
        Object.entries(next).map(([eventIndex, anchor]) => [eventIndex, {
          noteheadTop: anchor.noteheadTop,
          noteheadBottom: anchor.noteheadBottom
        }])
      ));
    };

    measure();
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [geometry, fontSize, onGlyphAnchorsChange, BACH_QUARTER_STEM_RIGHT_INSET_EM]);

  const getBeamDisplay = (beam: CompactRhythmGeometry['beams'][number]) => {
    const first = measuredGlyphAnchors[beam.eventIndices[0]];
    const last = measuredGlyphAnchors[beam.eventIndices.at(-1)!];
    const measuredMembers = beam.eventIndices
      .map((eventIndex) => measuredGlyphAnchors[eventIndex])
      .filter((anchor): anchor is MeasuredGlyphAnchor => Boolean(anchor));
    const y = measuredMembers.length === beam.eventIndices.length
      ? Math.min(...measuredMembers.map((anchor) => anchor.top))
      : beam.primary.y;

    return {
      x1: first?.stemX ?? beam.primary.x1,
      x2: last?.stemX ?? beam.primary.x2,
      y
    };
  };
  const displayedBeams = geometry.beams.map((beam) => ({ beam, display: getBeamDisplay(beam) }));

  const getTripletDisplay = (triplet: CompactRhythmGeometry['triplets'][number]) => {
    const matchingBeam = displayedBeams.find(({ beam }) => (
      triplet.eventIndices.every((eventIndex) => beam.eventIndices.includes(eventIndex))
    ));
    const measuredMembers = triplet.eventIndices
      .map((eventIndex) => measuredGlyphAnchors[eventIndex])
      .filter((anchor): anchor is MeasuredGlyphAnchor => Boolean(anchor));
    const symbolTop = measuredMembers.length > 0
      ? Math.min(...measuredMembers.map((anchor) => anchor.top))
      : triplet.bracketY + (2.55 * scale);
    const bracketY = triplet.showBracket
      ? symbolTop - (2.55 * scale)
      : matchingBeam?.display.y ?? triplet.bracketY;

    return {
      bracketY,
      numberY: bracketY - (5.1 * scale)
    };
  };

  return (
    <svg
      ref={svgRef}
      data-rhythm-geometry-svg
      className="absolute inset-0 h-full w-full overflow-visible pointer-events-none select-none"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {geometry.events.map(({ event, head, dot, accent }) => {
        const isBeamed = beamedEventIndices.has(event.index);
        const displayBase = isBeamed ? 'q' : event.base;
        const anchor = getBachGlyphAnchor(displayBase, event.isRest);
        const measuredAnchor = measuredGlyphAnchors[event.index];
        const accentY = accent
          ? (measuredAnchor?.top ?? accent.y + (3.25 * scale)) - (3.25 * scale)
          : null;

        return (
          <g
            data-rhythm-glyph
            data-rhythm-base={event.base}
            data-rhythm-rendered-beamed={isBeamed ? 'true' : 'false'}
            key={`bach-symbol-${event.index}`}
          >
            <text
              data-rhythm-notehead={!event.isRest ? 'true' : undefined}
              data-rhythm-formal-symbol
              data-rhythm-beamed-symbol={isBeamed ? 'true' : undefined}
              data-rhythm-event-index={event.index}
              data-rhythm-display-base={displayBase}
              data-rhythm-head-x={head.x}
              x={head.x + (anchor.xEm * fontSize)}
              y={(geometry.height / 2) + (anchor.yEm * fontSize)}
              fill={color}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="Bach, NotoMusic, serif"
              fontSize={fontSize}
            >
              {getRhythmEventGlyph({
                ...event,
                base: displayBase,
                dotted: false
              })}
            </text>
            {dot && (
              <circle data-rhythm-dot cx={dot.x} cy={dot.y} r={0.72 * scale} fill={color} />
            )}
            {accent && accentY !== null && (
              <path
                data-rhythm-accent
                d={`M ${accent.x - (1.45 * scale)} ${accentY - (2.05 * scale)} L ${accent.x + (1.45 * scale)} ${accentY} M ${accent.x - (1.45 * scale)} ${accentY + (2.05 * scale)} L ${accent.x + (1.45 * scale)} ${accentY}`}
                fill="none"
                stroke={color}
                strokeWidth={0.9 * scale}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}

      {displayedBeams.map(({ beam, display }, beamIndex) => (
        <g key={`beam-${beamIndex}`}>
          <line
            data-rhythm-primary-beam
            data-rhythm-beam-events={beam.eventIndices.join(',')}
            x1={display.x1}
            y1={display.y}
            x2={display.x2}
            y2={display.y}
            stroke={color}
            strokeWidth={primaryBeamWidth}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
          {beam.secondary.map((secondary, secondaryIndex) => {
            const sourceSpan = Math.max(0.001, beam.primary.x2 - beam.primary.x1);
            const displaySpan = display.x2 - display.x1;
            const mapX = (x: number) => display.x1 + (((x - beam.primary.x1) / sourceSpan) * displaySpan);
            return (
              <line
                data-rhythm-secondary-beam
                key={`secondary-${beamIndex}-${secondaryIndex}`}
                x1={mapX(secondary.x1)}
                y1={display.y + secondaryBeamGap}
                x2={mapX(secondary.x2)}
                y2={display.y + secondaryBeamGap}
                stroke={color}
                strokeWidth={secondaryBeamWidth}
                strokeLinecap="butt"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>
      ))}

      {geometry.triplets.map((triplet) => {
        const { bracketY, numberY } = getTripletDisplay(triplet);
        return (
          <g key={`triplet-${triplet.key}`}>
            {triplet.showBracket && (
              <path
                data-rhythm-triplet-bracket
                d={`M ${triplet.startX} ${bracketY + triplet.bracketDrop} L ${triplet.startX} ${bracketY} L ${triplet.endX} ${bracketY} L ${triplet.endX} ${bracketY + triplet.bracketDrop}`}
                fill="none"
                stroke={color}
                strokeWidth={0.8 * scale}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <text
              data-rhythm-triplet-number
              data-rhythm-triplet-base={triplet.base}
              x={triplet.centerX}
              y={numberY}
              fill={color}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
              fontSize={6.2 * scale}
              fontWeight={700}
            >
              3
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default CompactRhythmRenderer;
