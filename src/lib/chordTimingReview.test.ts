import { describe, expect, it } from 'vitest';
import type { Bar, Song } from '../types';
import { confirmChordTiming, indexTimingReviews, inspectChartChordDrop, moveChordToBeat, transferChartChord, timingBarKey } from './chordTimingReview';

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

describe('cross-measure chord drag', () => {
  const origin = { sectionId: 's', barId: 'a', beats: 4, beat: 2 };
  const source = { chord: 'G/B', offset: 0.5, beat: 2 };
  const destination = { sectionId: 'bridge', barId: 'b', beats: 3, beat: 1 };
  function fixture() {
    const song = score([{ id: 'a', chords: ['D', 'G/B'], chordMarks: { 1: { beatOffset: 0.5, color: 'rose', special: true } },
      riff: '1 2', chordSubdivisions: [{ chord: 'A', beat: 2, offset: 0.75 }] }]);
    song.sections.push({ id: 'bridge', title: 'Bridge', bars: [{ id: 'b', chords: ['C', '/', ''], timeSignature: '3/4', annotation: 'keep' }] });
    return song;
  }
  it('moves a compact, marked slash chord into another section and meter as a single song edit', () => {
    const song = fixture();
    const next = transferChartChord(song, origin, source, destination);
    expect(next.sections[0].bars[0]).toEqual({ ...song.sections[0].bars[0], chords: ['D', '', '', ''], chordMarks: undefined });
    expect(next.sections[1].bars[0]).toEqual({ ...song.sections[1].bars[0], chords: ['C', 'G/B', ''], chordMarks: { 1: song.sections[0].bars[0].chordMarks![1] } });
    expect(song.sections[0].bars[0].chords).toEqual(['D', 'G/B']);
  });
  it('drops or deletes only the selected subdivision and keeps the primary chord and other notation', () => {
    const song = fixture();
    const extra = { chord: 'A', beat: 2, offset: 0.75 };
    const moved = transferChartChord(song, origin, extra, destination);
    expect(moved.sections[0].bars[0]).toEqual({ ...song.sections[0].bars[0], chordSubdivisions: undefined });
    expect(moved.sections[1].bars[0].chordSubdivisions).toEqual([{ ...extra, beat: 1 }]);
    const deleted = transferChartChord(song, origin, extra, null);
    expect(deleted.sections[0]).toEqual(moved.sections[0]);
    expect(deleted.sections[1]).toBe(song.sections[1]);
    expect(transferChartChord(song, origin, source, null).sections[0].bars[0]).toEqual({ ...song.sections[0].bars[0], chords: ['D', '', '', ''], chordMarks: undefined });
  });
  it('rejects collisions, protected measures and stale events without removing the source', () => {
    for (const patch of [{ chords: ['', 'F', ''] }, { chords: ['0h'] }, { chords: ['%'] }, { closed: true },
      { chordTimingUnspecified: true }, { chordSubdivisions: [{ beat: 1, offset: 0.5 as const, chord: 'F' }] },
      { chordMarks: { 1: { special: true } } }]) {
      const song = fixture();
      Object.assign(song.sections[1].bars[0], patch);
      expect(transferChartChord(song, origin, source, destination)).toBe(song);
    }
    const song = fixture();
    expect(transferChartChord(song, origin, { ...source, chord: 'Am' }, null)).toBe(song);
    expect(transferChartChord(song, origin, source, { ...destination, beats: 4 })).toBe(song);
  });

  it('moves 3&, 3e, and 3a onto downbeats within the same bar or across bars and preserves marks', () => {
    const song = fixture();
    // Primary 3& -> beat 3 downbeat keeps color + special
    const toBeat3 = transferChartChord(song, origin, source, { ...origin, beat: 2, offset: 0 });
    expect(toBeat3.sections[0].bars[0]).toMatchObject({
      chords: ['D', '', 'G/B', ''],
      chordMarks: { 2: { color: 'rose', special: true } }
    });
    // Primary 3& -> beat 4 downbeat
    const toBeat4 = transferChartChord(song, origin, source, { ...origin, beat: 3, offset: 0 });
    expect(toBeat4.sections[0].bars[0]).toMatchObject({
      chords: ['D', '', '', 'G/B'],
      chordMarks: { 3: { color: 'rose', special: true } }
    });
    // Subdivision 3a (0.75) -> beat 4 downbeat
    const extra = { chord: 'A', beat: 2, offset: 0.75 };
    const extraTo4 = moveChordToBeat(song.sections[0].bars[0], 4, extra, 3, { targetOffset: 0 });
    expect(extraTo4.chords).toEqual(['D', '', 'G/B', 'A']);
    expect(extraTo4.chordSubdivisions).toBeUndefined();
    // Cross-bar 3& -> Bridge bar beat 2 downbeat (offset 0)
    const crossDownbeat = transferChartChord(song, origin, source, { ...destination, offset: 0 });
    expect(crossDownbeat.sections[1].bars[0]).toMatchObject({
      chords: ['C', 'G/B', ''],
      chordMarks: { 1: { color: 'rose', special: true } }
    });
  });

  it('supports lossless swap within a bar and across bars while protecting marked chords from demotion loss', () => {
    const bar: Bar = { id: 'a', chords: ['C', '', 'Am', ''], chordSubdivisions: [{ beat: 2, offset: 0.5, chord: 'G' }] };
    const swapped = moveChordToBeat(bar, 4, { chord: 'G', beat: 2, offset: 0.5 }, 2, { targetOffset: 0, swap: true });
    expect(swapped.chords).toEqual(['C', '', 'G', '']);
    expect(swapped.chordSubdivisions).toEqual([{ beat: 2, offset: 0.5, chord: 'Am' }]);

    // If Am carries a color mark, demoting Am into chordSubdivisions would lose it -> safely refuse
    const markedBar: Bar = { ...bar, chordMarks: { 2: { color: 'rose' } } };
    expect(moveChordToBeat(markedBar, 4, { chord: 'G', beat: 2, offset: 0.5 }, 2, { targetOffset: 0, swap: true })).toBe(markedBar);

    // Cross-bar swap & drop inspection
    const song = score([
      { id: 'a', chords: ['C', '', '', ''], chordSubdivisions: [{ beat: 2, offset: 0.5, chord: 'G' }] },
      { id: 'b', chords: ['Am', '', 'F', ''], chordMarks: { 0: { color: 'emerald' } } }
    ]);
    const fromA = { sectionId: 's', barId: 'a', beats: 4, beat: 2 };
    const toB = { sectionId: 's', barId: 'b', beats: 4, beat: 0, offset: 0 as const };
    const moveG = { chord: 'G', beat: 2, offset: 0.5 };
    expect(inspectChartChordDrop(song, fromA, moveG, toB, { swap: true })).toBe('swap');
    expect(inspectChartChordDrop(song, fromA, moveG, { ...toB, beat: 1 }, { swap: true })).toBe('allow');
    expect(inspectChartChordDrop(song, fromA, moveG, { ...fromA, offset: 0.5 }, { swap: true })).toBe('same');
    const swappedSong = transferChartChord(song, fromA, moveG, toB, { swap: true });
    expect(swappedSong.sections[0].bars[1].chords[0]).toBe('G');
    expect(swappedSong.sections[0].bars[1].chordMarks).toBeUndefined();
    expect(swappedSong.sections[0].bars[0]).toMatchObject({
      chords: ['C', '', 'Am', ''],
      chordMarks: { 2: { beatOffset: 0.5, color: 'emerald' } },
      chordSubdivisions: undefined
    });
  });
});
