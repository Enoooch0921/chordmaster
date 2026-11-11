import React from 'react';

/** Position transient selection ink without rerendering the score or observing our own writes. */
export default function NotationSelectionPointer({ style, jianpuOnset, voiceId, ...props }: React.ComponentProps<'span'> & { jianpuOnset?: number; voiceId?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const shift = React.useRef({ x: 0, y: 0 });
  const measureRef = React.useRef<() => void>(() => {});
  const latest = React.useRef({ jianpuOnset, voiceId });
  latest.current = { jianpuOnset, voiceId };
  React.useLayoutEffect(() => {
    const pointer = ref.current;
    const bar = pointer?.closest<HTMLElement>('.sheet-bar');
    if (!pointer || !bar) return;
    let frame: number | null = null;
    const measure = () => {
      const rect = pointer.getBoundingClientRect();
      const border = bar.getBoundingClientRect();
      const arrowHeight = parseFloat(getComputedStyle(pointer).borderBottomWidth);
      const zoom = rect.height / arrowHeight;
      if (!Number.isFinite(zoom) || zoom <= 0) return;
      const naturalTop = rect.top - shift.current.y * zoom;
      const gap = 3 * zoom;
      const overlapsBorder = naturalTop + rect.height > border.bottom - 2 * zoom - gap
        && naturalTop < border.bottom + gap;
      const { jianpuOnset, voiceId } = latest.current;
      const lane = Array.from(pointer.parentElement?.querySelectorAll<HTMLElement>('[data-jianpu-voice]') ?? [])
        .find(element => element.dataset.jianpuVoice === (voiceId ?? 'primary')) ?? pointer.parentElement;
      const anchor = jianpuOnset === undefined ? null : Array.from(lane?.querySelectorAll<HTMLElement>('[data-jianpu-onset], [data-jianpu-insert-onset]') ?? [])
        .find(element => Math.abs(Number(element.dataset.jianpuOnset ?? element.dataset.jianpuInsertOnset) - jianpuOnset) < 0.001);
      const anchorBox = anchor?.getBoundingClientRect();
      const naturalCenter = rect.left + rect.width / 2 - shift.current.x * zoom;
      const next = {
        x: anchorBox ? (anchorBox.left + anchorBox.width / 2 - naturalCenter) / zoom : 0,
        y: overlapsBorder ? (border.bottom + gap - naturalTop) / zoom : 0
      };
      if (Math.abs(next.x - shift.current.x) < 0.05 && Math.abs(next.y - shift.current.y) < 0.05) return;
      shift.current = next;
      pointer.style.translate = `${next.x}px ${next.y}px`;
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; measure(); });
    };
    measureRef.current = measure;
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(bar);
    if (pointer.parentElement) observer?.observe(pointer.parentElement);
    const mutations = new MutationObserver(records => {
      // translate is our own output, never a reason to measure again.
      if (records.some(record => record.target !== pointer)) schedule();
    });
    if (pointer.parentElement) mutations.observe(pointer.parentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      measureRef.current = () => {};
      observer?.disconnect(); mutations.disconnect(); window.removeEventListener('resize', schedule);
    };
  }, []);
  React.useLayoutEffect(() => { measureRef.current(); });
  return <span {...props} ref={ref} style={style} />;
}
