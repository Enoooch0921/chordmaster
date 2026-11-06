import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

const INTENT_DISTANCE = 8;
const TURN_DISTANCE = 44;
const FEEDBACK_SIZE = 40;
const FEEDBACK_GAP = 16;
const TAP_HOLD_MS = 100;
const CLICK_GUARD_MS = 700;
const GUIDE_KEY = 'chordmaster.performance-navigation-learned.v1';
type Direction = 'next' | 'previous';
type TapPoint = Pick<MouseEvent, 'detail' | 'clientX' | 'clientY'>;

type Options = {
  enabled: boolean;
  scope: string;
  reduced: boolean;
  overlay: RefObject<HTMLElement | null>;
  feedback: RefObject<HTMLElement | null>;
  onNext: () => void;
  onPrevious: () => void;
  onInteract: () => void;
  onLearned: () => void;
};

/** Only the small touch indicator moves; score content and React state stay independent. */
export function usePerformanceSwipe(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const reset = useRef<() => void>(() => {});
  const suppressClickUntil = useRef(0);
  const flash = useRef<(event: TapPoint, direction: Direction) => void>(() => {});
  const tap = useCallback((event: TapPoint, direction: Direction) => flash.current(event, direction), []);
  const cancel = useCallback(() => reset.current(), []);

  useLayoutEffect(() => {
    const overlay = options.overlay.current;
    const feedback = options.feedback.current;
    if (!options.enabled || !overlay || !feedback) { suppressClickUntil.current = 0; return; }
    let touch: { id: number; x: number; y: number; currentX: number; currentY: number; bounds: DOMRect; axis: 'pending' | 'horizontal'; dx: number } | null = null;
    let frame: number | null = null;
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    const clearFrame = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
    const clearFlash = () => { if (flashTimer !== null) clearTimeout(flashTimer); flashTimer = null; };
    const hide = (immediate = false) => {
      feedback.style.transition = immediate ? 'none' : '';
      delete feedback.dataset.active;
    };
    const show = (x: number, y: number, direction: Direction, ready: boolean, bounds: DOMRect) => {
      const maxX = Math.max(8, bounds.width - FEEDBACK_SIZE - 8);
      const maxY = Math.max(8, bounds.height - FEEDBACK_SIZE - 8);
      const left = Math.max(8, Math.min(maxX, x - bounds.left - FEEDBACK_SIZE / 2));
      const top = Math.max(8, Math.min(maxY, y - bounds.top - FEEDBACK_SIZE - FEEDBACK_GAP));
      feedback.style.transition = 'none';
      feedback.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      feedback.dataset.direction = direction;
      feedback.dataset.ready = String(ready);
      feedback.dataset.active = 'true';
    };
    const resetGesture = () => {
      if (touch && (touch.axis === 'horizontal' || Math.abs(touch.dx) >= INTENT_DISTANCE)) {
        suppressClickUntil.current = performance.now() + CLICK_GUARD_MS;
      }
      touch = null; clearFrame(); clearFlash(); hide(true);
    };
    reset.current = resetGesture;
    const flashTap = (event: TapPoint, direction: Direction) => {
      resetGesture();
      // Keyboard/pedal/assistive activation stays immediate and has no touch animation.
      if (event.detail === 0) return;
      show(event.clientX, event.clientY, direction, true, overlay.getBoundingClientRect());
      flashTimer = setTimeout(() => { flashTimer = null; hide(); }, TAP_HOLD_MS);
    };
    flash.current = flashTap;
    const paint = () => {
      frame = null;
      if (!touch || touch.axis !== 'horizontal') return;
      show(latest.current.reduced ? touch.x : touch.currentX,
        latest.current.reduced ? touch.y : touch.currentY,
        touch.dx < 0 ? 'next' : 'previous', Math.abs(touch.dx) >= TURN_DISTANCE, touch.bounds);
    };
    const guardClick = () => { suppressClickUntil.current = performance.now() + CLICK_GUARD_MS; };
    const abort = () => {
      if (!touch) return;
      if (touch.axis === 'horizontal' || Math.abs(touch.dx) >= INTENT_DISTANCE) guardClick();
      touch = null; clearFrame(); clearFlash(); hide();
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { guardClick(); abort(); return; }
      suppressClickUntil.current = 0;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-personal-notes-layer], [data-personal-notes-tools]')
        || (target.closest('button, a, input, textarea, select, [role="button"]') && !target.closest('[data-performance-turn-area]'))) return;
      latest.current.onInteract();
      clearFrame(); clearFlash();
      const point = event.touches[0];
      const bounds = overlay.getBoundingClientRect();
      touch = { id: point.identifier, x: point.clientX, y: point.clientY, currentX: point.clientX, currentY: point.clientY, bounds, axis: 'pending', dx: 0 };
      const area = target.closest<HTMLElement>('[data-performance-turn-area]')?.dataset.performanceTurnArea;
      const direction = area === 'previous' || area === 'next' ? area : point.clientX < bounds.left + bounds.width / 2 ? 'previous' : 'next';
      show(point.clientX, point.clientY, direction, false, bounds);
    };
    const move = (event: TouchEvent) => {
      if (!touch) return;
      if (event.touches.length !== 1) { guardClick(); abort(); return; }
      const point = Array.from(event.touches).find(point => point.identifier === touch!.id);
      if (!point) { abort(); return; }
      const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
      touch.dx = dx; touch.currentX = point.clientX; touch.currentY = point.clientY;
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
      touch.dx = dx; touch.currentX = point.clientX; touch.currentY = point.clientY;
      if (horizontal) { touch.axis = 'horizontal'; clearFrame(); paint(); }
      touch = null; clearFrame();
      if (horizontal || Math.max(Math.abs(dx), Math.abs(dy)) >= INTENT_DISTANCE) guardClick();
      if (horizontal && Math.abs(dx) >= TURN_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
        latest.current.onLearned();
        if (dx < 0) latest.current.onNext(); else latest.current.onPrevious();
      }
      hide();
    };
    const click = (event: MouseEvent) => {
      // Keyboard and assistive activation are intentional, never a touch compatibility click.
      if (event.detail === 0) return;
      if (performance.now() >= suppressClickUntil.current) return;
      suppressClickUntil.current = 0;
      event.preventDefault(); event.stopPropagation();
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') { suppressClickUntil.current = 0; resetGesture(); }
    };
    overlay.addEventListener('touchstart', start, { passive: true });
    overlay.addEventListener('touchmove', move, { passive: false });
    overlay.addEventListener('touchend', end);
    overlay.addEventListener('touchcancel', abort);
    overlay.addEventListener('click', click, true);
    overlay.addEventListener('pointerdown', pointer, true);
    return () => {
      resetGesture(); hide();
      overlay.removeEventListener('touchstart', start);
      overlay.removeEventListener('touchmove', move);
      overlay.removeEventListener('touchend', end);
      overlay.removeEventListener('touchcancel', abort);
      overlay.removeEventListener('click', click, true);
      overlay.removeEventListener('pointerdown', pointer, true);
      if (reset.current === resetGesture) reset.current = () => {};
      if (flash.current === flashTap) flash.current = () => {};
    };
  }, [options.enabled, options.scope, options.reduced, options.overlay, options.feedback]);
  return { cancel, tap };
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
