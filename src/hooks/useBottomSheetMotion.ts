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
type SheetSession = {
  sheet: HTMLElement;
  closing: boolean;
  completed: boolean;
  dragging: boolean;
  cancelDrag: () => void;
};

/** Shared motion for existing detail sheets, without taking over content scrolling. */
export function useBottomSheetMotion(ref: RefObject<HTMLElement | null>, enabled: boolean, onDismiss: () => void) {
  const [element, setElement] = useState(ref.current);
  const attach = useCallback((node: HTMLElement | null) => { ref.current = node; setElement(node); }, [ref]);
  const controls = useAnimationControls();
  const reduce = useReducedMotionPreference();
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  const reduced = useRef(reduce);
  reduced.current = reduce;
  const session = useRef<SheetSession | null>(null);
  const generation = useRef(0);
  const finishDismiss = useCallback((current: SheetSession, token: number) => {
    if (session.current !== current || generation.current !== token || !current.closing || current.completed) return;
    current.completed = true;
    latest.current();
  }, []);
  const animateDismiss = useCallback((current: SheetSession) => {
    const token = ++generation.current;
    controls.stop();
    if (isKeyboardInteraction()) { finishDismiss(current, token); return; }
    void controls.start(reduced.current ? { opacity: 0 } : { transform: `translate3d(0, ${offscreenDistance(current.sheet)}px, 0)` },
      { duration: reduced.current ? 0.16 : 0.2, ease: drawerEase }).then(() => finishDismiss(current, token));
  }, [controls, finishDismiss]);
  const dismiss = useCallback(() => {
    if (!enabled) { latest.current(); return; }
    const current = session.current;
    if (!current) { latest.current(); return; }
    if (current.closing) return;
    current.closing = true;
    current.cancelDrag();
    // The remaining exit is presentation only; don't accept a second edit while leaving.
    current.sheet.setAttribute('inert', '');
    current.sheet.setAttribute('aria-hidden', 'true');
    current.sheet.style.pointerEvents = 'none';
    animateDismiss(current);
  }, [animateDismiss, enabled]);

  useEffect(() => {
    const sheet = element;
    if (!enabled || !sheet) return;
    const current: SheetSession = { sheet, closing: false, completed: false, dragging: false, cancelDrag: () => {} };
    session.current = current;
    const originalInert = sheet.getAttribute('inert');
    const originalAriaHidden = sheet.getAttribute('aria-hidden');
    const originalPointerEvents = sheet.style.pointerEvents;
    // Use pixels at both ends so gesture interruption never mixes percentage
    // and pixel transforms, including the safe-area gap beneath a floating sheet.
    const instant = isKeyboardInteraction();
    controls.set({ transform: `translate3d(0, ${reduced.current || instant ? 0 : offscreenDistance(sheet)}px, 0)` });
    void controls.start({ transform: 'translate3d(0, 0px, 0)', opacity: 1 }, { duration: instant ? 0 : reduced.current ? 0.16 : 0.24, ease: drawerEase });
    let candidate: { id: number; x: number; y: number; base: number; distance: number; height: number; lastY: number; lastAt: number; velocity: number; dragging: boolean } | null = null;
    let frame: number | null = null;
    let suppressClick = false;
    const own = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); };
    current.cancelDrag = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; candidate = null; current.dragging = false;
    };
    const flush = () => { frame = null; if (candidate && !current.closing) controls.set({ transform: `translate3d(0, ${candidate.distance}px, 0)` }); };
    const settle = () => {
      if (reduced.current) controls.set({ transform: 'translate3d(0, 0px, 0)' });
      else void controls.start({ transform: 'translate3d(0, 0px, 0)' }, { type: 'spring', duration: 0.5, bounce: 0.2 });
    };
    const start = (event: TouchEvent) => {
      if (candidate || event.touches.length !== 1 || current.closing) return;
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
        candidate = null; current.dragging = false; return;
      }
      const touch = Array.from(event.touches).find(t => t.identifier === candidate!.id);
      if (!touch) return;
      const dy = touch.clientY - candidate.y, dx = touch.clientX - candidate.x;
      if (!candidate.dragging) {
        if (dy < -6 || Math.abs(dx) > Math.abs(dy) + 6) { candidate = null; return; }
        if (dy < 6) return;
        candidate.base = translateY(sheet);
        controls.stop(); candidate.dragging = true; current.dragging = true;
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
      const gesture = candidate;
      if (frame !== null) { cancelAnimationFrame(frame); flush(); }
      candidate = null; current.dragging = false;
      if (!gesture.dragging) return;
      own(event); suppressClick = true;
      const velocity = performance.now() - gesture.lastAt < 100 ? gesture.velocity : 0;
      if (event.type !== 'touchcancel' && (gesture.distance > Math.min(120, gesture.height * 0.25) || gesture.distance > 24 && velocity > 600)) dismiss();
      else settle();
    };
    const click = (event: MouseEvent) => { if (suppressClick || current.closing) { suppressClick = false; event.preventDefault(); event.stopPropagation(); } };
    const options = { capture: true, passive: false };
    sheet.addEventListener('touchstart', start, options);
    sheet.addEventListener('touchmove', move, options);
    sheet.addEventListener('touchend', end, options);
    sheet.addEventListener('touchcancel', end, options);
    sheet.addEventListener('click', click, true);
    return () => {
      generation.current++;
      if (session.current === current) session.current = null;
      controls.stop(); current.cancelDrag();
      if (originalInert === null) sheet.removeAttribute('inert'); else sheet.setAttribute('inert', originalInert);
      if (originalAriaHidden === null) sheet.removeAttribute('aria-hidden'); else sheet.setAttribute('aria-hidden', originalAriaHidden);
      sheet.style.pointerEvents = originalPointerEvents;
      sheet.removeEventListener('touchstart', start, true);
      sheet.removeEventListener('touchmove', move, true);
      sheet.removeEventListener('touchend', end, true);
      sheet.removeEventListener('touchcancel', end, true);
      sheet.removeEventListener('click', click, true);
    };
  }, [element, enabled, controls, dismiss]);

  const previousReduced = useRef(reduce);
  useEffect(() => {
    if (previousReduced.current === reduce) return;
    previousReduced.current = reduce;
    const current = session.current;
    if (!current || current.completed) return;
    if (current.closing) {
      // Changing preferences cannot revoke a committed dismissal or complete an old one.
      animateDismiss(current);
    } else if (reduce && !current.dragging) {
      controls.stop();
      controls.set({ transform: 'translate3d(0, 0px, 0)' });
      void controls.start({ opacity: 1 }, { duration: 0.16, ease: drawerEase });
    }
    // Re-enabling motion does not replay entry on an already visible sheet.
  }, [reduce, controls, animateDismiss]);
  return { attach, mounted: Boolean(element), dismiss, motionProps: enabled ? {
    initial: isKeyboardInteraction() ? false as const : reduce ? { opacity: 0, transform: 'translate3d(0, 0px, 0)' } : { opacity: 1, transform: 'translate3d(0, 100%, 0)' },
    animate: controls,
    // The sheet has already completed its controlled exit. Explicitly finish
    // presence so an outer AnimatePresence can release its backdrop and focus.
    exit: { opacity: 0, transition: { duration: 0 } }
  } : { initial: false as const } };
}
