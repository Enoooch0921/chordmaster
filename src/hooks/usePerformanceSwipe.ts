import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { UI_EASE_OUT } from '../lib/uiMotion';

const INTENT_DISTANCE = 8;
const TURN_DISTANCE = 44;
const MAX_FEEDBACK_DISTANCE = 48;
const CLICK_GUARD_MS = 700;
const GUIDE_KEY = 'chordmaster.performance-navigation-learned.v1';
const easing = `cubic-bezier(${UI_EASE_OUT.join(',')})`;

type Options = {
  enabled: boolean;
  scope: string;
  reduced: boolean;
  overlay: RefObject<HTMLElement | null>;
  surface: RefObject<HTMLElement | null>;
  onNext: () => void;
  onPrevious: () => void;
  onInteract: () => void;
  onLearned: () => void;
};

/** Gesture feedback is presentation-only; page offsets and React state stay independent. */
export function usePerformanceSwipe(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const reset = useRef<() => void>(() => {});
  const suppressClickUntil = useRef(0);
  const cancel = useCallback(() => reset.current(), []);

  useLayoutEffect(() => {
    const overlay = options.overlay.current;
    const surface = options.surface.current;
    if (!options.enabled || !overlay || !surface) { suppressClickUntil.current = 0; return; }
    let touch: { id: number; x: number; y: number; base: number; axis: 'pending' | 'horizontal'; dx: number } | null = null;
    let frame: number | null = null;
    let motion: Animation | null = null;
    let offset = 0;
    const clearFrame = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
    const neutral = () => { surface.style.transform = ''; surface.style.opacity = ''; surface.style.willChange = ''; offset = 0; };
    const stop = () => { motion?.cancel(); motion = null; };
    const resetSurface = () => {
      if (touch && (touch.axis === 'horizontal' || Math.abs(touch.dx) >= INTENT_DISTANCE)) {
        suppressClickUntil.current = performance.now() + CLICK_GUARD_MS;
      }
      touch = null; clearFrame(); stop(); neutral();
    };
    reset.current = resetSurface;
    const paint = () => {
      frame = null;
      if (!touch || touch.axis !== 'horizontal') return;
      offset = Math.max(-MAX_FEEDBACK_DISTANCE, Math.min(MAX_FEEDBACK_DISTANCE, touch.base + touch.dx * 0.22));
      surface.style.willChange = latest.current.reduced ? 'opacity' : 'transform';
      if (latest.current.reduced) surface.style.opacity = '0.96';
      else surface.style.transform = `translate3d(${offset}px, 0, 0)`;
    };
    const settle = () => {
      if (offset === 0 && !surface.style.opacity) { stop(); neutral(); return; }
      const reduced = latest.current.reduced;
      const from = reduced ? { opacity: surface.style.opacity || '1' } : { transform: `translate3d(${offset}px, 0, 0)` };
      stop();
      neutral();
      if (typeof surface.animate !== 'function') return;
      const animation = surface.animate([from, reduced ? { opacity: '1' } : { transform: 'translate3d(0px, 0, 0)' }], {
        duration: reduced ? 125 : 160, easing,
      });
      motion = animation;
      void animation.finished.then(() => { if (motion === animation) motion = null; }).catch(() => {});
    };
    const guardClick = () => { suppressClickUntil.current = performance.now() + CLICK_GUARD_MS; };
    const abort = () => {
      if (!touch) return;
      if (touch.axis === 'horizontal' || Math.abs(touch.dx) >= INTENT_DISTANCE) guardClick();
      touch = null; clearFrame(); settle();
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { guardClick(); abort(); return; }
      suppressClickUntil.current = 0;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-personal-notes-layer], [data-personal-notes-tools]')
        || (target.closest('button, a, input, textarea, select, [role="button"]') && !target.closest('[data-performance-turn-area]'))) return;
      latest.current.onInteract();
      let base = 0;
      if (motion) {
        const transform = getComputedStyle(surface).transform;
        if (typeof DOMMatrixReadOnly !== 'undefined' && transform && transform !== 'none') base = new DOMMatrixReadOnly(transform).m41;
      }
      stop();
      offset = base;
      if (!latest.current.reduced) surface.style.transform = base ? `translate3d(${base}px, 0, 0)` : '';
      const point = event.touches[0];
      touch = { id: point.identifier, x: point.clientX, y: point.clientY, base, axis: 'pending', dx: 0 };
    };
    const move = (event: TouchEvent) => {
      if (!touch) return;
      if (event.touches.length !== 1) { guardClick(); abort(); return; }
      const point = Array.from(event.touches).find(point => point.identifier === touch!.id);
      if (!point) { abort(); return; }
      const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
      touch.dx = dx;
      if (touch.axis === 'pending') {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < INTENT_DISTANCE) return;
        if (Math.abs(dy) >= Math.abs(dx)) { guardClick(); abort(); return; }
        touch.axis = 'horizontal';
      }
      if (event.cancelable) event.preventDefault();
      if (frame === null) frame = requestAnimationFrame(paint);
    };
    const end = (event: TouchEvent) => {
      if (!touch) return;
      if (event.touches.length > 0) { guardClick(); abort(); return; }
      const point = Array.from(event.changedTouches).find(point => point.identifier === touch!.id);
      if (!point) { abort(); return; }
      const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
      const horizontal = touch.axis === 'horizontal' || (Math.abs(dx) >= INTENT_DISTANCE && Math.abs(dx) > Math.abs(dy));
      touch.dx = dx;
      if (horizontal) { touch.axis = 'horizontal'; clearFrame(); paint(); }
      touch = null; clearFrame();
      if (horizontal || Math.max(Math.abs(dx), Math.abs(dy)) >= INTENT_DISTANCE) guardClick();
      if (horizontal && Math.abs(dx) >= TURN_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
        latest.current.onLearned();
        if (dx < 0) latest.current.onNext(); else latest.current.onPrevious();
      }
      settle();
    };
    const click = (event: MouseEvent) => {
      // Keyboard and assistive activation are intentional, never a touch compatibility click.
      if (event.detail === 0) return;
      if (performance.now() >= suppressClickUntil.current) return;
      suppressClickUntil.current = 0;
      event.preventDefault(); event.stopPropagation();
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') { suppressClickUntil.current = 0; resetSurface(); }
    };
    overlay.addEventListener('touchstart', start, { passive: true });
    overlay.addEventListener('touchmove', move, { passive: false });
    overlay.addEventListener('touchend', end);
    overlay.addEventListener('touchcancel', abort);
    overlay.addEventListener('click', click, true);
    overlay.addEventListener('pointerdown', pointer, true);
    return () => {
      resetSurface();
      overlay.removeEventListener('touchstart', start);
      overlay.removeEventListener('touchmove', move);
      overlay.removeEventListener('touchend', end);
      overlay.removeEventListener('touchcancel', abort);
      overlay.removeEventListener('click', click, true);
      overlay.removeEventListener('pointerdown', pointer, true);
      if (reset.current === resetSurface) reset.current = () => {};
    };
  }, [options.enabled, options.scope, options.reduced, options.overlay, options.surface]);
  return { cancel };
}

/** Stay visible through chrome idle, without rendering the score when learned. */
export function usePerformanceNavigationHint(enabled: boolean, ref: RefObject<HTMLElement | null>) {
  const learned = useRef(false);
  const dismiss = useCallback(() => {
    learned.current = true;
    if (ref.current) ref.current.hidden = true;
    try { localStorage.setItem(GUIDE_KEY, 'true'); } catch { /* Session dismissal still works. */ }
  }, [ref]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    if (!enabled) { ref.current.hidden = true; return; }
    try { learned.current ||= localStorage.getItem(GUIDE_KEY) === 'true'; } catch { /* Keep the guide available. */ }
    ref.current.hidden = learned.current;
  }, [enabled, ref]);
  return dismiss;
}
