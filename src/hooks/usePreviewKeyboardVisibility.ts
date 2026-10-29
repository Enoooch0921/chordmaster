import { useLayoutEffect, type RefObject } from 'react';
import { getKeyboardAvoidanceScroll } from '../lib/previewKeyboardVisibility';
import { PREVIEW_KEYBOARD_LAYOUT_EVENT } from './usePreviewKeyboardPosition';

/** Reveal only on selection/layout changes, never while the user pans the score. */
export function usePreviewKeyboardVisibility(
  anchorKey: string | null,
  previewRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLDivElement | null>,
  sheetRef: RefObject<HTMLDivElement | null>,
  onReveal: () => void
) {
  useLayoutEffect(() => {
    if (!anchorKey) return;
    let frame = 0;
    const reveal = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const preview = previewRef.current;
        const canvas = canvasRef.current;
        const panel = document.querySelector<HTMLElement>('[data-preview-bar-editor]');
        const anchor = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('[data-preview-edit-anchor]') ?? [])
          .find(node => node.dataset.previewEditAnchor === anchorKey);
        if (!preview || !canvas || !panel || !anchor) return;
        const bar = anchor.closest<HTMLElement>('.sheet-bar') ?? anchor;
        const viewport = window.visualViewport;
        const rect = preview.getBoundingClientRect();
        const visible = { left: rect.left, right: rect.right, top: Math.max(rect.top, viewport?.offsetTop ?? 0), bottom: Math.min(rect.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) };
        const delta = getKeyboardAvoidanceScroll(bar.getBoundingClientRect(), visible, panel.getBoundingClientRect());
        if (Math.abs(delta) < 1) return;
        // A top-parked desktop keyboard can cover the first row. Add only the
        // leading pan space needed to reach the free band below it.
        if (preview.scrollTop + delta < 0) {
          const extra = -(preview.scrollTop + delta);
          canvas.style.marginTop = `${(parseFloat(canvas.style.marginTop) || 0) + extra}px`;
          preview.scrollTop += extra;
        }
        preview.scrollTop += delta;
        onReveal();
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    if (previewRef.current) observer?.observe(previewRef.current);
    reveal();
    window.addEventListener(PREVIEW_KEYBOARD_LAYOUT_EVENT, reveal);
    window.visualViewport?.addEventListener('resize', reveal);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener(PREVIEW_KEYBOARD_LAYOUT_EVENT, reveal);
      window.visualViewport?.removeEventListener('resize', reveal);
    };
  }, [anchorKey, previewRef, canvasRef, sheetRef, onReveal]);

  useLayoutEffect(() => {
    if (!anchorKey) return;
    const canvas = canvasRef.current;
    const preview = previewRef.current;
    return () => {
      if (!canvas || !preview) return;
      const extra = parseFloat(canvas.style.marginTop) || 0;
      canvas.style.marginTop = '';
      preview.scrollTop = Math.max(0, preview.scrollTop - extra);
    };
  }, [Boolean(anchorKey), canvasRef, previewRef]);
}
