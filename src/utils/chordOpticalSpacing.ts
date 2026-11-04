export interface ChordInkBox { left: number; right: number; top: number; bottom: number }
export interface OpticalChord { width: number; boxes: readonly ChordInkBox[] }

/** Average the facing outlines over their shared height, including raised ink. */
export function chordPairSpacing(left: OpticalChord, right: OpticalChord) {
  const heights = [...new Set([...left.boxes, ...right.boxes].flatMap(box => [box.top, box.bottom]))].sort((a, b) => a - b);
  let weightedAdvance = 0;
  let sharedHeight = 0;
  let collisionAdvance = -Infinity;
  for (let index = 1; index < heights.length; index += 1) {
    const top = heights[index - 1], bottom = heights[index], middle = (top + bottom) / 2;
    const leftInk = left.boxes.filter(box => box.top <= middle && box.bottom > middle);
    const rightInk = right.boxes.filter(box => box.top <= middle && box.bottom > middle);
    if (!leftInk.length || !rightInk.length) continue;
    const advance = Math.max(...leftInk.map(box => box.right)) - Math.min(...rightInk.map(box => box.left));
    weightedAdvance += advance * (bottom - top);
    sharedHeight += bottom - top;
    collisionAdvance = Math.max(collisionAdvance, advance);
  }
  return sharedHeight > 0
    ? { advance: weightedAdvance / sharedHeight, collisionAdvance }
    : { advance: left.width, collisionAdvance: left.width };
}

/** Equalize the facing white space, with a separate hard ink-clearance limit. */
export function opticalChordSpacing(chords: readonly OpticalChord[], available: number, scaleLimit = 1) {
  if (chords.length < 2) return { scale: Math.max(0, Math.min(1, scaleLimit, available / Math.max(0.001, chords[0]?.width ?? 0))), gap: 0, positions: chords.length ? [0] : [], pairs: [] };
  const pairs = chords.slice(0, -1).map((chord, index) => chordPairSpacing(chord, chords[index + 1]));
  const extent = pairs.reduce((sum, pair) => sum + pair.advance, 0) + chords.at(-1)!.width;
  const collisionExtra = Math.max(0, ...pairs.map(pair => pair.collisionAdvance - pair.advance));
  const count = pairs.length;
  const scale = Math.max(0, Math.min(1, scaleLimit,
    (available - 8 * count) / Math.max(0.001, extent),
    (available - 8 * count) / Math.max(0.001, extent + collisionExtra * count)));
  const gap = Math.max(0, (available - extent * scale) / count);
  const positions = [0];
  for (const pair of pairs) positions.push(positions.at(-1)! + pair.advance * scale + gap);
  return { scale, gap, positions, pairs };
}
