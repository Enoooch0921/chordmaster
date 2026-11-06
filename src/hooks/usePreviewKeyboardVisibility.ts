import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, type AnimationPlaybackControls } from 'motion';
import { getKeyboardAvoidanceScroll } from '../lib/previewKeyboardVisibility';
import { PREVIEW_KEYBOARD_LAYOUT_EVENT } from './usePreviewKeyboardPosition';
import { useUiMotion } from './useUiMotion';
import { UI_DRAWER_EASE } from '../lib/uiMotion';
import { findPreviewAnchor } from '../lib/previewAnchor';

/** Keep pinned controls in bounds; scrollable keys never reserve their full scroll height. */
export function getKeyboardRestingRect(panel: HTMLElement) {
  const rect = panel.getBoundingClientRect();
  const disclosure = panel.querySelector<HTMLElement>('[data-keyboard-disclosure]');
  const content = disclosure?.querySelector<HTMLElement>('[data-keyboard-content]');
  if (!disclosure || !content) return rect;
  const scale = panel.offsetHeight ? rect.height / panel.offsetHeight : 1;
  const expandedHeight = disclosure.hasAttribute('data-keyboard-scroll-body') ? disclosure.offsetHeight : content.offsetHeight;
  const height = rect.height + ((disclosure.dataset.collapsed === 'true' ? 0 : expandedHeight) - disclosure.offsetHeight) * scale;
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
  onReveal: () => void,
  occurrence = 0
) {
  const preference = useUiMotion();
  const scrolling = useRef<AnimationPlaybackControls | null>(null);
  const destination = useRef<number | null>(null);
  const finishScroll = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const manualPosition = useRef({ anchorKey, occurrence, active: false });
  const reservation = useRef<{ preview: HTMLDivElement; canvas: HTMLDivElement; padding: string; scrollPadding: string; leading: HTMLDivElement | null; basePadding: number } | null>(null);

  const stop = () => {
    generation.current++;
    scrolling.current?.stop(); scrolling.current = null;
    destination.current = null; finishScroll.current = null;
  };
  const release = (immediate = false, preservePosition = false) => {
    const saved = reservation.current;
    if (!saved) return;
    stop();
    const token = generation.current;
    const height = parseFloat(saved.leading?.style.height ?? '') || 0;
    const scrollTop = saved.preview.scrollTop;
    saved.preview.style.paddingBottom = saved.padding;
    saved.preview.style.scrollPaddingBottom = saved.scrollPadding;
    const finish = () => {
      if (generation.current !== token || reservation.current !== saved) return;
      saved.leading?.remove(); reservation.current = null; scrolling.current = null;
      if (preservePosition) saved.preview.scrollTop = Math.max(0, scrollTop - height);
    };
    if (height && !immediate && !preference.instant && !preference.reduced) {
      // The temporary leading space is an accordion: collapse its height,
      // rather than removing a margin and snapping the first row upward.
      scrolling.current = animate(height, 0, { duration: 0.2, ease: UI_DRAWER_EASE,
        onUpdate: value => { if (generation.current === token && saved.leading) saved.leading.style.height = `${value}px`; }, onComplete: finish });
    } else finish();
  };
  const scroll = (preview: HTMLElement, top: number, complete: () => void) => {
    if (destination.current !== null && Math.abs(destination.current - top) < 1) { finishScroll.current = complete; return; }
    stop();
    const token = generation.current;
    finishScroll.current = complete;
    destination.current = top;
    const done = () => {
      if (generation.current !== token) return;
      scrolling.current = null; destination.current = null;
      const finish = finishScroll.current; finishScroll.current = null; finish?.();
    };
    if (preference.instant || preference.reduced || Math.abs(preview.scrollTop - top) < 1) {
      preview.scrollTop = top; done(); return;
    }
    scrolling.current = animate(preview.scrollTop, top, {
      duration: 0.24, ease: UI_DRAWER_EASE,
      onUpdate: value => { if (generation.current === token) preview.scrollTop = value; }, onComplete: done
    });
  };

  useLayoutEffect(() => {
    if (manualPosition.current.anchorKey !== anchorKey || manualPosition.current.occurrence !== occurrence) {
      manualPosition.current = { anchorKey, occurrence, active: false };
    }
    if (!anchorKey) {
      const saved = reservation.current;
      if (!saved) return;
      let interrupted = manualPosition.current.active;
      const releaseWhenSafe = () => {
        if (!interrupted || reservation.current !== saved) return;
        const leading = parseFloat(saved.leading?.style.height ?? '') || 0;
        const padding = parseFloat(getComputedStyle(saved.preview).paddingBottom) || 0;
        const top = saved.preview.scrollTop - leading;
        const max = Math.max(0, saved.preview.scrollHeight - saved.preview.clientHeight - padding + saved.basePadding - leading);
        // Keep only the temporary space still needed to avoid a clamp or a jump.
        // Once the user pans back into the original range, remove it in-place.
        if (top >= 0 && top <= max) release(true, true);
      };
      const interrupt = () => { interrupted = true; manualPosition.current.active = true; stop(); releaseWhenSafe(); };
      saved.preview.addEventListener('pointerdown', interrupt, { passive: true });
      saved.preview.addEventListener('touchstart', interrupt, { passive: true });
      saved.preview.addEventListener('wheel', interrupt, { passive: true });
      saved.preview.addEventListener('scroll', releaseWhenSafe, { passive: true });
      const padding = parseFloat(getComputedStyle(saved.preview).paddingBottom) || 0;
      const max = Math.max(0, saved.preview.scrollHeight - saved.preview.clientHeight - padding + saved.basePadding);
      // Keep the old space until the scroll finishes: removing it first makes
      // the browser clamp scrollTop and teleport the last rows on dismissal.
      if (interrupted) releaseWhenSafe();
      else scroll(saved.preview, Math.min(saved.preview.scrollTop, max), release);
      return () => {
        stop();
        saved.preview.removeEventListener('pointerdown', interrupt);
        saved.preview.removeEventListener('touchstart', interrupt);
        saved.preview.removeEventListener('wheel', interrupt);
        saved.preview.removeEventListener('scroll', releaseWhenSafe);
      };
    }
    stop();
    const preview = previewRef.current, canvas = canvasRef.current;
    if (!preview || !canvas) return;
    if (!reservation.current) reservation.current = {
      preview, canvas, padding: preview.style.paddingBottom, scrollPadding: preview.style.scrollPaddingBottom,
      leading: null, basePadding: parseFloat(getComputedStyle(preview).paddingBottom) || 0
    };
    let frame = 0;
    const reveal = () => {
      if (manualPosition.current.active) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (manualPosition.current.active) return;
        const preview = previewRef.current;
        const canvas = canvasRef.current;
        const panel = document.querySelector<HTMLElement>('[data-keyboard-position-shell]')
          ?? document.querySelector<HTMLElement>('[data-preview-bar-editor]');
        const anchor = findPreviewAnchor(sheetRef.current, anchorKey, occurrence);
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
      manualPosition.current.active = true;
      window.cancelAnimationFrame(frame);
      stop();
    };
    const resumeEditing = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-preview-bar-editor]')) return;
      manualPosition.current.active = false;
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
  }, [anchorKey, occurrence, previewRef, canvasRef, sheetRef, onReveal, preference.instant, preference.reduced]);

  useLayoutEffect(() => {
    return () => { stop(); release(true); };
  }, []);
}
