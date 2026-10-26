import { describe, expect, it } from 'vitest';
import { createPerformanceKeyGate } from './performanceKeyGate';
const key = (type: string, options: KeyboardEventInit = {}) => new KeyboardEvent(type, { key: 'PageDown', code: 'PageDown', ...options });
describe('page-turner press pairing', () => {
  it('turns only once when a pedal is held longer than the old 350ms window', () => {
    const gate = createPerformanceKeyGate();
    expect(gate.accept(key('keydown'))).toBe(true);
    expect(gate.accept(key('keydown', { repeat: true }))).toBe(false);
    expect(gate.accept(key('keydown', { repeat: true }))).toBe(false);
    expect(gate.accept(key('keyup'))).toBe(false);
    expect(gate.accept(key('keydown'))).toBe(true);
    expect(gate.accept(key('keyup'))).toBe(false);
  });
  it('supports keyup-only and keydown-only pedals without timing-based throttling', () => {
    const gate = createPerformanceKeyGate();
    expect(gate.accept(key('keyup'))).toBe(true);
    expect(gate.accept(key('keyup'))).toBe(true);
    expect(gate.accept(key('keydown'))).toBe(true);
    expect(gate.accept(key('keydown'))).toBe(true);
  });
  it('pairs legacy and modern key events even after Shift is released first', () => {
    const gate = createPerformanceKeyGate();
    expect(gate.accept(key('keydown', { key: ' ', code: '', shiftKey: true }))).toBe(true);
    expect(gate.accept(key('keyup', { key: 'Spacebar', code: '' }))).toBe(false);
    expect(gate.accept(key('keydown', { key: '', code: '', keyCode: 34 }))).toBe(true);
    expect(gate.accept(key('keyup', { key: 'PageDown', code: '' }))).toBe(false);
    gate.reset();
    expect(gate.accept(key('keyup'))).toBe(true);
  });
});
