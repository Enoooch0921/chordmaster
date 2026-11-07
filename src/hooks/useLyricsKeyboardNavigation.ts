import { useLayoutEffect, useRef, type RefObject } from 'react';

const NATIVE_KEYS = 'input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="listbox"],[role="slider"],[role="spinbutton"],[role="menu"],[role="menuitem"],[role="tree"],[role="grid"],[data-placement]';

/** Reading owns plain page keys without requiring a prior click in the canvas. */
export function useLyricsKeyboardNavigation({ reader, enabled, onNext, onPrevious }: {
  reader: RefObject<HTMLElement | null>;
  enabled: boolean;
  onNext: () => unknown;
  onPrevious: () => unknown;
}) {
  const latest = useRef({ onNext, onPrevious });
  latest.current = { onNext, onPrevious };
  useLayoutEffect(() => {
    if (!enabled) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const next = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(event.key);
      const previous = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key);
      if (!next && !previous) return;
      const root = reader.current;
      if (!root?.isConnected || root.closest('[inert],[aria-hidden="true"]')) return;
      // Performance has its own keyboard/pedal owner; the background reader
      // stays mounted, but must never turn along with that overlay.
      if (document.querySelector('[data-performance-overlay]')) return;
      const target = event.target instanceof Element ? event.target : document.activeElement;
      if (target?.closest(NATIVE_KEYS)) return;
      if (target && !root.contains(target) && target.closest('aside,nav,[role="navigation"]')) return;
      const modals = document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]:not([aria-hidden="true"]):not([inert])');
      if (Array.from(modals).some(modal => !modal.contains(root))) return;
      if (document.querySelector('[role="menu"]:not([aria-hidden="true"]):not([inert])')) return;
      event.preventDefault();
      if (next) latest.current.onNext(); else latest.current.onPrevious();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [enabled, reader]);
}
