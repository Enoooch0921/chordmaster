import { describe, expect, it } from 'vitest';
import { chordBeatGroupLabels, chordBeatTrackWeights } from './chordBeatLayout';

const dense = [0, .25, .5, .75].map(offset => ({beat: 2, offset, chord: 'A'}));

describe('chord beat grouping', () => {
  it('compacts a complete sixteenth run while preserving isolated and partial positions', () => {
    expect(chordBeatGroupLabels(dense)).toEqual(['3', 'e', '&', 'a']);
    expect(chordBeatGroupLabels(dense, true)).toEqual(['3', 'e', '&', 'a']);
    expect(chordBeatGroupLabels([dense[0], dense[2]])).toEqual(['3', '3&']);
    expect(chordBeatGroupLabels([dense[2]])).toEqual(['3&']);
    expect(chordBeatGroupLabels([dense[0], dense[2]], true)).toEqual(['', '3&']);
  });

  it('borrows room for a dense third beat without combining it with neighboring beats', () => {
    const events = [{beat:0,offset:0,chord:'A'}, {beat:1,offset:0,chord:'/'}, ...dense, {beat:3,offset:0,chord:'E'}];
    const before = JSON.stringify(events);
    const weights = chordBeatTrackWeights(events, 4);
    expect(weights).toHaveLength(4);
    expect(weights[2] / weights.reduce((sum, n) => sum + n, 0)).toBeGreaterThan(.5);
    expect(weights[0]).toBe(weights[3]);
    expect(weights[1]).toBeLessThan(weights[0]);
    expect(JSON.stringify(events)).toBe(before);
  });

  it('keeps equally subdivided beats equally spaced and preserves empty beat columns', () => {
    const events = Array.from({length:4}, (_,beat) => [0,.5].map(offset=>({beat,offset,chord:'A'}))).flat();
    expect(new Set(chordBeatTrackWeights(events, 4)).size).toBe(1);
    expect(chordBeatTrackWeights(dense, 4)).toEqual([.65,.65,3.25,.65]);
  });
});
