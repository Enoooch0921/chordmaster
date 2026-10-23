import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import RhythmNotation from '../components/RhythmNotation';
import { applyRhythmEdit } from '../lib/rhythmEditing';
import { buildCompactRhythmGeometry } from '../lib/rhythmGeometry';
import { normalizeStoredSong } from '../lib/workspace';
import type { Song } from '../types';
import { getRhythmEventGlyph, normalizeRhythmInput, parseRhythmNotation } from './rhythmUtils';

const target = { sectionId: 's', barId: 'b' };
const makeSong = (): Song => ({ title: 'Half triplets', originalKey: 'E', currentKey: 'E', timeSignature: '4/4', sections: [{ id: 's', title: 'Bridge', bars: [{ id: 'b', chords: ['G#7'], rhythm: 'h3 h3 h3' }] }] });
afterEach(cleanup);

describe('half-note rhythm triplets', () => {
  it('preserves three half-note attacks over a full bar through storage', () => {
    const song = normalizeStoredSong(JSON.parse(JSON.stringify(makeSong())), 0);
    const parsed = parseRhythmNotation(song.sections[0].bars[0].rhythm!, '4/4');
    expect(parsed.invalidTokens).toEqual([]);
    expect(parsed.events).toHaveLength(3);
    expect(parsed.totalUnits).toBeCloseTo(16);
    expect(parsed.overflow || parsed.underfilled).toBe(false);
    parsed.events.forEach((event, i) => {
      expect(event.startUnit).toBeCloseTo(i * 16 / 3);
      expect(event.durationUnits).toBeCloseTo(16 / 3);
      expect(event).toMatchObject({ base: 'h', triplet: true, beamCount: 0, isRest: false, isHidden: false, tieAfter: false });
      expect(getRhythmEventGlyph(event)).toBe(getRhythmEventGlyph(parseRhythmNotation('h', '4/4').events[0]));
    });
  });

  it('retains the fractional positions of the remaining heads after deletion and reinsertion', () => {
    const deleted = applyRhythmEdit(makeSong(), target, { cursorUnit: 16 / 3 }, { type: 'delete' });
    expect(deleted.error).toBeNull();
    const remaining = parseRhythmNotation(deleted.song.sections[0].bars[0].rhythm!, '4/4').events.filter(event => !event.isHidden);
    expect(remaining).toHaveLength(2);
    expect(remaining[1].startUnit).toBeCloseTo(32 / 3);
    const restored = applyRhythmEdit(deleted.song, target, { cursorUnit: 16 / 3 }, { type: 'insert', token: 'h3' });
    expect(restored.error).toBeNull();
    expect(restored.song.sections[0].bars[0].rhythm).toBe('h3 h3 h3');
    expect(restored.song.sections[0].bars[0].chords).toEqual(['G#7']);
  });

  it('supports exact half-triplet rests and hidden gaps while rejecting whole triplets and hollow crosses', () => {
    expect(normalizeRhythmInput('H3^~ H3R H3X')).toBe('h3^~ h3r h3x');
    const parsed = parseRhythmNotation('h3^~ h3r h3x', '4/4');
    expect(parsed.invalidTokens).toEqual([]);
    expect(parsed.totalUnits).toBeCloseTo(16);
    expect(parsed.events[1].isRest).toBe(true);
    expect(parsed.events[2].isHidden).toBe(true);
    expect(parseRhythmNotation('w3 h3c h3cu', '4/4').invalidTokens).toEqual(['w3', 'h3c', 'h3cu']);
  });

  it.each([true, false])('renders exactly three half-note glyphs and one triplet bracket (compact=%s)', compact => {
    const { container } = render(<RhythmNotation notation="h3 h3 h3" timeSignature="4/4" compact={compact} />);
    expect(container.querySelectorAll('[data-rhythm-glyph][data-rhythm-base="h"]')).toHaveLength(3);
    container.querySelectorAll('[data-rhythm-glyph]').forEach(glyph => expect(glyph.textContent).toBe(getRhythmEventGlyph(parseRhythmNotation('h', '4/4').events[0])));
    expect(container.querySelectorAll('[data-rhythm-triplet-bracket]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-rhythm-triplet-number][data-rhythm-triplet-base="h"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-rhythm-primary-beam], [data-rhythm-secondary-beam], [data-rhythm-flag], [data-rhythm-tie]')).toHaveLength(0);
  });

  it('keeps independent stems and a bracket in the compact geometry', () => {
    const parsed = parseRhythmNotation('h3 h3 h3', '4/4');
    const geometry = buildCompactRhythmGeometry(parsed.events, { width: 240, height: 24, barUnits: 16, beatUnits: 4, scale: 1 });
    expect(geometry.events.every(event => event.stem && event.flagCount === 0)).toBe(true);
    expect(geometry.beams).toHaveLength(0);
    expect(geometry.triplets).toHaveLength(1);
    expect(geometry.triplets[0]).toMatchObject({ base: 'h', eventIndices: [0, 1, 2], showBracket: true });
  });
});
