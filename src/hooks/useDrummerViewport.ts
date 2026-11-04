import { useLayoutEffect, type RefObject } from 'react';

/** Fit the portalled drummer layer to the keyboard's visual viewport. */
export function useDrummerViewport(rootRef: RefObject<HTMLDivElement | null>, tempoRef: RefObject<HTMLInputElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const viewport = window.visualViewport;
    const previous = { top: root.style.top, height: root.style.height };
    const touch = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)
      || ((navigator.platform === 'MacIntel' || /Macintosh/i.test(navigator.userAgent)) && navigator.maxTouchPoints > 1)
      || Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    let frame = 0, session = false, sawKeyboard = false, tempoSession = false, restoreOffset = false;
    let restingHeight = viewport?.height || window.innerHeight;
    const timers = new Set<number>();
    const resetDocument = () => {
      // WebKit can restore the painting but retain the keyboard's hit-test offset.
      // Reset only the locked document, never the song/chart scroll panes.
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (window.scrollX || window.scrollY) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    };
    const update = () => {
      if (viewport && Math.abs(viewport.scale - 1) > .01) return;
      const height = viewport?.height || window.innerHeight;
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && root.contains(active) && active.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]');
      if (session && restingHeight - height > 80) sawKeyboard = true;
      const restored = height >= restingHeight - 48;
      if (session && restored && (sawKeyboard || !focused)) {
        // The iPad keyboard's own dismiss button may not dispatch blur.
        if (sawKeyboard && focused) active.blur();
        resetDocument();
        session = false; sawKeyboard = false; tempoSession = false; restoreOffset = true;
      }
      const top = restoreOffset && restored ? 0 : Math.max(0, viewport?.offsetTop ?? 0);
      root.style.top = `${top}px`;
      root.style.height = `${Math.max(1, Math.min(height, window.innerHeight - top))}px`;
      const keyboard = session && sawKeyboard && !restored;
      if (keyboard) root.dataset.nativeKeyboard = 'true'; else delete root.dataset.nativeKeyboard;
      if (keyboard && tempoSession) root.dataset.tempoEditing = 'true'; else delete root.dataset.tempoEditing;
      if (!session && !restoreOffset) restingHeight = height;
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
      for (const delay of [100, 250, 500, 1000]) {
        const timer = window.setTimeout(() => { timers.delete(timer); schedule(); }, delay);
        timers.add(timer);
      }
    };
    const focus = (event: FocusEvent) => {
      const target = event.target;
      if (touch && target instanceof HTMLElement && root.contains(target) && target.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]')) {
        if (!session) restingHeight = viewport?.height || window.innerHeight;
        session = true; restoreOffset = false; tempoSession = target === tempoRef.current;
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
      delete root.dataset.nativeKeyboard; delete root.dataset.tempoEditing;
    };
  }, [rootRef, tempoRef]);
}
