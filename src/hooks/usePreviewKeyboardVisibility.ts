import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, type AnimationPlaybackControls } from 'motion';
import { getKeyboardAvoidanceScroll } from '../lib/previewKeyboardVisibility';
import { PREVIEW_KEYBOARD_LAYOUT_EVENT } from './usePreviewKeyboardPosition';
import { useUiMotion } from './useUiMotion';
import { UI_DRAWER_EASE } from '../lib/uiMotion';

/** Use the final accordion height, not each in-flight frame, when making room. */
export function getKeyboardRestingRect(panel: HTMLElement) {
  const rect = panel.getBoundingClientRect();
  const disclosure = panel.querySelector<HTMLElement>('[data-keyboard-disclosure]');
  const content = disclosure?.querySelector<HTMLElement>('[data-keyboard-content]');
  if (!disclosure || !content) return rect;
  const scale = panel.offsetHeight ? rect.height / panel.offsetHeight : 1;
  const height = rect.height + ((disclosure.dataset.collapsed === 'true' ? 0 : content.offsetHeight) - disclosure.offsetHeight) * scale;
  return panel.hasAttribute('data-keyboard-docked')
    ? { left: rect.left, right: rect.right, top: rect.bottom - height, bottom: rect.bottom, height }
    : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.top + height, height };
}

/** Reveal only on selection/layout changes, never while the user pans the score. */
export function usePreviewKeyboardVisibility(
  anchorKey: string | null,
  previewRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLDivElement | null>,
  sheetRef: RefObject<HTMLDivElement | null>,
  onReveal: () => void
) {
  const preference = useUiMotion();
  const scrolling = useRef<AnimationPlaybackControls | null>(null);
  const destination = useRef<number | null>(null);
  const finishScroll = useRef<(() => void) | null>(null);
  const reservation = useRef<{ preview: HTMLDivElement; canvas: HTMLDivElement; padding: string; scrollPadding: string; leading: HTMLDivElement | null; basePadding: number } | null>(null);

  const stop = () => {
    scrolling.current?.stop(); scrolling.current = null;
    destination.current = null; finishScroll.current = null;
  };
  const release = (immediate = false) => {
    const saved = reservation.current;
    if (!saved) return;
    saved.preview.style.paddingBottom = saved.padding;
    saved.preview.style.scrollPaddingBottom = saved.scrollPadding;
    const finish = () => { saved.leading?.remove(); reservation.current = null; scrolling.current = null; };
    const height = parseFloat(saved.leading?.style.height ?? '') || 0;
    if (height && !immediate && !preference.instant && !preference.reduced) {
      // The temporary leading space is an accordion: collapse its height,
      // rather than removing a margin and snapping the first row upward.
      scrolling.current = animate(height, 0, { duration: 0.2, ease: UI_DRAWER_EASE,
        onUpdate: value => { if (saved.leading) saved.leading.style.height = `${value}px`; }, onComplete: finish });
    } else finish();
  };
  const scroll = (preview: HTMLElement, top: number, complete: () => void) => {
    finishScroll.current = complete;
    if (destination.current !== null && Math.abs(destination.current - top) < 1) return;
    scrolling.current?.stop();
    destination.current = top;
    const done = () => {
      scrolling.current = null; destination.current = null;
      const finish = finishScroll.current; finishScroll.current = null; finish?.();
    };
    if (preference.instant || preference.reduced || Math.abs(preview.scrollTop - top) < 1) {
      preview.scrollTop = top; done(); return;
    }
    scrolling.current = animate(preview.scrollTop, top, {
      duration: 0.24, ease: UI_DRAWER_EASE,
      onUpdate: value => { preview.scrollTop = value; }, onComplete: done
    });
  };

  useLayoutEffect(() => {
    if (!anchorKey) {
      const saved = reservation.current;
      if (!saved) return;
      const padding = parseFloat(getComputedStyle(saved.preview).paddingBottom) || 0;
      const max = Math.max(0, saved.preview.scrollHeight - saved.preview.clientHeight - padding + saved.basePadding);
      // Keep the old space until the scroll finishes: removing it first makes
      // the browser clamp scrollTop and teleport the last rows on dismissal.
      scroll(saved.preview, Math.min(saved.preview.scrollTop, max), release);
      return stop;
    }
    stop();
    const preview = previewRef.current, canvas = canvasRef.current;
    if (!preview || !canvas) return;
    if (!reservation.current) reservation.current = {
      preview, canvas, padding: preview.style.paddingBottom, scrollPadding: preview.style.scrollPaddingBottom,
      leading: null, basePadding: parseFloat(getComputedStyle(preview).paddingBottom) || 0
    };
    let frame = 0;
    let manuallyPositioned = false;
    const reveal = () => {
      if (manuallyPositioned) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (manuallyPositioned) return;
        const preview = previewRef.current;
        const canvas = canvasRef.current;
        const panel = document.querySelector<HTMLElement>('[data-keyboard-position-shell]')
          ?? document.querySelector<HTMLElement>('[data-preview-bar-editor]');
        const anchor = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('[data-preview-edit-anchor]') ?? [])
          .find(node => node.dataset.previewEditAnchor === anchorKey);
        if (!preview || !canvas || !panel || !anchor) return;
        const bar = anchor.closest<HTMLElement>('.sheet-bar') ?? anchor;
        const viewport = window.visualViewport;
        const rect = preview.getBoundingClientRect();
        const visible = { left: rect.left, right: rect.right, top: Math.max(rect.top, viewport?.offsetTop ?? 0), bottom: Math.min(rect.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) };
        const bounds = getKeyboardRestingRect(panel);
        const saved = reservation.current;
        if (!saved) return;
        const inset = Math.max(saved.basePadding, Math.round(bounds.height) + 16);
        const currentPadding = parseFloat(getComputedStyle(preview).paddingBottom) || 0;
        const applyInset = () => { preview.style.paddingBottom = `${inset}px`; preview.style.scrollPaddingBottom = `${inset}px`; };
        // Grow the reachable scroll area immediately; defer shrinking it if
        // doing so would clamp the viewport in the middle of a transition.
        if (inset >= currentPadding) applyInset();
        const delta = getKeyboardAvoidanceScroll(bar.getBoundingClientRect(), visible, bounds);
        // A top-parked desktop keyboard can cover the first row. Add only the
        // leading pan space needed to reach the free band below it.
        if (preview.scrollTop + delta < 0) {
          const extra = -(preview.scrollTop + delta);
          if (!saved.leading) {
            saved.leading = document.createElement('div');
            saved.leading.dataset.keyboardLeadingSpace = '';
            saved.leading.setAttribute('aria-hidden', 'true');
            preview.insertBefore(saved.leading, canvas);
          }
          saved.leading.style.height = `${(parseFloat(saved.leading.style.height) || 0) + extra}px`;
          preview.scrollTop += extra;
        }
        const actualPadding = parseFloat(getComputedStyle(preview).paddingBottom) || 0;
        const max = Math.max(0, preview.scrollHeight - preview.clientHeight - actualPadding + inset);
        const before = preview.scrollTop;
        scroll(preview, Math.max(0, Math.min(max, before + delta)), () => {
          applyInset();
          if (Math.abs(preview.scrollTop - before) >= 1) onReveal();
        });
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    if (previewRef.current) observer?.observe(previewRef.current);
    const panel = document.querySelector<HTMLElement>('[data-keyboard-position-shell]')
      ?? document.querySelector<HTMLElement>('[data-preview-bar-editor]');
    if (panel) observer?.observe(panel);
    // User panning wins immediately, at its current position, without jumping
    // to the animation's destination or repeatedly revealing the selected bar.
    const interrupt = () => {
      manuallyPositioned = true;
      window.cancelAnimationFrame(frame);
      stop();
    };
    const resumeEditing = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-preview-bar-editor]')) return;
      manuallyPositioned = false;
      reveal();
    };
    preview.addEventListener('pointerdown', interrupt, { passive: true });
    preview.addEventListener('touchstart', interrupt, { passive: true });
    preview.addEventListener('wheel', interrupt, { passive: true });
    document.addEventListener('pointerdown', resumeEditing, true);
    reveal();
    window.addEventListener(PREVIEW_KEYBOARD_LAYOUT_EVENT, reveal);
    window.visualViewport?.addEventListener('resize', reveal);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      stop();
      preview.removeEventListener('pointerdown', interrupt);
      preview.removeEventListener('touchstart', interrupt);
      preview.removeEventListener('wheel', interrupt);
      document.removeEventListener('pointerdown', resumeEditing, true);
      window.removeEventListener(PREVIEW_KEYBOARD_LAYOUT_EVENT, reveal);
      window.visualViewport?.removeEventListener('resize', reveal);
    };
  }, [anchorKey, previewRef, canvasRef, sheetRef, onReveal, preference.instant, preference.reduced]);

  useLayoutEffect(() => {
    return () => { stop(); release(true); };
  }, []);
}
