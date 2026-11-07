import { describe, expect, it } from 'vitest';
import { getPerformanceCacheIds } from './performanceCache';
const entries = (sizes: number[]) => sizes.map((bars, i) => ({ item: { id: `song-${i}` }, song: {
  sections: [{ title: 'Verse', bars: Array.from({ length: bars }, () => ({ chords: ['C'] })) }],
} }));

describe('stage preparation budget and priority', () => {
  it('prepares the full small setlist, prioritizing the next song before looking farther ahead', () => {
    const list = entries([24, 24, 24, 24]);
    expect(getPerformanceCacheIds(list, 'song-0')).toEqual(['song-0', 'song-1', 'song-2', 'song-3']);
    expect(getPerformanceCacheIds(list, 'song-1')).toEqual(['song-1', 'song-2', 'song-0', 'song-3']);
  });
  it('bounds small-chart retention to eight entries and reverses the lookahead at the end', () => {
    const list = entries(Array(12).fill(1));
    expect(getPerformanceCacheIds(list, 'song-0')).toEqual(Array.from({ length: 8 }, (_, i) => `song-${i}`));
    expect(getPerformanceCacheIds(list, 'song-11')).toEqual(Array.from({ length: 8 }, (_, i) => `song-${11 - i}`));
  });
  it('limits optional charts by source measures as well as entry count', () => {
    const list = entries([64, 64, 192, 192, 32]);
    expect(getPerformanceCacheIds(list, 'song-0')).toEqual(['song-0', 'song-1', 'song-2', 'song-3']);
  });
  it('keeps immediate neighbors even if exceptionally long charts exceed the optional budget', () => {
    const list = entries([700, 700, 700, 1]);
    expect(getPerformanceCacheIds(list, 'song-1')).toEqual(['song-1', 'song-2', 'song-0']);
  });
  it('returns no preparation targets for a removed selection', () => {
    expect(getPerformanceCacheIds(entries([1, 1]), 'removed')).toEqual([]);
  });
});
