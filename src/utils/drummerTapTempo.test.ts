import { describe, expect, it } from 'vitest';
import { DrummerTapTempo } from './drummerTapTempo';

describe('drummer TAP acquisition and stability', () => {
  it.each([40, 70, 120, 180, 240])('acquires %s BPM by the second tap independently of the song tempo', bpm => {
    const tap = new DrummerTapTempo();
    expect(tap.push(0).bpm).toBeNull();
    expect(tap.push(60000 / bpm).bpm).toBe(bpm);
    expect(tap.push(120000 / bpm).bpm).toBe(bpm);
  });
  it('stays near 120 with human timing jitter and one late tap', () => {
    const tap = new DrummerTapTempo();
    const results = [0, 498, 1003, 1500, 2002, 2600, 3001, 3502, 4000].map(t => tap.push(t).bpm);
    expect(results.slice(2).filter(v => v !== null).every(v => Math.abs(v! - 120) <= 2)).toBe(true);
  });
  it('recovers from a poor first interval by the fourth tap', () => {
    const tap = new DrummerTapTempo();
    [0, 800, 1300].forEach(t => tap.push(t));
    expect(tap.push(1800).bpm).toBe(120);
  });
  it('reacquires a sustained change instead of remaining locked to old taps', () => {
    const tap = new DrummerTapTempo();
    [0, 500, 1000, 1500, 2000].forEach(t => tap.push(t));
    [1, 2].forEach(n => tap.push(2000 + n * 60000 / 70));
    expect(tap.push(2000 + 3 * 60000 / 70).bpm).toBe(70);
  });
  it('ignores double triggers and stale events, and resets after inactivity/song change', () => {
    const tap = new DrummerTapTempo();
    tap.push(1000); tap.push(1500);
    expect(tap.push(1540)).toEqual({ count: 2, bpm: null });
    expect(tap.push(1400)).toEqual({ count: 2, bpm: null });
    expect(tap.push(6000)).toEqual({ count: 1, bpm: null });
    expect(tap.push(7000).bpm).toBe(60);
    tap.reset(); expect(tap.push(7500).bpm).toBeNull();
  });
  it('estimates identically when source timestamps arrive with variable processing delays', () => {
    const immediate = new DrummerTapTempo(), delayed = new DrummerTapTempo();
    const packets = [0, 500, 1000, 1500, 2000, 2500].map((timestamp, i) => ({ timestamp, receivedAt: timestamp + [18, 70, 9, 125, 20, 58][i] }));
    const actual = packets.sort((a, b) => a.receivedAt - b.receivedAt).map(packet => delayed.push(packet.timestamp));
    expect(actual).toEqual(packets.map(packet => immediate.push(packet.timestamp)));
    expect(actual.at(-1)?.bpm).toBe(120);
  });
});
