import { describe, expect, it } from 'vitest';
import {
  BACH_QUARTER_OUTLINE_METRICS,
  BACH_QUARTER_STEM_RIGHT_INSET_EM
} from './bachRhythmMetrics';

describe('Bach rhythm glyph metrics', () => {
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
