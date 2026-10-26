import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Keep keyboard focus in a sheet, including its portalled pickers. */
export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>) {
  const opener = useRef<HTMLElement | null>(null);
  const generation = useRef(0);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const currentGeneration = ++generation.current;
    const previous = document.activeElement;
    if (previous instanceof HTMLElement && !dialog.contains(previous)) opener.current = previous;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)'
    ));
    const isPicker = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('[data-placement]'));
    const focusFirst = () => controls()[0]?.focus({ preventScroll: true });
    if (!dialog.contains(previous)) focusFirst();
    const onFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node) && !isPicker(event.target)) focusFirst();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || isPicker(event.target)) return;
      const targets = controls();
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first && last) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last && first) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKey, true);
      // React restores selection during commit; restore the opener afterwards.
      queueMicrotask(() => {
        if (generation.current !== currentGeneration) return;
        if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        opener.current = null;
      });
    };
  }, [open, ref]);
}
