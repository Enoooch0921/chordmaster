import React from 'react';
import { fitAnchoredChords } from '../utils/chordBeatLayout';

type Fit = { left: number; anchor: number; scale: number };

/** Keep harmony on a stable beat grid, with room for labels and collision fitting. */
export default function NotationAlignedChordRow({ anchors, spans, labels, children, className = '' }: {
  anchors: number[];
  spans: number[];
  labels: string[];
  children: React.ReactNode;
  className?: string;
}) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [fits, setFits] = React.useState<Fit[]>([]);
  React.useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const contents = Array.from(row.querySelectorAll<HTMLElement>('[data-aligned-chord-content]'));
    let cancelled = false;
    const measure = () => {
      if (cancelled || !row.offsetWidth) return;
      const rowBox = row.getBoundingClientRect();
      const style = window.getComputedStyle(row);
      const rowWidth = parseFloat(style.width) || row.offsetWidth;
      const insetLeft = parseFloat(style.paddingLeft) || 0;
      const insetRight = parseFloat(style.paddingRight) || 0;
      const contentWidth = rowWidth - insetLeft - insetRight;
      const zoom = rowBox.width / rowWidth;
      if (!zoom || contentWidth <= 0) return;
      const metrics = contents.map((content, index) => {
        const box = content.getBoundingClientRect();
        const currentScale = Number(content.dataset.fitScale) || 1;
        return {
          anchor: anchors[index] * contentWidth,
          width: Math.max(content.scrollWidth, box.width / zoom / currentScale),
          span: spans[index],
          opticalOffset: content.querySelector('[data-chord-bass]') ? 2 : 0
        };
      });
      const next = fitAnchoredChords(metrics, contentWidth).map(fit => ({ ...fit, left: fit.left + insetLeft, anchor: fit.anchor + insetLeft }));
      setFits(old => old.length === next.length && old.every((fit, i) =>
        Math.abs(fit.left - next[i].left) < 0.05 && Math.abs(fit.anchor - next[i].anchor) < 0.05 && Math.abs(fit.scale - next[i].scale) < 0.001
      ) ? old : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    [row, ...contents].forEach(element => observer?.observe(element));
    void document.fonts?.ready.then(measure);
    window.addEventListener('beforeprint', measure);
    return () => { cancelled = true; observer?.disconnect(); window.removeEventListener('beforeprint', measure); };
  }, [anchors, spans, children]);

  return <div ref={rowRef} data-notation-aligned-chords="beats" className={`relative h-[27px] w-full min-w-0 ${className}`}>
    {React.Children.map(children, (child, index) => {
      const fit = fits[index];
      const anchor = fit ? `${fit.anchor}px` : `${anchors[index] * 100}%`;
      return <React.Fragment>
        {labels[index] && <span data-chord-beat-labels aria-hidden="true" className="pointer-events-none absolute -top-[5px] text-[8px] font-medium leading-none text-slate-600" style={{ left: anchor, transform: 'translateX(-50%)' }}>{labels[index]}</span>}
        <div data-aligned-chord-content data-fit-scale={fit?.scale ?? 1} data-chord-beat-anchor={anchors[index]} className="absolute bottom-0 z-20 w-max" style={{ left: fit ? `${fit.left}px` : anchor, transform: `${fit ? '' : 'translateX(-50%) '}scale(${fit?.scale ?? 1}, ${Math.min(1, (fit?.scale ?? 1) * 2)})`, transformOrigin: 'left bottom' }}>{child}</div>
      </React.Fragment>;
    })}
  </div>;
}
