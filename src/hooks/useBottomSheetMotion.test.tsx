import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBottomSheetMotion } from './useBottomSheetMotion';
const motion = vi.hoisted(() => ({ reduce: false, controls: { start: vi.fn(async () => {}), stop: vi.fn(), set: vi.fn() } }));
vi.mock('./useReducedMotionPreference', () => ({ useReducedMotionPreference: () => motion.reduce }));
vi.mock('motion/react', () => ({ useAnimationControls: () => motion.controls, useReducedMotion: () => motion.reduce }));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); motion.reduce = false; });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
const point = (clientY: number) => ({ identifier: 1, clientX: 100, clientY });
function setup() {
 const sheet = document.createElement('div'), handle = document.createElement('div'), scroll = document.createElement('div'), content = document.createElement('p'); handle.dataset.sheetDragHandle = ''; scroll.dataset.previewMetadataScroll = ''; scroll.append(content); sheet.append(handle, scroll); document.body.append(sheet); sheet.getBoundingClientRect = () => ({ height: 600 }) as DOMRect;
 const onClose = vi.fn(), hook = renderHook(() => useBottomSheetMotion({ current: sheet }, true, onClose));
 const touch = (target: Element, type: string, y: number, ended = false) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'touches', { value: ended ? [] : [point(y)] }); fireEvent(target, e); return e; };
 return { sheet, handle, scroll, content, onClose, hook, touch, frame: (ms = 20) => act(() => vi.advanceTimersByTime(ms)) };
}
describe('bottom sheet direct manipulation', () => {
 it('enters and leaves through the bottom with the shared drawer curve', async () => {
  const { hook, onClose } = setup(); expect(motion.controls.start).toHaveBeenCalledWith({ transform: 'translate3d(0, 0px, 0)', opacity: 1 }, expect.objectContaining({ duration: 0.24 }));
  await act(async () => hook.result.current.dismiss()); expect(onClose).toHaveBeenCalledOnce();
  expect(motion.controls.start).toHaveBeenLastCalledWith({ transform: 'translate3d(0, 600px, 0)' }, expect.objectContaining({ duration: 0.2 }));
 });
 it('starts when a lazily rendered sheet attaches after the open state', () => {
  const ref = { current: null as HTMLElement | null }, onClose = vi.fn();
  const hook = renderHook(() => useBottomSheetMotion(ref, true, onClose));
  expect(motion.controls.start).not.toHaveBeenCalled();
  const sheet = document.createElement('div'); sheet.getBoundingClientRect = () => ({ height: 600 }) as DOMRect;
  act(() => hook.result.current.attach(sheet));
  expect(hook.result.current.mounted).toBe(true);
  expect(motion.controls.start).toHaveBeenCalledWith({ transform: 'translate3d(0, 0px, 0)', opacity: 1 }, expect.objectContaining({ duration: 0.24 }));
 });
 it('dismisses a deliberate downward handle drag', async () => {
  const { handle, touch, frame, onClose } = setup(); touch(handle, 'touchstart', 100); frame(100); expect(touch(handle, 'touchmove', 260).defaultPrevented).toBe(true); frame();
  await act(async () => touch(handle, 'touchend', 260, true)); expect(onClose).toHaveBeenCalledOnce();
 });
 it('springs a short slow pull back and keeps content scrolls native', async () => {
  const { scroll, content, touch, frame, onClose } = setup(); scroll.scrollTop = 50; touch(content, 'touchstart', 100); expect(touch(content, 'touchmove', 200).defaultPrevented).toBe(false);
  touch(content, 'touchend', 200, true); scroll.scrollTop = 0; touch(content, 'touchstart', 100); frame(300); touch(content, 'touchmove', 120); frame(200); touch(content, 'touchend', 120, true);
  expect(onClose).not.toHaveBeenCalled(); expect(motion.controls.start).toHaveBeenLastCalledWith({ transform: 'translate3d(0, 0px, 0)' }, { type: 'spring', duration: 0.5, bounce: 0.2 });
 });
 it('does not drag text fields and reduces automatic movement when requested', async () => {
  motion.reduce = true; const { sheet, touch, hook, onClose } = setup(); const input = document.createElement('input'); sheet.append(input); touch(input, 'touchstart', 100); expect(touch(input, 'touchmove', 300).defaultPrevented).toBe(false);
  await act(async () => hook.result.current.dismiss()); expect(motion.controls.start).toHaveBeenLastCalledWith({ opacity: 0 }, expect.objectContaining({ duration: 0.16 })); expect(onClose).toHaveBeenCalledOnce();
 });
});
