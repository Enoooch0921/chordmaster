import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { useSetlistSongDrag } from './useSetlistSongDrag';

const pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: 40, clientY: 180 };
const hit = vi.fn();
const options = () => ({ enabled: true, scopeKey: 'team/meeting', onMove: vi.fn(), onDraggingChange: vi.fn(), onTargetChange: vi.fn() });
type Options = ReturnType<typeof options>;
function Harness({ config, select = () => {} }: { config: Options; select?: () => void }) {
  const { onPointerDown } = useSetlistSongDrag(config);
  return <>
    <div data-setlist-detail-scroll data-testid="pane">
      <div data-setlist-song-id="a"><button onPointerDown={event => onPointerDown(event, 'a')}>Drag A</button></div>
      <div data-setlist-song-id="b"><button onClick={select}>Select B</button></div>
      <div data-setlist-song-id="c">Song C</div>
    </div>
    <div data-setlist-song-id="outside">Another pane</div>
  </>;
}
const card = (id: string) => document.querySelector<HTMLElement>(`[data-setlist-song-id="${id}"]`)!;

beforeAll(() => {
  if (!window.PointerEvent) vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? 'mouse'; this.isPrimary = init.isPrimary ?? true;
    }
  });
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit });
});
beforeEach(() => {
  vi.useFakeTimers(); hit.mockReset();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => window.setTimeout(() => callback(Date.now()), 16));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => window.clearTimeout(id));
});
afterEach(() => {
  cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  document.body.style.userSelect = ''; document.body.style.removeProperty('-webkit-user-select');
});

it('captures the stable pane and continues through lost or unsupported capture using the latest callback', () => {
  const config = options(); const view = render(<Harness config={config}/>);
  const pane = screen.getByTestId('pane');
  const capture = vi.fn(() => { throw new Error('Unsupported capture'); });
  Object.defineProperty(pane, 'setPointerCapture', { configurable: true, value: capture });
  const handle = screen.getByRole('button', { name: 'Drag A' });
  fireEvent.pointerDown(handle, pointer);
  expect(capture).toHaveBeenCalledWith(1);
  expect(document.body.style.userSelect).toBe('none');
  fireEvent.lostPointerCapture(handle, pointer);
  hit.mockReturnValue(card('b'));
  fireEvent.pointerMove(document, pointer);
  expect(config.onMove).toHaveBeenLastCalledWith('a', 'b');
  const latest = options(); view.rerender(<Harness config={latest}/>);
  hit.mockReturnValue(card('c')); fireEvent.pointerMove(document, pointer);
  expect(latest.onMove).toHaveBeenLastCalledWith('a', 'c');
  expect(config.onMove).toHaveBeenCalledTimes(1);
  fireEvent.pointerUp(window, { ...pointer, buttons: 0 });
  expect(latest.onDraggingChange).toHaveBeenLastCalledWith(null);
  expect(document.body.style.userSelect).toBe('');
});

it('waits for a touch hold and ignores other pointers until their down cancels the gesture', () => {
  const config = options(); render(<Harness config={config}/>);
  const touch = { ...pointer, pointerType: 'touch' };
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag A' }), touch);
  hit.mockReturnValue(card('b')); fireEvent.pointerMove(document, touch);
  act(() => vi.advanceTimersByTime(179)); expect(config.onMove).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(config.onDraggingChange).toHaveBeenLastCalledWith('a');
  fireEvent.lostPointerCapture(screen.getByRole('button', { name: 'Drag A' }), touch);
  fireEvent.pointerMove(document, { ...touch, pointerId: 2 });
  fireEvent.pointerUp(document, { ...touch, pointerId: 2 });
  expect(config.onMove).not.toHaveBeenCalled();
  fireEvent.pointerMove(document, touch); expect(config.onMove).toHaveBeenCalledWith('a', 'b');
  fireEvent.pointerDown(document, { ...touch, pointerId: 2, isPrimary: false });
  expect(config.onDraggingChange).toHaveBeenLastCalledWith(null);
  expect(document.body.style.userSelect).toBe('');
});

it.each(['scope', 'permission', 'unmount'])('ends an active drag on %s changes without moving the new context', reason => {
  const config = options(); const view = render(<Harness config={config}/>);
  document.body.style.userSelect = 'text';
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag A' }), pointer);
  if (reason === 'unmount') view.unmount();
  else view.rerender(<Harness config={{ ...config, ...(reason === 'scope' ? { scopeKey: 'other/meeting' } : { enabled: false }) }}/>);
  hit.mockReturnValue(card('b')); fireEvent.pointerMove(window, pointer);
  expect(config.onMove).not.toHaveBeenCalled();
  expect(document.body.style.userSelect).toBe('text');
  expect(config.onDraggingChange).toHaveBeenLastCalledWith(null);
});

it('cancels a pending hold on pointer cancellation and an active drag on Escape or window blur', () => {
  const config = options(); render(<Harness config={config}/>);
  const handle = screen.getByRole('button', { name: 'Drag A' });
  fireEvent.pointerDown(handle, { ...pointer, pointerType: 'touch' });
  fireEvent.pointerCancel(window, pointer);
  act(() => vi.advanceTimersByTime(200));
  expect(config.onDraggingChange).not.toHaveBeenCalledWith('a');
  for (const end of [() => fireEvent.keyDown(window, { key: 'Escape' }), () => fireEvent.blur(window)]) {
    fireEvent.pointerDown(handle, pointer); end();
    expect(config.onDraggingChange).toHaveBeenLastCalledWith(null);
    expect(document.body.style.userSelect).toBe('');
  }
});

it('auto-scrolls at the bottom edge with a stationary pointer and stops immediately on release', () => {
  const config = options(); render(<Harness config={config}/>);
  const pane = screen.getByTestId('pane');
  Object.defineProperties(pane, { clientHeight: { value: 200 }, scrollHeight: { value: 800 } });
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 300, left: 0, right: 240, height: 200, width: 240, x: 0, y: 100, toJSON() {} });
  hit.mockReturnValueOnce(card('b')).mockReturnValue(card('c'));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag A' }), { ...pointer, clientY: 295 });
  act(() => vi.advanceTimersByTime(48));
  expect(pane.scrollTop).toBeGreaterThan(0);
  expect(config.onMove).toHaveBeenCalledWith('a', 'b');
  expect(config.onMove).toHaveBeenCalledWith('a', 'c');
  fireEvent.pointerUp(window, { ...pointer, buttons: 0 });
  const stopped = pane.scrollTop;
  act(() => vi.advanceTimersByTime(100));
  expect(pane.scrollTop).toBe(stopped);
  expect(document.body.style.userSelect).toBe('');
});

it('restricts hits to its own pane and suppresses the release click without swallowing the next intentional click', () => {
  const config = options(), select = vi.fn(); render(<Harness config={config} select={select}/>);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag A' }), pointer);
  hit.mockReturnValue(card('outside')); fireEvent.pointerMove(document, pointer);
  expect(config.onMove).not.toHaveBeenCalled();
  fireEvent.pointerUp(window, { ...pointer, buttons: 0 });
  const title = screen.getByRole('button', { name: 'Select B' });
  fireEvent.click(title, { detail: 1 }); expect(select).not.toHaveBeenCalled();
  fireEvent.pointerDown(title, pointer); fireEvent.click(title, { detail: 1 });
  expect(select).toHaveBeenCalledOnce();
});
