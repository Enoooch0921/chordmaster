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
export function fitAnchoredChords(metrics: readonly { anchor: number; width: number; span?: number; opticalOffset?: number }[], width: number) {
  const gap = 3;
  const preferred = metrics.map((metric, index) => metric.span && metric.span < 1 ? .5 + .4 * metric.span
    : index > 0 && (metrics[index - 1].span ?? 1) < 1 && metric.width > 24 ? .9 : 1);
  const tolerance = metrics.map((metric, index) => Math.max(0, Math.min(10,
    (index ? metric.anchor - metrics[index - 1].anchor : width) * .22,
    (index + 1 < metrics.length ? metrics[index + 1].anchor - metric.anchor : width) * .22
  )));
  const place = (scales: number[]) => {
    const half = metrics.map((metric, index) => metric.width * scales[index] / 2);
    const lower: number[] = [];
    const upper = metrics.map((metric, index) => Math.min(width - half[index], metric.anchor + tolerance[index]));
    for (let index = 0; index < metrics.length; index++) {
      lower[index] = Math.max(half[index], metrics[index].anchor - tolerance[index],
        index ? lower[index - 1] + half[index - 1] + half[index] + gap : 0);
      if (lower[index] > upper[index] + .00001) return null;
    }
    const centers: number[] = [];
    for (let index = metrics.length - 1; index >= 0; index--) {
      const right = index + 1 < metrics.length ? centers[index + 1] - half[index + 1] - half[index] - gap : width;
      centers[index] = Math.max(lower[index], Math.min(metrics[index].anchor + (metrics[index].opticalOffset ?? 0), upper[index], right));
    }
    return centers;
  };
  let scales = preferred;
  let centers = place(scales);
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
  return metrics.map((metric, index) => ({ anchor: metric.anchor,
    left: (centers?.[index] ?? metric.anchor) - metric.width * scales[index] / 2, scale: scales[index] }));
}
