import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePerformanceNavigationHint, usePerformanceSwipe } from './usePerformanceSwipe';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
const point = (x: number, y = 200, identifier = 1) => ({ identifier, clientX: x, clientY: y });
function setup() {
  const overlay = document.createElement('div');
  const turn = document.createElement('button'), control = document.createElement('button');
  turn.dataset.performanceTurnArea = 'next'; overlay.append(turn, control); document.body.append(overlay);
  const onNext = vi.fn(), onPrevious = vi.fn(), onLearned = vi.fn(), onInteract = vi.fn();
  const base = { overlay: { current: overlay }, onNext, onPrevious, onLearned, onInteract };
  const hook = renderHook(({ enabled, scope }) => usePerformanceSwipe({ ...base, enabled, scope }), {
    initialProps: { enabled: true, scope: 'song-a' },
  });
  const start = (target: Element = turn) => fireEvent.touchStart(target, { touches: [point(400)] });
  const move = (x: number, y = 200, points = [point(x, y)]) => fireEvent.touchMove(turn, { touches: points });
  const end = (x: number, y = 200) => fireEvent.touchEnd(turn, { changedTouches: [point(x, y)], touches: [] });
  return { overlay, turn, control, onNext, onPrevious, onLearned, hook, start, move, end };
}

it('tracks a drag without a layout read or animation frame and turns in the final direction on release', () => {
  const t = setup();
  const bounds = vi.spyOn(t.overlay, 'getBoundingClientRect');
  const frame = vi.spyOn(window, 'requestAnimationFrame');
  t.start(); t.move(398, 202); t.move(320); t.move(480);
  expect(t.onNext).not.toHaveBeenCalled(); expect(t.onPrevious).not.toHaveBeenCalled();
  t.end(480);
  expect(t.onPrevious).toHaveBeenCalledOnce(); expect(t.onLearned).toHaveBeenCalledOnce();
  expect(t.onNext).not.toHaveBeenCalled();
  expect(bounds).not.toHaveBeenCalled(); expect(frame).not.toHaveBeenCalled();
});

it('dismisses a short horizontal drag without turning and consumes its synthesized click only once', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.move(380); t.end(380);
  expect(t.onNext).not.toHaveBeenCalled(); expect(t.onPrevious).not.toHaveBeenCalled();
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
  t.start(); t.end(400); fireEvent.click(t.turn, { detail: 1 }); expect(clicks).toHaveBeenCalledOnce();
});

it('locks a vertical gesture out and prevents its release from becoming a page tap', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.move(390, 240); t.move(200, 250); t.end(200, 250);
  expect(t.onNext).not.toHaveBeenCalled();
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
});

it('cancels when a second finger arrives and never resumes from a leftover finger', () => {
  const t = setup(); t.start(); t.move(350);
  t.move(320, 200, [point(320), point(340, 200, 2)]);
  t.move(150); t.end(150);
  expect(t.onNext).not.toHaveBeenCalled();
});

it.each(['button', 'notes', 'lyrics-navigation'])('does not own a gesture on %s controls', kind => {
  const t = setup(); const target = kind === 'button' ? t.control : document.createElement('div');
  if (kind === 'notes') { (target as HTMLElement).dataset.personalNotesLayer = ''; t.overlay.append(target); }
  if (kind === 'lyrics-navigation') { (target as HTMLElement).dataset.lyricsNavigation = ''; t.overlay.append(target); }
  t.start(target); t.move(100); t.end(100);
  expect(t.onNext).not.toHaveBeenCalled();
});

it('discards the gesture for native cancellation, scope changes and hardware input', () => {
  const t = setup(); t.start(); t.move(250);
  fireEvent.touchCancel(t.turn); expect(t.onNext).not.toHaveBeenCalled();
  t.start(); t.move(250);
  t.hook.rerender({ enabled: true, scope: 'song-b' });
  t.end(250); expect(t.onNext).not.toHaveBeenCalled();
  t.start(); t.move(250);
  act(() => t.hook.result.current());
  t.end(250); expect(t.onNext).not.toHaveBeenCalled();
  const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
});

it('keeps click suppression through a cross-song scope change and discards it after reentry', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.end(100); expect(t.onNext).toHaveBeenCalledOnce();
  t.hook.rerender({ enabled: true, scope: 'song-b' });
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
  t.hook.rerender({ enabled: false, scope: 'song-b' });
  t.hook.rerender({ enabled: true, scope: 'song-b' });
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).toHaveBeenCalledOnce();
});

it('does not react to touches while handwriting or presentation is disabled', () => {
  const t = setup(); t.hook.rerender({ enabled: false, scope: 'song-a' });
  t.start(); t.move(100); t.end(100);
  expect(t.onNext).not.toHaveBeenCalled();
});

it('persists acknowledgement without a React render and keeps first-use help until acknowledged', () => {
  const hint = document.createElement('div'); hint.hidden = true;
  const ref = { current: hint }; let renders = 0;
  const hook = renderHook(({ enabled }) => { renders++; return usePerformanceNavigationHint(enabled, ref); }, { initialProps: { enabled: true } });
  expect(hint.hidden).toBe(false);
  act(() => hook.result.current()); expect(hint.hidden).toBe(true); expect(renders).toBe(1);
  hook.unmount(); hint.hidden = false;
  renderHook(() => usePerformanceNavigationHint(true, ref)); expect(hint.hidden).toBe(true);
});


it('never swallows keyboard or assistive activation during the touch click guard', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.end(100);
  fireEvent.click(t.turn, { detail: 0 }); expect(clicks).toHaveBeenCalledOnce();
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).toHaveBeenCalledOnce();
});

it('hides the guide while handwriting disables swiping and restores only an unlearned guide', () => {
  const hint = document.createElement('div'); const ref = { current: hint };
  const hook = renderHook(({ enabled }) => usePerformanceNavigationHint(enabled, ref), { initialProps: { enabled: true } });
  expect(hint.hidden).toBe(false);
  hook.rerender({ enabled: false }); expect(hint.hidden).toBe(true);
  hook.rerender({ enabled: true }); expect(hint.hidden).toBe(false);
  act(() => hook.result.current());
  hook.rerender({ enabled: false }); hook.rerender({ enabled: true }); expect(hint.hidden).toBe(true);
});
