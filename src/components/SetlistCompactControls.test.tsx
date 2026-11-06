import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactSegmentedControl, CompactToggleSwitch } from './SetlistCompactControls';

const media = vi.hoisted(() => ({ reduced: false }));
vi.mock('../hooks/useReducedMotionPreference', () => ({ useReducedMotionPreference: () => media.reduced }));

const options = [{ value: 'a', label: '首調' }, { value: 'b', label: 'A much longer fixed-key label' }, { value: 'c', label: '級數' }];
let widths: number[], tops: number[], resizeCallbacks: Set<() => void>;
const animations: Array<{ playState: string; cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null }> = [];
const animate = vi.fn(function (_keyframes: Keyframe[], _options: KeyframeAnimationOptions) {
  const animation = { playState: 'running', cancel: vi.fn(), onfinish: null as (() => void) | null };
  animation.cancel.mockImplementation(() => { animation.playState = 'idle'; });
  animations.push(animation);
  return animation;
});
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const buttonIndex = (element: HTMLElement) => Array.from(element.parentElement?.querySelectorAll(':scope > button') ?? []).indexOf(element);
function Controls({ wrap = false, stretch = false, labels = options, onChange = vi.fn() }: { wrap?: boolean; stretch?: boolean; labels?: typeof options; onChange?: (value: string) => void }) {
  const [value, setValue] = useState('a');
  return <CompactSegmentedControl value={value} options={labels.map(option => ({ ...option }))} onChange={next => { onChange(next); setValue(next); }} wrap={wrap} stretch={stretch} />;
}
const marker = () => document.querySelector<HTMLElement>('.ui-measured-selection')!;
const pointerSelect = (name: string) => { const button = screen.getByRole('button', { name }); fireEvent.pointerDown(button); fireEvent.click(button); };

beforeEach(() => {
  media.reduced = false;
  widths = [42, 180, 64]; tops = [3, 3, 3]; resizeCallbacks = new Set(); animations.length = 0; animate.mockClear();
  vi.stubGlobal('ResizeObserver', class {
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; resizeCallbacks.add(callback); }
    observe() {}
    disconnect() { resizeCallbacks.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function () { const index = buttonIndex(this); return index < 0 ? 0 : 3 + widths.slice(0, index).reduce((sum, width) => sum + width + 4, 0); });
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function () { return tops[buttonIndex(this)] ?? 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return this.tagName === 'BUTTON' ? widths[buttonIndex(this)] ?? 0 : 300; });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.tagName === 'BUTTON' ? 24 : 32; });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () { return rect(0, 0, this.offsetWidth, this.offsetHeight); });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => { vi.unstubAllGlobals(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });

describe('measured compact selection', () => {
  it('keeps the initial selection measured through Strict Mode effect setup and cleanup', () => {
    render(<StrictMode><Controls /></StrictMode>);
    expect(marker().parentElement).toHaveAttribute('data-selection-ready', 'true');
    expect(marker().style.width).toBe('42px');
    expect(animate).not.toHaveBeenCalled();
    expect(resizeCallbacks.size).toBe(1);
  });

  it.each([false, true])('uses actual unequal button boxes (stretch=%s) and commits before animation ends', stretch => {
    const onChange = vi.fn();
    render(<Controls stretch={stretch} onChange={onChange} />);
    expect(marker()).toHaveAttribute('aria-hidden', 'true');
    expect(marker().style.width).toBe('42px');
    expect(animate).not.toHaveBeenCalled();
    pointerSelect(options[1].label);
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('button', { name: options[1].label })).toHaveAttribute('aria-pressed', 'true');
    expect(marker().style.left).toBe('49px'); expect(marker().style.width).toBe('180px');
    expect(animate).toHaveBeenCalledOnce();
    expect(animations[0].playState).toBe('running');
  });

  it('does not restart or cancel when an incidental render rebuilds the same options array', () => {
    const view = render(<Controls />);
    pointerSelect(options[1].label);
    view.rerender(<Controls />);
    expect(animate).toHaveBeenCalledOnce(); expect(animations[0].cancel).not.toHaveBeenCalled();
  });

  it('retargets rapid selections from the visible frame instead of the previous target', () => {
    render(<Controls />);
    pointerSelect(options[1].label);
    Object.defineProperty(marker(), 'getBoundingClientRect', { value: () => rect(20, 3, 90, 24) });
    pointerSelect(options[2].label);
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    expect(marker().style.left).toBe('233px'); expect(marker().style.width).toBe('64px');
    expect(animate.mock.calls[1][0]).toEqual([
      { transform: 'translate3d(-213px, 0px, 0) scale(1.40625, 1)' },
      { transform: 'translate3d(0, 0, 0) scale(1, 1)' }
    ]);
  });

  it('snaps to new geometry on resize and translated labels without replaying a selection move', () => {
    const view = render(<Controls />);
    pointerSelect(options[1].label);
    widths = [70, 210, 80];
    act(() => resizeCallbacks.forEach(callback => callback()));
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    expect(marker().style.left).toBe('77px'); expect(marker().style.width).toBe('210px');
    expect(animate).toHaveBeenCalledOnce();
    view.rerender(<Controls labels={options.map(option => ({ ...option, label: `${option.label} translation` }))} />);
    expect(animate).toHaveBeenCalledOnce();
  });

  it('keeps explicit wrap and unexpectedly wrapped layouts on static selected fills', () => {
    const view = render(<Controls wrap />);
    expect(marker()).toBeNull();
    pointerSelect(options[1].label);
    expect(screen.getByRole('button', { name: options[1].label })).toHaveClass('bg-white');
    view.rerender(<Controls />);
    tops = [3, 31, 31];
    act(() => resizeCallbacks.forEach(callback => callback()));
    expect(document.querySelector('[data-selection-ready]')).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('cancels pointer motion on keyboard input and commits keyboard selection instantly', () => {
    render(<Controls />);
    pointerSelect(options[1].label);
    const last = screen.getByRole('button', { name: options[2].label });
    fireEvent.keyDown(last, { key: ' ' });
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    fireEvent.click(last);
    expect(last).toHaveAttribute('aria-pressed', 'true');
    expect(marker().style.left).toBe('233px'); expect(animate).toHaveBeenCalledOnce();
  });

  it('honors reduced motion from mount and when changed while an indicator is moving', () => {
    const view = render(<Controls />);
    pointerSelect(options[1].label);
    media.reduced = true; view.rerender(<Controls />);
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    pointerSelect(options[2].label);
    expect(marker().style.left).toBe('233px'); expect(animate).toHaveBeenCalledOnce();
    view.unmount();
    render(<Controls />); pointerSelect(options[1].label);
    expect(animate).toHaveBeenCalledOnce();
  });

  it('cancels an active indicator and disconnects geometry observation on unmount', () => {
    const view = render(<Controls />); pointerSelect(options[1].label);
    view.unmount();
    expect(animations[0].cancel).toHaveBeenCalledOnce(); expect(resizeCallbacks.size).toBe(0);
  });
});

it('keeps toggle state changes synchronous with the shared motion thumb', () => {
  const onChange = vi.fn();
  const view = render(<CompactToggleSwitch checked={false} onChange={onChange} label="顯示曲序" />);
  fireEvent.click(screen.getByRole('button', { name: '顯示曲序' }));
  expect(onChange).toHaveBeenCalledWith(true);
  view.rerender(<CompactToggleSwitch checked onChange={onChange} label="顯示曲序" />);
  expect(screen.getByRole('button', { name: '顯示曲序' })).toHaveAttribute('aria-pressed', 'true');
  expect(document.querySelector('.ui-switch-thumb')).toHaveClass('translate-x-4');
});
