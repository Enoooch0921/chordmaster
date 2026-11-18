import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { AuditionBar } from '../lib/chordAudition';

function findMeasure(chart: HTMLElement, identity: string, bar: AuditionBar) {
  const score = `[data-audition-chart="${CSS.escape(identity)}"]`;
  if (bar.pickup) return chart.querySelector<HTMLElement>(score + '[data-preview-pickup]');
  if (bar.writtenPosition) {
    const { section, bar: index } = bar.writtenPosition;
    return chart.querySelector<HTMLElement>(score + `[data-audition-section-index="${section}"][data-audition-bar-index="${index}"]`);
  }
  if (!bar.sectionId || !bar.barId) return null;
  const measure = `[data-audition-section="${CSS.escape(bar.sectionId)}"][data-audition-bar="${CSS.escape(bar.barId)}"]`;
  return chart.querySelectorAll<HTMLElement>(score + measure)[bar.sectionOccurrence] ?? null;
}

/** Project the player's latency-adjusted frame onto the currently mounted chart. */
export function usePracticeChartCursor(identity: string, viewport?: RefObject<HTMLDivElement | null>) {
  const latest = useRef<{ bar: AuditionBar; beat: number } | null>(null);
  const draw = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (!viewport) return;
    let marked: HTMLElement | null = null;
    let previous: AuditionBar | undefined;
    let previousBeat = -1;
    const clear = () => {
      marked?.removeAttribute('data-practice-beat');
      marked?.style.removeProperty('--practice-beat-width');
      marked?.style.removeProperty('--practice-beat-position');
      marked = null;
    };
    const paint = () => {
      const cursor = latest.current;
      const chart = viewport.current;
      if (!cursor || !chart) return;
      const { bar, beat } = cursor;
      // An automatic Intro or Ending can have duration without a printed measure.
      if (!bar.pickup && !bar.writtenPosition && !bar.sectionId) {
        if (marked) clear();
        return;
      }
      if (previous !== bar || !marked?.isConnected) {
        clear();
        previous = bar;
        previousBeat = -1;
        marked = findMeasure(chart, identity, bar);
        if (!marked) return;
        marked.style.setProperty('--practice-beat-width', `${100 / bar.beats}%`);
        marked.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
      if (previousBeat !== beat) {
        marked.dataset.practiceBeat = String(beat + 1);
        marked.style.setProperty('--practice-beat-position', `${bar.beats > 1 ? 100 * beat / (bar.beats - 1) : 0}%`);
        previousBeat = beat;
      }
    };
    draw.current = paint;
    // The chart is a sibling. Its DOM ref may attach later in this commit.
    const frame = requestAnimationFrame(paint);
    return () => { cancelAnimationFrame(frame); draw.current = null; clear(); };
  }, [identity, viewport]);

  return useCallback((bar: AuditionBar | null, time = 0) => {
    if (!bar) { latest.current = null; return; }
    const beat = Math.floor(bar.firstBeat + (time - bar.start) / bar.beatSeconds) % bar.beats;
    if (latest.current?.bar !== bar || latest.current.beat !== beat) latest.current = { bar, beat };
    draw.current?.();
  }, []);
}
