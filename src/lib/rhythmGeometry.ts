import type { RhythmBase, RhythmEvent } from '../utils/rhythmUtils';
import { rhythmUnitsEqual } from '../utils/rhythmUtils';

export interface RhythmPoint {
  x: number;
  y: number;
}

export interface CompactRhythmEventGeometry {
  event: RhythmEvent;
  head: RhythmPoint;
  headRadiusX: number;
  headRadiusY: number;
  stem: null | {
    x: number;
    top: number;
    bottom: number;
  };
  flagCount: number;
  dot: RhythmPoint | null;
  accent: RhythmPoint | null;
}

export interface CompactRhythmBeamGeometry {
  eventIndices: number[];
  primary: { x1: number; x2: number; y: number };
  secondary: Array<{ x1: number; x2: number; y: number }>;
}

export interface CompactRhythmTripletGeometry {
  key: string;
  base: 'q' | 'e';
  eventIndices: [number, number, number];
  startX: number;
  centerX: number;
  endX: number;
  bracketY: number;
  bracketDrop: number;
  numberY: number;
  showBracket: boolean;
}

export interface CompactRhythmGeometry {
  width: number;
  height: number;
  events: CompactRhythmEventGeometry[];
  beams: CompactRhythmBeamGeometry[];
  triplets: CompactRhythmTripletGeometry[];
}

interface CompactRhythmGeometryOptions {
  width: number;
  height: number;
  barUnits: number;
  beatUnits: number;
  scale: number;
}

interface BeamGroupDraft {
  events: RhythmEvent[];
  secondaryRuns: RhythmEvent[][];
  secondarySingles: RhythmEvent[];
}

const isBeamable = (event: RhythmEvent) => (
  !event.isRest && !event.isHidden && (event.base === 'e' || event.base === 's')
);

const buildBeamGroups = (events: RhythmEvent[], beatUnits: number): BeamGroupDraft[] => {
  const groups: BeamGroupDraft[] = [];
  let current: RhythmEvent[] = [];

  const flush = () => {
    if (current.length < 2) {
      current = [];
      return;
    }

    const secondaryRuns: RhythmEvent[][] = [];
    const secondarySingles: RhythmEvent[] = [];
    let sixteenths: RhythmEvent[] = [];

    const flushSixteenths = () => {
      if (sixteenths.length >= 2) secondaryRuns.push(sixteenths);
      else if (sixteenths.length === 1) secondarySingles.push(sixteenths[0]);
      sixteenths = [];
    };

    current.forEach((event, index) => {
      if (event.base === 's') sixteenths.push(event);
      const next = current[index + 1];
      if (!next || next.base !== 's' || !rhythmUnitsEqual(event.endUnit, next.startUnit)) {
        flushSixteenths();
      }
    });

    groups.push({ events: current, secondaryRuns, secondarySingles });
    current = [];
  };

  events.forEach((event, index) => {
    const previous = current.at(-1);
    const sameBeat = previous
      ? Math.floor((previous.startUnit + 0.001) / beatUnits) === Math.floor((event.startUnit + 0.001) / beatUnits)
      : true;
    const contiguous = previous ? rhythmUnitsEqual(previous.endUnit, event.startUnit) : true;

    if (isBeamable(event) && sameBeat && contiguous) {
      current.push(event);
    } else {
      flush();
      if (isBeamable(event)) current = [event];
    }

    if (index === events.length - 1) flush();
  });

  return groups;
};

const buildTripletRuns = (events: RhythmEvent[]) => {
  const runs: Array<{ key: string; base: 'q' | 'e'; events: [RhythmEvent, RhythmEvent, RhythmEvent] }> = [];

  for (let index = 0; index <= events.length - 3; index += 1) {
    const first = events[index];
    const second = events[index + 1];
    const third = events[index + 2];
    if (!first.triplet || !second.triplet || !third.triplet) continue;
    if (first.base !== second.base || first.base !== third.base) continue;
    if (first.base !== 'q' && first.base !== 'e') continue;
    if (!rhythmUnitsEqual(first.endUnit, second.startUnit) || !rhythmUnitsEqual(second.endUnit, third.startUnit)) continue;

    runs.push({
      key: `${first.index}-${second.index}-${third.index}`,
      base: first.base,
      events: [first, second, third]
    });
    index += 2;
  }

  return runs;
};

export const getCompactRhythmCenterUnit = (event: RhythmEvent): number => (
  event.startUnit + (event.durationUnits / 2)
);

export const buildCompactRhythmGeometry = (
  visibleEvents: RhythmEvent[],
  options: CompactRhythmGeometryOptions
): CompactRhythmGeometry => {
  const { width, height, barUnits, beatUnits, scale } = options;
  const safeWidth = Math.max(1, width);
  const safeBarUnits = Math.max(1, barUnits);
  const unitToX = (unit: number) => (unit / safeBarUnits) * safeWidth;
  const centerX = (event: RhythmEvent) => unitToX(getCompactRhythmCenterUnit(event));
  const headRadiusX = 2.05 * scale;
  const headRadiusY = 1.42 * scale;
  const headY = height - (4.6 * scale);
  const stemHeight = 9.2 * scale;
  const beamY = headY - stemHeight;
  const secondaryBeamY = beamY + (2.05 * scale);
  const stemXOffset = headRadiusX * 0.72;
  const stemBottom = headY - (headRadiusY * 0.12);
  const beamGroups = buildBeamGroups(visibleEvents, beatUnits);
  const beamedIndices = new Set(beamGroups.flatMap((group) => group.events.map((event) => event.index)));
  const eventByIndex = new Map(visibleEvents.map((event) => [event.index, event]));

  const events = visibleEvents.map((event): CompactRhythmEventGeometry => {
    const x = centerX(event);
    const hasStem = !event.isRest && event.base !== 'w';
    const isBeamed = beamedIndices.has(event.index);
    const stem = hasStem
      ? {
          x: x + stemXOffset,
          top: beamY,
          bottom: stemBottom
        }
      : null;

    return {
      event,
      head: { x, y: headY },
      headRadiusX,
      headRadiusY,
      stem,
      flagCount: !isBeamed && !event.isRest ? (event.base === 'e' ? 1 : event.base === 's' ? 2 : 0) : 0,
      dot: event.dotted ? { x: x + (3.7 * scale), y: headY } : null,
      accent: event.accent && stem
        ? { x, y: stem.top - (3.25 * scale) }
        : null
    };
  });
  const geometryByIndex = new Map(events.map((event) => [event.event.index, event]));

  const beams = beamGroups.map((group): CompactRhythmBeamGeometry => {
    const first = geometryByIndex.get(group.events[0].index)!;
    const last = geometryByIndex.get(group.events.at(-1)!.index)!;
    const secondary: CompactRhythmBeamGeometry['secondary'] = [];

    group.secondaryRuns.forEach((run) => {
      const runFirst = geometryByIndex.get(run[0].index)!;
      const runLast = geometryByIndex.get(run.at(-1)!.index)!;
      secondary.push({ x1: runFirst.stem!.x, x2: runLast.stem!.x, y: secondaryBeamY });
    });
    group.secondarySingles.forEach((event) => {
      const eventGeometry = geometryByIndex.get(event.index)!;
      const groupIndex = group.events.findIndex((candidate) => candidate.index === event.index);
      const partial = 3.2 * scale;
      secondary.push(groupIndex === 0
        ? { x1: eventGeometry.stem!.x, x2: eventGeometry.stem!.x + partial, y: secondaryBeamY }
        : { x1: eventGeometry.stem!.x - partial, x2: eventGeometry.stem!.x, y: secondaryBeamY });
    });

    return {
      eventIndices: group.events.map((event) => event.index),
      primary: { x1: first.stem!.x, x2: last.stem!.x, y: beamY },
      secondary
    };
  });

  const triplets = buildTripletRuns(visibleEvents).map((run): CompactRhythmTripletGeometry => {
    const first = geometryByIndex.get(run.events[0].index)!;
    const middle = geometryByIndex.get(run.events[1].index)!;
    const last = geometryByIndex.get(run.events[2].index)!;
    const showBracket = run.base === 'q' || run.events.some((event) => event.isRest);
    const bracketY = showBracket ? beamY - (2.55 * scale) : beamY;

    return {
      key: run.key,
      base: run.base,
      eventIndices: run.events.map((event) => event.index) as [number, number, number],
      startX: first.head.x - (showBracket ? headRadiusX * 0.5 : 0),
      centerX: middle.head.x,
      endX: last.head.x + (showBracket ? headRadiusX * 0.5 : 0),
      bracketY,
      bracketDrop: 2 * scale,
      numberY: bracketY - (5.1 * scale),
      showBracket
    };
  });

  // Keep this lookup live in development builds: every beam member must have a
  // rendered event geometry, otherwise stems and beams could diverge again.
  beams.forEach((beam) => beam.eventIndices.forEach((index) => {
    if (!eventByIndex.has(index) || !geometryByIndex.has(index)) {
      throw new Error(`Missing compact rhythm geometry for event ${index}`);
    }
  }));

  return { width: safeWidth, height, events, beams, triplets };
};

export const isOpenNoteHead = (base: RhythmBase): boolean => base === 'w' || base === 'h';
