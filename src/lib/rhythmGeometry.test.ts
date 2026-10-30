import { describe, expect, it } from 'vitest';
import { parseRhythmNotation } from '../utils/rhythmUtils';
import { buildCompactRhythmGeometry, getTaperedRhythmTiePath } from './rhythmGeometry';

it('keeps full tie tips closed while matching the thickness at cross-bar cut points', () => {
  const start = { x: 10, y: 20 }, end = { x: 30, y: 20 };
  const a = { x: 16, y: 24 }, b = { x: 24, y: 24 };
  const numbers = (path: string) => path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const full = numbers(getTaperedRhythmTiePath(start, a, b, end, 1.2));
  expect(full.slice(0, 2)).toEqual([10, 20]);
  expect(full.slice(6, 8)).toEqual([30, 20]);
  expect(full.slice(-2)).toEqual([10, 20]);
  const outgoing = numbers(getTaperedRhythmTiePath(start, a, b, { x: 30, y: 24 }, 1.2, false, true));
  const incoming = numbers(getTaperedRhythmTiePath({ x: 10, y: 24 }, a, b, end, 1.2, true, false));
  expect(outgoing[7] - outgoing[9]).toBeCloseTo(1.2);
  expect(incoming[1] - incoming.at(-1)!).toBeCloseTo(1.2);
  expect(outgoing[5]).toBe(outgoing[7]);
  expect(incoming[3]).toBe(incoming[1]);
});

const geometryFor = (notation: string, scale = 1) => {
  const parsed = parseRhythmNotation(notation, '4/4');
  return buildCompactRhythmGeometry(parsed.events, {
    width: 320,
    height: notation.includes('3') ? 24 * scale : 16 * scale,
    barUnits: parsed.barUnits,
    beatUnits: parsed.beatUnits,
    scale
  });
};

describe('compact rhythm geometry', () => {
  it('uses the exact same endpoints for beamed stems and the primary beam', () => {
    const geometry = geometryFor('s s e q q q');
    const beam = geometry.beams[0];
    const beamedEvents = geometry.events.filter((event) => beam.eventIndices.includes(event.event.index));

    expect(beam.primary.x1).toBe(beamedEvents[0].stem?.x);
    expect(beam.primary.x2).toBe(beamedEvents.at(-1)?.stem?.x);
    beamedEvents.forEach((event) => expect(event.stem?.top).toBe(beam.primary.y));
  });

  it('keeps geometry relationships intact at score-preview scale', () => {
    const geometry = geometryFor('e3 e3 e3 q q q', 1.34);
    const beam = geometry.beams[0];
    const triplet = geometry.triplets[0];

    expect(triplet.numberY).toBeLessThan(beam.primary.y);
    expect(beam.primary.y - triplet.numberY).toBeCloseTo(5.1 * 1.34, 5);
    expect(triplet.showBracket).toBe(false);
    geometry.events.slice(0, 3).forEach((event) => expect(event.stem?.top).toBe(beam.primary.y));
  });

  it('centers accents on noteheads and places them clear of the stem', () => {
    const geometry = geometryFor('q^ q q q');
    const accented = geometry.events[0];

    expect(accented.accent?.x).toBe(accented.head.x);
    expect(accented.accent?.y).toBeLessThan(accented.stem?.top ?? 0);
  });

  it('keeps a bracket when an eighth-note triplet contains a rest', () => {
    const geometry = geometryFor('e3 e3r e3 q q q');

    expect(geometry.triplets[0].showBracket).toBe(true);
    expect(geometry.events[1].event.isRest).toBe(true);
  });

  it.each(['s3 s3 s3 e q q q', 's3 s3 s3 s3 s3 s3 q q q'])('marks each tuplet range when its beam also spans other notes: %s', notation => {
    const geometry = geometryFor(notation);
    expect(geometry.beams[0].eventIndices.length).toBeGreaterThan(3);
    expect(geometry.triplets.length).toBeGreaterThan(0);
    expect(geometry.triplets.every(group => group.showBracket)).toBe(true);
  });
});
