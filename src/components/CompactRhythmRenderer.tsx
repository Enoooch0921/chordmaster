import React from 'react';
import {
  BACH_QUARTER_STEM_RIGHT_INSET_EM,
  BACH_QUARTER_OUTLINE_METRICS,
  getBachNoteContoursFromBaseline,
  getBachCrossHeadProfile,
  getBachGlyphAnchor,
  getBachNoteheadTopFromGlyphTop
} from '../lib/bachRhythmMetrics';
import { getRhythmAccentShape, getTupletBracketPath, type CompactRhythmGeometry } from '../lib/rhythmGeometry';
import { getRhythmEventGlyph, type RhythmBase } from '../utils/rhythmUtils';
import BeatSlashGlyph from './BeatSlashGlyph';

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
  stemHalfWidth: number;
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
      && Math.abs(left[index].stemHalfWidth - right[index].stemHalfWidth) < 0.01
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
  const [numberMetrics, setNumberMetrics] = React.useState({ width:3.6, height:6.2, centerX:0, centerY:0, ink:false });
  const numberFont = 'Georgia, "Times New Roman", serif';
  const primaryBeamWidth = 1.15 * beamStrokeScale * scale;
  const secondaryBeamWidth = 1.05 * beamStrokeScale * scale;
  const secondaryBeamGap = 2.05 * scale;
  const fontSize = 17 * scale;
  // Crossheads share Bach's baseline and stem weight. Ordinary notes keep the
  // same font glyphs even when a crosshead occurs elsewhere in the measure.
  const hasCrossHeads = geometry.events.some(({ event }) => event.crossHead);
  const beamedEventIndices = React.useMemo(
    () => new Set(geometry.beams.flatMap((beam) => beam.eventIndices)),
    [geometry.beams]
  );
  const groupedTripletIndices = new Set(geometry.triplets.flatMap(group => group.eventIndices));
  const probeBases = [...new Set([
    ...geometry.events.filter(({ event }) => !event.isRest && !event.isSlash && !event.crossHead)
      .map(({ event }) => beamedEventIndices.has(event.index) ? 'q' as const : event.base),
    ...(hasCrossHeads ? ['q' as const] : [])
  ])];
  const stemHalfWidth = (BACH_QUARTER_OUTLINE_METRICS.stemRight - BACH_QUARTER_OUTLINE_METRICS.stemLeft)
      / (2 * BACH_QUARTER_OUTLINE_METRICS.unitsPerEm) * fontSize;
  const quarterStemOffset = (getBachGlyphAnchor('q', false).xEm
    + ((BACH_QUARTER_OUTLINE_METRICS.stemLeft + BACH_QUARTER_OUTLINE_METRICS.stemRight)
      / 2 - BACH_QUARTER_OUTLINE_METRICS.advanceWidth / 2)
      / BACH_QUARTER_OUTLINE_METRICS.unitsPerEm) * fontSize;

  React.useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const next: MeasuredGlyphAnchors = {};
      const numberProbe = svg.querySelector<SVGTextElement>('[data-rhythm-tuplet-number-probe]');
      if (numberProbe) {
        const context = typeof CanvasRenderingContext2D === 'undefined' ? null : document.createElement('canvas').getContext('2d');
        let metrics: typeof numberMetrics | null = null;
        if (context) {
          context.font = `italic 500 ${6.2*scale}px ${numberFont}`;
          context.textAlign = 'center';
          context.textBaseline = 'alphabetic';
          const ink = context.measureText('3');
          if (ink.actualBoundingBoxLeft+ink.actualBoundingBoxRight > 0 && ink.actualBoundingBoxAscent+ink.actualBoundingBoxDescent > 0) {
            metrics = { width:(ink.actualBoundingBoxLeft+ink.actualBoundingBoxRight)/scale,
              height:(ink.actualBoundingBoxAscent+ink.actualBoundingBoxDescent)/scale,
              centerX:(ink.actualBoundingBoxRight-ink.actualBoundingBoxLeft)/2/scale,
              centerY:(ink.actualBoundingBoxDescent-ink.actualBoundingBoxAscent)/2/scale, ink:true };
          }
        }
        if (!metrics && typeof numberProbe.getBBox === 'function') {
          const box = numberProbe.getBBox();
          if (box.width > 0 && box.height > 0) metrics = { width:box.width/scale, height:box.height/scale,
            centerX:(box.x+box.width/2)/scale, centerY:(box.y+box.height/2)/scale, ink:false };
        }
        if (metrics) {
          const measured = metrics;
          setNumberMetrics(current => current.ink === measured.ink && (['width','height','centerX','centerY'] as const)
            .every(key => Math.abs(current[key]-measured[key])<.01) ? current : measured);
        }
      }
      const referenceYs = new Map<RhythmBase, number>();
      svg.querySelectorAll<SVGTextElement>('[data-rhythm-metric-probe]').forEach(probe => {
        if (typeof probe.getBBox !== 'function') return;
        const box = probe.getBBox();
        if (box.height > 0) referenceYs.set(probe.dataset.rhythmMetricProbe as RhythmBase, box.y);
      });
      const crossProbe = svg.querySelector<SVGTextElement>('[data-rhythm-cross-anchor-probe]');
      const crossProbeBox = typeof crossProbe?.getBBox === 'function' ? crossProbe.getBBox() : null;
      const quarterReferenceY = referenceYs.get('q');
      const crossContours = crossProbeBox && crossProbeBox.height > 0 && quarterReferenceY !== undefined
        ? getBachNoteContoursFromBaseline(crossProbeBox.y - quarterReferenceY, fontSize, 'q') : null;
      geometry.events.forEach(({ event, head, stem }) => {
        if (!event.crossHead || event.isRest || event.isSlash) return;
        const centerY = crossContours
          ? (crossContours.noteheadTop + crossContours.noteheadBottom) / 2
            + (event.crossHead === 'upper' ? -5 * scale : 0)
          : head.y;
        const profile = getBachCrossHeadProfile(head.x, centerY, fontSize);
        next[event.index] = {
          top: crossContours?.top ?? stem?.top ?? profile.top,
          stemX: head.x + quarterStemOffset,
          stemHalfWidth,
          noteheadTop: profile.top,
          noteheadBottom: profile.bottom
        };
      });
      svg.querySelectorAll<SVGTextElement>('[data-rhythm-formal-symbol]').forEach((symbol) => {
        const eventIndex = Number(symbol.dataset.rhythmEventIndex);
        if (typeof symbol.getBBox !== 'function') return;
        const box = symbol.getBBox();
        if (!Number.isFinite(eventIndex) || box.width <= 0 || box.height <= 0) return;
        const displayBase = (symbol.dataset.rhythmDisplayBase || 'q') as RhythmBase;
        // SVG text bounds include the font's line box, not the visible stem.
        // A matching glyph probe cancels each base's baseline offset. Dots,
        // ties and triplet brackets need the same ink contours as beams.
        const referenceY = referenceYs.get(displayBase);
        const baseline = symbol.hasAttribute('data-rhythm-notehead') && referenceY !== undefined
          ? box.y - referenceY : null;
        const contours = baseline !== null ? getBachNoteContoursFromBaseline(baseline, fontSize, displayBase) : null;
        const top = contours?.top ?? box.y;
        next[eventIndex] = {
          top,
          stemX: box.x + box.width - (fontSize * BACH_QUARTER_STEM_RIGHT_INSET_EM),
          stemHalfWidth,
          noteheadTop: contours?.noteheadTop ?? getBachNoteheadTopFromGlyphTop(top, fontSize, displayBase),
          noteheadBottom: contours?.noteheadBottom ?? box.y + box.height
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
    document.fonts?.addEventListener?.('loadingdone', measure);
    return () => {
      cancelled = true;
      document.fonts?.removeEventListener?.('loadingdone', measure);
    };
  }, [geometry, fontSize, scale, quarterStemOffset, stemHalfWidth, onGlyphAnchorsChange]);

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
      leftCap: first?.stemHalfWidth ?? stemHalfWidth,
      rightCap: last?.stemHalfWidth ?? stemHalfWidth,
      y
    };
  };
  const displayedBeams = geometry.beams.map((beam) => ({ beam, display: getBeamDisplay(beam) }));
  const displayedAccents = new Map(geometry.events.flatMap(({ event, head, stem, accent }) => {
    if (!accent) return [];
    const symbolTop = measuredGlyphAnchors[event.index]?.top ?? stem?.top ?? head.y - 1.42 * scale;
    const beamHalfWidth = beamedEventIndices.has(event.index) ? primaryBeamWidth / 2 : 0;
    return [[event.index, getRhythmAccentShape(accent.x, symbolTop - beamHalfWidth - 1.4 * scale, scale)] as const];
  }));

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
    const accentTop = Math.min(...triplet.eventIndices.map(index => displayedAccents.get(index)?.top ?? Infinity));
    const endpoint = (index: number, fallback: number) => {
      const member = geometry.events.find(item => item.event.index === index);
      if (!member || member.event.isRest || member.event.isSlash) return fallback;
      if (beamedEventIndices.has(index) || member.event.crossHead) return measuredGlyphAnchors[index]?.stemX ?? member.head.x + quarterStemOffset;
      // Flagged glyphs extend past the stem. Their rightmost ink is not its anchor.
      return member.head.x + quarterStemOffset
        + (getBachGlyphAnchor(member.event.base, false).xEm-getBachGlyphAnchor('q', false).xEm)*fontSize;
    };
    const startX = endpoint(triplet.eventIndices[0], triplet.startX);
    const endX = endpoint(triplet.eventIndices[2], triplet.endX);
    const centerX = !triplet.showBracket && matchingBeam
      ? (matchingBeam.display.x1+matchingBeam.display.x2)/2 : (startX+endX)/2;
    // Keep both horizontal arms longer than their hooks on short tuplet spans.
    const numberPadding = .6;
    const minimumArm = 2.4;
    const markScale = triplet.showBracket
      ? Math.min(scale, Math.max(1,endX-startX)/(numberMetrics.width+2*(numberPadding+minimumArm))) : scale;
    const halfNumberHeight = numberMetrics.height * markScale / 2;
    const bracketDrop = 1.7 * markScale;
    const clearance = 2 * scale;
    const bracketY = triplet.showBracket
      ? Math.min(symbolTop, accentTop) - Math.max(halfNumberHeight, bracketDrop) - clearance
      : matchingBeam?.display.y ?? triplet.bracketY;
    const numberCenterY = triplet.showBracket ? bracketY
      : Math.min(bracketY - primaryBeamWidth / 2, accentTop) - halfNumberHeight - clearance;
    return {
      bracketY,
      bracketDrop,
      startX,
      endX,
      centerX,
      markScale,
      halfGap: (numberMetrics.width / 2 + numberPadding) * markScale,
      numberX:centerX-numberMetrics.centerX*markScale,
      numberY:numberCenterY-numberMetrics.centerY*markScale
    };
  };

  return (
    <svg
      ref={svgRef}
      data-rhythm-geometry-svg
      className="absolute inset-0 z-[2] h-full w-full overflow-visible pointer-events-none select-none"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {geometry.triplets.length > 0 && <text data-rhythm-tuplet-number-probe opacity={0}
        x={0} y={0} textAnchor="middle" dominantBaseline="alphabetic"
        fontFamily={numberFont} fontStyle="italic" fontSize={6.2*scale} fontWeight={500}>3</text>}
      {probeBases.map(base => <text key={base}
        data-rhythm-metric-probe={base}
        x={0} y={0} dominantBaseline="alphabetic" opacity={0}
        fontFamily="Bach, NotoMusic, serif" fontSize={fontSize}
      >{getRhythmEventGlyph({ base, isRest: false, dotted: false, isHidden: false, isSlash: false })}</text>)}
      {hasCrossHeads && <text data-rhythm-cross-anchor-probe opacity={0}
        x={0} y={geometry.height / 2 + getBachGlyphAnchor('q', false).yEm * fontSize}
        dominantBaseline="central" fontFamily="Bach, NotoMusic, serif" fontSize={fontSize}
      >{getRhythmEventGlyph({ base: 'q', isRest: false, dotted: false, isHidden: false, isSlash: false })}</text>}
      {geometry.events.map(({ event, head, stem, flagCount, dot }) => {
        const isBeamed = beamedEventIndices.has(event.index);
        const displayBase = isBeamed ? 'q' : event.base;
        const anchor = event.isSlash ? { xEm: 0, yEm: 0 } : getBachGlyphAnchor(displayBase, event.isRest);
        const measuredAnchor = measuredGlyphAnchors[event.index];
        const displayHeadY = measuredAnchor ? (measuredAnchor.noteheadTop + measuredAnchor.noteheadBottom) / 2 : head.y;
        const displayStemX = measuredAnchor?.stemX ?? head.x + quarterStemOffset;
        const displayStemTop = measuredAnchor?.top ?? stem?.top ?? head.y;
        const crossProfile = event.crossHead ? getBachCrossHeadProfile(head.x, displayHeadY, fontSize) : null;
        const slashWidth = fontSize * 0.7;
        const slashHeight = fontSize * 0.92;
        const accent = displayedAccents.get(event.index);

        return (
          <g
            data-rhythm-glyph
            data-rhythm-base={event.base}
            data-rhythm-rendered-beamed={isBeamed ? 'true' : 'false'}
            key={`bach-symbol-${event.index}`}
          >
            {event.isSlash ? (
              <BeatSlashGlyph
                data-rhythm-slash="true"
                data-rhythm-event-index={event.index}
                data-rhythm-display-base={displayBase}
                data-rhythm-head-x={head.x}
                x={head.x - (slashWidth / 2)}
                y={(geometry.height / 2) - (slashHeight / 2)}
                width={slashWidth}
                height={slashHeight}
                color={color}
                className="overflow-visible"
              />
            ) : event.crossHead && !event.isRest ? (
              <g data-rhythm-event-index={event.index} data-rhythm-vector-note>
                  <path
                    data-rhythm-notehead="true"
                    data-rhythm-cross-head={event.crossHead}
                    data-rhythm-head-x={crossProfile!.centerX}
                    data-rhythm-head-y={displayHeadY}
                    d={crossProfile!.path}
                    fill={color}
                  />
                {stem && <line data-rhythm-stem x1={displayStemX} x2={displayStemX}
                  y1={displayStemTop} y2={crossProfile!.stemBottom} stroke={color} strokeWidth={stemHalfWidth * 2} />}
                {stem && Array.from({ length: flagCount }, (_, index) => {
                  const y = displayStemTop + index * 3.2 * scale;
                  return <path key={index} data-rhythm-flag d={`M ${displayStemX} ${y} C ${displayStemX + 1.2 * scale} ${y + 3 * scale} ${displayStemX + 6 * scale} ${y + 3 * scale} ${displayStemX + 2.2 * scale} ${y + 8 * scale} C ${displayStemX + 4 * scale} ${y + 4 * scale} ${displayStemX} ${y + 4 * scale} ${displayStemX} ${y + 2 * scale} Z`} fill={color} />;
                })}
              </g>
            ) : (
              <text
                data-rhythm-notehead={!event.isRest ? 'true' : undefined}
                data-rhythm-formal-symbol
                data-rhythm-beamed-symbol={isBeamed ? 'true' : undefined}
                data-rhythm-event-index={event.index}
                data-rhythm-display-base={displayBase}
                data-rhythm-head-x={head.x}
                data-rhythm-head-y={displayHeadY}
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
            )}
            {event.triplet && !groupedTripletIndices.has(event.index) && (
              <text data-rhythm-incomplete-triplet x={head.x} y={-2 * scale}
                textAnchor="middle" fontSize={6 * scale} fontFamily="sans-serif" fill={color}>3</text>
            )}
            {dot && (
              <circle data-rhythm-dot cx={dot.x}
                cy={!event.isRest && measuredAnchor ? (measuredAnchor.noteheadTop + measuredAnchor.noteheadBottom) / 2 : dot.y}
                r={0.72 * scale} fill={color} />
            )}
            {accent && (
              <path
                data-rhythm-accent
                data-rhythm-event-index={event.index}
                d={accent.path}
                fill={color}
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
            x1={display.x1 - display.leftCap}
            y1={display.y}
            x2={display.x2 + display.rightCap}
            y2={display.y}
            stroke={color}
            strokeWidth={primaryBeamWidth}
            strokeLinecap="butt"
          />
          {beam.secondary.map((secondary, secondaryIndex) => {
            const sourceSpan = Math.max(0.001, beam.primary.x2 - beam.primary.x1);
            const displaySpan = display.x2 - display.x1;
            const mapX = (x: number) => display.x1 + (((x - beam.primary.x1) / sourceSpan) * displaySpan);
            const capAt = (x: number) => {
              const member = geometry.events.find(({ event, stem }) => stem
                && beam.eventIndices.includes(event.index) && Math.abs(stem.x - x) < 0.001);
              return member ? measuredGlyphAnchors[member.event.index]?.stemHalfWidth ?? stemHalfWidth : 0;
            };
            return (
              <line
                data-rhythm-secondary-beam
                key={`secondary-${beamIndex}-${secondaryIndex}`}
                x1={mapX(secondary.x1) - capAt(secondary.x1)}
                y1={display.y + secondaryBeamGap}
                x2={mapX(secondary.x2) + capAt(secondary.x2)}
                y2={display.y + secondaryBeamGap}
                stroke={color}
                strokeWidth={secondaryBeamWidth}
                strokeLinecap="butt"
              />
            );
          })}
        </g>
      ))}

      {geometry.triplets.map((triplet) => {
        const { bracketY, bracketDrop, startX, endX, centerX, markScale, halfGap, numberX, numberY } = getTripletDisplay(triplet);
        return (
          <g key={`triplet-${triplet.key}`} data-rhythm-tuplet-events={triplet.eventIndices.join(',')}>
            {triplet.showBracket && (
              <path
                data-rhythm-triplet-bracket
                data-rhythm-bracket-y={bracketY}
                data-rhythm-number-gap-left={Math.max(startX,Math.min(endX,centerX-halfGap))}
                data-rhythm-number-gap-right={Math.max(startX,Math.min(endX,centerX+halfGap))}
                d={getTupletBracketPath(startX, endX, centerX, bracketY, bracketDrop, halfGap)}
                fill="none"
                stroke={color}
                strokeWidth={0.32 * markScale}
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
            )}
            <text
              data-rhythm-triplet-number
              data-rhythm-triplet-base={triplet.base}
              data-rhythm-number-ink={numberMetrics.ink || undefined}
              x={numberX}
              y={numberY}
              fill={color}
              textAnchor="middle"
              dominantBaseline="alphabetic"
              fontFamily={numberFont}
              fontStyle="italic"
              fontSize={6.2 * markScale}
              fontWeight={500}
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
