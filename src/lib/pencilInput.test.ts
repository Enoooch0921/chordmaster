import { expect, it } from 'vitest';
import { createPencilInput } from './pencilInput';

it.each([60, 120, 240])('steadies the live tip of a slow diagonal at %i samples per second', hz => {
  const filter = createPencilInput(0, 0, 0);
  let rawSquared = 0, tipSquared = 0;
  for (let i = 1; i <= hz; i++) {
    const t = i / hz;
    const x = 36 * t + .6 * Math.sin(2 * Math.PI * 18 * t);
    const y = 16 * t + 1.3 * Math.sin(2 * Math.PI * 15 * t);
    const [inkX, inkY] = filter(x, y, t * 1000);
    rawSquared += (y - x * 16 / 36) ** 2;
    tipSquared += (inkY - inkX * 16 / 36) ** 2;
    expect(Math.hypot(inkX - x, inkY - y)).toBeLessThanOrEqual(1.66);
  }
  expect(Math.sqrt(tipSquared / rawSquared)).toBeLessThan(.7);
});

it.each([60, 120, 240])('retains the corner and direction change of a small hook at %i Hz', hz => {
  const filter = createPencilInput(0, 0, 0);
  const corners = [[0, 0], [10, 0], [10, 12], [6, 8]];
  const steps = Math.round(hz / 8);
  let time = 0;
  for (let i = 1; i < corners.length; i++) {
    const [ax, ay] = corners[i - 1], [bx, by] = corners[i];
    for (let j = 1; j <= steps; j++) {
      const x = ax + (bx - ax) * j / steps, y = ay + (by - ay) * j / steps;
      const [inkX, inkY] = filter(x, y, time += 1000 / hz);
      expect(Math.hypot(inkX - x, inkY - y)).toBeLessThanOrEqual(1.66);
      if (j === steps) expect(Math.hypot(inkX - bx, inkY - by)).toBeLessThan(1.5);
    }
  }
});

it('keeps dots and duplicate lift samples in place, and accepts a distinct sparse endpoint', () => {
  const filter = createPencilInput(20.5, 14.75, 100);
  expect(filter(20.5, 14.75, 110)).toEqual([20.5, 14.75]);
  const tip = filter(21.5, 15.75, 114);
  expect(filter(21.5, 15.75, 138)).toEqual(tip);
  expect(filter(10, 0, 110)).toEqual(tip);
  expect(filter(45, 22, 143)).toEqual([45, 22]);
});
