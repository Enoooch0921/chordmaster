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
  const overlay = document.createElement('div'), surface = document.createElement('div');
  const turn = document.createElement('button'), control = document.createElement('button');
  turn.dataset.performanceTurnArea = 'next'; overlay.append(surface, turn, control); document.body.append(overlay);
  const animations: { frames: Keyframe[]; options: KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn> }[] = [];
  surface.animate = vi.fn((frames, options) => {
    const cancel = vi.fn(); animations.push({ frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, cancel });
    return { cancel, finished: new Promise(() => {}) } as unknown as Animation;
  });
  const onNext = vi.fn(), onPrevious = vi.fn(), onLearned = vi.fn(), onInteract = vi.fn();
  const base = { enabled: true, scope: 'song-a', reduced, overlay: { current: overlay }, surface: { current: surface }, onNext, onPrevious, onLearned, onInteract };
  let renders = 0;
  const hook = renderHook(({ enabled, scope, reduced }) => { renders++; return usePerformanceSwipe({ ...base, enabled, scope, reduced }); }, {
    initialProps: { enabled: true, scope: 'song-a', reduced },
  });
  const start = (target: Element = turn) => fireEvent.touchStart(target, { touches: [point(400)] });
  const move = (x: number, y = 200, points = [point(x, y)]) => fireEvent.touchMove(turn, { touches: points });
  const end = (x: number, y = 200) => fireEvent.touchEnd(turn, { changedTouches: [point(x, y)], touches: [] });
  const frame = () => act(() => vi.advanceTimersByTime(16));
  return { overlay, surface, turn, control, onNext, onPrevious, onLearned, onInteract, animations, hook, start, move, end, frame, renders: () => renders };
}

it('follows a horizontal finger modestly with one paint per frame and no hook render', () => {
  const t = setup(); t.start();
  t.move(360); t.move(200);
  expect(t.surface.style.transform).toBe('');
  t.frame(); expect(t.surface.style.transform).toBe('translate3d(-44px, 0, 0)');
  expect(t.renders()).toBe(1); expect(t.onNext).not.toHaveBeenCalled();
  t.move(0); t.frame(); expect(t.surface.style.transform).toBe('translate3d(-48px, 0, 0)');
  t.end(0); expect(t.onNext).toHaveBeenCalledOnce(); expect(t.onLearned).toHaveBeenCalledOnce();
  expect(t.surface.style.transform).toBe('');
  expect(t.animations.at(-1)?.options).toEqual({ duration: 160, easing: 'cubic-bezier(0.23,1,0.32,1)' });
  expect(t.renders()).toBe(1);
});

it('returns a short horizontal drag without turning and consumes its synthesized click only once', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.move(380); t.frame(); t.end(380);
  expect(t.onNext).not.toHaveBeenCalled(); expect(t.onPrevious).not.toHaveBeenCalled();
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
  t.start(); t.end(400); fireEvent.click(t.turn, { detail: 1 }); expect(clicks).toHaveBeenCalledOnce();
});

it('locks a vertical gesture out and prevents its release from becoming a page tap', () => {
  const t = setup(); const clicks = vi.fn(); t.turn.addEventListener('click', clicks);
  t.start(); t.move(390, 240); t.frame(); t.move(200, 250); t.end(200, 250);
  expect(t.surface.style.transform).toBe(''); expect(t.onNext).not.toHaveBeenCalled();
  fireEvent.click(t.turn, { detail: 1 }); expect(clicks).not.toHaveBeenCalled();
});

it('cancels when a second finger arrives and never resumes from a leftover finger', () => {
  const t = setup(); t.start(); t.move(350); t.frame();
  t.move(320, 200, [point(320), point(340, 200, 2)]);
  t.move(150); t.end(150);
  expect(t.surface.style.transform).toBe(''); expect(t.onNext).not.toHaveBeenCalled();
});

it.each(['button', 'notes'])('does not own a gesture on %s controls', kind => {
  const t = setup(); const target = kind === 'button' ? t.control : document.createElement('div');
  if (kind === 'notes') { (target as HTMLElement).dataset.personalNotesLayer = ''; t.overlay.append(target); }
  t.start(target); t.move(100); t.frame(); t.end(100);
  expect(t.surface.style.transform).toBe(''); expect(t.onNext).not.toHaveBeenCalled();
});

it('drops movement for reduced motion while preserving subtle feedback and a turn', () => {
  const t = setup(true); t.start(); t.move(250); t.frame();
  expect(t.surface.style.transform).toBe(''); expect(t.surface.style.opacity).toBe('0.96');
  t.end(250); expect(t.onNext).toHaveBeenCalledOnce();
  expect(t.animations.at(-1)?.frames).toEqual([{ opacity: '0.96' }, { opacity: '1' }]);
});

it('cancels feedback for native cancellation, scope changes and hardware input', () => {
  const t = setup(); t.start(); t.move(250); t.frame();
  fireEvent.touchCancel(t.turn); expect(t.surface.style.transform).toBe(''); expect(t.onNext).not.toHaveBeenCalled();
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
