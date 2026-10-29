export interface KeyboardRect { left: number; right: number; top: number; bottom: number }

/** Return the smallest scroll that fits the complete bar in an unobscured band. */
export function getKeyboardAvoidanceScroll(target: KeyboardRect, viewport: KeyboardRect, panel: KeyboardRect, gap = 16): number {
  const top = viewport.top + gap;
  const bottom = viewport.bottom - gap;
  const overlapsX = target.right > panel.left && target.left < panel.right;
  const bands = overlapsX && panel.bottom > top && panel.top < bottom
    ? [[top, Math.min(bottom, panel.top - gap)], [Math.max(top, panel.bottom + gap), bottom]]
    : [[top, bottom]];
  const height = target.bottom - target.top;
  const candidates = bands.filter(([start, end]) => end - start >= height).map(([start, end]) => (
    target.top < start ? target.top - start : target.bottom > end ? target.bottom - end : 0
  ));
  if (candidates.length) return candidates.reduce((best, value) => Math.abs(value) < Math.abs(best) ? value : best);
  // Very short windows/large bars: expose the start in the largest available band.
  const [start] = bands.reduce((best, band) => band[1] - band[0] > best[1] - best[0] ? band : best);
  return target.top - start;
}
