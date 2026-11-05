import { useEffect } from 'react';

/** Keep Safari's text selection/callout UI out of an active handwriting session. */
export function useHandwritingSelectionGuard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    document.body.setAttribute('data-handwriting-active', '');
    const editable = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      return Boolean(element?.closest('input, textarea, [contenteditable="true"]'));
    };
    const preventSelection = (event: Event) => { if (!editable(event.target)) event.preventDefault(); };
    const clearSelection = () => {
      const selection = document.getSelection();
      if (selection && !selection.isCollapsed && !editable(document.activeElement)) selection.removeAllRanges();
    };
    clearSelection();
    document.addEventListener('selectstart', preventSelection, true);
    document.addEventListener('contextmenu', preventSelection, true);
    document.addEventListener('dragstart', preventSelection, true);
    document.addEventListener('selectionchange', clearSelection);
    return () => {
      document.body.removeAttribute('data-handwriting-active');
      document.removeEventListener('selectstart', preventSelection, true);
      document.removeEventListener('contextmenu', preventSelection, true);
      document.removeEventListener('dragstart', preventSelection, true);
      document.removeEventListener('selectionchange', clearSelection);
    };
  }, [enabled]);
}
