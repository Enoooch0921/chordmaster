import { describe, expect, it } from 'vitest';
import { getKeyboardAvoidanceScroll } from './previewKeyboardVisibility';
const viewport = { left: 0, right: 1000, top: 80, bottom: 800 };
const dock = { left: 0, right: 1000, top: 480, bottom: 800 };
const bar = (top: number, bottom: number) => ({ left: 100, right: 300, top, bottom });
describe('keyboard occlusion', () => {
  it('leaves an already visible bar still', () => {
    expect(getKeyboardAvoidanceScroll(bar(200, 280), viewport, dock)).toBe(0);
  });
  it('reveals the entire bar on opening the dock or selecting the final row', () => {
    expect(getKeyboardAvoidanceScroll(bar(420, 510), viewport, dock)).toBe(46);
    expect(getKeyboardAvoidanceScroll(bar(900, 980), viewport, dock)).toBe(516);
  });
  it('chooses the nearest free band around a floating panel', () => {
    const panel = { left: 50, right: 670, top: 300, bottom: 550 };
    expect(getKeyboardAvoidanceScroll(bar(310, 390), viewport, panel)).toBe(106);
    expect(getKeyboardAvoidanceScroll(bar(460, 540), viewport, panel)).toBe(-106);
  });
  it('can expose the first bar below a top-parked keyboard', () => {
    expect(getKeyboardAvoidanceScroll(bar(100, 180), viewport, { ...dock, top: 90, bottom: 400 })).toBe(-316);
  });
  it('ignores a panel beside the bar and clamps to visible viewport bounds', () => {
    const side = { left: 500, right: 950, top: 100, bottom: 600 };
    expect(getKeyboardAvoidanceScroll(bar(300, 380), viewport, side)).toBe(0);
    expect(getKeyboardAvoidanceScroll(bar(50, 130), viewport, side)).toBe(-46);
  });
  it('exposes the start of oversized bars without oscillating', () => {
    const delta = getKeyboardAvoidanceScroll(bar(200, 700), viewport, dock);
    expect(delta).toBe(104);
    expect(getKeyboardAvoidanceScroll(bar(200 - delta, 700 - delta), viewport, dock)).toBe(0);
  });
});
