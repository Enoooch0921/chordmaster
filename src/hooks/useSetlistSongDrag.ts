import { useCallback, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface Options {
  enabled: boolean;
  scopeKey: string;
  onMove: (sourceId: string, targetId: string) => void;
  onDraggingChange: (id: string | null) => void;
  onTargetChange: (id: string | null) => void;
}

interface Gesture {
  sourceId: string;
  pointerId: number;
  container: HTMLElement;
  scopeKey: string;
  x: number;
  y: number;
  activated: boolean;
  lastTargetId: string;
  holdId: number | null;
  frameId: number | null;
  frameTime: number | null;
  previousUserSelect: string;
  previousWebkitUserSelect: string;
  removeEvents: () => void;
}

const HOLD_MS = 180;
const EDGE_SIZE = 48;
const SCROLL_SPEED = 600;

function scrollVelocity(gesture: Gesture) {
  const { container, x, y } = gesture;
  const rect = container.getBoundingClientRect();
  if (rect.height <= 0 || container.scrollHeight <= container.clientHeight
    || x < rect.left - 24 || x > rect.right + 24) return 0;
  const edge = Math.min(EDGE_SIZE, rect.height / 3);
  if (y < rect.top + edge) return -SCROLL_SPEED * Math.min(1, (rect.top + edge - y) / edge) ** 2;
  if (y > rect.bottom - edge) return SCROLL_SPEED * Math.min(1, (y - rect.bottom + edge) / edge) ** 2;
  return 0;
}

/** Capture the stationary pane, since reparenting a keyed row can release handle capture. */
export function useSetlistSongDrag(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<Gesture | null>(null);
  const clickCleanup = useRef<(() => void) | null>(null);
  const clearClickGuard = useCallback(() => { clickCleanup.current?.(); clickCleanup.current = null; }, []);
  const guardReleaseClick = useCallback(() => {
    clearClickGuard();
    const clear = () => clearClickGuard();
    const onClick = (event: MouseEvent) => {
      if (event.detail === 0) return; // Preserve keyboard-generated activation.
      event.preventDefault(); event.stopPropagation();
      clear();
    };
    const timeout = window.setTimeout(clear, 450);
    window.addEventListener('click', onClick, true);
    window.addEventListener('pointerdown', clear, true);
    clickCleanup.current = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('pointerdown', clear, true);
    };
  }, [clearClickGuard]);

  const finish = useCallback((suppressClick = false) => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    if (current.holdId !== null) window.clearTimeout(current.holdId);
    if (current.frameId !== null) window.cancelAnimationFrame(current.frameId);
    current.removeEvents();
    try { current.container.releasePointerCapture(current.pointerId); } catch { /* Capture may already be released. */ }
    if (current.activated) {
      document.body.style.userSelect = current.previousUserSelect;
      document.body.style.setProperty('-webkit-user-select', current.previousWebkitUserSelect);
      if (suppressClick) guardReleaseClick();
    }
    latest.current.onDraggingChange(null);
    latest.current.onTargetChange(null);
  }, [guardReleaseClick]);

  const hitTest = useCallback((current: Gesture) => {
    if (!current.activated || gesture.current !== current) return;
    const card = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>('[data-setlist-song-id]');
    const targetId = card?.dataset.setlistSongId;
    if (!targetId || !current.container.contains(card!) || targetId === current.lastTargetId) return;
    current.lastTargetId = targetId;
    latest.current.onTargetChange(targetId);
    if (targetId !== current.sourceId) latest.current.onMove(current.sourceId, targetId);
  }, []);

  const scheduleScroll = useCallback(() => {
    const current = gesture.current;
    if (!current?.activated || current.frameId !== null || !scrollVelocity(current)) return;
    const tick = (time: number) => {
      if (gesture.current !== current) return;
      current.frameId = null;
      if (!current.container.isConnected) { finish(); return; }
      const elapsed = current.frameTime === null ? 16 : Math.min(32, Math.max(0, time - current.frameTime));
      current.frameTime = time;
      const before = current.container.scrollTop;
      const limit = Math.max(0, current.container.scrollHeight - current.container.clientHeight);
      current.container.scrollTop = Math.max(0, Math.min(limit, before + scrollVelocity(current) * elapsed / 1000));
      if (current.container.scrollTop !== before) {
        hitTest(current);
        if (gesture.current === current && scrollVelocity(current)) current.frameId = window.requestAnimationFrame(tick);
      } else current.frameTime = null;
    };
    current.frameTime = null;
    current.frameId = window.requestAnimationFrame(tick);
  }, [finish, hitTest]);

  const activate = useCallback(() => {
    const current = gesture.current;
    if (!current || current.activated) return;
    if (!latest.current.enabled || latest.current.scopeKey !== current.scopeKey || !current.container.isConnected) { finish(); return; }
    current.activated = true;
    current.holdId = null;
    current.previousUserSelect = document.body.style.userSelect;
    current.previousWebkitUserSelect = document.body.style.getPropertyValue('-webkit-user-select');
    document.body.style.userSelect = 'none';
    document.body.style.setProperty('-webkit-user-select', 'none');
    latest.current.onDraggingChange(current.sourceId);
    latest.current.onTargetChange(current.sourceId);
    scheduleScroll();
  }, [finish, scheduleScroll]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>, sourceId: string) => {
    if (!latest.current.enabled || event.button !== 0 || (event.pointerType === 'touch' && event.isPrimary === false)) return;
    const container = event.currentTarget.closest<HTMLElement>('[data-setlist-detail-scroll]');
    if (!container) return;
    event.preventDefault(); event.stopPropagation();
    finish(); clearClickGuard();
    const current: Gesture = {
      sourceId, pointerId: event.pointerId, container, scopeKey: latest.current.scopeKey,
      x: event.clientX, y: event.clientY, activated: false, lastTargetId: sourceId,
      holdId: null, frameId: null, frameTime: null, previousUserSelect: '', previousWebkitUserSelect: '', removeEvents: () => {}
    };
    gesture.current = current;
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== current.pointerId || gesture.current !== current) return;
      if (!latest.current.enabled || latest.current.scopeKey !== current.scopeKey || !container.isConnected
        || (move.pointerType === 'mouse' && move.buttons === 0)) { finish(); return; }
      move.preventDefault();
      current.x = move.clientX; current.y = move.clientY;
      if (!current.activated) return;
      hitTest(current); scheduleScroll();
    };
    const onUp = (up: PointerEvent) => { if (up.pointerId === current.pointerId) finish(true); };
    const onCancel = (cancel: PointerEvent) => { if (cancel.pointerId === current.pointerId) finish(); };
    const onOtherPointer = (down: PointerEvent) => { if (down.pointerId !== current.pointerId) finish(); };
    const onBlur = () => finish();
    const onVisibility = () => { if (document.visibilityState === 'hidden') finish(); };
    const onKey = (key: KeyboardEvent) => {
      if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); finish(); }
    };
    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('pointerdown', onOtherPointer, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    current.removeEvents = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('pointerdown', onOtherPointer, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // The pane survives React's keyed row moves. Window listeners remain a fallback
    // when older WebKit releases capture or does not support it for this event.
    try { container.setPointerCapture(event.pointerId); } catch { /* Continue through window listeners. */ }
    if (event.pointerType === 'touch' || event.pointerType === 'pen') current.holdId = window.setTimeout(activate, HOLD_MS);
    else activate();
  }, [activate, clearClickGuard, finish, hitTest, scheduleScroll]);

  useLayoutEffect(() => () => { finish(); clearClickGuard(); }, [options.enabled, options.scopeKey, finish, clearClickGuard]);
  return { onPointerDown, cancel: finish };
}
