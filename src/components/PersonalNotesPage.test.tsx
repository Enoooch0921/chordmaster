import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PersonalNotesPage from './PersonalNotesPage';
import { notePath, projectNotePoints, type NoteTool } from '../lib/personalNotes';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'pen'; }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup(zoom = 1, shapeEnabled = true, tool: NoteTool = 'pen', barAnchor = false) {
  const page = document.createElement('div');
  Object.defineProperties(page, { offsetWidth: { value: 800 }, offsetHeight: { value: 1000 } });
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800 * zoom, bottom: 1000 * zoom, width: 800 * zoom, height: 1000 * zoom, toJSON() {} });
  if (barAnchor) {
    const bar = document.createElement('div');
    bar.dataset.previewClipboardSection = 'verse'; bar.dataset.previewClipboardBar = 'bar-one';
    bar.getBoundingClientRect = () => ({ x: 100, y: 200, left: 100, top: 200, right: 300, bottom: 260, width: 200, height: 60, toJSON() {} });
    page.append(bar);
  }
  const onEdit = vi.fn(), onShape = vi.fn(), navigate = vi.fn();
  const view = render(<div onTouchStart={navigate}><PersonalNotesPage page={page} pageIndex={0} strokes={[]} drawing visible
    performance tool={tool} color="#2563eb" width={2.5} shapeEnabled={shapeEnabled} onShape={onShape} onEdit={onEdit} /></div>);
  const layer = view.getByLabelText('Personal handwritten notes');
  Object.defineProperty(layer, 'setPointerCapture', { value: vi.fn() });
  const point = (x: number, y: number) => ({ pointerId: 1, pointerType: 'pen', clientX: x, clientY: y, button: 0 });
  return { view, page, layer, onEdit, onShape, navigate, point };
}
it.each(['pen', 'highlighter'] as const)('paints %s samples immediately without waiting for a frame or changing geometry on lift', tool => {
  const { layer, onEdit, point } = setup(1, false, tool);
  const live = layer.parentElement!.querySelector(`[data-personal-note-live="${tool}"]`)!;
  fireEvent.pointerDown(layer, point(50, 50));
  expect(live.getAttribute('d')).toBe('M50.00 50.00 l0.01 0');
  fireEvent.pointerMove(layer, point(70, 54));
  fireEvent.pointerMove(layer, point(90, 65));
  expect(live.getAttribute('d')).toMatch(/L90\.00 65\.00$/);
  const beforeLift = live.getAttribute('d');
  fireEvent.pointerUp(layer, point(90, 65));
  const saved = onEdit.mock.calls[0][0].add[0];
  expect(notePath(projectNotePoints(saved, { x: 0, y: 0, width: 800, height: 1000 }))).toBe(beforeLift);
  expect(live.hasAttribute('d')).toBe(false);
  expect(saved.tool).toBe(tool);
});
it.each([.68, 1.35])('saves the stabilized live tip at sheet scale %f, including the last native sample', zoom => {
  const { layer, onEdit, point } = setup(zoom, false);
  const live = layer.querySelector('[data-personal-note-live="pen"]')!;
  const penEvent = (type: string, x: number, y: number, time: number) => {
    const e = new PointerEvent(type, { ...point(x, y), bubbles: true });
    Object.defineProperty(e, 'timeStamp', { value: time });
    return e;
  };
  fireEvent(layer, penEvent('pointerdown', 50, 50, 100));
  for (let i = 1; i <= 60; i++) {
    const x = 50 + i / 4, y = 50 + Math.sin(i * .43);
    const e = penEvent('pointermove', x, y, 100 + i * 8);
    Object.defineProperty(e, 'getCoalescedEvents', { value: () => [
      penEvent('pointermove', x - .125, 50 + Math.sin((i - .5) * .43), 96 + i * 8),
    ] });
    fireEvent(layer, e);
    const coords = live.getAttribute('d')!.match(/L([\d.]+) ([\d.]+)$/);
    if (i > 5) {
      expect(coords).not.toBeNull();
      expect(Math.abs(Number(coords![2]) * zoom - 50)).toBeLessThan(.8);
    }
  }
  const beforeLift = live.getAttribute('d');
  const endY = 50 + Math.sin(60 * .43);
  fireEvent(layer, penEvent('pointerup', 65, endY, 590));
  const saved = onEdit.mock.calls[0][0].add[0];
  expect(notePath(projectNotePoints(saved, { x: 0, y: 0, width: 800, height: 1000 }))).toBe(beforeLift);
  fireEvent(layer, penEvent('pointerdown', 30, 40, 700));
  const final = penEvent('pointerup', 60, 45, 714);
  Object.defineProperty(final, 'getCoalescedEvents', { value: () => [penEvent('pointermove', 49, 44, 708)] });
  fireEvent(layer, final);
  const points = projectNotePoints(onEdit.mock.calls[1][0].add[0], { x: 0, y: 0, width: 800, height: 1000 });
  expect(points.at(-1)![0] * zoom).toBeCloseTo(60, 8);
});
it('includes every coalesced sample in immediate ink and can resume freehand after snapping', () => {
  const { layer, onEdit, point } = setup();
  fireEvent.pointerDown(layer, point(50, 50));
  const event = new PointerEvent('pointermove', { ...point(150, 50), bubbles: true });
  Object.defineProperty(event, 'getCoalescedEvents', { value: () => [point(80, 50), point(100, 50), point(150, 50)] });
  fireEvent(layer, event);
  expect(layer.querySelector('[data-personal-note-live]')?.getAttribute('d')).toContain('L150.00 50.00');
  act(() => vi.advanceTimersByTime(800));
  fireEvent.pointerMove(layer, point(180, 75));
  expect(layer.querySelector('[data-personal-note-live]')?.getAttribute('d')).toContain('L180.00 75.00');
  fireEvent.pointerUp(layer, point(180, 75));
  expect(onEdit.mock.calls[0][0].add[0].shape).toBeUndefined();
  expect(onEdit.mock.calls[0][0].add[0].points).toHaveLength(5);
});
it('holds through Pencil jitter, preserves the tidied line on lift, and blocks a palm from flipping the page', () => {
  const { layer, onEdit, onShape, navigate, point } = setup();
  fireEvent.pointerDown(layer, point(50, 50));
  for (let x = 55; x <= 150; x += 5) fireEvent.pointerMove(layer, point(x, 50 + Math.sin(x) * .5));
  // Real Pencil endpoint noise supplies many samples during the hold.
  for (let i = 0; i < 30; i++) {
    act(() => vi.advanceTimersByTime(10));
    fireEvent.pointerMove(layer, point(150 + Math.sin(i) * 8, 50 + Math.cos(i) * 8));
  }
  expect(layer.querySelector('circle')).toBeNull();
  expect(onShape).not.toHaveBeenCalledWith('holding');
  fireEvent.touchStart(layer, { touches: [{ clientX: 200, clientY: 200 }] });
  expect(navigate).not.toHaveBeenCalled();
  expect(onEdit).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(500));
  expect(onShape).toHaveBeenLastCalledWith('line');
  fireEvent.pointerUp(layer, point(150.5, 50.5));
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(onEdit.mock.calls[0][0].add[0]).toMatchObject({ shape: 'line' });
  expect(onEdit.mock.calls[0][0].add[0].points).toHaveLength(2);
});
it('recognizes the same visible small circle on a zoomed-in paper', () => {
  const { layer, onEdit, onShape, point } = setup(3);
  const circle = Array.from({ length: 41 }, (_, i) => point(100 + 20 * Math.cos(i * Math.PI / 20), 100 + 20 * Math.sin(i * Math.PI / 20)));
  fireEvent.pointerDown(layer, circle[0]);
  circle.slice(1).forEach(p => fireEvent.pointerMove(layer, p));
  act(() => vi.advanceTimersByTime(750));
  expect(onShape).toHaveBeenLastCalledWith('ellipse');
  fireEvent.pointerUp(layer, circle.at(-1)!);
  expect(onEdit.mock.calls[0][0].add[0].shape).toBe('ellipse');
});
it('reports an unrecognized hold and keeps the original mark', () => {
  const { layer, onEdit, onShape, point } = setup();
  fireEvent.pointerDown(layer, point(50, 50));
  for (const [x, y] of [[60, 110], [100, 50], [60, 70], [130, 150]]) fireEvent.pointerMove(layer, point(x, y));
  act(() => vi.advanceTimersByTime(750));
  expect(onShape).toHaveBeenLastCalledWith('unrecognized');
  fireEvent.pointerUp(layer, point(130, 150));
  expect(onEdit.mock.calls[0][0].add[0].shape).toBeUndefined();
});
it('never snaps or shows a progress cue when hold-to-shape is disabled', () => {
  const { layer, onShape, point } = setup(1, false);
  fireEvent.pointerDown(layer, point(50, 50)); fireEvent.pointerMove(layer, point(150, 50));
  act(() => vi.advanceTimersByTime(1000));
  expect(onShape).toHaveBeenLastCalledWith(null);
  expect(layer.querySelector('.personal-notes-hold-cue')).toBeNull();
});
it('cancels the pending hold when drawing continues or the pen is lifted', () => {
  const { layer, onShape, onEdit, point } = setup();
  fireEvent.pointerDown(layer, point(50, 50));
  for (let x = 80; x <= 230; x += 30) {
    fireEvent.pointerMove(layer, point(x, 50));
    act(() => vi.advanceTimersByTime(200));
    expect(onShape).not.toHaveBeenCalledWith('holding');
  }
  fireEvent.pointerUp(layer, point(230, 50));
  act(() => vi.advanceTimersByTime(500));
  expect(onShape).toHaveBeenLastCalledWith(null);
  expect(onEdit.mock.calls[0][0].add[0].shape).toBeUndefined();
});
it('does not start recognition during slow continuous drawing inside the old hold radius', () => {
  const { layer, onShape, point } = setup();
  fireEvent.pointerDown(layer, point(50, 50));
  for (let i = 1; i <= 100; i++) {
    act(() => vi.advanceTimersByTime(20));
    fireEvent.pointerMove(layer, point(50 + i * .4, 50 + Math.sin(i) * .2));
  }
  expect(onShape).not.toHaveBeenCalledWith('holding');
  expect(onShape).not.toHaveBeenCalledWith('line');
  expect(layer.querySelector('circle')).toBeNull();
  act(() => vi.advanceTimersByTime(750));
  expect(onShape).toHaveBeenLastCalledWith('line');
});
it('keeps a small handwritten loop freehand while the pen is moving through noisy samples', () => {
  const { layer, onEdit, onShape, point } = setup();
  const sample = (i: number) => point(80 + 6 * Math.cos(i / 19) + .8 * Math.sin(i * 1.4),
    80 + 8 * Math.sin(i / 19) + .7 * Math.cos(i * 1.6));
  fireEvent.pointerDown(layer, sample(0));
  for (let i = 1; i <= 145; i++) {
    act(() => vi.advanceTimersByTime(8));
    fireEvent.pointerMove(layer, sample(i));
  }
  fireEvent.pointerUp(layer, sample(145));
  expect(onShape).not.toHaveBeenCalledWith('holding');
  expect(onEdit.mock.calls[0][0].add[0].shape).toBeUndefined();
});

it('keeps the final edges of a small hexagon drawn at a natural pace', () => {
  const { layer, onShape, point } = setup();
  const vertices = [[25,5],[75,6],[99,49],[75,93],[25,94],[2,50],[25,5]];
  fireEvent.pointerDown(layer, point(200+vertices[0][0]*.48,200+vertices[0][1]*.48));
  for(let i=1;i<vertices.length;i++) for(let n=1;n<=12;n++) {
    act(() => vi.advanceTimersByTime(20));
    const a=vertices[i-1],b=vertices[i],t=n/12;
    fireEvent.pointerMove(layer, point(200+(a[0]+(b[0]-a[0])*t)*.48,200+(a[1]+(b[1]-a[1])*t)*.48));
  }
  expect(onShape).not.toHaveBeenCalledWith('ellipse');
  expect(onShape).not.toHaveBeenCalledWith('hexagon');
  expect(onShape).not.toHaveBeenCalledWith('holding');
  act(() => vi.advanceTimersByTime(800));
  expect(onShape).toHaveBeenLastCalledWith('hexagon');
});
it('finishes a cancelled capture so the next stroke can start', () => {
  const { layer, onEdit, point } = setup();
  fireEvent.pointerDown(layer, point(50, 50)); fireEvent.pointerMove(layer, point(80, 50));
  fireEvent.lostPointerCapture(layer, point(80, 50));
  fireEvent.pointerDown(layer, point(90, 50)); fireEvent.pointerUp(layer, point(110, 50));
  expect(onEdit).toHaveBeenCalledTimes(2);
});
it('keeps ordinary handwriting freehand and never draws with a finger', () => {
  const { layer, onEdit, onShape, point } = setup();
  fireEvent.pointerDown(layer, { ...point(10, 10), pointerType: 'touch' });
  fireEvent.pointerUp(layer, { ...point(20, 20), pointerType: 'touch' });
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.pointerDown(layer, point(50, 50));
  for (let x = 55; x <= 150; x += 5) fireEvent.pointerMove(layer, point(x, 50 + Math.sin(x) * .5));
  fireEvent.pointerUp(layer, point(150, 50));
  act(() => vi.advanceTimersByTime(1000));
  expect(onEdit.mock.calls[0][0].add[0].shape).toBeUndefined();
  expect(onEdit.mock.calls[0][0].add[0].points.length).toBeGreaterThan(2);
  expect(onShape).not.toHaveBeenCalledWith('line');
});

it.each(['mouse', 'pen'])('keeps upward %s ink visible after a JSON storage round trip reorders anchor keys', pointerType => {
  const { view, page, layer, onEdit, onShape, point } = setup(1, false, 'pen', true);
  const sample = (x: number, y: number) => ({ ...point(x, y), pointerType });
  fireEvent.pointerDown(layer, sample(150, 240));
  fireEvent.pointerMove(layer, sample(155, 205));
  fireEvent.pointerMove(layer, sample(160, 170));
  fireEvent.pointerUp(layer, sample(160, 170));
  const saved = onEdit.mock.calls[0][0].add[0];
  expect(saved.anchor).toEqual({kind: 'bar', sectionId: 'verse', barId: 'bar-one'});
  const rerender = (stroke: typeof saved) => view.rerender(<div><PersonalNotesPage page={page} pageIndex={0} strokes={[stroke]} drawing visible
    performance={false} tool="pen" color="#2563eb" width={2.5} shapeEnabled={false} onShape={onShape} onEdit={onEdit}/></div>);
  rerender(saved);
  const before = view.container.querySelector('[data-personal-note-stroke]')?.getAttribute('d');
  expect(before).toBeTruthy();
  // JSON objects have no semantic key order; a backend may return this order.
  const restored = JSON.parse(JSON.stringify({...saved, anchor: {kind:'bar', barId:'bar-one', sectionId:'verse'}}));
  rerender(restored);
  expect(view.container.querySelector('[data-personal-note-stroke]')?.getAttribute('d')).toBe(before);
});
