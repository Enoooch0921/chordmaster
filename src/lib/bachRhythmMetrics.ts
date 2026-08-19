import type { RhythmBase } from '../utils/rhythmUtils';

export interface BachGlyphAnchor {
  xEm: number;
  yEm: number;
}

// These are font-level anchors, not per-view pixel nudges. They describe the
// visible ink inside Bach's uneven advance boxes and therefore scale with the
// selected font size everywhere the glyph is used.
export const BACH_NOTE_ANCHORS: Record<RhythmBase, BachGlyphAnchor> = {
  w: { xEm: -0.02, yEm: -0.09 },
  h: { xEm: 0.02, yEm: 0.18 },
  q: { xEm: 0.02, yEm: 0.18 },
  e: { xEm: -0.07, yEm: 0.17 },
  s: { xEm: -0.08, yEm: 0.18 }
};

export const BACH_REST_ANCHORS: Record<RhythmBase, BachGlyphAnchor> = {
  w: { xEm: -0.06, yEm: 0.16 },
  h: { xEm: -0.06, yEm: -0.01 },
  q: { xEm: 0, yEm: 0.05 },
  e: { xEm: -0.03, yEm: 0.01 },
  s: { xEm: -0.05, yEm: 0.04 }
};

export const getBachGlyphAnchor = (base: RhythmBase, isRest: boolean): BachGlyphAnchor => (
  (isRest ? BACH_REST_ANCHORS : BACH_NOTE_ANCHORS)[base]
);

// Exact outline metrics from public/fonts/BachRhythm.ttf's `crotchet` glyph.
// SVG text measurement includes the full 294-unit advance width, while the
// visible vertical stem occupies x=239..252. Beams attach to its center.
export const BACH_QUARTER_OUTLINE_METRICS = {
  unitsPerEm: 1000,
  advanceWidth: 294,
  stemLeft: 239,
  stemRight: 252
} as const;

export const BACH_QUARTER_STEM_RIGHT_INSET_EM = (
  BACH_QUARTER_OUTLINE_METRICS.advanceWidth
  - ((BACH_QUARTER_OUTLINE_METRICS.stemLeft + BACH_QUARTER_OUTLINE_METRICS.stemRight) / 2)
) / BACH_QUARTER_OUTLINE_METRICS.unitsPerEm;

export const BACH_NOTE_VERTICAL_OUTLINE_METRICS: Record<RhythmBase, {
  glyphTop: number;
  noteheadTop: number;
}> = {
  w: { glyphTop: 237, noteheadTop: 237 },
  h: { glyphTop: 802, noteheadTop: 197 },
  q: { glyphTop: 802, noteheadTop: 197 },
  e: { glyphTop: 784, noteheadTop: 197 },
  s: { glyphTop: 805, noteheadTop: 197 }
};

export const getBachNoteheadTopFromGlyphTop = (
  glyphTopY: number,
  fontSize: number,
  base: RhythmBase
): number => {
  const outline = BACH_NOTE_VERTICAL_OUTLINE_METRICS[base];
  return glyphTopY + (
    ((outline.glyphTop - outline.noteheadTop) / BACH_QUARTER_OUTLINE_METRICS.unitsPerEm) * fontSize
  );
};
