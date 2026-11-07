import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** Presentation-only chrome must not re-render the entire score workspace. */
export function usePerformanceChrome(enabled: boolean, overlay: RefObject<HTMLElement | null>) {
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const show = useCallback((element: HTMLElement, visible: boolean) => {
    // Scope the styling state to the small controls. An ancestor selector on
    // the overlay invalidates styles throughout every cached score in WebKit.
    const state = visible ? 'visible' : 'hidden';
    if (element.dataset.performanceChrome !== state) element.dataset.performanceChrome = state;
    for (const item of element.querySelectorAll<HTMLElement>('[data-performance-chrome-item]')) {
      if (visible) item.removeAttribute('data-performance-chrome-hidden');
      else item.setAttribute('data-performance-chrome-hidden', '');
    }
  }, []);
  const reveal = useCallback(() => {
    const element = overlay.current;
    if (!element) return;
    show(element, true);
    clear();
    timer.current = window.setTimeout(() => {
      show(element, false);
      timer.current = null;
    }, 2000);
  }, [overlay, clear, show]);
  useEffect(() => {
    if (enabled) reveal();
    return clear;
  }, [enabled, reveal, clear]);
  return reveal;
}
