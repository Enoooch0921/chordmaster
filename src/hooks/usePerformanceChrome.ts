import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** Presentation-only chrome must not re-render the entire score workspace. */
export function usePerformanceChrome(enabled: boolean, overlay: RefObject<HTMLElement | null>) {
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const reveal = useCallback(() => {
    const element = overlay.current;
    if (!element) return;
    if (element.dataset.performanceChrome !== 'visible') element.dataset.performanceChrome = 'visible';
    clear();
    timer.current = window.setTimeout(() => {
      element.dataset.performanceChrome = 'hidden';
      timer.current = null;
    }, 2000);
  }, [overlay, clear]);
  useEffect(() => {
    if (enabled) reveal();
    return clear;
  }, [enabled, reveal, clear]);
  return reveal;
}
