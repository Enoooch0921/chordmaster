import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UI_EASE_OUT } from '../lib/uiMotion';
import { isKeyboardInteraction, useUiMotion } from '../hooks/useUiMotion';

type ActiveRow = { node: HTMLElement; close: () => void };
const SwipeGroupContext = createContext<React.MutableRefObject<ActiveRow | null> | null>(null);

/** One open row per navigator, with one outside/Escape listener for the whole list. */
export function SwipeActionGroup({ children, resetKey }: { children: React.ReactNode; resetKey: string }) {
  const active = useRef<ActiveRow | null>(null);
  useLayoutEffect(() => { active.current?.close(); active.current = null; }, [resetKey]);
  useEffect(() => {
    const outside = (event: Event) => {
      if (active.current && !active.current.node.contains(event.target as Node)) active.current.close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !active.current) return;
      const node = active.current.node;
      active.current.close();
      node.querySelector<HTMLElement>('[data-swipe-foreground] button')?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('touchstart', outside, { passive: true, capture: true });
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('touchstart', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return <SwipeGroupContext.Provider value={active}>{children}</SwipeGroupContext.Provider>;
}

type Action = { label: string; accessibleLabel: string; onAction: () => void; tone: 'archive' | 'delete'; disabled?: boolean };
interface SwipeActionRowProps extends React.HTMLAttributes<HTMLDivElement> {
  leftAction?: Action;
  rightAction?: Action;
  contentClassName: string;
  contentProps?: React.HTMLAttributes<HTMLDivElement>;
}
const REVEAL = 80;
const LOCK = 8;
const THRESHOLD = 14;
type SwipeInput = Pick<React.PointerEvent<HTMLDivElement>, 'pointerId' | 'isPrimary' | 'button' | 'target' | 'clientX' | 'clientY' | 'preventDefault'> & { currentTarget: HTMLDivElement };
type Gesture = { pointer: number; x: number; y: number; base: number; wasOpen: number; latest: number; axis: 'h' | 'v' | null };

/** Dragging writes one transform per frame; it never sends pixels through App state. */
export function SwipeActionRow({ leftAction, rightAction, children, className = '', contentClassName, contentProps, ...props }: SwipeActionRowProps) {
  const group = useContext(SwipeGroupContext);
  const preference = useUiMotion();
  const root = useRef<HTMLDivElement>(null);
  const foreground = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const target = useRef(0);
  const suppressClick = useRef(false);
  const frame = useRef<number | null>(null), cleanupTimer = useRef<number | null>(null), idleTimer = useRef<number | null>(null);
  const [open, setOpen] = useState<'left' | 'right' | null>(null);
  const clearTimers = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (cleanupTimer.current !== null) window.clearTimeout(cleanupTimer.current);
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    frame.current = cleanupTimer.current = idleTimer.current = null;
  };
  const showSide = (offset: number) => {
    if (left.current) left.current.style.visibility = offset > 0 ? 'visible' : 'hidden';
    if (right.current) right.current.style.visibility = offset < 0 ? 'visible' : 'hidden';
  };
  const paint = (offset: number) => {
    if (!foreground.current) return;
    foreground.current.style.transform = `translate3d(${offset}px, 0, 0)`;
    showSide(offset);
  };
  const settle = (offset: number) => {
    clearTimers();
    gesture.current = null;
    target.current = offset;
    setOpen(offset > 0 ? 'left' : offset < 0 ? 'right' : null);
    if (foreground.current) {
      foreground.current.style.transition = `transform ${isKeyboardInteraction() || preference.reduced ? 0 : 160}ms cubic-bezier(${UI_EASE_OUT.join(',')})`;
      foreground.current.style.transform = `translate3d(${offset}px, 0, 0)`;
    }
    // Keep the revealed side painted while the opaque card closes over it.
    if (offset) showSide(offset);
    cleanupTimer.current = window.setTimeout(() => {
      if (!offset) showSide(0);
      if (foreground.current) foreground.current.style.willChange = '';
    }, isKeyboardInteraction() || preference.reduced ? 0 : 160);
    if (offset) idleTimer.current = window.setTimeout(() => settle(0), 4000);
    else if (group?.current?.node === root.current) group.current = null;
  };
  const close = () => settle(0);
  useLayoutEffect(() => { close(); }, [Boolean(leftAction), Boolean(rightAction)]);
  useEffect(() => {
    const node = root.current;
    return () => {
      clearTimers();
      if (group?.current?.node === node) group.current = null;
    };
  }, []);

  const begin = (event: SwipeInput) => {
    if (event.isPrimary === false || event.button !== 0 || (!leftAction && !rightAction)) return;
    if ((event.target as HTMLElement).closest('input, select, textarea, [data-swipe-ignore]')) return;
    clearTimers();
    suppressClick.current = false;
    const element = foreground.current!;
    // Read the current compositor position once, so reversing a closing row never jumps.
    const matrix = getComputedStyle(element).transform;
    const values = matrix === 'none' ? [] : matrix.slice(matrix.indexOf('(') + 1, -1).split(',').map(Number);
    const base = values.length === 16 ? values[12] : values[4] || 0;
    element.style.transition = 'none';
    element.style.transform = `translate3d(${base}px, 0, 0)`;
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, base, wasOpen: target.current, latest: base, axis: null };
  };
  const move = (event: SwipeInput, capture = true) => {
    const start = gesture.current;
    if (!start || start.pointer !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (start.axis === 'h') {
        suppressClick.current = true;
        if (group) {
          if (group.current?.node !== root.current) group.current?.close();
          group.current = { node: root.current!, close };
        }
        foreground.current!.style.willChange = 'transform';
        try { if (capture) event.currentTarget.setPointerCapture(event.pointerId); } catch { /* detached or synthetic pointer */ }
      }
    }
    if (start.axis !== 'h') return;
    const min = rightAction && !rightAction.disabled && start.wasOpen <= 0 ? -REVEAL : 0;
    const max = leftAction && !leftAction.disabled && start.wasOpen >= 0 ? REVEAL : 0;
    start.latest = Math.max(min, Math.min(max, start.base + dx));
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (gesture.current?.axis === 'h') paint(gesture.current.latest);
    });
    event.preventDefault();
  };
  const finish = (event: SwipeInput) => {
    const start = gesture.current;
    if (!start || start.pointer !== event.pointerId) return;
    if (start.axis !== 'h') { settle(start.wasOpen); return; }
    const closingNudge = start.wasOpen < 0 ? start.latest - start.base : start.base - start.latest;
    const offset = start.wasOpen ? closingNudge > THRESHOLD ? 0 : start.wasOpen
      : Math.abs(start.latest) >= THRESHOLD ? Math.sign(start.latest) * REVEAL : 0;
    settle(offset);
    event.preventDefault();
  };
  // Safari touch scrolling may cancel pointer streams. Track real touches separately
  // and prevent native scrolling only after locking a horizontal gesture.
  const touchHandlers = useRef({ begin, move, finish, close });
  useLayoutEffect(() => { touchHandlers.current = { begin, move, finish, close }; });
  useEffect(() => {
    const element = foreground.current;
    if (!element) return;
    const input = (event: TouchEvent, touch: Touch): SwipeInput => ({
      pointerId: touch.identifier, isPrimary: true, button: 0, target: event.target!, currentTarget: element,
      clientX: touch.clientX, clientY: touch.clientY,
      preventDefault: () => { if (event.cancelable) event.preventDefault(); }
    });
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { touchHandlers.current.close(); return; }
      touchHandlers.current.begin(input(event, event.touches[0]));
    };
    const moveTouch = (event: TouchEvent) => {
      if (event.touches.length !== 1) { touchHandlers.current.close(); return; }
      const touch = Array.from(event.touches).find(item => item.identifier === gesture.current?.pointer);
      if (touch) touchHandlers.current.move(input(event, touch), false);
    };
    const end = (event: TouchEvent) => {
      const touch = Array.from(event.changedTouches).find(item => item.identifier === gesture.current?.pointer);
      if (touch) touchHandlers.current.finish(input(event, touch));
    };
    const cancel = () => touchHandlers.current.close();
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', moveTouch, { passive: false });
    element.addEventListener('touchend', end, { passive: false });
    element.addEventListener('touchcancel', cancel);
    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', moveTouch);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', cancel);
    };
  }, []);
  const action = (side: 'left' | 'right', item: Action | undefined) => item && (
    <div ref={side === 'left' ? left : right} data-swipe-action={side} aria-hidden={open !== side} inert={open !== side ? true : undefined}
      style={{ visibility: 'hidden' }} className={`absolute inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} flex w-20 items-stretch`}>
      <button type="button" disabled={item.disabled} aria-label={item.accessibleLabel} title={item.label}
        className={`flex w-full items-center justify-center px-2 text-center text-sm font-bold leading-tight text-white ${item.tone === 'delete' ? 'bg-rose-600' : 'bg-indigo-600'}`}
        onClick={() => { close(); item.onAction(); }}>{item.label}</button>
    </div>
  );
  return <div {...props} ref={root} data-swipe-row className={`relative isolate overflow-hidden ${className}`}>
    {action('left', leftAction)}{action('right', rightAction)}
    <div ref={foreground} data-swipe-foreground className="relative rounded-[inherit] bg-white dark:bg-[color:var(--color-surface)] [touch-action:pan-y_pinch-zoom]"
      onPointerDown={event => { if (event.pointerType !== 'touch') begin(event); }}
      onPointerMove={event => { if (event.pointerType !== 'touch') move(event); }}
      onPointerUp={event => { if (event.pointerType !== 'touch') finish(event); }}
      onPointerCancel={event => { if (event.pointerType !== 'touch') close(); }}
      onLostPointerCapture={event => { if (event.pointerType !== 'touch' && gesture.current) close(); }}
      onKeyDown={event => {
        suppressClick.current = false;
        if ((event.target as HTMLElement).closest('input, select, textarea, [data-swipe-ignore]')) return;
        const side = event.key === 'ArrowLeft' && rightAction && !rightAction.disabled ? 'right'
          : event.key === 'ArrowRight' && leftAction && !leftAction.disabled ? 'left' : null;
        if (!side) return;
        event.preventDefault();
        if (group) {
          if (group.current?.node !== root.current) group.current?.close();
          group.current = { node: root.current!, close };
        }
        settle(side === 'left' ? REVEAL : -REVEAL);
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          (side === 'left' ? left : right).current?.querySelector('button')?.focus();
        });
      }}
      onClickCapture={event => {
        if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
        else if (target.current && !(event.target as HTMLElement).closest('[data-swipe-ignore]')) { close(); event.preventDefault(); event.stopPropagation(); }
      }}>
      <div {...contentProps} className={`rounded-[inherit] ${contentClassName}`}>{children}</div>
    </div>
  </div>;
}
