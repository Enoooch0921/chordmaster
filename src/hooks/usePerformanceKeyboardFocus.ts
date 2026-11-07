import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** iPad standalone Safari can lose hardware-keyboard focus while DOM focus stays unchanged. */
export const usePerformanceKeyboardFocus = (
  enabled: boolean,
  capture: RefObject<HTMLElement | null>,
  overlay: RefObject<HTMLElement | null>,
  fullscreenTarget = false
) => {
  const active = useRef(enabled);
  const touching = useRef(false);
  const pointers = useRef(new Set<number>());
  const touchSettlesAt = useRef(0);
  active.current = enabled;
  const restore = useCallback(() => {
    if (!active.current || document.visibilityState === 'hidden' || document.querySelector('dialog[open]')) return;
    // Refocusing an editable capture during an iPad touch can cancel its native
    // activation. Let the contact and compatibility mouse events finish first.
    if (touching.current || performance.now() < touchSettlesAt.current) return;
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
    const begins = (event: Event) => {
      if (event.target instanceof Node && overlay.current?.contains(event.target)) touching.current = true;
    };
    const ends = (event: TouchEvent) => {
      if (!touching.current && !(event.target instanceof Node && overlay.current?.contains(event.target))) return;
      touching.current = event.touches.length > 0 || pointers.current.size > 0;
      if (!touching.current) touchSettlesAt.current = performance.now() + 500;
    };
    const pointerDown = (event: PointerEvent) => {
      if ((event.pointerType === 'touch' || event.pointerType === 'pen')
        && event.target instanceof Node && overlay.current?.contains(event.target)) {
        pointers.current.add(event.pointerId); begins(event);
      }
    };
    const pointerUp = (event: PointerEvent) => {
      if ((event.pointerType === 'touch' || event.pointerType === 'pen') && pointers.current.delete(event.pointerId)) {
        touching.current = pointers.current.size > 0;
        if (!touching.current) touchSettlesAt.current = performance.now() + 500;
      }
    };
    const clearContact = () => { touching.current = false; pointers.current.clear(); touchSettlesAt.current = 0; };
    const visibility = () => {
      if (document.visibilityState === 'hidden') clearContact();
      else restore();
    };
    // Document capture precedes React's overlay pointer/touch capture handlers.
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointerup', pointerUp, true);
    document.addEventListener('pointercancel', pointerUp, true);
    document.addEventListener('touchstart', begins, { capture: true, passive: true });
    document.addEventListener('touchend', ends, true);
    document.addEventListener('touchcancel', ends, true);
    const frame = requestAnimationFrame(restore);
    const heartbeat = setInterval(restore, 1500);
    window.addEventListener('focus', restore);
    window.addEventListener('blur', clearContact);
    window.addEventListener('pagehide', clearContact);
    window.addEventListener('pageshow', restore);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(heartbeat);
      clearContact();
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('pointercancel', pointerUp, true);
      document.removeEventListener('touchstart', begins, true);
      document.removeEventListener('touchend', ends, true);
      document.removeEventListener('touchcancel', ends, true);
      window.removeEventListener('focus', restore);
      window.removeEventListener('blur', clearContact);
      window.removeEventListener('pagehide', clearContact);
      window.removeEventListener('pageshow', restore);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled, restore, overlay]);
  return restore;
};
