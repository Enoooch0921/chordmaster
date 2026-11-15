import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useToolbarActionLabels } from './useToolbarActionLabels';

let available: number, controls: number, text: number;
let resize: () => void;
let disconnect: ReturnType<typeof vi.fn>;
beforeEach(() => {
  available = 200; controls = 100; text = 50;
  disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => available);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const visible = this.querySelector<HTMLElement>('[data-toolbar-action-label]')?.style.position !== 'absolute';
    const width = this.hasAttribute('data-toolbar-action-label') ? text : controls + (visible ? text + 6 : 0);
    return { width } as DOMRect;
  });
});
function Harness({ enabled = true, layout = 'tablet' }) {
  const { ref, showLabels } = useToolbarActionLabels(enabled, layout);
  return <div ref={ref}><div data-toolbar-label-content><button style={{ columnGap: 6 }}>
    Icon<span data-testid="label" data-toolbar-action-label style={{ position: showLabels ? 'static' : 'absolute' }}>Lyrics</span>
  </button></div></div>;
}
it('shows labels when they fit and stays stable across resize, optional controls and longer translations', () => {
  render(<Harness />);
  const visible = () => screen.getByTestId('label').style.position === 'static';
  expect(visible()).toBe(true);
  act(() => resize()); expect(visible()).toBe(true);
  available = 150; act(() => resize()); expect(visible()).toBe(false);
  act(() => resize()); expect(visible()).toBe(false);
  available = 200; act(() => resize()); expect(visible()).toBe(true);
  controls = 160; act(() => resize()); expect(visible()).toBe(false);
  controls = 100; act(() => resize()); expect(visible()).toBe(true);
  text = 100; act(() => resize()); expect(visible()).toBe(false);
  text = 50; act(() => resize()); expect(visible()).toBe(true);
});
it('reconnects after a header layout change and disconnects when disabled', () => {
  const { rerender, unmount } = render(<Harness />);
  rerender(<Harness layout="desktop" />); expect(disconnect).toHaveBeenCalledTimes(1);
  rerender(<Harness enabled={false} layout="desktop" />); expect(disconnect).toHaveBeenCalledTimes(2);
  unmount(); expect(disconnect).toHaveBeenCalledTimes(2);
});
