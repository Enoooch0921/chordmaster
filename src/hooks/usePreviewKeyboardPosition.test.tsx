import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PREVIEW_KEYBOARD_POSITION_KEY, usePreviewKeyboardPosition } from './usePreviewKeyboardPosition';

beforeEach(() => {
  localStorage.removeItem(PREVIEW_KEYBOARD_POSITION_KEY);
  vi.stubGlobal('innerWidth', 1200);
  vi.stubGlobal('innerHeight', 800);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.removeItem(PREVIEW_KEYBOARD_POSITION_KEY); });

function panel(left = 100, top = 100, width = 400, height = 200) {
  const current = document.createElement('div');
  vi.spyOn(current, 'getBoundingClientRect').mockReturnValue({ left, top, width, height } as DOMRect);
  return { current };
}
const target = { setPointerCapture: vi.fn(), hasPointerCapture: () => false, releasePointerCapture: vi.fn() };
const pointer = (clientX: number, clientY: number) => ({ button: 0, pointerId: 1, clientX, clientY, currentTarget: target, preventDefault: vi.fn() }) as unknown as ReactPointerEvent<HTMLButtonElement>;
const arrow = (key = 'ArrowRight') => ({ key, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as ReactKeyboardEvent<HTMLButtonElement>;

it('remembers a completed drag after closing and opening at a different measure', () => {
  const ref = panel();
  const first = renderHook(() => usePreviewKeyboardPosition(ref, 'desktop'));
  act(() => first.result.current.gripProps.onPointerDown(pointer(110, 110)));
  act(() => first.result.current.gripProps.onPointerMove(pointer(310, 210)));
  act(() => first.result.current.gripProps.onPointerUp(pointer(310, 210)));
  expect(first.result.current.position).toEqual({ left: 300, top: 200 });
  first.unmount();
  const nextRef = panel(700, 550);
  const reopened = renderHook(() => usePreviewKeyboardPosition(nextRef, 'desktop'));
  expect(reopened.result.current.position).toEqual({ left: 300, top: 200 });
});

it('keeps the chosen position while temporarily clamping it for a small viewport', () => {
  localStorage.setItem(PREVIEW_KEYBOARD_POSITION_KEY, JSON.stringify({ left: 700, top: 400 }));
  const ref = panel();
  const { result } = renderHook(() => usePreviewKeyboardPosition(ref, 'desktop'));
  act(() => { vi.stubGlobal('innerWidth', 450); vi.stubGlobal('innerHeight', 300); window.dispatchEvent(new Event('resize')); });
  expect(result.current.position).toEqual({ left: 38, top: 88 });
  expect(JSON.parse(localStorage.getItem(PREVIEW_KEYBOARD_POSITION_KEY)!)).toEqual({ left: 700, top: 400 });
  act(() => { vi.stubGlobal('innerWidth', 1200); vi.stubGlobal('innerHeight', 800); window.dispatchEvent(new Event('resize')); });
  expect(result.current.position).toEqual({ left: 700, top: 400 });
});

it('does not replace the saved preference when a drag is cancelled', () => {
  const ref = panel();
  const { result } = renderHook(() => usePreviewKeyboardPosition(ref, 'desktop'));
  act(() => result.current.gripProps.onPointerDown(pointer(110, 110)));
  act(() => result.current.gripProps.onPointerMove(pointer(310, 210)));
  act(() => result.current.gripProps.onPointerCancel(pointer(310, 210)));
  expect(result.current.position).toEqual({ left: 100, top: 100 });
  expect(localStorage.getItem(PREVIEW_KEYBOARD_POSITION_KEY)).toBeNull();
});

it('remembers keyboard-based movement', () => {
  const ref = panel();
  const first = renderHook(() => usePreviewKeyboardPosition(ref, 'desktop'));
  act(() => first.result.current.gripProps.onKeyDown(arrow()));
  first.unmount();
  const reopened = renderHook(() => usePreviewKeyboardPosition(ref, 'desktop'));
  expect(reopened.result.current.position).toEqual({ left: 110, top: 100 });
});

it.each(['phone', 'tablet'] as const)('leaves the %s dock and desktop preference untouched', layout => {
  const saved = JSON.stringify({ left: 300, top: 200 });
  localStorage.setItem(PREVIEW_KEYBOARD_POSITION_KEY, saved);
  const ref = panel();
  const { result } = renderHook(() => usePreviewKeyboardPosition(ref, layout));
  act(() => result.current.gripProps.onPointerDown(pointer(110, 110)));
  act(() => result.current.gripProps.onPointerMove(pointer(310, 210)));
  act(() => result.current.gripProps.onPointerUp(pointer(310, 210)));
  act(() => result.current.gripProps.onKeyDown(arrow()));
  expect(result.current.position).toBeNull();
  expect(localStorage.getItem(PREVIEW_KEYBOARD_POSITION_KEY)).toBe(saved);
});

it.each(['broken', 'null', '{"left":"300","top":200}', '{"left":300}', '{"left":1e400,"top":200}'])('ignores corrupt position %s', saved => {
  localStorage.setItem(PREVIEW_KEYBOARD_POSITION_KEY, saved);
  const ref = panel();
  expect(renderHook(() => usePreviewKeyboardPosition(ref, 'desktop')).result.current.position).toEqual({ left: 100, top: 100 });
});

it('still moves when storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const ref = panel();
  const { result } = renderHook(() => usePreviewKeyboardPosition(ref, 'desktop'));
  act(() => result.current.gripProps.onKeyDown(arrow()));
  expect(result.current.position).toEqual({ left: 110, top: 100 });
});
