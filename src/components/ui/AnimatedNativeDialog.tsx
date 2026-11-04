import { forwardRef, useCallback, useRef, type DialogHTMLAttributes } from 'react';
import { useNativeDialogMotion } from '../../hooks/useNativeDialogMotion';

/** Native dialog body for an existing conditional render inside AnimatePresence. */
const AnimatedNativeDialog = forwardRef<HTMLDialogElement, Omit<DialogHTMLAttributes<HTMLDialogElement>, 'open'> & { kind?: 'responsive' | 'modal' }>(
  function AnimatedNativeDialog({ kind = 'responsive', onKeyDown, ...props }, forwardedRef) {
    const ref = useRef<HTMLDialogElement>(null);
    const attach = useCallback((node: HTMLDialogElement | null) => {
      ref.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }, [forwardedRef]);
    useNativeDialogMotion(ref, kind);
    return <dialog {...props} ref={attach} onKeyDown={event => { onKeyDown?.(event); event.stopPropagation(); }}/>;
  }
);
export default AnimatedNativeDialog;
