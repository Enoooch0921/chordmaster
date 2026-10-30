import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

/** Keep the application in the visual viewport; only its own scroll panes move. */
export function useAppViewport(overlay?: RefObject<HTMLDivElement | null>, overlayVisible = false) {
  const root = useRef<HTMLDivElement | null>(null);
  const update = useCallback(() => {
    const viewport = window.visualViewport;
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const top = Math.max(0, viewport?.offsetTop ?? 0);
    const visualHeight = viewport?.height || window.innerHeight;
    // During fullscreen exit, the browser bars can return before VisualViewport
    // catches up. Keep the bottom inside both reported viewport bounds.
    const height = Math.min(visualHeight, Math.max(0, window.innerHeight - top));
    for (const element of [root.current, overlay?.current]) {
      if (!element) continue;
      if (height > 0) element.style.height = `${height}px`;
      element.style.top = `${top}px`;
    }
  }, [overlay]);
  const attach = useCallback((element: HTMLDivElement | null) => { root.current = element; update(); }, [update]);
  // The performance overlay mounts independently of the persistent app root.
  useLayoutEffect(update, [update, overlayVisible]);
  useLayoutEffect(() => {
    let frame: number | null = null;
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(() => { frame = null; update(); }); };
    const settleTimers = new Set<number>();
    const settle = () => {
      settleTimers.forEach(timer => window.clearTimeout(timer));
      settleTimers.clear();
      schedule();
      // Fullscreen/rotation events may precede the toolbar animation's final
      // dimensions. Bounded follow-ups also cover a missing final resize event.
      for (const delay of [100, 250, 500, 1000]) {
        const timer = window.setTimeout(() => { settleTimers.delete(timer); schedule(); }, delay);
        settleTimers.add(timer);
      }
    };
    const visible = () => { if (document.visibilityState !== 'hidden') settle(); };
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
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    update();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      settleTimers.forEach(timer => window.clearTimeout(timer));
      document.removeEventListener('touchstart', start, true); document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end);
      window.removeEventListener('resize', schedule); window.removeEventListener('pageshow', settle); window.removeEventListener('focus', settle);
      window.removeEventListener('orientationchange', settle);
      document.removeEventListener('fullscreenchange', settle); document.removeEventListener('webkitfullscreenchange', settle);
      document.removeEventListener('visibilitychange', visible);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [update]);
  return attach;
}
