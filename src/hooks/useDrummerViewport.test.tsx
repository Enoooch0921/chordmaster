import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDrummerViewport } from './useDrummerViewport';

let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('navigator', { userAgent: 'iPad', maxTouchPoints: 5 });
  viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; });
const frame = () => act(() => vi.advanceTimersByTime(20));
function setup() {
  const root = document.createElement('div'), input = document.createElement('input'), songList = document.createElement('div');
  root.append(input, songList); document.body.append(root);
  const hook = renderHook(() => useDrummerViewport({ current: root }, { current: input }));
  return { root, input, songList, hook };
}
const resize = (height: number, top = 0) => {
  viewport.height = height; viewport.offsetTop = top;
  act(() => viewport.dispatchEvent(new Event('resize'))); frame();
};
it('fits the visible keyboard area and returns the full surface to zero offset when the keyboard dismisses without blur', () => {
  const { root, input, songList } = setup();
  songList.scrollTop = 77;
  act(() => input.focus()); resize(380, 120);
  expect(root.style.height).toBe('380px'); expect(root.style.top).toBe('120px');
  expect(root).toHaveAttribute('data-native-keyboard', 'true'); expect(root).toHaveAttribute('data-tempo-editing', 'true');
  document.documentElement.scrollTop = 120; document.body.scrollTop = 120;
  resize(800, 120); // Safari may retain the keyboard's offset after it is gone.
  expect(document.activeElement).not.toBe(input);
  expect(root.style.top).toBe('0px'); expect(root.style.height).toBe('800px');
  expect(root).not.toHaveAttribute('data-native-keyboard');
  expect(document.documentElement.scrollTop).toBe(0); expect(document.body.scrollTop).toBe(0);
  expect(songList.scrollTop).toBe(77);
  act(() => viewport.dispatchEvent(new Event('scroll'))); frame();
  expect(root.style.top).toBe('0px');
});
it('waits for the keyboard animation after blur, including a missing final resize notification', () => {
  const { root, input } = setup();
  act(() => input.focus()); resize(380, 80);
  act(() => input.blur()); frame();
  expect(root).toHaveAttribute('data-tempo-editing', 'true');
  viewport.height = 800; // No final resize event: a bounded follow-up must recover it.
  act(() => vi.advanceTimersByTime(300));
  expect(root.style.height).toBe('800px'); expect(root.style.top).toBe('0px');
  expect(root).not.toHaveAttribute('data-tempo-editing');
});
it.each([['Macintosh', 0], ['Windows', 10]])('does not treat %s desktop physical-keyboard input and window resizing as a software keyboard', (userAgent, maxTouchPoints) => {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints });
  const { root, input } = setup();
  act(() => input.focus()); resize(380); resize(800);
  expect(root).not.toHaveAttribute('data-tempo-editing');
  expect(document.activeElement).toBe(input);
});
it('preserves pinch zoom and removes pending viewport work on exit', () => {
  const { root, input, hook } = setup();
  act(() => input.focus()); resize(380);
  viewport.scale = 2; resize(200);
  expect(root.style.height).toBe('380px');
  hook.unmount(); expect(vi.getTimerCount()).toBe(0);
  resize(800);
  expect(root.style.height).toBe('');
});
