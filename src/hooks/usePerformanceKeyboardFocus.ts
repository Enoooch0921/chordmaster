import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** iPad standalone Safari can lose hardware-keyboard focus while DOM focus stays unchanged. */
export const usePerformanceKeyboardFocus = (
  enabled: boolean,
  capture: RefObject<HTMLElement | null>,
  overlay: RefObject<HTMLElement | null>
) => {
  const active = useRef(enabled);
  active.current = enabled;
  const restore = useCallback(() => {
    if (!active.current || document.visibilityState === 'hidden' || document.querySelector('dialog[open]')) return;
    const target = capture.current ?? overlay.current;
    // Do not skip when activeElement is already target: the native responder may
    // have expired after idle/Bluetooth reconnection without a DOM blur event.
    target?.focus({ preventScroll: true });
  }, [capture, overlay]);
  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(restore);
    const heartbeat = setInterval(restore, 1500);
    window.addEventListener('focus', restore);
    window.addEventListener('pageshow', restore);
    document.addEventListener('visibilitychange', restore);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(heartbeat);
      window.removeEventListener('focus', restore);
      window.removeEventListener('pageshow', restore);
      document.removeEventListener('visibilitychange', restore);
    };
  }, [enabled, restore]);
  return restore;
};
