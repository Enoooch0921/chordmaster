import { useCallback, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface Options {
  enabled: boolean;
  scopeKey: string;
  items?: readonly { id: string }[];
  onMove: (sourceId: string, targetId: string) => void;
  onDraggingChange: (id: string | null) => void;
  onTargetChange: (id: string | null) => void;
}

interface DragRow {
  id: string;
  node: HTMLElement;
  top: number;
  height: number;
  transform: string;
  transition: string;
  willChange: string;
}

interface Gesture {
  sourceId: string;
  pointerId: number;
  container: HTMLElement;
  scopeKey: string;
  x: number;
  y: number;
  activated: boolean;
  startY: number;
  startScrollTop: number;
  items: Options['items'];
  rows: DragRow[];
  bounds: { left: number; right: number };
  sourceIndex: number;
  targetIndex: number;
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

/** Capture the stationary pane; stage direct row feedback without changing song order. */
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
    for (const row of current.rows) {
      row.node.style.transform = row.transform;
      row.node.style.transition = row.transition;
      row.node.style.willChange = row.willChange;
      delete row.node.dataset.setlistDragNeighbor;
      delete row.node.dataset.setlistDragging;
    }
    try { current.container.releasePointerCapture(current.pointerId); } catch { /* Capture may already be released. */ }
    if (current.activated) {
      document.body.style.userSelect = current.previousUserSelect;
      document.body.style.setProperty('-webkit-user-select', current.previousWebkitUserSelect);
      if (suppressClick) guardReleaseClick();
    }
    latest.current.onDraggingChange(null);
    latest.current.onTargetChange(null);
  }, [guardReleaseClick]);

  const valid = useCallback((current: Gesture) => latest.current.enabled
    && latest.current.scopeKey === current.scopeKey && latest.current.items === current.items
    && current.container.isConnected
    && current.rows.every(row => row.node.isConnected && current.container.contains(row.node)), []);

  // A preview changes only compositor transforms. The document order and charts
  // remain untouched until release, even when the pointer crosses many songs.
  const paint = useCallback((current: Gesture) => {
    if (!current.activated || gesture.current !== current) return;
    const source = current.rows[current.sourceIndex];
    const dy = current.y - current.startY + current.container.scrollTop - current.startScrollTop;
    const center = source.top + source.height / 2 + dy;
    source.node.style.transform = `translate3d(0, ${dy}px, 0)`;
    if (current.x < current.bounds.left - 24 || current.x > current.bounds.right + 24) return;
    const targetIndex = current.rows.filter((row, index) => index !== current.sourceIndex
      && row.top + row.height / 2 < center).length;
    if (targetIndex === current.targetIndex) return;
    current.targetIndex = targetIndex;
    current.rows.forEach((row, index) => {
      if (index === current.sourceIndex) return;
      const offset = current.sourceIndex < targetIndex && index > current.sourceIndex && index <= targetIndex
        ? -source.height
        : current.sourceIndex > targetIndex && index >= targetIndex && index < current.sourceIndex
          ? source.height : 0;
      row.node.style.transform = offset ? `translate3d(0, ${offset}px, 0)` : row.transform;
    });
  }, []);

  const scheduleFrame = useCallback(() => {
    const current = gesture.current;
    if (!current?.activated || current.frameId !== null) return;
    const tick = (time: number) => {
      if (gesture.current !== current) return;
      current.frameId = null;
      if (!valid(current)) { finish(); return; }
      const velocity = scrollVelocity(current);
      const elapsed = current.frameTime === null ? 16 : Math.min(32, Math.max(0, time - current.frameTime));
      current.frameTime = time;
      const before = current.container.scrollTop;
      const limit = Math.max(0, current.container.scrollHeight - current.container.clientHeight);
      current.container.scrollTop = Math.max(0, Math.min(limit, before + velocity * elapsed / 1000));
      paint(current);
      if (velocity && current.container.scrollTop !== before) current.frameId = window.requestAnimationFrame(tick);
      else current.frameTime = null;
    };
    current.frameId = window.requestAnimationFrame(tick);
  }, [finish, paint, valid]);

  const activate = useCallback(() => {
    const current = gesture.current;
    if (!current || current.activated) return;
    if (!latest.current.enabled || latest.current.scopeKey !== current.scopeKey || !current.container.isConnected) { finish(); return; }
    current.bounds = current.container.getBoundingClientRect();
    current.rows = Array.from(current.container.querySelectorAll<HTMLElement>('[data-setlist-song-id]')).map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.setlistSongId!, node, top: rect.top, height: rect.height,
        transform: node.style.transform, transition: node.style.transition, willChange: node.style.willChange };
    });
    current.sourceIndex = current.rows.findIndex(row => row.id === current.sourceId);
    if (current.sourceIndex < 0) { finish(); return; }
    current.targetIndex = current.sourceIndex;
    current.startScrollTop = current.container.scrollTop;
    current.rows.forEach((row, index) => {
      if (index === current.sourceIndex) {
        row.node.style.transition = 'none';
        row.node.style.willChange = 'transform';
        row.node.dataset.setlistDragging = '';
      } else row.node.dataset.setlistDragNeighbor = '';
    });
    current.activated = true;
    current.holdId = null;
    current.previousUserSelect = document.body.style.userSelect;
    current.previousWebkitUserSelect = document.body.style.getPropertyValue('-webkit-user-select');
    document.body.style.userSelect = 'none';
    document.body.style.setProperty('-webkit-user-select', 'none');
    latest.current.onDraggingChange(current.sourceId);
    latest.current.onTargetChange(null);
    scheduleFrame();
  }, [finish, scheduleFrame]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>, sourceId: string) => {
    if (!latest.current.enabled || event.button !== 0 || (event.pointerType === 'touch' && event.isPrimary === false)) return;
    const container = event.currentTarget.closest<HTMLElement>('[data-setlist-detail-scroll]');
    if (!container) return;
    event.preventDefault(); event.stopPropagation();
    finish(); clearClickGuard();
    const current: Gesture = {
      sourceId, pointerId: event.pointerId, container, scopeKey: latest.current.scopeKey,
      x: event.clientX, y: event.clientY, startY: event.clientY, startScrollTop: container.scrollTop,
      items: latest.current.items, rows: [], bounds: { left: 0, right: 0 }, sourceIndex: -1, targetIndex: -1, activated: false,
      holdId: null, frameId: null, frameTime: null, previousUserSelect: '', previousWebkitUserSelect: '', removeEvents: () => {}
    };
    gesture.current = current;
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== current.pointerId || gesture.current !== current) return;
      if (!valid(current) || (move.pointerType === 'mouse' && move.buttons === 0)) { finish(); return; }
      move.preventDefault();
      current.x = move.clientX; current.y = move.clientY;
      if (!current.activated) return;
      scheduleFrame();
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== current.pointerId || gesture.current !== current) return;
      try {
        if (current.activated && valid(current)) {
          paint(current);
          const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-setlist-song-id]'));
          const unchanged = rows.length === current.rows.length && rows.every((row, index) => row === current.rows[index].node);
          if (unchanged && current.targetIndex !== current.sourceIndex) {
            // Commit while the existing history group is still active; ending the
            // gesture afterwards preserves its one-step undo and save safeguards.
            latest.current.onMove(current.sourceId, current.rows[current.targetIndex].id);
          }
        }
      } finally { finish(true); }
    };
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
    window.addEventListener('resize', onBlur);
    container.addEventListener('scroll', scheduleFrame, { passive: true });
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    current.removeEvents = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('pointerdown', onOtherPointer, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
      container.removeEventListener('scroll', scheduleFrame);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // The pane survives React's keyed row moves. Window listeners remain a fallback
    // when older WebKit releases capture or does not support it for this event.
    try { container.setPointerCapture(event.pointerId); } catch { /* Continue through window listeners. */ }
    if (event.pointerType === 'touch' || event.pointerType === 'pen') current.holdId = window.setTimeout(activate, HOLD_MS);
    else activate();
  }, [activate, clearClickGuard, finish, paint, scheduleFrame, valid]);

  useLayoutEffect(() => () => { finish(); clearClickGuard(); }, [options.enabled, options.scopeKey, options.items, finish, clearClickGuard]);
  return { onPointerDown, cancel: finish };
}
