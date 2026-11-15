import { useLayoutEffect, useRef, type PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';

type Props = {
  direction: 1 | -1;
  disabled: boolean;
  label: string;
  hint: string;
  onStep: (delta: number) => void;
};

export default function DrummerTempoStep({ direction, disabled, label, hint, onStep }: Props) {
  const press = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);
  const step = useRef(onStep);
  useLayoutEffect(() => { step.current = onStep; }, [onStep]);

  function finish() {
    window.clearTimeout(timer.current);
    press.current = null;
  }
  function cancel() {
    if (press.current) suppressClick.current = true;
    finish();
  }
  useLayoutEffect(() => {
    if (disabled) cancel();
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    window.addEventListener('pagehide', cancel);
    window.addEventListener('orientationchange', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancel();
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('orientationchange', cancel);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [disabled]);

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || event.isPrimary === false || press.current) return;
    press.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
    suppressClick.current = false;
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Synthetic events have no active pointer. */ }
    const repeat = () => {
      suppressClick.current = true;
      step.current(10 * direction);
      timer.current = window.setTimeout(repeat, 250);
    };
    timer.current = window.setTimeout(repeat, 450);
  }
  const Icon = direction === 1 ? Plus : Minus;
  return <button type="button" data-drummer-action={direction === 1 ? 'tempoUp' : 'tempoDown'}
    aria-label={label} aria-description={hint} title={hint} disabled={disabled}
    onPointerDown={begin}
    onPointerMove={event => {
      const start = press.current;
      if (start && start.pointer === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) cancel();
    }}
    onPointerUp={event => { if (press.current?.pointer === event.pointerId) finish(); }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onContextMenu={event => event.preventDefault()}
    onClick={event => {
      if (event.detail === 0 || !suppressClick.current) onStep(direction);
      suppressClick.current = false;
    }}><Icon size={24} aria-hidden="true"/></button>;
}
