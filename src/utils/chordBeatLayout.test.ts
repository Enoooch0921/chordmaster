import { describe, expect, it } from 'vitest';
import { chordBeatGroupLabels, chordBeatTrackWeights, chordBeatAnchors, fitAnchoredChords } from './chordBeatLayout';

const dense = [0, .25, .5, .75].map(offset => ({beat: 2, offset, chord: 'A'}));

it('condenses dense harmony horizontally inside the original measure and beat grid', () => {
  const width = 153;
  // Includes the raised D-sharp's ink extending beyond the B/D# container.
  const metrics = [24.3359375,39.2428,23.1484375,45.1875].map((w,index) => ({ width:w, anchor:(index+.5)/4*width, span:1 }));
  const fits = fitAnchoredChords(metrics, width, { edgePadding:4, balanceSpacing:true });
  fits.forEach((fit,index) => {
    expect(fit.scale).toBeCloseTo(.85, 6);
    expect(fit.anchor).toBe(metrics[index].anchor);
    if (index) expect(fit.left-fits[index-1].left-metrics[index-1].width*fits[index-1].scale).toBeGreaterThanOrEqual(9.999);
  });
});

it.each([120, 153, 200])('separates four full-beat harmonies in a %ipx measure without changing their attacks', width => {
  // 一道江河（2022 新版）, Verse 14: Bm, B/D#, Em, Gm7(b5).
  // Natural widths measured with the song's stage-sans font.
  const metrics = [24.3359375, 34.8046875, 23.1484375, 45.1875].map((naturalWidth, index) => ({
    anchor: (index + .5) / 4 * width,
    width: naturalWidth,
    span: 1,
    slashBass: index === 1,
    opticalOffset: index === 1 ? 2 : 0,
  }));
  const before = JSON.stringify(metrics);
  const fits = fitAnchoredChords(metrics, width, { edgePadding: 4, balanceSpacing: true });
  fits.forEach((fit, index) => {
    expect(fit.anchor).toBe(metrics[index].anchor);
    expect(fit.scale).toBeCloseTo(fits[0].scale, 6);
    expect(fit.left).toBeGreaterThanOrEqual(4 - .0001);
    const right = fit.left + metrics[index].width * fit.scale;
    expect(right).toBeLessThanOrEqual(width - 4 + .0001);
    if (fits[index + 1]) expect(fits[index + 1].left - right).toBeGreaterThanOrEqual(6 - .0001);
    expect(Math.abs(fit.left + metrics[index].width * fit.scale / 2 - fit.anchor)).toBeLessThanOrEqual(Math.min(10, width / 4 * .22) + .0001);
  });
  expect(JSON.stringify(metrics)).toBe(before);
});

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


it.each([
  ['Pre-Chorus / Chorus bar 7', 142.08, [28.3, 37.5, 12.86, 11.07]],
  ['Tag after the repeat start', 128.8, [28.3, 37.5, 12.86, 11.07]],
  ['Ending after the repeat end', 142.8, [36.42, 15, 11.54, 15]],
] as const)('balances visible gaps and preserves beat bounds in %s', (_, width, widths) => {
  const metrics = widths.map((w, index) => ({anchor: width * (index + .5) / 4, width: w, span: 1}));
  const before = fitAnchoredChords(metrics, width, {edgePadding: 4});
  const after = fitAnchoredChords(metrics, width, {edgePadding: 4, balanceSpacing: true});
  const spread = (fits: typeof after) => {
    const gaps = fits.slice(1).map((fit, index) => fit.left - fits[index].left - metrics[index].width * fits[index].scale);
    return Math.max(...gaps) - Math.min(...gaps);
  };
  expect(spread(after)).toBeLessThan(spread(before) - 3);
  after.forEach((fit, index) => {
    expect(fit.left).toBeGreaterThanOrEqual(3.999);
    expect(fit.left + metrics[index].width * fit.scale).toBeLessThanOrEqual(width - 3.999);
    expect(Math.abs(fit.left + metrics[index].width * fit.scale / 2 - metrics[index].anchor)).toBeLessThanOrEqual(Math.min(10, width / 4 * .22) + .001);
    expect(fit.scale).toBeGreaterThanOrEqual(.85);
  });
});

it('leaves a clear gap before the final slash chord without over-condensing the subdivisions', () => {
  const width = 140.3;
  const metrics = [.125,.375,.5625,.6875,.875].map((anchor, index) => ({
    anchor: anchor * width, width: [36.54,15,11.54,24.33,37.48][index], span: [1,1,.5,.5,1][index],
  }));
  const fits = fitAnchoredChords(metrics, width, {edgePadding: 4});
  expect(fits[4].left - (fits[3].left + metrics[3].width * fits[3].scale)).toBeGreaterThanOrEqual(5.999);
  expect(fits[3].scale).toBeGreaterThan(.6);
  expect(fits[4].scale).toBe(.8);
});


it('balances the second-beat slash between its neighbors without moving their beat positions', () => {
  const width = 140.3;
  const metrics = [.125,.375,.5625,.6875,.875].map((anchor, index) => ({
    anchor: anchor * width, width: [36.54,15,11.54,24.33,37.48][index], span: [1,1,.5,.5,1][index],
  }));
  const original = fitAnchoredChords(metrics, width, {edgePadding: 4});
  const fits = fitAnchoredChords(metrics.map((metric,index) => ({...metric, continuation: index === 1})), width, {edgePadding: 4});
  const leftGap = fits[1].left - fits[0].left - metrics[0].width * fits[0].scale;
  const rightGap = fits[2].left - fits[1].left - metrics[1].width * fits[1].scale;
  expect(leftGap).toBeCloseTo(rightGap, 4);
  expect(leftGap).toBeGreaterThan(9);
  expect(Math.abs(fits[1].left + 15 / 2 - metrics[1].anchor)).toBeLessThanOrEqual(140.3 * .1875 * .22);
  [0,2,3,4].forEach(index => expect(fits[index]).toEqual(original[index]));
});

it.each([100, 120, 140, 160, 200])('keeps adjacent full-beat slash chords distinct in a %ipx measure', width => {
  // Chorus bar 3: 2m11, empty, 6m7/5, 3/#5. Widths model long slash spellings.
  const metrics = [.125, .625, .875].map((anchor, index) => ({
    anchor: anchor * width, width: [38, 48, 50][index], span: 1, slashBass: index > 0,
  }));
  const before = JSON.stringify(metrics);
  const fits = fitAnchoredChords(metrics, width, { edgePadding: 4 });
  const thirdBeatRight = fits[1].left + metrics[1].width * fits[1].scale;
  expect(fits[2].left - thirdBeatRight).toBeGreaterThanOrEqual(7.999);
  fits.forEach((fit, index) => {
    expect(fit.anchor).toBe(metrics[index].anchor);
    expect(fit.left).toBeGreaterThanOrEqual(3.999);
    expect(fit.left + metrics[index].width * fit.scale).toBeLessThanOrEqual(width - 3.999);
    expect(Math.abs(fit.left + metrics[index].width * fit.scale / 2 - fit.anchor)).toBeLessThanOrEqual(Math.min(10, width / 4 * .22) + .001);
  });
  expect(JSON.stringify(metrics)).toBe(before);
});

it.each([120, 140])('keeps Washed full-beat chords at one scale in a %ipx measure', width => {
  // B/D#, E, /, /: a long slash chord followed by a short root.
  const metrics = [38, 13, 15, 15].map((w, index) => ({
    anchor: width * (index + .5) / 4, width: w, span: 1,
    slashBass: index === 0, opticalOffset: index === 0 ? 2 : 0, continuation: index > 1,
  }));
  const before = JSON.stringify(metrics);
  const fits = fitAnchoredChords(metrics, width, { edgePadding: 4, balanceSpacing: true });
  expect(fits[0].scale).toBeCloseTo(fits[1].scale, 6);
  expect(Math.max(...fits.map(fit => fit.scale)) - Math.min(...fits.map(fit => fit.scale))).toBeLessThan(.000001);
  fits.forEach((fit, index) => {
    expect(fit.anchor).toBe(metrics[index].anchor);
    expect(fit.left).toBeGreaterThanOrEqual(3.999);
    expect(fit.left + metrics[index].width * fit.scale).toBeLessThanOrEqual(width - 3.999);
    if (index) expect(fit.left - fits[index-1].left - metrics[index-1].width * fits[index-1].scale).toBeGreaterThanOrEqual(2.999);
  });
  expect(JSON.stringify(metrics)).toBe(before);
});
