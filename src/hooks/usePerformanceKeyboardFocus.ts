import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** iPad standalone Safari can lose hardware-keyboard focus while DOM focus stays unchanged. */
export const usePerformanceKeyboardFocus = (
  enabled: boolean,
  capture: RefObject<HTMLElement | null>,
  overlay: RefObject<HTMLElement | null>,
  fullscreenTarget = false
) => {
  const active = useRef(enabled);
  active.current = enabled;
  const restore = useCallback(() => {
    if (!active.current || document.visibilityState === 'hidden' || document.querySelector('dialog[open]')) return;
    // Keep deliberate control focus; only reassert the page-turner's capture.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== capture.current && focused !== overlay.current
      && !focused.closest('[inert]') && (overlay.current?.contains(focused) || focused.closest('[data-ui-toast], [role="dialog"]'))
      && focused.closest('button, a[href], input, select, textarea, summary, [contenteditable="true"], [role="button"], [role="dialog"], [tabindex]:not([tabindex="-1"])')) return;
    // Editable focus can dismiss native fullscreen in iPad WebKit, even with
    // inputMode=none. Select the overlay before the async entry request settles.
    const nativeFullscreen = document.fullscreenElement
      ?? (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement;
    const target = fullscreenTarget || nativeFullscreen ? overlay.current : capture.current ?? overlay.current;
    // Do not skip when activeElement is already target: the native responder may
    // have expired after idle/Bluetooth reconnection without a DOM blur event.
    target?.focus({ preventScroll: true });
  }, [capture, overlay, fullscreenTarget]);
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
