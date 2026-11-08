export interface NoteHoldSample { x: number; y: number; time: number }
export const NOTE_HOLD_STILL_MS = 500;

/** Require a quiet time window, not merely remaining inside a large radius. */
export function stationaryNoteEndpoint(samples: NoteHoldSample[], now: number) {
  if (samples.length < 2 || now - samples[0].time < NOTE_HOLD_STILL_MS) return null;
  const cutoff = now - NOTE_HOLD_STILL_MS;
  let start = samples.findIndex(p => p.time >= cutoff);
  if (start < 0) start = samples.length - 1;
  else start = Math.max(0, start - 1);
  const recent = samples.slice(start);
  const spanX = Math.max(...recent.map(p => p.x)) - Math.min(...recent.map(p => p.x));
  const spanY = Math.max(...recent.map(p => p.y)) - Math.min(...recent.map(p => p.y));
  if (spanX > 24 || spanY > 24) return null;
  const progressing = (trace: NoteHoldSample[]) => {
    const travel = trace.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - trace[i].x, p.y - trace[i].y), 0);
    const progress = Math.hypot(trace.at(-1)!.x - trace[0].x, trace.at(-1)!.y - trace[0].y);
    return progress > 1.5 && progress > travel * .6;
  };
  // Slow, purposeful movement still counts as drawing. Back-and-forth Pencil
  // jitter can have a long travelled distance but makes little net progress.
  // Also check the latest edge: several polygon corners can cancel the net
  // movement of the longer window while the pen is still drawing.
  let tailStart = recent.findIndex(p => p.time >= now - 150);
  if (tailStart < 0) tailStart = recent.length - 1;
  else tailStart = Math.max(0, tailStart - 1);
  const tail = recent.slice(tailStart);
  if (progressing(recent) || progressing(tail)) return null;
  // A small loop can end where it started, especially amid Pencil noise.
  // Compare short-window centers to distinguish travel from jitter in place.
  const centers = new Map<number, { x: number; y: number; count: number; first: number; last: number }>();
  for (const sample of recent) {
    if (sample.time < cutoff) continue;
    const bucket = Math.floor((sample.time - cutoff) / 80);
    const center = centers.get(bucket) ?? { x: 0, y: 0, count: 0, first: sample.time, last: sample.time };
    center.x += sample.x; center.y += sample.y; center.count++; center.last = sample.time;
    centers.set(bucket, center);
  }
  let firstCenter: { x: number; y: number } | undefined;
  for (const window of centers.values()) {
    if (window.last - window.first < 45) continue;
    const x = window.x / window.count, y = window.y / window.count;
    firstCenter ??= { x, y };
    if (Math.hypot(x - firstCenter.x, y - firstCenter.y) > 3) return null;
  }
  return { x: tail.reduce((n, p) => n + p.x, 0) / tail.length,
    y: tail.reduce((n, p) => n + p.y, 0) / tail.length };
}
