import { useEffect, useRef } from 'react';

export interface HistoryGestureSession { active: boolean; direction: 'undo' | 'redo' | null; handled: boolean; finishedAt: number }
const isDialog = (target: EventTarget | null) => target instanceof Element
  && Boolean(target.closest('[role="dialog"], [aria-modal="true"]') && !target.closest('[data-preview-bar-editor]'));
const isNativeText = (target: EventTarget | null) => target instanceof Element && (
  isDialog(target)
  || Boolean(target.closest('input, textarea, select, [contenteditable]') && !target.closest('[data-song-history-input], [data-preview-chord-capture]'))
);
type Point = { x: number; y: number };
type Direction = 'undo' | 'redo' | null;

export function useThreeFingerHistory({ enabled, onUndo, onRedo }: { enabled: boolean; onUndo: () => void; onRedo: () => void }) {
  const latest = useRef({ onUndo, onRedo }); latest.current = { onUndo, onRedo };
  const session = useRef<HistoryGestureSession>({ active: false, direction: null, handled: false, finishedAt: -Infinity });
  useEffect(() => {
    if (!enabled || !(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) return;
    let gesture: { origins: Map<number, Point>; positions: Map<number, Point>; began: number; direction: Direction } | null = null;
    let blocked = false;
    const finishSession = () => {
      if (session.current.active) session.current.finishedAt = performance.now();
      session.current.active = false;
      gesture = null;
    };
    const reset = () => { finishSession(); blocked = false; };
    const reject = () => { finishSession(); blocked = true; };
    const updateDirection = (touches: Iterable<Touch>) => {
      if (!gesture) return;
      if (performance.now() - gesture.began > 900) { reject(); return; }
      for (const touch of touches) {
        if (!gesture.origins.has(touch.identifier)) { reject(); return; }
        gesture.positions.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      }
      const movements = Array.from(gesture.origins, ([id, origin]) => {
        const position = gesture!.positions.get(id)!;
        return { x: position.x - origin.x, y: position.y - origin.y };
      });
      if (movements.some(point => Math.abs(point.y) > 32)) { reject(); return; }
      const dx = movements.map(point => point.x);
      if (Math.max(...dx) - Math.min(...dx) > 36) { reject(); return; }
      gesture.direction = dx.every(x => x <= -48) ? 'undo' : dx.every(x => x >= 48) ? 'redo' : null;
      if (!session.current.handled) session.current.direction = gesture.direction;
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length === 1 && !gesture) blocked = false;
      if (event.touches.length > 3) { reject(); return; }
      if (blocked || gesture || event.touches.length !== 3 || isNativeText(event.target) || isDialog(document.activeElement)) return;
      // Reserve this dedicated gesture before Safari can latch onto native list
      // scrolling. Waiting for the 48px action threshold loses the touch stream.
      // One- and two-finger input, and gestures inside text fields, stay native.
      if (event.cancelable) event.preventDefault();
      const origins = new Map(Array.from(event.touches, touch => [touch.identifier, { x: touch.clientX, y: touch.clientY }]));
      gesture = { origins, positions: new Map(origins), began: performance.now(), direction: null };
      session.current = { active: true, direction: null, handled: false, finishedAt: -Infinity };
      // A sort/select or title field can keep focus after an earlier interaction.
      // A gesture on the list must still reach workspace history; blur commits
      // any text edit through its existing handler before history is replayed.
      if (document.activeElement instanceof HTMLElement && isNativeText(document.activeElement)) document.activeElement.blur();
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 3) { reject(); return; }
      if (event.cancelable) event.preventDefault();
      updateDirection(Array.from(event.touches));
    };
    const end = (event: TouchEvent) => {
      if (gesture) {
        // Mobile Safari may coalesce the final move; the first lifted finger
        // and the two remaining fingers together carry the final displacement.
        updateDirection([...Array.from(event.touches), ...Array.from(event.changedTouches ?? [])]);
        const direction = gesture?.direction;
        if (direction) {
          if (event.cancelable) event.preventDefault();
          const handled = session.current.handled;
          session.current.handled = true;
          session.current.direction = direction;
          reject();
          if (!handled) latest.current[direction === 'undo' ? 'onUndo' : 'onRedo']();
        } else reject();
      }
      if (!event.touches.length) reset();
    };
    const options = { capture: true, passive: false };
    window.addEventListener('touchstart', start, options);
    window.addEventListener('touchmove', move, options);
    window.addEventListener('touchend', end, options);
    window.addEventListener('touchcancel', reject, options);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('touchstart', start, true); window.removeEventListener('touchmove', move, true);
      window.removeEventListener('touchend', end, true); window.removeEventListener('touchcancel', reject, true);
      window.removeEventListener('blur', reset);
      finishSession();
    };
  }, [enabled]);
  return session;
}
