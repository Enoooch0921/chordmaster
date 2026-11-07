import { createRef } from 'react';
import { act, fireEvent, renderHook } from '@testing-library/react';
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
  it('does not refocus during contact or compatibility mouse activation, then resumes recovery', () => {
    const { overlay, focus, result } = setup();
    fireEvent.touchStart(overlay.current!, { touches: [{ identifier: 1 }] });
    focus.mockClear();
    act(() => { result.current(); vi.advanceTimersByTime(3000); });
    expect(focus).not.toHaveBeenCalled();
    fireEvent.touchEnd(overlay.current!, { touches: [], changedTouches: [{ identifier: 1 }] });
    act(() => result.current());
    expect(focus).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(501); result.current(); });
    expect(focus).toHaveBeenCalledOnce();
  });

  it('protects the pointerdown phase before touchstart reaches React and clears contact on cancel', () => {
    const { overlay, focus, result } = setup();
    const press = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(press, 'pointerType', { value: 'touch' });
    fireEvent(overlay.current!, press);
    focus.mockClear(); act(() => result.current()); expect(focus).not.toHaveBeenCalled();
    const cancel = new Event('pointercancel', { bubbles: true });
    Object.defineProperty(cancel, 'pointerType', { value: 'touch' });
    fireEvent(overlay.current!, cancel);
    act(() => { vi.advanceTimersByTime(501); result.current(); });
    expect(focus).toHaveBeenCalledOnce();
  });

  it('waits for the final finger to lift before recovering focus', () => {
    const { overlay, focus, result } = setup();
    const pointer = (type: string, id: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: id } });
      fireEvent(overlay.current!, event);
    };
    pointer('pointerdown', 1); pointer('pointerdown', 2);
    pointer('pointerup', 1);
    fireEvent.touchEnd(overlay.current!, { touches: [{ identifier: 2 }] });
    focus.mockClear(); act(() => { vi.advanceTimersByTime(3000); result.current(); });
    expect(focus).not.toHaveBeenCalled();
    pointer('pointerup', 2); fireEvent.touchEnd(overlay.current!, { touches: [] });
    act(() => { vi.advanceTimersByTime(501); result.current(); });
    expect(focus).toHaveBeenCalledOnce();
  });

  it('recovers a contact interrupted by backgrounding even without touchend', () => {
    const { overlay, focus } = setup();
    fireEvent.touchStart(overlay.current!, { touches: [{ identifier: 1 }] });
    focus.mockClear();
    act(() => window.dispatchEvent(new Event('blur')));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(focus).toHaveBeenCalledOnce();
  });
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


it('never focuses the input on rapid restore calls before the fullscreen request settles', () => {
  const { focus, overlay, result } = setup(true);
  // No timers or fullscreenElement yet: these calls model pointer/touch,
  // blur and foreground callbacks arriving during the asynchronous request.
  act(() => {
    for (let i = 0; i < 20; i++) result.current();
  });
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(overlay.current);
});

it('leaves the reader section picker focused through heartbeats and resumes after leaving it', () => {
  const { overlay, capture, focus } = setup();
  const picker = document.createElement('select');
  picker.append(document.createElement('option'));
  overlay.current!.append(picker);
  picker.focus(); focus.mockClear();
  act(() => vi.advanceTimersByTime(3000));
  expect(picker).toHaveFocus();
  expect(focus).not.toHaveBeenCalled();
  picker.blur();
  act(() => vi.advanceTimersByTime(1500));
  expect(document.activeElement).toBe(capture.current);
});

it.each(['button', 'input', 'a'])('preserves deliberate %s focus during heartbeat and foreground recovery', tag => {
  const { overlay, capture, focus } = setup();
  const control = document.createElement(tag);
  if (tag === 'a') control.setAttribute('href', '#');
  overlay.current!.append(control);
  control.focus(); focus.mockClear();
  act(() => { vi.advanceTimersByTime(4500); window.dispatchEvent(new Event('focus')); });
  expect(control).toHaveFocus(); expect(focus).not.toHaveBeenCalled();
  control.blur();
  act(() => vi.advanceTimersByTime(1500));
  expect(capture.current).toHaveFocus();
});
