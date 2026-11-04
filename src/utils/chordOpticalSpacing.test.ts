import { expect, it } from 'vitest';
import { chordPairSpacing, opticalChordSpacing, type OpticalChord } from './chordOpticalSpacing';

const plain = (width: number): OpticalChord => ({ width, boxes: [{ left: 0, right: width, top: 0, bottom: 18 }] });
const raised: OpticalChord = { width: 40, boxes: [
  { left: 0, right: 20, top: 0, bottom: 18 },
  { left: 20, right: 40, top: 0, bottom: 6 }
] };

it('includes an upper extension in proportion to the height it actually faces', () => {
  const pair = chordPairSpacing(raised, plain(20));
  expect(pair.advance).toBeCloseTo((40 * 6 + 20 * 12) / 18);
  expect(pair.collisionAdvance).toBe(40);
});

it('balances both gaps around the third chord without a separate index-based nudge', () => {
  const chords = [plain(20), raised, plain(18), raised];
  const layout = opticalChordSpacing(chords, 145);
  const opticalGaps = layout.pairs.map((pair, index) => layout.positions[index + 1] - layout.positions[index] - pair.advance * layout.scale);
  const clearances = layout.pairs.map((pair, index) => layout.positions[index + 1] - layout.positions[index] - pair.collisionAdvance * layout.scale);
  for (const gap of opticalGaps) expect(gap).toBeCloseTo(layout.gap);
  expect(Math.min(...clearances)).toBeGreaterThanOrEqual(8 - 0.0001);
  expect(layout.positions.at(-1)! + chords.at(-1)!.width * layout.scale).toBeCloseTo(145);
  expect(opticalChordSpacing(chords, 145)).toEqual(layout);
});

it('uses the next chord’s left edge too, rather than only measuring the previous right edge', () => {
  const inset = { width: 24, boxes: [{ left: 4, right: 24, top: 0, bottom: 18 }] };
  expect(chordPairSpacing(plain(20), inset).advance).toBe(16);
});

it('keeps a roomy measure at natural width and remains stable when the fit is reused', () => {
  const chords = [plain(12), plain(11), plain(13), plain(12)];
  const first = opticalChordSpacing(chords, 150);
  expect(first.scale).toBe(1);
  expect(opticalChordSpacing(chords, 150, first.scale)).toEqual(first);
});

it('respects an explicit per-measure compression limit', () => {
  const chords = [plain(20), raised, plain(18), raised];
  const layout = opticalChordSpacing(chords, 145, 0.7);
  expect(layout.scale).toBe(0.7);
  expect(layout.positions.at(-1)! + chords.at(-1)!.width * layout.scale).toBeCloseTo(145);
});
