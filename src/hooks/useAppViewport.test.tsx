import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppViewport } from './useAppViewport';
let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
beforeEach(() => { vi.useFakeTimers(); viewport = Object.assign(new EventTarget(), { height: 700, offsetTop: 0, scale: 1 }); vi.stubGlobal('visualViewport', viewport); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const point = (x: number, y: number) => ({ clientX: x, clientY: y });
const touch = (target: Element, type: string, touches: ReturnType<typeof point>[]) => { const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'touches', { value: touches }); fireEvent(target, event); return event; };
function setup() { const root = document.createElement('div'); document.body.append(root); const hook = renderHook(useAppViewport); act(() => hook.result.current(root)); return { root, hook, frame: () => act(() => vi.advanceTimersByTime(20)) }; }
describe('contained app viewport', () => {
 it('resyncs keyboard bounds and standalone foreground changes without document scrolling', () => {
  const { root, frame } = setup(); expect(root.style.height).toBe('700px');
  viewport.height = 380; viewport.offsetTop = 60; act(() => viewport.dispatchEvent(new Event('resize'))); frame();
  expect(root.style.height).toBe('380px'); expect(root.style.top).toBe('60px');
  viewport.height = 800; viewport.offsetTop = 0; fireEvent(window, new Event('pageshow')); frame();
  expect(root.style.height).toBe('800px'); expect(root.style.top).toBe('0px');
  viewport.scale = 2; viewport.height = 400; act(() => viewport.dispatchEvent(new Event('resize'))); frame(); expect(root.style.height).toBe('800px');
 });
 it('allows internal scrolling but blocks a pane handing its exhausted edge to the document', () => {
  const { root } = setup(); const scroller = document.createElement('div'), child = document.createElement('p'); scroller.style.overflowY = 'auto';
  Object.defineProperties(scroller, { clientHeight: { value: 200 }, scrollHeight: { value: 600 } }); scroller.append(child); root.append(scroller);
  touch(child, 'touchstart', [point(100, 100)]); expect(touch(child, 'touchmove', [point(100, 130)]).defaultPrevented).toBe(true);
  scroller.scrollTop = 100; touch(child, 'touchstart', [point(100, 100)]); expect(touch(child, 'touchmove', [point(100, 130)]).defaultPrevented).toBe(false);
  scroller.scrollTop = 400; touch(child, 'touchstart', [point(100, 100)]); expect(touch(child, 'touchmove', [point(100, 70)]).defaultPrevented).toBe(true);
  touch(child, 'touchstart', [point(100, 100), point(150, 100)]); expect(touch(child, 'touchmove', [point(80, 100), point(170, 100)]).defaultPrevented).toBe(false);
 });
 it('removes global gesture and viewport work on unmount', () => {
  const { root, hook, frame } = setup(); hook.unmount(); viewport.height = 300; fireEvent(window, new Event('pageshow')); frame(); expect(root.style.height).toBe('700px');
  touch(root, 'touchstart', [point(100, 100)]); expect(touch(root, 'touchmove', [point(100, 130)]).defaultPrevented).toBe(false);
 });
});
