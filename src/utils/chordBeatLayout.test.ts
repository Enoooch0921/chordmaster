import { describe, expect, it } from 'vitest';
import { chordBeatGroupLabels, chordBeatTrackWeights, chordRhythmAnchors, chordJianpuAnchors, fitAnchoredChords } from './chordBeatLayout';

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


describe('notation-aligned chord anchors', () => {
  const attacks = [0, 1, 2, 2.5, 3].map(position => ({ beat: Math.floor(position), offset: position % 1, chord: 'G' }));
  it('maps the supplied G / G Am G/B example to the actual rhythm heads', () => {
    expect(chordRhythmAnchors(attacks, 'er e q e e q', '4/4')).toEqual([.0625, .375, .5625, .6875, .875]);
  });
  it.each(['w', 'h h', 'q. e q q', 'bad', 'q q q q q'])('retains the original placement for long or invalid rhythm %s', notation => {
    expect(chordRhythmAnchors([attacks[0]], notation, '4/4')).toBeNull();
  });
  it('aligns entered notes immediately and keeps missing attacks in their own beat', () => {
    expect(chordRhythmAnchors(attacks, 'q', '4/4')).toEqual([.125, .375, .5625, .6875, .875]);
    expect(chordRhythmAnchors(attacks, 'q q q q', '4/4')).toEqual([.125, .375, .625, .6875, .875]);
    expect(chordJianpuAnchors(attacks, '1 | x | x | x', '4/4')).toEqual([.125, .375, .5625, .6875, .875]);
  });
  it('aligns melody beat subdivisions using automatic duration shorthand', () => {
    expect(chordJianpuAnchors(attacks, '1 | 2 | 34 | 5', '4/4')).toEqual([.125, .375, .5625, .6875, .875]);
  });
  it('retains the first-position chord for a melody sustained across the bar', () => {
    expect(chordJianpuAnchors([attacks[0]], '1 | - | - | -', '4/4')).toBeNull();
  });
  it('does not align a chord to an invisible melody placeholder', () => {
    expect(chordJianpuAnchors([attacks[0]], 'x | 2 | 3 | 4', '4/4')).toBeNull();
  });
  it('uses the eighth-note beat capacity in compound meter', () => {
    const positions = [0, 1, 2, 3, 4, 5].map(beat => ({beat, offset:0, chord:'C'}));
    expect(chordRhythmAnchors(positions, 'e e e e e e', '6/8')).toEqual(positions.map(({beat}) => (beat + .5) / 6));
    chordJianpuAnchors(positions, '123 | 456', '6/8')!.forEach((value, index) => expect(value).toBeCloseTo((index + .5) / 6));
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
