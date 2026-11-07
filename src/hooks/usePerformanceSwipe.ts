import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

const INTENT_DISTANCE = 8;
const TURN_DISTANCE = 44;
const CLICK_GUARD_MS = 700;
const GUIDE_KEY = 'chordmaster.performance-navigation-learned.v1';

type Options = {
  enabled: boolean;
  scope: string;
  overlay: RefObject<HTMLElement | null>;
  onNext: () => void;
  onPrevious: () => void;
  onInteract: () => void;
  onLearned: () => void;
  ignoreTextSelection?: boolean;
};

/** Track intent during the swipe and turn once, on release. */
export function usePerformanceSwipe(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const reset = useRef<() => void>(() => {});
  const suppressClickUntil = useRef(0);
  const cancel = useCallback(() => reset.current(), []);

  useLayoutEffect(() => {
    const overlay = options.overlay.current;
    if (!options.enabled || !overlay) {
      suppressClickUntil.current = 0;
      return;
    }
    let touch: { id: number; x: number; y: number; horizontal: boolean; turn: string | null } | null = null;
    const guardClick = () => { suppressClickUntil.current = performance.now() + CLICK_GUARD_MS; };
    const abort = () => {
      if (touch?.horizontal) guardClick();
      touch = null;
    };
    reset.current = abort;
    const selecting = () => latest.current.ignoreTextSelection && window.getSelection()?.isCollapsed === false;
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { guardClick(); abort(); return; }
      suppressClickUntil.current = 0;
      touch = null;
      if (selecting()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-personal-notes-layer], [data-personal-notes-tools], [data-lyrics-navigation]')
        || (target.closest('button, a, input, textarea, select, [role="button"]') && !target.closest('[data-performance-turn-area]'))) return;
      latest.current.onInteract();
      const point = event.touches[0];
      touch = { id: point.identifier, x: point.clientX, y: point.clientY, horizontal: false,
        turn: target.closest('[data-performance-turn-area]')?.getAttribute('data-performance-turn-area') ?? null };
    };
    const move = (event: TouchEvent) => {
      if (!touch) return;
      if (selecting()) { guardClick(); abort(); return; }
      if (event.touches.length !== 1) { guardClick(); abort(); return; }
      const point = event.touches[0];
      if (point.identifier !== touch.id) { abort(); return; }
      if (!touch.horizontal) {
        const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < INTENT_DISTANCE) return;
        if (Math.abs(dy) >= Math.abs(dx)) { guardClick(); abort(); return; }
        touch.horizontal = true;
      }
      if (event.cancelable) event.preventDefault();
    };
    const end = (event: TouchEvent) => {
      if (!touch) return;
      if (selecting()) { guardClick(); abort(); return; }
      if (event.touches.length > 0) { guardClick(); abort(); return; }
      const point = Array.from(event.changedTouches).find(point => point.identifier === touch!.id);
      if (!point) { abort(); return; }
      const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
      const moved = touch.horizontal || Math.max(Math.abs(dx), Math.abs(dy)) >= INTENT_DISTANCE;
      const tap = !moved && (touch.turn === 'next' || touch.turn === 'previous') ? touch.turn : null;
      if (moved || tap) guardClick();
      touch = null;
      if (tap) {
        // Safari may omit the compatibility click after idle chrome/focus
        // changes. Complete a tap here, then consume any duplicate click.
        if (event.cancelable) event.preventDefault();
        latest.current.onLearned();
        if (tap === 'next') latest.current.onNext(); else latest.current.onPrevious();
      } else if (Math.abs(dx) >= TURN_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
        latest.current.onLearned();
        if (dx < 0) latest.current.onNext(); else latest.current.onPrevious();
      }
    };
    const click = (event: MouseEvent) => {
      // Keyboard and assistive activation are intentional, never a touch compatibility click.
      if (event.detail === 0) return;
      if (performance.now() >= suppressClickUntil.current) return;
      suppressClickUntil.current = 0;
      event.preventDefault(); event.stopPropagation();
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') { suppressClickUntil.current = 0; abort(); }
    };
    overlay.addEventListener('touchstart', start, { passive: true });
    overlay.addEventListener('touchmove', move, { passive: false });
    overlay.addEventListener('touchend', end);
    overlay.addEventListener('touchcancel', abort);
    overlay.addEventListener('click', click, true);
    overlay.addEventListener('pointerdown', pointer, true);
    return () => {
      abort();
      overlay.removeEventListener('touchstart', start);
      overlay.removeEventListener('touchmove', move);
      overlay.removeEventListener('touchend', end);
      overlay.removeEventListener('touchcancel', abort);
      overlay.removeEventListener('click', click, true);
      overlay.removeEventListener('pointerdown', pointer, true);
      reset.current = () => {};
    };
  }, [options.enabled, options.scope, options.overlay]);
  return cancel;
}

/** Stay visible through chrome idle, without rendering the score when learned. */
export function usePerformanceNavigationHint(enabled: boolean, ref: RefObject<HTMLElement | null>) {
  const learned = useRef(false);
  const dismiss = useCallback(() => {
    if (learned.current) return;
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
