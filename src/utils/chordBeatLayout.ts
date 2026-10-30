import { chordPairSpacing, type OpticalChord } from './chordOpticalSpacing';
import { chordEventLabel } from './chordSubdivisions';

type ChordAttack = { beat: number; offset: number; chord: string };

/** Give dense beats more room, while retaining a separate column per beat. */
export function chordBeatTrackWeights(events: readonly ChordAttack[], beats: number) {
  return Array.from({ length: beats }, (_, beat) => {
    const attacks = events.filter(event => event.beat === beat);
    if (!attacks.length || (attacks.length === 1 && attacks[0].chord.trim() === '/')) return .65;
    return 1 + .75 * (attacks.length - 1);
  });
}

/** Shorten only a complete run; isolated offbeats keep their full beat number. */
export function chordBeatGroupLabels(events: readonly ChordAttack[], compact = false) {
  if (events.length === 4 && events.every((event, index) => event.beat === events[0].beat && event.offset === index / 4)) {
    return [String(events[0].beat + 1), 'e', '&', 'a'];
  }
  return events.map(event => (!event.offset && (compact || events.length === 1)) ? '' : chordEventLabel(event.beat, event.offset));
}

export function chordAttackSpan(events: readonly ChordAttack[], index: number) {
  const event = events[index];
  const next = events[index + 1];
  return next?.beat === event.beat ? next.offset - event.offset : 1 - event.offset;
}

/** Center harmony in its beat or subdivision, independently of note durations.
 * Unsplit beats keep their midpoint; split beats share that same fixed beat cell.
 * Always use the measure meter, even while melody/rhythm entry is incomplete.
 */
export function chordBeatAnchors(events: readonly ChordAttack[], beats: number): number[] {
  return events.map((event, index) => (event.beat + event.offset + chordAttackSpan(events, index) / 2) / beats);
}

/** Center the complete chord on its attack; borrow nearby whitespace before shrinking.
 * Movement stays within 22% of the nearest attack distance (at most 10 chart px).
 */
export function fitAnchoredChords(metrics: readonly { anchor: number; width: number; span?: number; opticalOffset?: number; continuation?: boolean; slashBass?: boolean; ink?: OpticalChord }[], width: number,
  options: { edgePadding?: number; balanceSpacing?: boolean } = {}) {
  const edge = Math.min(Math.max(0, options.edgePadding ?? 0), Math.max(0, width / 4));
  // A full-beat chord following subdivisions needs a clearer visual break.
  const gaps = metrics.map((metric, index) => {
    const previous = metrics[index - 1];
    // Two slash chords on consecutive beats must not read as one long symbol.
    // Keep the attack bounds and borrow whitespace before condensing either chord.
    if (previous?.slashBass && metric.slashBass && (previous.span ?? 1) >= 1 && (metric.span ?? 1) >= 1) return 8;
    return previous && (previous.span ?? 1) < 1 && (metric.span ?? 1) >= 1 ? 6 : 3;
  });
  let preferred = metrics.map((metric, index) => metric.span && metric.span < 1 ? .5 + .4 * metric.span
    : index > 0 && (metrics[index - 1].span ?? 1) < 1 && metric.width > 24 ? .9 : 1);
  const tolerance = metrics.map((metric, index) => Math.max(0, Math.min(10,
    (index ? metric.anchor - metrics[index - 1].anchor : width) * .22,
    (index + 1 < metrics.length ? metrics[index + 1].anchor - metric.anchor : width) * .22
  )));
  const place = (scales: number[], targets?: number[]) => {
    const half = metrics.map((metric, index) => metric.width * scales[index] / 2);
    const lower: number[] = [];
    const upper = metrics.map((metric, index) => Math.min(width - edge - half[index], metric.anchor + tolerance[index]));
    for (let index = 0; index < metrics.length; index++) {
      lower[index] = Math.max(edge + half[index], metrics[index].anchor - tolerance[index],
        index ? lower[index - 1] + half[index - 1] + half[index] + gaps[index] : 0);
      if (lower[index] > upper[index] + .00001) return null;
    }
    const centers: number[] = [];
    for (let index = metrics.length - 1; index >= 0; index--) {
      const right = index + 1 < metrics.length ? centers[index + 1] - half[index + 1] - half[index] - gaps[index + 1] : width;
      centers[index] = Math.max(lower[index], Math.min(targets?.[index] ?? metrics[index].anchor + (metrics[index].opticalOffset ?? 0), upper[index], right));
    }
    return centers;
  };
  let scales = preferred;
  let centers = place(scales);
  if (!centers && preferred.some(scale => scale === .9)) {
    // Share the squeeze with the following long chord before over-condensing
    // the short subdivisions that precede it.
    preferred = preferred.map(scale => scale === .9 ? .8 : scale);
    scales = preferred;
    centers = place(scales);
  }
  if (!centers) {
    // Prefer condensing subdivisions, keeping neighboring full-beat chords readable.
    const short = metrics.map(metric => (metric.span ?? 1) < 1);
    const search = (onlyShort: boolean) => {
      const candidate = (factor: number) => preferred.map((scale, index) => scale * (onlyShort && !short[index] ? 1 : factor));
      if (!place(candidate(.01))) return false;
      let low = .01, high = 1;
      for (let iteration = 0; iteration < 24; iteration++) {
        const mid = (low + high) / 2;
        if (place(candidate(mid))) low = mid; else high = mid;
      }
      scales = candidate(low);
      centers = place(scales);
      return true;
    };
    if (!short.some(Boolean) || !search(true)) search(false);
  }
  if (centers && options.balanceSpacing && metrics.length > 2) {
    // Balance facing ink within the beat bounds. When a long chord prevents
    // that, allow modest horizontal compression without changing its height.
    const balance = (candidateScales: number[]) => {
      const initial = place(candidateScales);
      if (!initial) return null;
      const ink = metrics.map((metric, index) => ({
        width: metric.width * candidateScales[index],
        boxes: (metric.ink?.boxes ?? []).map(box => ({ ...box, left: box.left * candidateScales[index], right: box.right * candidateScales[index] })),
      }));
      const advances = ink.slice(0, -1).map((chord, index) => chordPairSpacing(chord, ink[index + 1]).advance);
      const firstLeft = initial[0] - ink[0].width / 2;
      const lastRight = initial.at(-1)! + ink.at(-1)!.width / 2;
      const space = (lastRight - firstLeft - ink.at(-1)!.width - advances.reduce((sum, value) => sum + value, 0)) / advances.length;
      let left = firstLeft;
      const targets = ink.map((chord, index) => {
        const center = left + chord.width / 2;
        left += (advances[index] ?? 0) + space;
        return center;
      });
      const positioned = place(candidateScales, targets) ?? initial;
      const gaps = advances.map((advance, index) => positioned[index + 1] - ink[index + 1].width / 2
        - (positioned[index] - ink[index].width / 2) - advance);
      return { centers: positioned, spread: Math.max(...gaps) - Math.min(...gaps) };
    };
    let best = balance(scales)!;
    let score = best.spread;
    const originalScales = scales;
    if (score > 3) {
      const beatWidth = (metrics.at(-1)!.anchor - metrics[0].anchor) / (metrics.length - 1);
      for (const factor of [.95, .9, .85]) {
        const candidateScales = originalScales.map((scale, index) => scale * (metrics[index].width > beatWidth * .7 ? factor : 1));
        const candidate = balance(candidateScales);
        const candidateScore = (candidate?.spread ?? Infinity) + 8 * (1 - factor);
        if (candidate && candidateScore < score) {
          best = candidate; score = candidateScore; scales = candidateScales;
        }
      }
    }
    centers = best.centers;
  }
  if (centers) {
    // A continuation slash should share the whitespace between its neighbors,
    // while remaining within the same beat tolerance as ordinary chords.
    for (let index = 1; index + 1 < metrics.length; index++) {
      if (!metrics[index].continuation) continue;
      const half = metrics[index].width * scales[index] / 2;
      const previousRight = centers[index - 1] + metrics[index - 1].width * scales[index - 1] / 2;
      const nextLeft = centers[index + 1] - metrics[index + 1].width * scales[index + 1] / 2;
      const lower = Math.max(metrics[index].anchor - tolerance[index], previousRight + gaps[index] + half);
      const upper = Math.min(metrics[index].anchor + tolerance[index], nextLeft - gaps[index + 1] - half);
      centers[index] = Math.max(lower, Math.min((previousRight + nextLeft) / 2, upper));
    }
  }
  return metrics.map((metric, index) => ({ anchor: metric.anchor,
    left: (centers?.[index] ?? metric.anchor) - metric.width * scales[index] / 2, scale: scales[index] }));
}
