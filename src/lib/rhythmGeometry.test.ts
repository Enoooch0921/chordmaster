import { describe, expect, it } from 'vitest';
import { parseRhythmNotation } from '../utils/rhythmUtils';
import { buildCompactRhythmGeometry } from './rhythmGeometry';

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
});
