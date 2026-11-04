import { useLayoutEffect, useRef, type RefObject } from 'react';
import { usePresence } from 'motion/react';
import { isKeyboardInteraction, useUiMotion } from './useUiMotion';
import { UI_DRAWER_EASE, UI_EASE_OUT } from '../lib/uiMotion';

let nativeLocks = 0;
let previousBodyOverflow = '';

/** Retain the native top layer, focus trap and scroll lock through visual exit. */
export function useNativeDialogMotion(ref: RefObject<HTMLDialogElement | null>, kind: 'responsive' | 'modal' = 'responsive') {
  const [present, safeToRemove] = usePresence();
  const safe = useRef(safeToRemove); safe.current = safeToRemove;
  const preference = useUiMotion();
  const animation = useRef<Animation | null>(null);
  const generation = useRef(0);
  const hasEntered = useRef(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (nativeLocks++ === 0) previousBodyOverflow = document.body.style.overflow;
    hasEntered.current = false;
    dialog.dataset.nativeDialogMotion = '';
    dialog.dataset.nativeDialogBackdrop = 'hidden';
    if (!dialog.open) dialog.showModal();
    // Establish the backdrop's first style explicitly; Safari need not support
    // discrete display/overlay transitions to fade this native pseudo-element.
    if (typeof dialog.animate === 'function') void getComputedStyle(dialog, '::backdrop').opacity;
    document.body.style.overflow = 'hidden';
    return () => {
      generation.current++; animation.current?.cancel();
      try { if (dialog.open) dialog.close(); }
      finally { if (--nativeLocks === 0) document.body.style.overflow = previousBodyOverflow; }
    };
  }, [ref]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const current = getComputedStyle(dialog);
    const from = { opacity: Number(current.opacity) || 0, transform: current.transform || 'none' };
    animation.current?.cancel();
    const token = ++generation.current;
    const initial = !hasEntered.current;
    hasEntered.current = true;
    if (present) dialog.removeAttribute('inert');
    else dialog.setAttribute('inert', '');
    if (present) { dialog.removeAttribute('aria-hidden'); delete dialog.dataset.nativeDialogClosing; dialog.dataset.nativeDialogBackdrop = 'visible'; }
    else { dialog.setAttribute('aria-hidden', 'true'); dialog.dataset.nativeDialogClosing = ''; dialog.dataset.nativeDialogBackdrop = 'hidden'; }
    const instant = isKeyboardInteraction() || typeof dialog.animate !== 'function';
    if (instant) dialog.dataset.nativeDialogInstant = '';
    else delete dialog.dataset.nativeDialogInstant;
    // Presence records exits in its parent's layout effect. Complete after that
    // commit even when no visual animation runs, or the native top layer can stick.
    const completeInstantExit = () => queueMicrotask(() => {
      if (generation.current === token && !present) safe.current?.();
    });
    if (instant) { if (!present) completeInstantExit(); return; }
    const sheet = kind === 'responsive' && window.innerWidth < 640;
    const reduced = preference.reduced;
    const hidden = reduced ? 'none' : sheet ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 8px, 0) scale(0.97)';
    const visible = 'translate3d(0, 0px, 0) scale(1)';
    const duration = reduced ? 0.125 : sheet ? present ? 0.24 : 0.2 : present ? 0.2 : 0.16;
    const ease = sheet ? UI_DRAWER_EASE : UI_EASE_OUT;
    const start = present && initial ? { opacity: reduced || !sheet ? 0 : 1, transform: hidden } : { ...from, ...(reduced ? { transform: 'none' } : {}) };
    const end = present ? { opacity: 1, transform: reduced ? 'none' : visible } : { opacity: reduced || !sheet ? 0 : 1, transform: hidden };
    dialog.dataset.nativeDialogSheet = sheet ? 'true' : 'false';
    const motion = dialog.animate([start, end], { duration: duration * 1000, easing: `cubic-bezier(${ease.join(',')})`, fill: 'both' });
    if (!motion?.finished) { if (!present) completeInstantExit(); return; }
    animation.current = motion;
    void motion.finished.then(() => {
      if (generation.current !== token) return;
      if (!present) safe.current?.();
      else motion.cancel();
    }).catch(() => {});
  }, [present, preference.reduced, kind, ref]);
}
