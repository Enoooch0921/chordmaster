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
  noteheadLeft: 8,
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
  noteheadBottom: number;
}> = {
  w: { glyphTop: 237, noteheadTop: 237, noteheadBottom: 17 },
  h: { glyphTop: 802, noteheadTop: 197, noteheadBottom: 0 },
  q: { glyphTop: 802, noteheadTop: 197, noteheadBottom: 0 },
  e: { glyphTop: 784, noteheadTop: 197, noteheadBottom: 0 },
  s: { glyphTop: 805, noteheadTop: 197, noteheadBottom: 0 }
};

export const getBachNoteContoursFromBaseline = (baseline: number, fontSize: number, base: RhythmBase) => {
  const outline = BACH_NOTE_VERTICAL_OUTLINE_METRICS[base];
  const unit = fontSize / BACH_QUARTER_OUTLINE_METRICS.unitsPerEm;
  return {
    top: baseline - outline.glyphTop * unit,
    noteheadTop: baseline - outline.noteheadTop * unit,
    noteheadBottom: baseline - outline.noteheadBottom * unit
  };
};

/** A flat-ended cross with Bach's notehead bounds and twice its stem weight. */
export const getBachCrossHeadProfile = (headX: number, centerY: number, fontSize: number) => {
  const metrics = BACH_QUARTER_OUTLINE_METRICS;
  const unit = fontSize / metrics.unitsPerEm;
  const glyphOrigin = headX + BACH_NOTE_ANCHORS.q.xEm * fontSize - metrics.advanceWidth / 2 * unit;
  const left = glyphOrigin + metrics.noteheadLeft * unit;
  const right = glyphOrigin + metrics.stemRight * unit;
  const height = BACH_NOTE_VERTICAL_OUTLINE_METRICS.q.noteheadTop * unit;
  const top = centerY - height / 2, bottom = centerY + height / 2;
  const width = right - left;
  const armWidth = 2 * (metrics.stemRight - metrics.stemLeft) * unit;
  const diagonal = Math.hypot(width, height);
  const cutX = height / diagonal * armWidth, cutY = width / diagonal * armWidth;
  return {
    left, right, top, bottom, centerX: (left + right) / 2,
    stemBottom: top + cutY,
    path: `M ${left + cutX} ${top} L ${right} ${bottom - cutY} L ${right - cutX} ${bottom} L ${left} ${top + cutY} Z `
      + `M ${left} ${bottom - cutY} L ${right - cutX} ${top} L ${right} ${top + cutY} L ${left + cutX} ${bottom} Z`
  };
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
