import { describe, expect, it } from 'vitest';
import type { Bar, Song } from '../types';
import { confirmChordTiming, indexTimingReviews, moveChordToBeat, timingBarKey } from './chordTimingReview';

const pending = (id: string, patch: Partial<Bar> = {}): Bar => ({
  id, chords: ['D/F#', 'G'], chordTimingUnspecified: true, ...patch
});
const score = (bars: Bar[]): Song => ({
  title: 'Timing review', originalKey: 'D', currentKey: 'D', timeSignature: '4/4',
  sections: [{ id: 's', title: 'Intro', bars }]
});
const target = { sectionId: 's', barId: 'a' };
const reviewOf = (song: Song) => indexTimingReviews(song).get(timingBarKey('s', 'a'))!;

describe('chord timing review', () => {
  it('proposes two beats each, follows consistent examples, and flags conflicting evidence', () => {
    const song = score([pending('a')]);
    expect(reviewOf(song)).toMatchObject({ positions: [0, 2], manual: false });
    song.sections[0].bars.push({ chords: ['D/F#', '/', '/', 'G'], id: 'known' });
    expect(reviewOf(song)).toMatchObject({ positions: [0, 3], manual: false });
    song.sections[0].bars.push({ chords: ['D/F#', '/', 'G', '/'], id: 'other' });
    expect(reviewOf(song).manual).toBe(true);
    expect(reviewOf(score([pending('a', { chords: ['G', 'A', 'G'] })])).manual).toBe(true);
    expect(reviewOf(score([pending('a', { chords: ['D/F#', '', '', 'G'] })])).positions).toEqual([0, 3]);
  });

  it('confirms only matching pending measures across sections, retaining each measure’s own marks and notes', () => {
    const song = score([pending('a'), { id: 'already', chords: ['D/F#', '/', 'G', '/'] },
      pending('reverse', { chords: ['G', 'D/F#'] }), pending('unknown-key', { chordKeyUnspecified: true }),
      pending('free', { unmeteredChordLines: [['D/F#', 'G']] }),
      pending('variant', { chordPassVariants: [{ pass: 2, chords: ['A'] }] })]);
    song.sections.push({ id: 'v', title: 'Verse', bars: [
      pending('b', { annotation: 'Only here', chordMarks: { 1: { special: true } }, repeatEnd: true }),
      pending('partial', { timeSignature: '2/4', partialMeasure: true }), pending('changed-key', { keyChangeTo: 'G' })
    ] });
    const review = reviewOf(song);
    expect(review.count).toBe(2);
    const result = confirmChordTiming(song, target, review, [0, 3], true);
    expect(result.sections[0].bars[0].chords).toEqual(['D/F#', '/', '/', 'G']);
    expect(result.sections[1].bars[0]).toMatchObject({ chordTimingUnspecified: undefined, annotation: 'Only here',
      chordMarks: { 3: { special: true } }, repeatEnd: true, chords: ['D/F#', '/', '/', 'G'] });
    expect(result.sections[0].bars.slice(1)).toEqual(song.sections[0].bars.slice(1));
    expect(result.sections[1].bars.slice(1)).toEqual(song.sections[1].bars.slice(1));
    const single = confirmChordTiming(song, target, review, [0, 3], false);
    expect(single.sections[1]).toBe(song.sections[1]);
    for (const positions of [[0, 4], [2, 1], [1, 1], [0], [0, 2.5]]) {
      expect(confirmChordTiming(song, target, review, positions, true)).toBe(song);
    }
    expect(confirmChordTiming(result, target, review, [0, 2], true)).toBe(result);
  });

  it('retains offsets and chord marks when moving a compact legacy chord, and refuses collisions', () => {
    const bar: Bar = { chords: ['D/F#', 'G'], chordMarks: { 1: { beatOffset: 0.5, special: true } },
      chordSubdivisions: [{ chord: 'A', beat: 1, offset: 0.5 }], annotation: 'Keep' };
    const source = { chord: 'G', beat: 2, offset: 0.5 };
    const result = moveChordToBeat(bar, 4, source, 3);
    expect(result).toEqual({ ...bar, chords: ['D/F#', '', '', 'G'], chordMarks: { 3: bar.chordMarks![1] } });
    expect(moveChordToBeat(bar, 4, source, 0)).toBe(bar);
    expect(moveChordToBeat(bar, 4, source, 1)).toBe(bar);
    expect(moveChordToBeat(bar, 4, source, 4)).toBe(bar);
    expect(moveChordToBeat(bar, 4, { chord: 'A', beat: 1, offset: 0.5 }, 3).chordSubdivisions)
      .toEqual([{ chord: 'A', beat: 3, offset: 0.5 }]);
    const rests: Bar = { chords: ['0h', '', 'G', ''] };
    expect(moveChordToBeat(rests, 4, { chord: 'G', beat: 2, offset: 0 }, 1)).toBe(rests);
  });
});
