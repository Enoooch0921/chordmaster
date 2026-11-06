import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePerformanceNavigationHint, usePerformanceSwipe } from './usePerformanceSwipe';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const point = (x: number, y = 200, identifier = 1) => ({ identifier, clientX: x, clientY: y });
function setup(reduced = false) {
  const overlay = document.createElement('div'), surface = document.createElement('div'), feedback = document.createElement('div');
  overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
  const turn = document.createElement('button'), control = document.createElement('button');
  turn.dataset.performanceTurnArea = 'next'; overlay.append(surface, feedback, turn, control); document.body.append(overlay);
  const onNext = vi.fn(), onPrevious = vi.fn(), onLearned = vi.fn(), onInteract = vi.fn();
  const base = { enabled: true, scope: 'song-a', reduced, overlay: { current: overlay }, feedback: { current: feedback }, onNext, onPrevious, onLearned, onInteract };
  let renders = 0;
  const hook = renderHook(({ enabled, scope, reduced }) => { renders++; return usePerformanceSwipe({ ...base, enabled, scope, reduced }); }, {
    initialProps: { enabled: true, scope: 'song-a', reduced },
  });
  const start = (target: Element = turn) => fireEvent.touchStart(target, { touches: [point(400)] });
  const move = (x: number, y = 200, points = [point(x, y)]) => fireEvent.touchMove(turn, { touches: points });
  const end = (x: number, y = 200) => fireEvent.touchEnd(turn, { changedTouches: [point(x, y)], touches: [] });
  const frame = () => act(() => vi.advanceTimersByTime(16));
  return { overlay, surface, feedback, turn, control, onNext, onPrevious, onLearned, onInteract, hook, start, move, end, frame, renders: () => renders };
}

it('moves only the local cue once per frame, keeping the score still without hook renders', () => {
  const t = setup(); t.start();
  expect(t.feedback.dataset.active).toBe('true');
  const startPosition = t.feedback.style.transform;
  t.move(360); t.move(200);
  expect(t.feedback.style.transform).toBe(startPosition);
  t.frame(); expect(t.feedback.style.transform).toBe('translate3d(180px, 144px, 0)');
  expect(t.feedback.dataset.direction).toBe('next'); expect(t.feedback.dataset.ready).toBe('true');
  expect(t.surface.style.transform).toBe(''); expect(t.surface.style.opacity).toBe('');
  expect(t.renders()).toBe(1); expect(t.onNext).not.toHaveBeenCalled();
  t.move(0); t.frame(); expect(t.feedback.style.transform).toBe('translate3d(8px, 144px, 0)');
  t.end(0); expect(t.onNext).toHaveBeenCalledOnce(); expect(t.onLearned).toHaveBeenCalledOnce();
  expect(t.surface.style.transform).toBe(''); expect(t.surface.style.opacity).toBe('');
  expect(t.feedback.dataset.active).toBeUndefined(); expect(t.feedback.style.transition).toBe('');
  expect(t.renders()).toBe(1);
});

it('reverses the cue direction and readiness immediately without queuing animation', () => {
  const t = setup(); t.start(); t.move(300); t.frame();
  expect(t.feedback.dataset.direction).toBe('next'); expect(t.feedback.dataset.ready).toBe('true');
  t.move(420); t.frame();
  expect(t.feedback.dataset.direction).toBe('previous'); expect(t.feedback.dataset.ready).toBe('false');
  t.end(480); expect(t.onPrevious).toHaveBeenCalledOnce(); expect(t.onNext).not.toHaveBeenCalled();
});

it('dismisses a short horizontal drag without turning and consumes its synthesized click only once', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.move(380); t.frame(); t.end(380);
  expect(t.onNext).not.toHaveBeenCalled(); expect(t.onPrevious).not.toHaveBeenCalled();
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
  t.start(); t.end(400); fireEvent.click(t.turn, { detail: 1 }); expect(clicks).toHaveBeenCalledOnce();
});

it('locks a vertical gesture out and prevents its release from becoming a page tap', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.move(390, 240); t.frame(); t.move(200, 250); t.end(200, 250);
  expect(t.surface.style.transform).toBe(''); expect(t.feedback.dataset.active).toBeUndefined(); expect(t.onNext).not.toHaveBeenCalled();
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
});

it('cancels when a second finger arrives and never resumes from a leftover finger', () => {
  const t = setup(); t.start(); t.move(350); t.frame();
  t.move(320, 200, [point(320), point(340, 200, 2)]);
  t.move(150); t.end(150);
  expect(t.surface.style.transform).toBe(''); expect(t.feedback.dataset.active).toBeUndefined(); expect(t.onNext).not.toHaveBeenCalled();
});

it.each(['button', 'notes'])('does not own a gesture on %s controls', kind => {
  const t = setup(); const target = kind === 'button' ? t.control : document.createElement('div');
  if (kind === 'notes') { (target as HTMLElement).dataset.personalNotesLayer = ''; t.overlay.append(target); }
  t.start(target); t.move(100); t.frame(); t.end(100);
  expect(t.surface.style.transform).toBe(''); expect(t.feedback.dataset.active).toBeUndefined(); expect(t.onNext).not.toHaveBeenCalled();
});

it('keeps reduced-motion feedback at the first touch without moving or fading the paper', () => {
  const t = setup(true); t.start(); const first = t.feedback.style.transform;
  t.move(250); t.frame();
  expect(t.feedback.style.transform).toBe(first); expect(t.feedback.dataset.active).toBe('true');
  expect(t.surface.style.transform).toBe(''); expect(t.surface.style.opacity).toBe('');
  t.end(250); expect(t.onNext).toHaveBeenCalledOnce(); expect(t.feedback.dataset.active).toBeUndefined();
});

it('shows an interruptible tap cue and removes it after a short hold; keyboard activation stays still', () => {
  const t = setup();
  act(() => t.hook.result.current.tap({ detail: 1, clientX: 700, clientY: 300 }, 'next'));
  expect(t.feedback.dataset.active).toBe('true'); expect(t.feedback.dataset.direction).toBe('next');
  act(() => vi.advanceTimersByTime(80));
  act(() => t.hook.result.current.tap({ detail: 1, clientX: 100, clientY: 300 }, 'previous'));
  act(() => vi.advanceTimersByTime(20));
  expect(t.feedback.dataset.active).toBe('true'); expect(t.feedback.dataset.direction).toBe('previous');
  act(() => vi.advanceTimersByTime(80)); expect(t.feedback.dataset.active).toBeUndefined();
  act(() => t.hook.result.current.tap({ detail: 0, clientX: 0, clientY: 0 }, 'next'));
  expect(t.feedback.dataset.active).toBeUndefined(); expect(t.feedback.style.transition).toBe('none');
  expect(t.surface.style.transform).toBe(''); expect(t.renders()).toBe(1);
});

it('cleans up a pending tap timer without hiding a new gesture after scope changes', () => {
  const t = setup();
  act(() => t.hook.result.current.tap({ detail: 1, clientX: 700, clientY: 300 }, 'next'));
  t.hook.rerender({ enabled: true, scope: 'song-b', reduced: false });
  t.start(); act(() => vi.advanceTimersByTime(150));
  expect(t.feedback.dataset.active).toBe('true');
  t.hook.unmount(); expect(t.feedback.dataset.active).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
});

it('cancels feedback for native cancellation, scope changes and hardware input', () => {
  const t = setup(); t.start(); t.move(250); t.frame();
  fireEvent.touchCancel(t.turn); expect(t.surface.style.transform).toBe(''); expect(t.feedback.dataset.active).toBeUndefined(); expect(t.onNext).not.toHaveBeenCalled();
  t.start(); t.move(250); t.frame();
  t.hook.rerender({ enabled: true, scope: 'song-b', reduced: false });
  t.end(250); expect(t.onNext).not.toHaveBeenCalled(); expect(t.surface.style.transform).toBe('');
  t.start(); t.move(250); t.frame();
  act(() => t.hook.result.current.cancel());
  t.end(250); expect(t.onNext).not.toHaveBeenCalled(); expect(t.surface.style.transform).toBe('');
  const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
});

it('keeps click suppression through a cross-song scope change and discards it after reentry', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.end(100); expect(t.onNext).toHaveBeenCalledOnce();
  t.hook.rerender({ enabled: true, scope: 'song-b', reduced: false });
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
  t.hook.rerender({ enabled: false, scope: 'song-b', reduced: false });
  t.hook.rerender({ enabled: true, scope: 'song-b', reduced: false });
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).toHaveBeenCalledOnce();
});

it('does not react to touches while handwriting or presentation is disabled', () => {
  const t = setup(); t.hook.rerender({ enabled: false, scope: 'song-a', reduced: false });
  t.start(); t.move(100); t.frame(); t.end(100);
  expect(t.onNext).not.toHaveBeenCalled(); expect(t.surface.style.transform).toBe('');
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
