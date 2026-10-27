import { useEffect, useRef, type RefObject } from 'react';
import { getPreviewPinchTranslation } from '../lib/previewZoom';

export interface PreviewPinchCommit {
  scale: number;
  contentRatioX: number;
  contentRatioY: number;
  focalX: number;
  focalY: number;
}

interface Options {
  rootRef: RefObject<HTMLDivElement | null>;
  sheetRef: RefObject<HTMLDivElement | null>;
  activeRef: RefObject<boolean>;
  labelRef: RefObject<HTMLButtonElement | null>;
  enabled: boolean;
  identity: string | null;
  minScale: number;
  maxScale: number;
  fitHeightScale: number;
  onStart: () => void;
  onCommit: (value: PreviewPinchCommit) => void;
  onFinish: () => void;
  onSuppressClick: () => void;
  onSingleTouchStart?: () => void;
}

export function usePreviewPinchZoom(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    const root = options.rootRef.current;
    const sheet = options.sheetRef.current;
    if (!root || !sheet || !options.enabled) return;
    let owned = false;
    let multiFingerHistory = false;
    let frame: number | null = null;
    let gesture: {
      ids: [number, number]; distance: number; startScale: number; scale: number;
      startX: number; startY: number; centerX: number; centerY: number;
      pointX: number; pointY: number; ratioX: number; ratioY: number;
      rootLeft: number; rootTop: number; transform: string; willChange: string; label: string;
    } | null = null;
    const own = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); };
    const flush = () => {
      frame = null;
      if (!gesture) return;
      const t = getPreviewPinchTranslation(gesture.startScale, gesture.scale, gesture.pointX, gesture.pointY,
        gesture.centerX - gesture.startX, gesture.centerY - gesture.startY);
      // A direct transform avoids inherited CSS-variable invalidation across all notation glyphs.
      sheet.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${gesture.scale})`;
      if (latest.current.labelRef.current) latest.current.labelRef.current.textContent = `${Math.round(gesture.scale / latest.current.fitHeightScale * 100)}%`;
    };
    const finish = (commit: boolean) => {
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      if (!gesture) return;
      const current = gesture;
      gesture = null;
      sheet.style.transform = current.transform;
      sheet.style.willChange = current.willChange;
      if (!commit && latest.current.labelRef.current) latest.current.labelRef.current.textContent = current.label;
      if (commit) latest.current.onCommit({ scale: current.scale, contentRatioX: current.ratioX, contentRatioY: current.ratioY,
        focalX: current.centerX - current.rootLeft, focalY: current.centerY - current.rootTop });
      options.activeRef.current = false;
      latest.current.onFinish();
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length >= 3) {
        multiFingerHistory = true;
        if (owned) { finish(false); owned = false; latest.current.onSuppressClick(); }
        return;
      }
      if (multiFingerHistory) return;
      if (!owned && event.touches.length === 1) latest.current.onSingleTouchStart?.();
      if (event.touches.length !== 2 || gesture) { if (owned) own(event); return; }
      const a = event.touches[0], b = event.touches[1];
      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      if (!distance) return;
      own(event); owned = true;
      latest.current.onStart();
      const rect = sheet.getBoundingClientRect(), rootRect = root.getBoundingClientRect();
      const scale = rect.width / Math.max(1, sheet.offsetWidth);
      const centerX = (a.clientX + b.clientX) / 2, centerY = (a.clientY + b.clientY) / 2;
      gesture = { ids: [a.identifier, b.identifier], distance, startScale: scale, scale,
        startX: centerX, startY: centerY, centerX, centerY,
        pointX: (centerX - rect.left) / scale, pointY: (centerY - rect.top) / scale,
        ratioX: (centerX - rect.left) / Math.max(1, rect.width), ratioY: (centerY - rect.top) / Math.max(1, rect.height),
        rootLeft: rootRect.left, rootTop: rootRect.top, transform: sheet.style.transform, willChange: sheet.style.willChange,
        label: latest.current.labelRef.current?.textContent ?? '' };
      options.activeRef.current = true;
      sheet.style.willChange = 'transform';
    };
    const move = (event: TouchEvent) => {
      if (!owned) return;
      own(event);
      if (!gesture) return;
      const touches = Array.from(event.touches);
      const a = touches.find(t => t.identifier === gesture!.ids[0]), b = touches.find(t => t.identifier === gesture!.ids[1]);
      if (!a || !b) return;
      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      gesture.scale = Math.min(latest.current.maxScale, Math.max(latest.current.minScale, gesture.startScale * distance / gesture.distance));
      gesture.centerX = (a.clientX + b.clientX) / 2;
      gesture.centerY = (a.clientY + b.clientY) / 2;
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const end = (event: TouchEvent) => {
      if (multiFingerHistory) { if (!event.touches.length) multiFingerHistory = false; return; }
      if (!owned) return;
      own(event);
      const ids = Array.from(event.touches, t => t.identifier);
      if (gesture && !gesture.ids.every(id => ids.includes(id))) finish(true);
      // Keep the remaining finger from turning the completed pinch into a native pan.
      if (!event.touches.length) { owned = false; latest.current.onSuppressClick(); }
    };
    const resize = () => {
      multiFingerHistory = false;
      if (!owned) return;
      finish(false);
      owned = false;
      latest.current.onSuppressClick();
    };
    const cancel = () => {
      multiFingerHistory = false;
      if (!owned) return;
      finish(false); owned = false; latest.current.onSuppressClick();
    };
    const listenerOptions = { passive: false, capture: true };
    root.addEventListener('touchstart', start, listenerOptions);
    root.addEventListener('touchmove', move, listenerOptions);
    root.addEventListener('touchend', end, listenerOptions);
    root.addEventListener('touchcancel', cancel, listenerOptions);
    window.addEventListener('resize', resize);
    return () => {
      root.removeEventListener('touchstart', start, true);
      root.removeEventListener('touchmove', move, true);
      root.removeEventListener('touchend', end, true);
      root.removeEventListener('touchcancel', cancel, true);
      window.removeEventListener('resize', resize);
      finish(false);
    };
  }, [options.rootRef, options.sheetRef, options.activeRef, options.enabled, options.identity]);
}
