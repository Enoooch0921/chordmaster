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
  return { x: tail.reduce((n, p) => n + p.x, 0) / tail.length,
    y: tail.reduce((n, p) => n + p.y, 0) / tail.length };
}
