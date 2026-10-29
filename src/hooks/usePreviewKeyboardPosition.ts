import { useLayoutEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type RefObject } from 'react';
import type { PreviewEditorDeviceLayout } from '../lib/previewEditorLayout';

export const PREVIEW_KEYBOARD_LAYOUT_EVENT = 'preview-keyboard-layout';
export const PREVIEW_KEYBOARD_POSITION_KEY = 'chordmaster.preview-keyboard-position.v1';
type Point = { left: number; top: number };

function loadPosition(): Point | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREVIEW_KEYBOARD_POSITION_KEY) ?? 'null');
    return saved && typeof saved.left === 'number' && Number.isFinite(saved.left)
      && typeof saved.top === 'number' && Number.isFinite(saved.top)
      ? { left: saved.left, top: saved.top } : null;
  } catch { return null; }
}

export function clampKeyboardPosition(point: Point, width: number, height: number): Point {
  const viewport = window.visualViewport;
  const left = (viewport?.offsetLeft ?? 0) + 12;
  const top = (viewport?.offsetTop ?? 0) + 12;
  return {
    left: Math.max(left, Math.min(point.left, left + (viewport?.width ?? window.innerWidth) - width - 24)),
    top: Math.max(top, Math.min(point.top, top + (viewport?.height ?? window.innerHeight) - height - 24))
  };
}

/** Drag only the dedicated grip. Pointer movement never rerenders the score. */
export function usePreviewKeyboardPosition(panelRef: RefObject<HTMLElement | null>, layout: PreviewEditorDeviceLayout, scale = 1) {
  const [preferredPosition, setPreferredPosition] = useState(loadPosition);
  const [position, setPosition] = useState<Point | null>(preferredPosition);
  const drag = useRef<{ id: number; x: number; y: number; origin: Point; current: Point; width: number; height: number } | null>(null);
  const frame = useRef<number | null>(null);
  const publish = () => window.dispatchEvent(new Event(PREVIEW_KEYBOARD_LAYOUT_EVENT));
  const rememberPosition = (next: Point) => {
    setPosition(next);
    setPreferredPosition(next);
    try { window.localStorage.setItem(PREVIEW_KEYBOARD_POSITION_KEY, JSON.stringify(next)); } catch {
      // Restricted storage must not prevent moving the current keyboard.
    }
  };
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const update = () => {
      if (layout === 'desktop' && !drag.current) {
        const rect = panel.getBoundingClientRect();
        // Temporary viewport clamps must not overwrite the user's chosen location.
        const next = clampKeyboardPosition(preferredPosition ?? rect, rect.width, rect.height);
        setPosition(old => old?.left === next.left && old?.top === next.top ? old : next);
      }
      publish();
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(panel);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      drag.current = null;
    };
  // A CSS transform changes visual bounds without triggering ResizeObserver.
  }, [layout, panelRef, scale, preferredPosition]);
  useLayoutEffect(() => { publish(); }, [position]);

  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    const next = cancelled ? current.origin : current.current;
    if (panelRef.current) Object.assign(panelRef.current.style, { left: `${next.left}px`, top: `${next.top}px` });
    setPosition(next);
    if (!cancelled && (next.left !== current.origin.left || next.top !== current.origin.top)) rememberPosition(next);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    publish();
  };
  return {
    position: layout === 'desktop' ? position : null,
    gripProps: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || layout !== 'desktop' || !panelRef.current) return;
        event.preventDefault();
        const rect = panelRef.current.getBoundingClientRect();
        const origin = { left: rect.left, top: rect.top };
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin, current: origin, width: rect.width, height: rect.height };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const current = drag.current;
        const panel = panelRef.current;
        if (!current || current.id !== event.pointerId || !panel) return;
        current.current = clampKeyboardPosition({ left: current.origin.left + event.clientX - current.x, top: current.origin.top + event.clientY - current.y }, current.width, current.height);
        if (frame.current === null) frame.current = window.requestAnimationFrame(() => {
          frame.current = null;
          if (drag.current) Object.assign(panel.style, { left: `${drag.current.current.left}px`, top: `${drag.current.current.top}px` });
        });
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        const panel = panelRef.current;
        if (layout !== 'desktop' || !panel || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = panel.getBoundingClientRect();
        const step = event.shiftKey ? 40 : 10;
        rememberPosition(clampKeyboardPosition({ left: rect.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), top: rect.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) }, rect.width, rect.height));
      }
    }
  };
}
