import { useLayoutEffect, useRef } from 'react';
import { useUiMotion } from '../../hooks/useUiMotion';
import { UI_EASE_OUT } from '../../lib/uiMotion';

type Box = { left: number; top: number; width: number; height: number };
interface Props {
  value: string;
  layoutKey: string;
  selection?: 'single' | 'range';
}

/** Follow one selected button, or a contiguous group, using their actual boxes. */
export default function MeasuredSlidingSelection({ value, layoutKey, selection = 'single' }: Props) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const animation = useRef<Animation | null>(null);
  const previous = useRef<{ value: string; layoutKey: string; geometry: string; box: Box } | null>(null);
  const refresh = useRef<(animateChange: boolean) => void>(() => {});
  const preference = useUiMotion();

  useLayoutEffect(() => {
    refresh.current = animateChange => {
      const marker = markerRef.current, container = marker?.parentElement;
      if (!container || !marker) return;
      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(':scope > button'));
      const selected = buttons.flatMap((button, index) => button.getAttribute('aria-pressed') === 'true' ? [index] : []);
      const boxes = buttons.map(button => ({ left: button.offsetLeft, top: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight }));
      const first = boxes[selected[0]], last = boxes[selected[selected.length - 1]];
      const contiguous = selected.every((index, offset) => index === selected[0] + offset);
      const box = first && (selection === 'single' ? first : contiguous
        ? { ...first, width: last.left + last.width - first.left } : null);
      // Hidden controls and unexpected wrapping retain their ordinary selected fill.
      if (!box?.width || !box.height || boxes.some(candidate => candidate.top !== box.top)) {
        animation.current?.cancel(); animation.current = null;
        delete container.dataset.selectionReady;
        previous.current = null;
        return;
      }
      const geometry = JSON.stringify(boxes);
      const old = previous.current;
      const changed = old?.value !== value;
      const sameLayout = old?.layoutKey === layoutKey && old.geometry === geometry;
      const shouldAnimate = Boolean(animateChange && changed && sameLayout && !preference.instant && !preference.reduced && typeof marker.animate === 'function');
      if (!changed && sameLayout && !preference.instant && !preference.reduced) {
        container.dataset.selectionReady = 'true';
        return;
      }

      let from = old?.box;
      if (shouldAnimate && animation.current?.playState === 'running') {
        // Retarget from the current visual frame rather than the previous destination.
        const visible = marker.getBoundingClientRect(), parent = container.getBoundingClientRect();
        const scaleX = container.offsetWidth ? parent.width / container.offsetWidth : 1;
        const scaleY = container.offsetHeight ? parent.height / container.offsetHeight : 1;
        if (scaleX > 0 && scaleY > 0) from = {
          left: (visible.left - parent.left) / scaleX - container.clientLeft,
          top: (visible.top - parent.top) / scaleY - container.clientTop,
          width: visible.width / scaleX, height: visible.height / scaleY
        };
      }
      animation.current?.cancel(); animation.current = null;
      Object.assign(marker.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      container.dataset.selectionReady = 'true';
      previous.current = { value, layoutKey, geometry, box };
      if (shouldAnimate && from) {
        const next = marker.animate([
          { transform: `translate3d(${from.left - box.left}px, ${from.top - box.top}px, 0) scale(${from.width / box.width}, ${from.height / box.height})` },
          { transform: 'translate3d(0, 0, 0) scale(1, 1)' }
        ], { duration: 160, easing: `cubic-bezier(${UI_EASE_OUT.join(',')})` });
        animation.current = next;
        next.onfinish = () => { if (animation.current === next) animation.current = null; };
      }
    };
    refresh.current(true);
  }, [value, layoutKey, selection, preference.instant, preference.reduced]);

  useLayoutEffect(() => {
    const container = markerRef.current?.parentElement;
    if (!container) return;
    const resize = () => refresh.current(false);
    const stopForKeyboard = () => { animation.current?.cancel(); animation.current = null; };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(container);
    container.querySelectorAll(':scope > button').forEach(button => observer?.observe(button));
    window.addEventListener('resize', resize);
    document.addEventListener('keydown', stopForKeyboard, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('keydown', stopForKeyboard, true);
      animation.current?.cancel(); animation.current = null;
      delete container.dataset.selectionReady;
    };
  }, [layoutKey]);

  return <span ref={markerRef} aria-hidden="true" className="ui-measured-selection" />;
}
