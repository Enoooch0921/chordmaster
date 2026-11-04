import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChordFitScope, ChordFitGrid, FittedBeatChord } from './ChordFitGrid';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shares the tightest measured scale across a measure and releases it after resizing', () => {
  let availableWidth = 44;
  let resized: () => void = () => {};
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => availableWidth);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return Number(this.textContent);
  });
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++frameId, callback); return frameId; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const { container, unmount } = render(<ChordFitScope><ChordFitGrid>
    {[28, 56, 26, 70].map(width => <FittedBeatChord key={width}>{width}</FittedBeatChord>)}
  </ChordFitGrid></ChordFitScope>);
  const grid = container.querySelector<HTMLElement>('[data-chord-fit-grid]')!;
  expect(Number(grid.style.getPropertyValue('--chord-fit-scale'))).toBeCloseTo(0.6);
  for (const slot of grid.querySelectorAll('[data-chord-fit-slot]')) {
    const content = slot.firstElementChild as HTMLElement;
    expect(content.style.transform).toContain('scaleX(var(--chord-fit-scale, 1))');
    expect(content.style.transformOrigin).toBe('left bottom');
  }
  availableWidth = 100;
  act(() => {
    resized(); resized();
    expect(frames.size).toBe(1);
    const callback = [...frames.values()][0]; frames.clear(); callback(0);
  });
  expect(grid.style.getPropertyValue('--chord-fit-scale')).toBe('1');
  resized();
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(frames.size).toBe(0);
});

it('fits measures independently and preserves neighbors when one chord becomes longer', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return Number(this.textContent);
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const widths = [[20, 60, 30, 40], [40, 80, 30, 70], [40, 50, 50, 50]];
  const score = () => <ChordFitScope>{widths.map((measure, index) => <ChordFitGrid key={index} evenSpacing>
    {measure.map((width, index) => <FittedBeatChord key={index}>{width}</FittedBeatChord>)}
  </ChordFitGrid>)}</ChordFitScope>;
  const { container, rerender } = render(score());
  const grids = [...container.querySelectorAll<HTMLElement>('[data-chord-fit-grid]')];
  grids.forEach((grid, index) => {
    const scale = Number(grid.style.getPropertyValue('--chord-fit-scale'));
    expect(scale).toBeCloseTo(Math.min(1, 176 / widths[index].reduce((sum, width) => sum + width, 0)));
    const columns = grid.style.getPropertyValue('--chord-fit-columns').split(' ').map(parseFloat);
    expect(columns.reduce((sum, width) => sum + width, 0)).toBeCloseTo(200);
    const gaps = columns.slice(0, -1).map((column, beat) => column - widths[index][beat] * scale);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.001);
    expect((grid.cloneNode(true) as HTMLElement).style.getPropertyValue('--chord-fit-scale')).toBe(String(scale));
  });
  const previousScales = grids.map(grid => grid.style.getPropertyValue('--chord-fit-scale'));
  widths[1][1] = 200;
  rerender(score());
  expect(Number(grids[1].style.getPropertyValue('--chord-fit-scale'))).toBeCloseTo(176 / 340);
  expect(grids[0].style.getPropertyValue('--chord-fit-scale')).toBe(previousScales[0]);
  expect(grids[2].style.getPropertyValue('--chord-fit-scale')).toBe(previousScales[2]);
});

it('reserves the inline time-signature gutter when distributing chords', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return Number(this.textContent);
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const { container } = render(<ChordFitScope><ChordFitGrid evenSpacing style={{ paddingLeft: 32 }}>
    <FittedBeatChord>80</FittedBeatChord><FittedBeatChord>100</FittedBeatChord>
  </ChordFitGrid></ChordFitScope>);
  const grid = container.querySelector<HTMLElement>('[data-chord-fit-grid]')!;
  expect(Number(grid.style.getPropertyValue('--chord-fit-scale'))).toBeCloseTo(160 / 180);
  const columns = grid.style.getPropertyValue('--chord-fit-columns').split(' ').map(parseFloat);
  expect(columns.reduce((sum, width) => sum + width, 0)).toBeCloseTo(168);
});

it('balances facing glyph profiles while reserving clearance for a raised extension', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
  const naturalWidth = (element: HTMLElement) => Number((element.hasAttribute('data-natural-width') ? element : element.querySelector('[data-natural-width]'))?.getAttribute('data-natural-width')) || 0;
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return naturalWidth(this); });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return naturalWidth(this); });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = Number(this.dataset.inkLeft) || 0;
    const right = Number(this.dataset.inkRight) || naturalWidth(this);
    const height = Number(this.dataset.inkHeight) || 18;
    return { x: left, y: 0, left, right, top: 0, bottom: height, width: right - left, height, toJSON() {} };
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const { container } = render(<ChordFitScope><ChordFitGrid evenSpacing>
    {[20, 40, 20].map((width, index) => <FittedBeatChord key={index}>
      <span data-natural-width={width}>
        <span data-chord-root data-ink-right="20">C</span>
        {index === 1 && <><span data-ink-left="20" data-ink-right="40" data-ink-height="6">(b9)</span><span data-chord-fit-decoration><span data-ink-right="200">performance badge</span></span></>}
      </span>
    </FittedBeatChord>)}
  </ChordFitGrid></ChordFitScope>);
  const grid = container.querySelector<HTMLElement>('[data-chord-fit-grid]')!;
  const scale = Number(grid.style.getPropertyValue('--chord-fit-scale'));
  const columns = grid.style.getPropertyValue('--chord-fit-columns').split(' ').map(parseFloat);
  expect(scale).toBeCloseTo(0.9);
  [38, 44, 18].forEach((width, index) => expect(columns[index]).toBeCloseTo(width));
  const opticalGaps = [columns[0] - 20 * scale, columns[1] - (20 + 20 / 3) * scale];
  expect(opticalGaps[0]).toBeCloseTo(opticalGaps[1]);
  expect(columns[1] - 40 * scale).toBeCloseTo(8);
  const slots = [...grid.querySelectorAll<HTMLElement>('[data-chord-fit-slot]')];
  expect(slots.map(slot => slot.style.getPropertyValue('--chord-fit-inset'))).toEqual(['0px', '0px', '0px']);
});
