import { useReducedMotionPreference } from './useReducedMotionPreference';
import { isKeyboardInteraction } from './useUiMotion';
import { UI_DRAWER_EASE } from '../lib/uiMotion';
import { useAnimationControls } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const drawerEase = UI_DRAWER_EASE;
const scrollSelector = '[data-preview-metadata-scroll], [data-mobile-metadata-scroll]';
const translateY = (element: HTMLElement) => {
  const value = getComputedStyle(element).transform;
  return typeof DOMMatrixReadOnly !== 'undefined' && value !== 'none' ? new DOMMatrixReadOnly(value).m42 : 0;
};
const offscreenDistance = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const bottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
  return Number.isFinite(rect.top) ? Math.max(rect.height, bottom - (rect.top - translateY(element)) + 1) : rect.height;
};

/** Shared motion for existing detail sheets, without taking over content scrolling. */
export function useBottomSheetMotion(ref: RefObject<HTMLElement | null>, enabled: boolean, onDismiss: () => void) {
  const [element, setElement] = useState(ref.current);
  const attach = useCallback((node: HTMLElement | null) => { ref.current = node; setElement(node); }, [ref]);
  const controls = useAnimationControls();
  const reduce = useReducedMotionPreference();
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  const alive = useRef(false);
  const closing = useRef(false);
  const dismiss = useCallback(() => {
    if (!enabled) { latest.current(); return; }
    if (closing.current) return;
    closing.current = true;
    controls.stop();
    if (isKeyboardInteraction()) { latest.current(); return; }
    const distance = ref.current ? offscreenDistance(ref.current) : window.innerHeight;
    void controls.start(reduce ? { opacity: 0 } : { transform: `translate3d(0, ${distance}px, 0)` },
      { duration: reduce ? 0.16 : 0.2, ease: drawerEase }).then(() => { if (alive.current) latest.current(); });
  }, [controls, enabled, reduce, ref]);

  useEffect(() => {
    const sheet = element;
    if (!enabled || !sheet) return;
    alive.current = true;
    closing.current = false;
    // Use pixels at both ends so gesture interruption never mixes percentage
    // and pixel transforms, including the safe-area gap beneath a floating sheet.
    const instant = isKeyboardInteraction();
    controls.set({ transform: `translate3d(0, ${reduce || instant ? 0 : offscreenDistance(sheet)}px, 0)` });
    void controls.start({ transform: 'translate3d(0, 0px, 0)', opacity: 1 }, { duration: instant ? 0 : reduce ? 0.16 : 0.24, ease: drawerEase });
    let candidate: { id: number; x: number; y: number; base: number; distance: number; height: number; lastY: number; lastAt: number; velocity: number; dragging: boolean } | null = null;
    let frame: number | null = null;
    let suppressClick = false;
    const own = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); };
    const flush = () => { frame = null; if (candidate) controls.set({ transform: `translate3d(0, ${candidate.distance}px, 0)` }); };
    const settle = () => {
      if (reduce) controls.set({ transform: 'translate3d(0, 0px, 0)' });
      else void controls.start({ transform: 'translate3d(0, 0px, 0)' }, { type: 'spring', duration: 0.5, bounce: 0.2 });
    };
    const start = (event: TouchEvent) => {
      if (candidate || event.touches.length !== 1 || closing.current) return;
      suppressClick = false;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('button, input, textarea, select, a, [role="tab"], [data-placement]')) return;
      const scroller = target.closest<HTMLElement>(scrollSelector);
      if (!target.closest('[data-sheet-drag-handle]') && (!scroller || scroller.scrollTop > 0)) return;
      const touch = event.touches[0];
      candidate = { id: touch.identifier, x: touch.clientX, y: touch.clientY, base: 0, distance: 0,
        height: sheet.getBoundingClientRect().height, lastY: touch.clientY, lastAt: performance.now(), velocity: 0, dragging: false };
    };
    const move = (event: TouchEvent) => {
      if (!candidate) return;
      if (event.touches.length !== 1) {
        if (candidate.dragging) { own(event); settle(); }
        candidate = null; return;
      }
      const touch = Array.from(event.touches).find(t => t.identifier === candidate!.id);
      if (!touch) return;
      const dy = touch.clientY - candidate.y, dx = touch.clientX - candidate.x;
      if (!candidate.dragging) {
        if (dy < -6 || Math.abs(dx) > Math.abs(dy) + 6) { candidate = null; return; }
        if (dy < 6) return;
        candidate.base = translateY(sheet);
        controls.stop(); candidate.dragging = true;
      }
      own(event);
      const now = performance.now();
      candidate.velocity = (touch.clientY - candidate.lastY) / Math.max(1, now - candidate.lastAt) * 1000;
      candidate.lastY = touch.clientY; candidate.lastAt = now;
      candidate.distance = Math.max(0, candidate.base + dy);
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const end = (event: TouchEvent) => {
      if (!candidate) return;
      if (Array.from(event.touches).some(t => t.identifier === candidate!.id)) return;
      const current = candidate;
      if (frame !== null) { cancelAnimationFrame(frame); flush(); }
      candidate = null;
      if (!current.dragging) return;
      own(event); suppressClick = true;
      const velocity = performance.now() - current.lastAt < 100 ? current.velocity : 0;
      if (event.type !== 'touchcancel' && (current.distance > Math.min(120, current.height * 0.25) || current.distance > 24 && velocity > 600)) dismiss();
      else settle();
    };
    const click = (event: MouseEvent) => { if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); } };
    const options = { capture: true, passive: false };
    sheet.addEventListener('touchstart', start, options);
    sheet.addEventListener('touchmove', move, options);
    sheet.addEventListener('touchend', end, options);
    sheet.addEventListener('touchcancel', end, options);
    sheet.addEventListener('click', click, true);
    return () => {
      alive.current = false; controls.stop();
      if (frame !== null) cancelAnimationFrame(frame);
      sheet.removeEventListener('touchstart', start, true);
      sheet.removeEventListener('touchmove', move, true);
      sheet.removeEventListener('touchend', end, true);
      sheet.removeEventListener('touchcancel', end, true);
      sheet.removeEventListener('click', click, true);
    };
  }, [element, enabled, controls, dismiss, reduce]);
  return { attach, mounted: Boolean(element), dismiss, motionProps: enabled ? {
    initial: isKeyboardInteraction() ? false as const : reduce ? { opacity: 0, transform: 'translate3d(0, 0px, 0)' } : { opacity: 1, transform: 'translate3d(0, 100%, 0)' },
    animate: controls,
    // The sheet has already completed its controlled exit. Explicitly finish
    // presence so an outer AnimatePresence can release its backdrop and focus.
    exit: { opacity: 0, transition: { duration: 0 } }
  } : { initial: false as const } };
}
