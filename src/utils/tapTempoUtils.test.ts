import { describe, expect, it } from 'vitest';
import {
  estimateTapTempo,
  getRecentTapTimes,
  resolveTapTempoDisplayBpm,
  type TapTempoLockState
} from './tapTempoUtils';

describe('tap tempo estimation', () => {
  it('estimates a steady 120 BPM tap sequence', () => {
    const estimate = estimateTapTempo([0, 500, 1000, 1500, 2000, 2500]);

    expect(estimate).toMatchObject({
      bpm: 120,
      rawBpm: 120,
      confidence: 'steady'
    });
  });

  it('keeps a stable estimate with small human timing jitter', () => {
    const estimate = estimateTapTempo([0, 498, 1003, 1501, 2004, 2502, 3001]);

    expect(estimate?.rawBpm).toBe(120);
    expect(estimate?.confidence).toBe('steady');
  });

  it('uses the longest stable segment when one tap lands late', () => {
    const estimate = estimateTapTempo([0, 500, 1000, 1800, 2300, 2800, 3300]);

    expect(estimate?.rawBpm).toBe(120);
    expect(estimate?.usedTapCount).toBe(4);
  });

  it('smooths sudden displayed BPM jumps while preserving the raw estimate', () => {
    const estimate = estimateTapTempo([0, 500, 1000, 1500, 2000], 100);

    expect(estimate?.rawBpm).toBe(120);
    expect(estimate?.bpm).toBe(104);
  });

  it('can settle on an odd tempo between two neighboring even estimates', () => {
    const estimateFromBelow = estimateTapTempo([0, 469, 945, 1414, 1890, 2359, 2835], 126);
    const estimateFromAbove = estimateTapTempo([0, 469, 945, 1414, 1890, 2359, 2835], 128);

    expect(estimateFromBelow?.rawBpm).toBe(127);
    expect(estimateFromBelow?.bpm).toBe(127);
    expect(estimateFromAbove?.rawBpm).toBe(127);
    expect(estimateFromAbove?.bpm).toBe(127);
  });

  it('locks the displayed BPM instead of chasing small tap jitter', () => {
    const estimates = [126.3, 128.8, 127.1, 129.0, 126.6, 128.1].map((rawPreciseBpm, index) => ({
      bpm: Math.round(rawPreciseBpm),
      rawBpm: Math.round(rawPreciseBpm),
      preciseBpm: rawPreciseBpm,
      rawPreciseBpm,
      intervalMs: 60000 / rawPreciseBpm,
      tapCount: index + 5,
      usedTapCount: 5,
      spread: 0.04,
      confidence: 'steady' as const
    }));
    let state: TapTempoLockState = { lockedBpm: null, recentPreciseBpms: [] };
    const displayedBpms = estimates.map((estimate) => {
      const result = resolveTapTempoDisplayBpm(estimate, state);
      state = result.state;
      return result.bpm;
    });

    expect(displayedBpms.slice(2)).toEqual([127, 127, 127, 127]);
    expect(state.lockedBpm).toBe(127);
  });

  it('keeps a locked BPM through nearby jitter but unlocks for a real tempo change', () => {
    const locked = resolveTapTempoDisplayBpm({
      bpm: 127,
      rawBpm: 127,
      preciseBpm: 127,
      rawPreciseBpm: 127,
      intervalMs: 60000 / 127,
      tapCount: 7,
      usedTapCount: 6,
      spread: 0.03,
      confidence: 'steady'
    }, { lockedBpm: 127, recentPreciseBpms: [126.5, 127.2, 128.1] });
    const changed = resolveTapTempoDisplayBpm({
      bpm: 134,
      rawBpm: 134,
      preciseBpm: 134,
      rawPreciseBpm: 134,
      intervalMs: 60000 / 134,
      tapCount: 8,
      usedTapCount: 6,
      spread: 0.03,
      confidence: 'steady'
    }, { lockedBpm: 127, recentPreciseBpms: [134, 134.3, 133.8] });

    expect(locked.bpm).toBe(127);
    expect(changed.bpm).toBe(134);
    expect(changed.state.lockedBpm).toBe(134);
  });

  it('starts a fresh sequence after a reset gap', () => {
    const recent = getRecentTapTimes([0, 500, 1000], 4000, {
      resetAfterMs: 2500,
      maxSamples: 12
    });

    expect(recent).toEqual([4000]);
  });
});
