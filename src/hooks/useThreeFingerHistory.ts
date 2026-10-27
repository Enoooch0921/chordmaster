import { useEffect, useRef } from 'react';

export interface HistoryGestureSession { active: boolean; direction: 'undo' | 'redo' | null; handled: boolean; finishedAt: number }
const isNativeText = (target: EventTarget | null) => target instanceof HTMLElement && (
  Boolean(target.closest('[role="dialog"], [aria-modal="true"]') && !target.closest('[data-preview-bar-editor]'))
  || Boolean(target.closest('input, textarea, select, [contenteditable]') && !target.closest('[data-song-history-input], [data-preview-chord-capture]'))
);
export function useThreeFingerHistory({ enabled, onUndo, onRedo }: { enabled: boolean; onUndo: () => void; onRedo: () => void }) {
  const latest = useRef({ onUndo, onRedo }); latest.current = { onUndo, onRedo };
  const session=useRef<HistoryGestureSession>({active:false,direction:null,handled:false,finishedAt:-Infinity});
  useEffect(() => {
    if (!enabled || !(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) return;
    let gesture: { points: Map<number, { x: number; y: number }>; began: number; direction: 'undo' | 'redo' | null } | null = null;
    let blocked = false;
    const reset = () => {
      if(session.current.active)session.current.finishedAt=performance.now();
      session.current.active=false;gesture=null;blocked=false;
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length === 1 && !gesture) blocked = false;
      if (event.touches.length > 3) { gesture = null; blocked = true; return; }
      if (blocked || gesture || event.touches.length !== 3 || isNativeText(event.target) || isNativeText(document.activeElement)) return;
      gesture = { points: new Map(Array.from(event.touches, touch => [touch.identifier, { x: touch.clientX, y: touch.clientY }])), began: performance.now(), direction: null };
      session.current={active:true,direction:null,handled:false,finishedAt:-Infinity};
    };
    const move = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 3) return;
      if (performance.now() - gesture.began > 900) { gesture = null; blocked = true; return; }
      const movements = Array.from(event.touches, touch => {
        const origin = gesture!.points.get(touch.identifier);
        return origin ? { x: touch.clientX - origin.x, y: touch.clientY - origin.y } : null;
      });
      if (movements.some(point => !point || Math.abs(point.y) > 32)) { gesture = null; blocked = true; return; }
      const dx = movements.map(point => point!.x);
      if (Math.max(...dx) - Math.min(...dx) > 36) { gesture = null; blocked = true; return; }
      gesture.direction = dx.every(x => x <= -48) ? 'undo' : dx.every(x => x >= 48) ? 'redo' : null;
      if(!session.current.handled)session.current.direction=gesture.direction;
      if (gesture.direction && event.cancelable) event.preventDefault();
    };
    const end = (event: TouchEvent) => {
      if (gesture?.direction) {
        const direction = gesture.direction; gesture = null; blocked = true;
        if (event.cancelable) event.preventDefault();
        if(!session.current.handled){session.current.handled=true;session.current.direction=direction;latest.current[direction === 'undo' ? 'onUndo' : 'onRedo']();}
        session.current.active=false;session.current.finishedAt=performance.now();
      } else if (event.touches.length < 3) gesture = null;
      if (!event.touches.length) reset();
    };
    const cancel = () => { gesture = null; blocked = true;session.current.active=false;session.current.finishedAt=performance.now(); };
    const options = { capture: true, passive: false };
    window.addEventListener('touchstart', start, options);
    window.addEventListener('touchmove', move, options);
    window.addEventListener('touchend', end, options);
    window.addEventListener('touchcancel', cancel, options);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('touchstart', start, true); window.removeEventListener('touchmove', move, true);
      window.removeEventListener('touchend', end, true); window.removeEventListener('touchcancel', cancel, true);
      window.removeEventListener('blur', reset);
      if(session.current.active){session.current.active=false;session.current.finishedAt=performance.now();}
    };
  }, [enabled]);
  return session;
}
