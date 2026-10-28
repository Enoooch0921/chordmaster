import { useEffect, useRef, type RefObject } from 'react';

export function useWorkspaceSwitcherDismiss({ open, rootRef, triggerRef, contextKey, onClose }: {
  open: boolean;
  rootRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  contextKey: string;
  onClose: () => void;
}) {
  const previousContext = useRef(contextKey);
  useEffect(() => {
    if (previousContext.current === contextKey) return;
    previousContext.current = contextKey;
    onClose();
  }, [contextKey, onClose]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let outsidePress: { x: number; y: number } | null = null;
    const isOutside = (target: EventTarget | null) => !(target instanceof Node && rootRef.current?.contains(target));
    const closeAfterClick = (event: MouseEvent) => {
      if (!isOutside(event.target)) return;
      // This is an inline disclosure. Let the original button's action finish
      // before collapsing it, so the first tap still selects the intended row.
      queueMicrotask(() => { if (active) onClose(); });
    };
    const pointerDown = (event: PointerEvent) => {
      outsidePress = isOutside(event.target) ? { x: event.clientX, y: event.clientY } : null;
    };
    const pointerMove = (event: PointerEvent) => {
      if (outsidePress && Math.hypot(event.clientX - outsidePress.x, event.clientY - outsidePress.y) >= 8) onClose();
    };
    const pointerCancel = () => { outsidePress = null; };
    const outsideScroll = (event: Event) => { if (isOutside(event.target)) onClose(); };
    const focusIn = (event: FocusEvent) => { if (!outsidePress && isOutside(event.target)) onClose(); };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); onClose();
      triggerRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('click', closeAfterClick, true);
    window.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('pointermove', pointerMove, { capture: true, passive: true });
    window.addEventListener('pointercancel', pointerCancel, true);
    window.addEventListener('scroll', outsideScroll, { capture: true, passive: true });
    window.addEventListener('wheel', outsideScroll, { capture: true, passive: true });
    window.addEventListener('focusin', focusIn, true);
    window.addEventListener('keydown', keyDown, true);
    return () => {
      active = false;
      window.removeEventListener('click', closeAfterClick, true);
      window.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointermove', pointerMove, true);
      window.removeEventListener('pointercancel', pointerCancel, true);
      window.removeEventListener('scroll', outsideScroll, true);
      window.removeEventListener('wheel', outsideScroll, true);
      window.removeEventListener('focusin', focusIn, true);
      window.removeEventListener('keydown', keyDown, true);
    };
  }, [open, rootRef, triggerRef, onClose]);
}
