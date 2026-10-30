import { describe, expect, it } from 'vitest';
import {
  BACH_QUARTER_OUTLINE_METRICS,
  BACH_QUARTER_STEM_RIGHT_INSET_EM,
  getBachNoteContoursFromBaseline,
  getBachCrossHeadProfile
} from './bachRhythmMetrics';

describe('Bach rhythm glyph metrics', () => {
  it.each([17, 22.78, 30.6])('fits the crosshead to Bach notehead and stem edges at %ipx', font => {
    const profile = getBachCrossHeadProfile(50, 20, font);
    const unit = font / 1000;
    const origin = 50 + .02 * font - 147 * unit;
    expect(profile.left).toBeCloseTo(origin + 8 * unit);
    expect(profile.right).toBeCloseTo(origin + 252 * unit);
    expect(profile.bottom - profile.top).toBeCloseTo(.197 * font);
    expect(profile.stemBottom).toBeGreaterThan(profile.top);
    expect(profile.stemBottom).toBeLessThan(20);
  });
  it.each(['w', 'h', 'q', 'e', 's'] as const)('locates %s noteheads from their baseline without including the font line box', base => {
    const contours = getBachNoteContoursFromBaseline(20, 24, base);
    expect(contours.noteheadTop).toBeCloseTo(20 - (base === 'w' ? .237 : .197) * 24);
    expect(contours.noteheadBottom).toBeCloseTo(20 - (base === 'w' ? .017 : 0) * 24);
    expect(contours.top).toBeLessThanOrEqual(contours.noteheadTop);
  });
  it('anchors beams to the center of the crotchet stem outline', () => {
    const stemCenter = (
      BACH_QUARTER_OUTLINE_METRICS.stemLeft + BACH_QUARTER_OUTLINE_METRICS.stemRight
    ) / 2;
    const anchoredX = BACH_QUARTER_OUTLINE_METRICS.advanceWidth
      - (BACH_QUARTER_STEM_RIGHT_INSET_EM * BACH_QUARTER_OUTLINE_METRICS.unitsPerEm);

    expect(anchoredX).toBe(stemCenter);
    expect(BACH_QUARTER_STEM_RIGHT_INSET_EM).toBe(0.0485);
  });
});
