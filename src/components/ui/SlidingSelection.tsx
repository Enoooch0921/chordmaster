import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  index: number;
  count: number;
  inset?: number | string;
  gap?: number | string;
  visible?: boolean;
}

/** Equal-width segments share one moving background; their labels stay still. */
export default function SlidingSelection({ index, count, inset = 2, gap = 0, visible = true, className = '', style, ...props }: Props) {
  const segments = Math.max(1, count);
  const selected = Math.max(0, Math.min(segments - 1, index));
  const insetLength = typeof inset === 'number' ? `${inset}px` : inset;
  const gapLength = typeof gap === 'number' ? `${gap}px` : gap;
  return <span {...props} aria-hidden="true" className={`ui-sliding-selection ${className}`} style={{
    ...style, left: inset, top: inset, bottom: inset,
    width: `calc((100% - ${insetLength} - ${insetLength} - ${gapLength} * ${segments - 1}) / ${segments})`,
    transform: gap ? `translateX(calc(${selected * 100}% + ${gapLength} * ${selected}))` : `translateX(${selected * 100}%)`,
    opacity: visible ? 1 : 0
  }}/>;
}
