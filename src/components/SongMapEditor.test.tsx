import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SongMapEditor from './SongMapEditor';
import type { SongMapStep } from '../types';

const initial: SongMapStep[] = [{ label: 'Intro', repeats: 1 }, { label: 'Chorus 1', repeats: 2 }, { label: 'Ending', repeats: 1 }];
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null, writable: true });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 7; this.pointerType = init.pointerType ?? 'mouse'; }
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function setup(steps = initial) {
  const onSave = vi.fn(), close = vi.fn();
  render(<SongMapEditor steps={steps} title="Song" language="zh" close={close} options={{ scope: 'setlist', setlistName: '聚會一',
    fallback: [{ label: 'Verse', repeats: 1 }], sections: [...initial, { label: 'Pc2', repeats: 1 }], onSave }} />);
  return { onSave, close };
}
const button = (name: string) => screen.getByRole('button', { name });
const sequence = () => within(screen.getByRole('list', { name: '目前曲序' })).getAllByRole('button');

it('builds a map from chart choices without typing, including a section omitted from the default', () => {
  const { onSave } = setup();
  fireEvent.click(button('清空重排'));
  fireEvent.click(button('加入 Intro'));
  fireEvent.click(button('加入 Pre Chorus 2'));
  fireEvent.click(button('加入 Chorus 1'));
  fireEvent.click(button('增加遍數'));
  fireEvent.click(button('複製選取段落'));
  fireEvent.click(button('向前移動'));
  fireEvent.click(button('刪除選取段落'));
  fireEvent.click(button('儲存曲序'));
  expect(onSave).toHaveBeenCalledWith([{ label: 'Intro', repeats: 1 }, { label: 'Pre Chorus 2', repeats: 1 }, { label: 'Chorus 1', repeats: 2 }]);
});
it('inserts before a selected occurrence, then keeps subsequent inserts in performance order', () => {
  const { onSave } = setup();
  fireEvent.click(sequence()[1]);
  fireEvent.change(screen.getByLabelText('新增段落位置'), { target: { value: 'before' } });
  fireEvent.click(button('加入 Verse'));
  fireEvent.click(button('加入 Pre Chorus 2'));
  fireEvent.click(button('儲存曲序'));
  expect(onSave.mock.calls[0][0].map((s: SongMapStep) => s.label)).toEqual(['Intro','Verse','Pre Chorus 2','Chorus 1','Ending']);
});
it('preserves inheritance on reset and undo, while cancellation saves nothing', () => {
  const { onSave, close } = setup();
  fireEvent.click(button('沿用預設曲序'));
  fireEvent.click(button('增加遍數'));
  fireEvent.click(button('復原曲序變更'));
  fireEvent.click(button('儲存曲序'));
  expect(onSave).toHaveBeenCalledWith(undefined);
  expect(close).toHaveBeenCalledTimes(1);
});
it('undoes a clear and allows custom names while rejecting empty names or invalid repeats', () => {
  const { onSave } = setup();
  fireEvent.click(button('清空重排'));
  expect(button('儲存曲序')).toBeDisabled();
  fireEvent.click(button('復原曲序變更'));
  expect(sequence()).toHaveLength(3);
  fireEvent.click(button('修改選取段落名稱'));
  fireEvent.change(screen.getByLabelText('選取段落名稱'), { target: { value: '' } });
  expect(button('儲存曲序')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('選取段落名稱'), { target: { value: 'Solo cue' } });
  fireEvent.change(screen.getByLabelText('總遍數'), { target: { value: '1.5' } });
  expect(button('儲存曲序')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('總遍數'), { target: { value: '4' } });
  fireEvent.click(button('儲存曲序'));
  expect(onSave.mock.calls[0][0][0]).toEqual({ label: 'Solo cue', repeats: 4 });
});
it('reorders duplicate sections by identity using pointers, and abandons a cancelled drag', () => {
  const { onSave } = setup([{label:'Chorus',repeats:1},{label:'Verse',repeats:1},{label:'Chorus',repeats:4}]);
  const source = sequence()[2], target = sequence()[0];
  const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
  target.getBoundingClientRect = () => ({ left:80, width:40 } as DOMRect);
  fireEvent.pointerDown(source, { pointerId:7, button:0, clientX:10, clientY:10 });
  fireEvent.pointerMove(source, { pointerId:7, clientX:90, clientY:60 });
  fireEvent.pointerCancel(source, { pointerId:7 });
  expect(sequence()[2]).toHaveAttribute('aria-label', '第 3 段 Chorus，共 4 遍');
  fireEvent.pointerDown(source, { pointerId:7, button:0, clientX:10, clientY:10 });
  fireEvent.pointerMove(source, { pointerId:7, clientX:90, clientY:60 });
  fireEvent.pointerUp(source, { pointerId:7 });
  fireEvent.click(button('儲存曲序'));
  expect(onSave.mock.calls[0][0].map((s: SongMapStep)=>s.repeats)).toEqual([4,1,1]);
  hit.mockRestore();
});
it('lets a touch swipe scroll and requires a stationary hold before touch reordering', () => {
  vi.useFakeTimers();
  const { onSave } = setup();
  const source = sequence()[2], target = sequence()[0];
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
  target.getBoundingClientRect = () => ({ left:80, width:40 } as DOMRect);
  const finger = (x: number, y: number) => ({ identifier:9, clientX:x, clientY:y });
  fireEvent.touchStart(source, { touches:[finger(90,300)] });
  fireEvent.touchMove(source, { touches:[finger(90,200)] });
  act(() => vi.advanceTimersByTime(400));
  expect(source).not.toHaveAttribute('data-dragging');
  fireEvent.touchEnd(source, { touches:[] });
  expect(sequence()[2]).toHaveAttribute('aria-label', '第 3 段 Ending，共 1 遍');
  fireEvent.touchStart(source, { touches:[finger(90,300)] });
  act(() => vi.advanceTimersByTime(350));
  expect(source).toHaveAttribute('data-dragging', 'true');
  fireEvent.touchMove(source, { touches:[finger(90,60)] });
  fireEvent.touchEnd(source, { touches:[] });
  fireEvent.click(button('儲存曲序'));
  expect(onSave.mock.calls[0][0].map((s: SongMapStep)=>s.label)).toEqual(['Ending','Intro','Chorus 1']);
});
it('offers keyboard reordering and leaves edits local until Save', () => {
  const { onSave, close } = setup();
  fireEvent.keyDown(sequence()[2], { key:'ArrowLeft', altKey:true });
  expect(sequence()[1]).toHaveAttribute('aria-label', '第 2 段 Ending，共 1 遍');
  fireEvent.click(button('取消'));
  expect(close).toHaveBeenCalled(); expect(onSave).not.toHaveBeenCalled();
});
it('continues edge scrolling while the pointer is stationary and stops on cancellation', () => {
  vi.useFakeTimers(); setup();
  const body = document.querySelector<HTMLElement>('.map-editor-body')!;
  Object.defineProperties(body, { scrollHeight: { value: 1200 }, clientHeight: { value: 400 } });
  body.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 400 }) as DOMRect;
  const source = sequence()[0];
  fireEvent.pointerDown(source, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: 80, clientY: 50 });
  fireEvent.pointerMove(source, { pointerId: 7, pointerType: 'mouse', clientX: 80, clientY: 390 });
  act(() => vi.advanceTimersByTime(160)); const first = body.scrollTop;
  act(() => vi.advanceTimersByTime(160)); expect(body.scrollTop).toBeGreaterThan(first);
  fireEvent.pointerCancel(source, { pointerId: 7, pointerType: 'mouse' }); const stopped = body.scrollTop;
  act(() => vi.advanceTimersByTime(500)); expect(body.scrollTop).toBe(stopped);
});

it('scrolls the same distance at 60 and 120 Hz and caps a long frame', () => {
  setup();
  const body = document.querySelector<HTMLElement>('.map-editor-body')!;
  Object.defineProperties(body, { scrollHeight: { value: 2000 }, clientHeight: { value: 400 } });
  body.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 400 }) as DOMRect;
  let scroll = 0;
  Object.defineProperty(body, 'scrollTop', { configurable: true, get: () => scroll, set: value => { scroll = Math.floor(value); } });
  let callback: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { callback = fn; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => { callback = undefined; });
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const source = sequence()[0]; const distances: number[] = [];
  for (const hz of [60, 120]) {
    body.scrollTop = 0;
    fireEvent.pointerDown(source, { pointerId: 7, button: 0, clientX: 80, clientY: 50 });
    fireEvent.pointerMove(source, { pointerId: 7, clientX: 80, clientY: 399 });
    for (let frame = 1; frame <= hz / 2; frame++) act(() => callback?.(frame * 1000 / hz));
    distances.push(body.scrollTop);
    act(() => callback?.(5000));
    expect(body.scrollTop - distances.at(-1)!).toBeLessThanOrEqual(600 * .032 + .001);
    fireEvent.pointerCancel(source, { pointerId: 7 });
    expect(callback).toBeUndefined();
  }
  expect(distances[0]).toBe(Math.floor(600 * (31 / 32) ** 2 * .5));
  expect(distances[1]).toBeCloseTo(distances[0]);
  now.mockRestore();
});

it('shows a non-interactive drag preview only after activation and removes it on keyboard cancellation', () => {
  vi.useFakeTimers(); setup();
  const source = sequence()[0];
  const finger = { identifier: 9, clientX: 90, clientY: 100 };
  fireEvent.touchStart(source, { touches: [finger] });
  expect(document.querySelector('.map-drag-preview')).toBeNull();
  act(() => vi.advanceTimersByTime(350));
  const preview = document.querySelector('.map-drag-preview');
  expect(preview).toHaveAttribute('aria-hidden', 'true');
  expect(preview).toHaveAttribute('inert');
  expect(preview).not.toHaveAttribute('data-map-step-id');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.querySelector('.map-drag-preview')).toBeNull();
  expect(source).not.toHaveAttribute('data-dragging');
  expect(sequence()[0]).toBe(source);
});
