import { canOpenSoftwareKeyboard, fitViewportLayer, resetLockedDocumentScroll } from './viewportBounds';
import { useLayoutEffect, type RefObject } from 'react';

/** Fit the portalled drummer layer to the keyboard's visual viewport. */
export function useDrummerViewport(rootRef: RefObject<HTMLDivElement | null>, stage = false) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const viewport = window.visualViewport;
    const previous = { top: root.style.top, height: root.style.height };
    const touch = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)
      || ((navigator.platform === 'MacIntel' || /Macintosh/i.test(navigator.userAgent)) && navigator.maxTouchPoints > 1)
      || Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    let frame = 0, session = false, sawKeyboard = false;
    let restingHeight = viewport?.height || window.innerHeight;
    const timers = new Set<number>();
    const update = () => {
      if (viewport && Math.abs(viewport.scale - 1) > .01) return;
      const height = viewport?.height || window.innerHeight;
      const active = document.activeElement;
      const focused = canOpenSoftwareKeyboard(active) && root.contains(active);
      if (session && restingHeight - height > 80) sawKeyboard = true;
      const restored = height >= restingHeight - 48;
      if (session && restored && (sawKeyboard || !focused)) {
        // The iPad keyboard's own dismiss button may not dispatch blur.
        if (sawKeyboard && focused) active.blur();
        resetLockedDocumentScroll();
        session = false; sawKeyboard = false;
      }
      const keyboard = session && sawKeyboard && !restored;
      fitViewportLayer(root, keyboard);
      if (!keyboard && !focused) resetLockedDocumentScroll();
      if (keyboard) root.dataset.nativeKeyboard = 'true'; else delete root.dataset.nativeKeyboard;
      if (!session) restingHeight = height;
      if (keyboard && focused) {
        // Scroll only the containing settings/control pane, not the document.
        for (let pane = active.parentElement; pane && pane !== root; pane = pane.parentElement) {
          if (!/(auto|scroll)/.test(getComputedStyle(pane).overflowY)) continue;
          const bounds = pane.getBoundingClientRect(), input = active.getBoundingClientRect();
          if (input.bottom > bounds.bottom - 12) pane.scrollTop += input.bottom - bounds.bottom + 12;
          else if (input.top < bounds.top + 12) pane.scrollTop -= bounds.top + 12 - input.top;
        }
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    const settle = () => {
      timers.forEach(timer => window.clearTimeout(timer)); timers.clear();
      schedule();
      if (!session) return;
      for (const delay of [100, 250, 500, 1000]) {
        const timer = window.setTimeout(() => { timers.delete(timer); schedule(); }, delay);
        timers.add(timer);
      }
    };
    const focus = (event: FocusEvent) => {
      const target = event.target;
      if (touch && target instanceof HTMLElement && root.contains(target) && canOpenSoftwareKeyboard(target)) {
        if (!session) restingHeight = viewport?.height || window.innerHeight;
        session = true;
      }
      settle();
    };
    root.addEventListener('focusin', focus); root.addEventListener('focusout', settle);
    viewport?.addEventListener('resize', settle); viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', settle); window.addEventListener('pageshow', settle);
    window.addEventListener('orientationchange', settle);
    document.addEventListener('fullscreenchange', settle); document.addEventListener('webkitfullscreenchange', settle);
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      timers.forEach(timer => window.clearTimeout(timer));
      root.removeEventListener('focusin', focus); root.removeEventListener('focusout', settle);
      viewport?.removeEventListener('resize', settle); viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', settle); window.removeEventListener('pageshow', settle);
      window.removeEventListener('orientationchange', settle);
      document.removeEventListener('fullscreenchange', settle); document.removeEventListener('webkitfullscreenchange', settle);
      root.style.top = previous.top; root.style.height = previous.height;
      delete root.dataset.nativeKeyboard;
    };
  }, [rootRef, stage]);
}
