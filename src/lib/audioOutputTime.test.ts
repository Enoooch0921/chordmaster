import { expect, it } from 'vitest';
import { audioOutputTime } from './audioOutputTime';

it('tracks the audible output with a 250ms device delay, without applying the latency twice', () => {
  const context = { currentTime: 4, baseLatency: .01, outputLatency: .24,
    getOutputTimestamp: () => ({ contextTime: 3.70, performanceTime: 1950 }) } as AudioContext;
  expect(audioOutputTime(context, 2000)).toBeCloseTo(3.75);
});
it('falls back to reported latency when a timestamp is unavailable, all-zero or stale', () => {
  for (const getOutputTimestamp of [undefined, () => ({contextTime:0, performanceTime:0}), () => ({contextTime:1,performanceTime:100}), () => { throw Error(); }]) {
    expect(audioOutputTime({ currentTime:4, outputLatency:.18, baseLatency:.02, getOutputTimestamp } as AudioContext, 2000)).toBeCloseTo(3.8);
  }
});
