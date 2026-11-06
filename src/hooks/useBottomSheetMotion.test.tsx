import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBottomSheetMotion } from './useBottomSheetMotion';
const motion = vi.hoisted(() => ({ reduce: false, keyboard: false, controls: { start: vi.fn(async () => {}), stop: vi.fn(), set: vi.fn() } }));
vi.mock('./useReducedMotionPreference', () => ({ useReducedMotionPreference: () => motion.reduce }));
vi.mock('./useUiMotion', () => ({ isKeyboardInteraction: () => motion.keyboard }));
vi.mock('motion/react', () => ({ useAnimationControls: () => motion.controls, useReducedMotion: () => motion.reduce }));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); motion.controls.start.mockResolvedValue(undefined); motion.reduce = false; motion.keyboard = false; });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
const point = (clientY: number) => ({ identifier: 1, clientX: 100, clientY });
function setup() {
 const sheet = document.createElement('div'), handle = document.createElement('div'), scroll = document.createElement('div'), content = document.createElement('p'); handle.dataset.sheetDragHandle = ''; scroll.dataset.previewMetadataScroll = ''; scroll.append(content); sheet.append(handle, scroll); document.body.append(sheet); sheet.getBoundingClientRect = () => ({ height: 600 }) as DOMRect;
 const ref = { current: sheet }, onClose = vi.fn();
 const hook = renderHook(({ enabled }) => useBottomSheetMotion(ref, enabled, onClose), { initialProps: { enabled: true } });
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
 it('makes a departing sheet inert immediately and rejects interaction during its visual exit', async () => {
  const { sheet, hook, onClose } = setup();
  let complete!: () => void;
  motion.controls.start.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
  const button = document.createElement('button'), edit = vi.fn(); button.addEventListener('click', edit); sheet.append(button);
  act(() => hook.result.current.dismiss());
  expect(sheet).toHaveAttribute('inert'); expect(sheet).toHaveAttribute('aria-hidden', 'true');
  expect(sheet.style.pointerEvents).toBe('none'); expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(button); expect(edit).not.toHaveBeenCalled();
  act(() => hook.result.current.dismiss());
  await act(async () => complete()); expect(onClose).toHaveBeenCalledOnce();
 });
 it('retargets live reduced motion without replaying entry when motion is re-enabled', () => {
  const { hook } = setup(); motion.controls.set.mockClear(); motion.controls.start.mockClear();
  motion.reduce = true; hook.rerender({ enabled: true });
  expect(motion.controls.set).toHaveBeenCalledExactlyOnceWith({ transform: 'translate3d(0, 0px, 0)' });
  expect(motion.controls.start).toHaveBeenCalledExactlyOnceWith({ opacity: 1 }, expect.objectContaining({ duration: 0.16 }));
  motion.reduce = false; hook.rerender({ enabled: true });
  expect(motion.controls.set).toHaveBeenCalledTimes(1); expect(motion.controls.start).toHaveBeenCalledTimes(1);
 });
 it('keeps a committed dismissal when reduced motion changes and ignores its old completion', async () => {
  const { sheet, hook, onClose } = setup(), complete: Array<() => void> = [];
  motion.controls.start.mockImplementation(() => new Promise<void>(resolve => complete.push(resolve)));
  act(() => hook.result.current.dismiss());
  motion.reduce = true; hook.rerender({ enabled: true });
  expect(sheet).toHaveAttribute('inert'); expect(sheet).toHaveAttribute('aria-hidden', 'true');
  expect(motion.controls.start).toHaveBeenLastCalledWith({ opacity: 0 }, expect.objectContaining({ duration: 0.16 }));
  await act(async () => complete[0]()); expect(onClose).not.toHaveBeenCalled();
  await act(async () => complete[1]()); expect(onClose).toHaveBeenCalledOnce();
 });
 it('cleans up closing attributes and ignores stale completion after the same sheet reopens', async () => {
  const { sheet, hook, onClose } = setup(), complete: Array<() => void> = [];
  motion.controls.start.mockImplementation(() => new Promise<void>(resolve => complete.push(resolve)));
  act(() => hook.result.current.dismiss());
  hook.rerender({ enabled: false });
  expect(sheet).not.toHaveAttribute('inert'); expect(sheet).not.toHaveAttribute('aria-hidden'); expect(sheet.style.pointerEvents).toBe('');
  hook.rerender({ enabled: true });
  await act(async () => complete[0]()); expect(onClose).not.toHaveBeenCalled();
  act(() => hook.result.current.dismiss());
  await act(async () => complete[2]()); expect(onClose).toHaveBeenCalledOnce();
 });
 it('does not replay motion or wait for an exit on a keyboard dismissal', () => {
  motion.keyboard = true; const { hook, onClose } = setup();
  expect(motion.controls.start).toHaveBeenCalledWith({ transform: 'translate3d(0, 0px, 0)', opacity: 1 }, expect.objectContaining({ duration: 0 }));
  motion.controls.start.mockClear(); act(() => hook.result.current.dismiss());
  expect(onClose).toHaveBeenCalledOnce(); expect(motion.controls.start).not.toHaveBeenCalled();
 });
});
