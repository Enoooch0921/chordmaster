import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { ReadingAnchor } from '../utils/lyricsReading';

const clampReadingSize = (size: number) => Math.max(20, Math.min(40, size));

/** Preview the pinch at the fingers. Repaginate only when the fingers lift. */
export function useLyricsPinch(canvas: RefObject<HTMLDivElement | null>, identity: string, fontSize: number,
  onSizeChange?: (size: number, anchor?: ReadingAnchor) => void) {
  const latest = useRef({ fontSize, onSizeChange });
  latest.current = { fontSize, onSizeChange };
  const enabled = !!onSizeChange;
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root || !enabled) return;
    let pinch: { first: number; second: number; distance: number; initial: number; size: number;
      columns: HTMLElement; anchor?: ReadingAnchor } | undefined;
    let suppress = false;
    let clickUntil = 0;
    const clear = () => {
      if (!pinch) return;
      pinch.columns.style.removeProperty('transform');
      pinch.columns.style.removeProperty('transform-origin');
      delete root.dataset.lyricsPinching;
      pinch = undefined;
    };
    const span = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const start = (event: TouchEvent) => {
      if (event.touches.length === 1) { clear(); suppress = false; clickUntil = 0; return; }
      if (suppress) { if (event.touches.length !== 2) clear(); return; }
      suppress = true;
      const touches = Array.from(event.touches);
      if (touches.length !== 2 || touches.some(t => (t as Touch & { touchType?: string }).touchType === 'stylus'
        || (t.target && !root.contains(t.target as Node))) || root.querySelector('[data-pen-contact]')) { clear(); return; }
      const [a, b] = touches;
      const distance = span(a, b), columns = root.querySelector<HTMLElement>('.alr-columns');
      if (!distance || !columns) return;
      const x = (a.clientX + b.clientX) / 2, y = (a.clientY + b.clientY) / 2;
      const bounds = columns.getBoundingClientRect();
      const row = document.elementFromPoint?.(x, y)?.closest<HTMLElement>('[data-reading-row]');
      // While writing, hit testing reaches the ink SVG rather than the lyric.
      const focus = row && columns.contains(row) ? row : Array.from(columns.querySelectorAll<HTMLElement>('[data-reading-row]')).find(node => {
        const r = node.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
      const blockId = focus?.closest<HTMLElement>('[data-reading-section]')?.dataset.readingSection;
      const initial = latest.current.fontSize;
      pinch = { first: a.identifier, second: b.identifier, distance, initial, size: initial, columns,
        anchor: blockId && focus ? { blockId, line: Number(focus.dataset.readingRow) } : undefined };
      columns.style.transformOrigin = `${x - bounds.left}px ${y - bounds.top}px`;
      root.dataset.lyricsPinching = '';
      // Let the page-turn recognizer see the second finger and cancel its tap.
      if (event.cancelable) event.preventDefault();
    };
    const update = (touches: Touch[]) => {
      if (!pinch) return;
      const a = touches.find(t => t.identifier === pinch!.first), b = touches.find(t => t.identifier === pinch!.second);
      if (!a || !b) return;
      pinch.size = clampReadingSize(pinch.initial * span(a, b) / pinch.distance);
      pinch.columns.style.transform = `scale(${pinch.size / pinch.initial})`;
    };
    const move = (event: TouchEvent) => {
      if (!pinch) return;
      if (event.touches.length !== 2) { clear(); return; }
      if (event.cancelable) event.preventDefault();
      update(Array.from(event.touches));
    };
    const end = (event: TouchEvent) => {
      if (!suppress) return;
      if (pinch) {
        const ids = Array.from(event.touches, t => t.identifier);
        if (ids.includes(pinch.first) && ids.includes(pinch.second)) return;
        if (event.cancelable) event.preventDefault();
        update([...Array.from(event.touches), ...Array.from(event.changedTouches)]);
        const { size, initial, anchor } = pinch;
        clear();
        const rounded = Math.round(size / 2) * 2;
        if (initial !== rounded) latest.current.onSizeChange?.(rounded, anchor);
      }
      if (!event.touches.length) { suppress = false; clickUntil = performance.now() + 700; }
    };
    const cancel = () => { if (suppress) { clear(); suppress = false; clickUntil = performance.now() + 700; } };
    const click = (event: MouseEvent) => {
      if (event.detail && (suppress || performance.now() < clickUntil)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const pointer = (event: PointerEvent) => { if (event.pointerType === 'mouse') clickUntil = 0; };
    const opts = { capture: true, passive: false };
    root.addEventListener('touchstart', start, opts); root.addEventListener('touchmove', move, opts);
    root.addEventListener('touchend', end, opts); root.addEventListener('touchcancel', cancel, opts);
    root.addEventListener('click', click, true); root.addEventListener('pointerdown', pointer, true);
    window.addEventListener('resize', cancel); window.addEventListener('blur', cancel);
    return () => {
      clear();
      root.removeEventListener('touchstart', start, true); root.removeEventListener('touchmove', move, true);
      root.removeEventListener('touchend', end, true); root.removeEventListener('touchcancel', cancel, true);
      root.removeEventListener('click', click, true); root.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('resize', cancel); window.removeEventListener('blur', cancel);
    };
  }, [canvas, identity, enabled]);
}
