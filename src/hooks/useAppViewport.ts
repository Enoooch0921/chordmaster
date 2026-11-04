import { useCallback, useLayoutEffect, useRef } from 'react';

/** Keep the application in the visual viewport; only its own scroll panes move. */
export function useAppViewport() {
  const root = useRef<HTMLDivElement | null>(null);
  const update = useCallback(() => {
    if (!root.current) return;
    const viewport = window.visualViewport;
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const active = document.activeElement;
    const editing = active instanceof HTMLElement && active.inputMode !== 'none' && (
      ((active instanceof HTMLInputElement && /^(text|search|tel|url|email|password|number)$/.test(active.type)
        || active instanceof HTMLTextAreaElement) && !active.readOnly && !active.disabled)
      || active.isContentEditable || active.matches('[contenteditable="true"], [contenteditable=""]'));
    // Safari can retain an old visualViewport size after leaving fullscreen.
    // Let dvh track browser chrome/rotation natively; only use visual bounds
    // while an editor is occluded by the software keyboard.
    const keyboard = editing && viewport && viewport.height + viewport.offsetTop < window.innerHeight - 1;
    const dynamicHeight = typeof CSS === 'undefined' || !CSS.supports || CSS.supports('height', '100dvh');
    const height = keyboard ? viewport.height : window.innerHeight;
    if (height > 0) root.current.style.height = keyboard || !dynamicHeight ? `${height}px` : '100dvh';
    root.current.style.top = `${keyboard ? viewport.offsetTop : 0}px`;
  }, []);
  const attach = useCallback((element: HTMLDivElement | null) => { root.current = element; update(); }, [update]);
  useLayoutEffect(() => {
    let frame: number | null = null;
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(() => { frame = null; update(); }); };
    let settleTimers: number[] = [];
    const settle = () => {
      settleTimers.forEach(window.clearTimeout);
      schedule();
      // Fullscreen/toolbar events can precede Safari's final viewport geometry,
      // with no resize event when that final geometry becomes available.
      settleTimers = [100, 300, 700, 1200].map(delay => window.setTimeout(schedule, delay));
    };
    const visible = () => { if (document.visibilityState === 'visible') settle(); };
    let touch: { x: number; y: number; startX: number; startY: number; axis: 'x' | 'y' | null; scrollers: HTMLElement[] } | null = null;
    const start = (event: TouchEvent) => {
      touch = null;
      if (event.touches.length !== 1) return;
      let element = event.target instanceof Element ? event.target : null;
      const scrollers: HTMLElement[] = [];
      while (element && element !== document.body && element !== document.documentElement) {
        if (element instanceof HTMLElement) {
          const style = getComputedStyle(element);
          if (/(auto|scroll)/.test(style.overflowX + style.overflowY)) scrollers.push(element);
        }
        element = element.parentElement;
      }
      touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, startX: event.touches[0].clientX, startY: event.touches[0].clientY, axis: null, scrollers };
    };
    const move = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1 || event.defaultPrevented) return;
      const point = event.touches[0], dx = point.clientX - touch.x, dy = point.clientY - touch.y;
      touch.x = point.clientX; touch.y = point.clientY;
      if (!touch.axis) {
        const totalX = Math.abs(point.clientX - touch.startX), totalY = Math.abs(point.clientY - touch.startY);
        if (Math.max(totalX, totalY) < 8) return;
        touch.axis = totalX > totalY ? 'x' : 'y';
      }
      // Do not reclassify each tiny movement: a vertical pan can drift sideways.
      const horizontal = touch.axis === 'x', delta = horizontal ? dx : dy;
      if (Math.abs(delta) < 1) return;
      const canScroll = touch.scrollers.some(element => {
        const position = horizontal ? element.scrollLeft : element.scrollTop;
        const limit = horizontal ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight;
        return limit > 1 && (delta > 0 ? position > 0 : position < limit - 1);
      });
      // Safari versions with incomplete overscroll-behavior must not hand an
      // exhausted internal pane to the document / installed-app viewport.
      if (!canScroll && event.cancelable) event.preventDefault();
    };
    const end = () => { touch = null; };
    const nativeContainment = typeof CSS !== 'undefined' && CSS.supports?.('overscroll-behavior', 'none');
    if (!nativeContainment) {
      document.addEventListener('touchstart', start, { passive: true, capture: true });
      document.addEventListener('touchmove', move, { passive: false, capture: true });
      document.addEventListener('touchend', end, { passive: true });
      document.addEventListener('touchcancel', end, { passive: true });
    }
    window.addEventListener('resize', schedule); window.addEventListener('pageshow', settle); window.addEventListener('focus', settle);
    window.addEventListener('orientationchange', settle);
    document.addEventListener('fullscreenchange', settle); document.addEventListener('webkitfullscreenchange', settle);
    document.addEventListener('visibilitychange', visible);
    document.addEventListener('focusin', schedule); document.addEventListener('focusout', settle);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    update();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      settleTimers.forEach(window.clearTimeout);
      document.removeEventListener('touchstart', start, true); document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end);
      window.removeEventListener('resize', schedule); window.removeEventListener('pageshow', settle); window.removeEventListener('focus', settle);
      window.removeEventListener('orientationchange', settle);
      document.removeEventListener('fullscreenchange', settle); document.removeEventListener('webkitfullscreenchange', settle);
      document.removeEventListener('visibilitychange', visible);
      document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', settle);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [update]);
  return attach;
}
