import { describe, expect, it } from 'vitest';
import { getPerformanceLayout, getPerformancePageRange, getPerformanceSpreadStart } from './performanceLayout';

describe('performance page spreads', () => {
  it('fits two full A4 pages on Macs and landscape tablets', () => {
    for (const [width, height] of [[1440, 900], [1366, 1024], [1024, 768]]) {
      const layout = getPerformanceLayout(width, height, 5);
      expect(layout.columns).toBe(2);
      expect(layout.width).toBeLessThanOrEqual(width);
      expect(layout.height).toBeLessThanOrEqual(height);
    }
  });

  it('keeps portrait tablets, phones, small windows and one-page songs in single-page view', () => {
    expect(getPerformanceLayout(1024, 1366, 5).columns).toBe(1);
    expect(getPerformanceLayout(932, 430, 5, true).columns).toBe(1);
    expect(getPerformanceLayout(1100, 600, 5, true).columns).toBe(1);
    expect(getPerformanceLayout(800, 600, 5).columns).toBe(1);
    expect(getPerformanceLayout(1440, 900, 1).columns).toBe(1);
  });

  it('keeps the selected page in view on rotation and handles an odd final page', () => {
    expect(getPerformanceSpreadStart(3, 5, 2)).toBe(2);
    expect(getPerformanceSpreadStart(4, 5, 2)).toBe(4);
    expect(getPerformanceSpreadStart(2, 5, 1)).toBe(2);
    expect(getPerformanceSpreadStart(Infinity, 5, 2)).toBe(4);
    expect(getPerformanceSpreadStart(Infinity, 4, 2)).toBe(2);
    expect(getPerformanceSpreadStart(4, 1, 1)).toBe(0);
    expect(getPerformancePageRange(0, 5, 2)).toBe('1–2');
    expect(getPerformancePageRange(2, 5, 2)).toBe('3–4');
    expect(getPerformancePageRange(4, 5, 2)).toBe('5');
    expect(getPerformancePageRange(1, 5, 1)).toBe('2');
  });
});
