import React from 'react';

/** Keep notation arrows clear of the measure's selection border at any preview zoom. */
export default function NotationSelectionPointer({ style, jianpuOnset, voiceId, ...props }: React.ComponentProps<'span'> & { jianpuOnset?: number; voiceId?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const shiftRef = React.useRef({ x: 0, y: 0 });
  const [shift, setShift] = React.useState({ x: 0, y: 0 });
  React.useLayoutEffect(() => {
    const pointer = ref.current;
    const bar = pointer?.closest<HTMLElement>('.sheet-bar');
    if (!pointer || !bar) return;
    const measure = () => {
      const rect = pointer.getBoundingClientRect();
      const border = bar.getBoundingClientRect();
      const arrowHeight = parseFloat(getComputedStyle(pointer).borderBottomWidth);
      const zoom = rect.height / arrowHeight;
      if (!Number.isFinite(zoom) || zoom <= 0) return;
      const naturalTop = rect.top - shiftRef.current.y * zoom;
      const gap = 3 * zoom;
      const overlapsBorder = naturalTop + rect.height > border.bottom - 2 * zoom - gap
        && naturalTop < border.bottom + gap;
      const lane = Array.from(pointer.parentElement?.querySelectorAll<HTMLElement>('[data-jianpu-voice]') ?? [])
        .find(element => element.dataset.jianpuVoice === (voiceId ?? 'primary')) ?? pointer.parentElement;
      const digit = jianpuOnset === undefined ? null : Array.from(lane?.querySelectorAll<HTMLElement>('[data-jianpu-onset]') ?? [])
        .find(element => Math.abs(Number(element.dataset.jianpuOnset) - jianpuOnset) < 0.001);
      const digitBox = digit?.getBoundingClientRect();
      const naturalCenter = rect.left + rect.width / 2 - shiftRef.current.x * zoom;
      const next = {
        x: digitBox ? (digitBox.left + digitBox.width / 2 - naturalCenter) / zoom : 0,
        y: overlapsBorder ? (border.bottom + gap - naturalTop) / zoom : 0
      };
      if (Math.abs(next.x - shiftRef.current.x) < 0.05 && Math.abs(next.y - shiftRef.current.y) < 0.05) return;
      shiftRef.current = next;
      setShift(next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(bar);
    if (pointer.parentElement) observer?.observe(pointer.parentElement);
    const mutations = jianpuOnset === undefined ? null : new MutationObserver(measure);
    if (pointer.parentElement) mutations?.observe(pointer.parentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); mutations?.disconnect(); window.removeEventListener('resize', measure); };
  }, [style, jianpuOnset, voiceId]);
  return <span {...props} ref={ref} style={{ ...style, translate: `${shift.x}px ${shift.y}px` }} />;
}
