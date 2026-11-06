import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

/** A touch belongs to the key pressed, even if the dock reflows before release. */
export function useKeyboardTouchPress(enabled: boolean) {
  const press = useRef<{ id: number; button: HTMLButtonElement; x: number; y: number; cancelled: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  useLayoutEffect(() => {
    // Keep the gesture until release so its compatibility click is still consumed.
    if (!enabled && press.current) press.current.cancelled = true;
  }, [enabled]);
  useEffect(() => {
    const start = (event: PointerEvent) => {
      suppressClickUntil.current = 0;
      if (press.current && press.current.id !== event.pointerId) press.current.cancelled = true;
    };
    const move = (event: PointerEvent) => {
      const current = press.current;
      if (current?.id === event.pointerId && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 12) current.cancelled = true;
    };
    const cancel = () => { press.current = null; };
    const end = (event: PointerEvent) => {
      const current = press.current;
      if (!current || current.id !== event.pointerId) return;
      move(event);
      press.current = null;
      // Consume this gesture's native compatibility click, including a different
      // button under the finger after a layout change. Keyboard clicks (detail 0) pass.
      suppressClickUntil.current = performance.now() + 500;
      if (!current.cancelled && current.button.isConnected && !current.button.disabled && !current.button.closest('[inert]')) current.button.click();
    };
    const click = (event: MouseEvent) => {
      if (event.detail === 0 || performance.now() >= suppressClickUntil.current) return;
      suppressClickUntil.current = 0;
      event.preventDefault(); event.stopPropagation();
    };
    window.addEventListener('pointerdown', start, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('click', click, true);
    window.addEventListener('blur', cancel);
    return () => {
      cancel(); suppressClickUntil.current = 0;
      window.removeEventListener('pointerdown', start, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('blur', cancel);
    };
  }, []);
  return useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0 || event.isPrimary === false || !['touch', 'pen'].includes(event.pointerType)
      || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-keyboard-surface] button');
    if (!button || button.disabled || button.closest('[inert], [data-preview-picker-popover]')) return;
    press.current = { id: event.pointerId, button, x: event.clientX, y: event.clientY, cancelled: false };
  }, [enabled]);
}
