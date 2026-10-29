import React from 'react';
import { fitAnchoredChords } from '../utils/chordBeatLayout';

type Fit = { left: number; anchor: number; scale: number };

/** Share the rendered notation lane's coordinates, including label gutters and print insets. */
export default function NotationAlignedChordRow({ anchors, positions, spans, notationMode, labels, children, className = '' }: {
  anchors: number[];
  positions: number[];
  spans: number[];
  notationMode: 'rhythm' | 'jianpu' | 'beats';
  labels: string[];
  children: React.ReactNode;
  className?: string;
}) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [fits, setFits] = React.useState<Fit[]>([]);
  React.useLayoutEffect(() => {
    const row = rowRef.current;
    const lane = notationMode === 'beats' ? row : row?.closest('[data-preview-clipboard-bar]')?.querySelector<HTMLElement>(notationMode === 'rhythm' ? '[data-rhythm-notation]' : '[data-jianpu-notation]');
    if (!row || !lane) return;
    const contents = Array.from(row.querySelectorAll<HTMLElement>('[data-aligned-chord-content]'));
    let cancelled = false;
    const measure = () => {
      if (cancelled || !row.offsetWidth) return;
      const rowBox = row.getBoundingClientRect();
      const laneBox = lane.getBoundingClientRect();
      const rowWidth = parseFloat(window.getComputedStyle(row).width) || row.offsetWidth;
      const zoom = rowBox.width / rowWidth;
      if (!zoom || !laneBox.width) return;
      const digits = Array.from(lane.querySelectorAll<HTMLElement>('[data-jianpu-onset]'));
      const metrics = contents.map((content, index) => {
        const box = content.getBoundingClientRect();
        const currentScale = Number(content.dataset.fitScale) || 1;
        const digit = notationMode === 'jianpu' ? digits.find(node => Math.abs(Number(node.dataset.jianpuOnset) - positions[index]) < 0.001)?.getBoundingClientRect() : null;
        return {
          anchor: digit ? (digit.left + digit.width / 2 - rowBox.left) / zoom : (laneBox.left - rowBox.left + anchors[index] * laneBox.width) / zoom,
          width: Math.max(content.scrollWidth, box.width / zoom / currentScale),
          span: spans[index],
          opticalOffset: content.querySelector('[data-chord-bass]') ? 2 : 0
        };
      });
      const next = fitAnchoredChords(metrics, rowWidth);
      setFits(old => old.length === next.length && old.every((fit, i) =>
        Math.abs(fit.left - next[i].left) < 0.05 && Math.abs(fit.anchor - next[i].anchor) < 0.05 && Math.abs(fit.scale - next[i].scale) < 0.001
      ) ? old : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    [row, lane, ...contents].forEach(element => observer?.observe(element));
    void document.fonts?.ready.then(measure);
    const mutations = notationMode === 'jianpu' ? new MutationObserver(measure) : null;
    mutations?.observe(lane, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
    window.addEventListener('beforeprint', measure);
    return () => { cancelled = true; observer?.disconnect(); mutations?.disconnect(); window.removeEventListener('beforeprint', measure); };
  }, [anchors, positions, spans, notationMode, children]);

  return <div ref={rowRef} data-notation-aligned-chords={notationMode} className={`relative h-[27px] w-full min-w-0 ${className}`}>
    {React.Children.map(children, (child, index) => {
      const fit = fits[index];
      const anchor = fit ? `${fit.anchor}px` : `${anchors[index] * 100}%`;
      return <React.Fragment>
        {labels[index] && <span data-chord-beat-labels aria-hidden="true" className="pointer-events-none absolute -top-[5px] text-[8px] font-medium leading-none text-slate-600" style={{ left: anchor, transform: 'translateX(-50%)' }}>{labels[index]}</span>}
        <div data-aligned-chord-content data-fit-scale={fit?.scale ?? 1} className="absolute bottom-0 w-max" style={{ left: fit ? `${fit.left}px` : anchor, transform: `scale(${fit?.scale ?? 1}, ${Math.min(1, (fit?.scale ?? 1) * 2)})`, transformOrigin: 'left bottom' }}>{child}</div>
      </React.Fragment>;
    })}
  </div>;
}
