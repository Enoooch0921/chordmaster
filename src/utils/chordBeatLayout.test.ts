import { describe, expect, it } from 'vitest';
import { chordBeatGroupLabels, chordBeatTrackWeights, chordBeatAnchors, fitAnchoredChords } from './chordBeatLayout';

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


describe('fixed chord beat anchors', () => {
  it('keeps full beats equally spaced regardless of the harmony or notation duration', () => {
    const attacks = ['G', '/', 'Am', 'G/B'].map((chord, beat) => ({ beat, offset: 0, chord }));
    expect(chordBeatAnchors(attacks, 4)).toEqual([.125, .375, .625, .875]);
    expect(chordBeatAnchors([attacks[0]], 4)).toEqual([.125]);
  });
  it('shares the third beat between G and Am while preserving surrounding beat centers', () => {
    const attacks = [0, 1, 2, 2.5, 3].map(position => ({ beat: Math.floor(position), offset: position % 1, chord: 'G' }));
    expect(chordBeatAnchors(attacks, 4)).toEqual([.125, .375, .5625, .6875, .875]);
  });
  it('preserves sixteenth order and isolated offbeat positions', () => {
    expect(chordBeatAnchors(dense, 4)).toEqual([.53125, .59375, .65625, .71875]);
    expect(chordBeatAnchors([{beat: 2, offset: .5, chord: 'C'}], 4)).toEqual([.6875]);
  });
  it.each([3, 6])('uses all %i beats in other meters', beats => {
    const attacks = Array.from({length: beats}, (_, beat) => ({beat, offset: 0, chord: 'C'}));
    expect(chordBeatAnchors(attacks, beats)).toEqual(attacks.map(({beat}) => (beat + .5) / beats));
  });
});


it('fits dense sixteenth chords without overlap or drifting beyond the attack tolerance', () => {
  const metrics = Array.from({ length: 16 }, (_, index) => ({ anchor: 5 + index * 10, width: 42 }));
  const fits = fitAnchoredChords(metrics, 160);
  fits.forEach((fit, index) => {
    expect(Math.abs(fit.left + metrics[index].width * fit.scale / 2 - metrics[index].anchor)).toBeLessThanOrEqual(2.201);
    expect(fit.left).toBeGreaterThanOrEqual(0);
    const right = fit.left + metrics[index].width * fit.scale;
    expect(right).toBeLessThanOrEqual(160);
    if (fits[index + 1]) expect(right).toBeLessThan(fits[index + 1].left);
    expect(fit.scale).toBeGreaterThan(.1);
  });
});

it('shows beat labels only where that beat is subdivided', () => {
  expect(chordBeatGroupLabels([{beat:0, offset:0, chord:'G'}])).toEqual(['']);
});
it('condenses short subdivisions before taking room from a full beat', () => {
  const fits = fitAnchoredChords([{anchor:50,width:35,span:.5},{anchor:78,width:38,span:1}], 130);
  expect(fits[0].scale).toBeLessThan(fits[1].scale);
  expect(fits[1].scale).toBe(.9);
});

it('centers a whole slash chord and borrows spare space before compressing it', () => {
  const centered = fitAnchoredChords([{anchor:70,width:44}], 140)[0];
  expect(centered.left).toBe(48);
  expect(centered.scale).toBe(1);
  const [left, right] = fitAnchoredChords([{anchor:50,width:50}, {anchor:90,width:36}], 130);
  expect(left.scale).toBe(1);
  expect(right.scale).toBe(1);
  expect(left.left).toBeLessThan(25);
  expect(left.left + 50 + 2).toBeLessThanOrEqual(right.left + .001);
  expect(right.left + 18).toBe(90);
});

it('allows a small optical correction for slash chords within the same beat bounds', () => {
  const fit = fitAnchoredChords([{ anchor: 80, width: 40, opticalOffset: 2 }], 140)[0];
  expect(fit.left + 20).toBe(82);
  expect(fit.anchor).toBe(80);
  expect(fit.scale).toBe(1);
});
