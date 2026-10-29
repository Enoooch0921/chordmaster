import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePerformanceKeyboardFocus } from './usePerformanceKeyboardFocus';
beforeEach(() => {
  vi.useFakeTimers(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });
const setup = (fullscreenTarget = false) => {
  const capture = createRef<HTMLInputElement>(); const overlay = createRef<HTMLDivElement>();
  capture.current = document.createElement('input'); overlay.current = document.createElement('div');
  overlay.current.tabIndex = -1;
  document.body.append(capture.current, overlay.current);
  const focus = vi.spyOn(capture.current, 'focus');
  const hook = renderHook(({ enabled }) => usePerformanceKeyboardFocus(enabled, capture, overlay, fullscreenTarget), { initialProps: { enabled: true } });
  return { ...hook, capture, overlay, focus };
};
describe('iPad standalone page-turner focus recovery', () => {
  it('continues asserting native focus after 30 minutes even when DOM focus has not changed', () => {
    const { focus, capture } = setup();
    act(() => vi.advanceTimersByTime(30 * 60 * 1000));
    expect(document.activeElement).toBe(capture.current);
    expect(focus.mock.calls.length).toBeGreaterThanOrEqual(1200);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });
  it('recovers immediately after foreground/pageshow and leaves modal controls alone', () => {
    const { focus } = setup(); focus.mockClear();
    act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); });
    expect(focus).toHaveBeenCalledTimes(2);
    const dialog = document.createElement('dialog'); dialog.setAttribute('open', ''); document.body.append(dialog);
    act(() => vi.advanceTimersByTime(3000)); expect(focus).toHaveBeenCalledTimes(2);
    dialog.remove();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => vi.advanceTimersByTime(3000)); expect(focus).toHaveBeenCalledTimes(2);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(focus).toHaveBeenCalledTimes(3);
  });
  it('stops timers/listeners and ignores stale blur callbacks after leaving performance mode', () => {
    const { focus, result, rerender } = setup(); const oldRestore = result.current;
    rerender({ enabled: false }); focus.mockClear();
    act(() => { oldRestore(); window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(60000); });
    expect(focus).not.toHaveBeenCalled();
  });
});

// WebKit may dismiss native fullscreen when any editable input takes focus,
// even if inputMode=none suppresses the software keyboard.
it('keeps native fullscreen through initial focus, heartbeats and foreground recovery', () => {
  const { focus, overlay, result } = setup(true);
  let fullscreen = true;
  focus.mockImplementation(() => { fullscreen = false; });
  act(() => {
    vi.advanceTimersByTime(6000);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    result.current();
  });
  expect(fullscreen).toBe(true);
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(overlay.current);
});
