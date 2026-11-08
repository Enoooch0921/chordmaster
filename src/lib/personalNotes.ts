export const NOTE_COLORS = ['#1e293b', '#dc2626', '#2563eb', '#238454', '#d97706'] as const;
export type NoteTool = 'pen' | 'highlighter' | 'eraser';
export type NoteSurface = 'score' | 'lyrics';
export type NoteAnchor = { kind: 'bar'; sectionId: string; barId: string } | { kind: 'page'; page: number } | { kind: 'lyric'; sourceLine: string; offset: number; fontSize: number };
export interface NoteStroke {
  id: string;
  anchor: NoteAnchor;
  points: [number, number][];
  lyricOffsets?: number[];
  color: string;
  width: number;
  tool: 'pen' | 'highlighter';
  shape?: 'line' | 'ellipse' | 'rectangle' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'arrow';
}
// Immutable operations merge across tabs/devices without overwriting a drawing.
// Undoing an erasure creates new stroke identities; tombstones never resurrect.
export interface NoteOperation { id: string; strokes: NoteStroke[]; removed: string[] }
export const noteId = () => crypto.randomUUID();
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function validNoteOperation(value: unknown): value is NoteOperation {
  const op = value as NoteOperation | null;
  if (!op || !uuid(op.id) || !Array.isArray(op.strokes) || !Array.isArray(op.removed)
    || op.strokes.length > 100 || op.removed.length > 10000 || !op.removed.every(uuid)) return false;
  return op.strokes.every(s => s && uuid(s.id) && NOTE_COLORS.includes(s.color as typeof NOTE_COLORS[number])
    && (s.tool === 'pen' || s.tool === 'highlighter') && (s.shape === undefined || ['line', 'ellipse', 'rectangle', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'arrow'].includes(s.shape))
    && Number.isFinite(s.width) && s.width >= 1 && s.width <= 24
    && s.anchor && (s.anchor.kind === 'bar' ? typeof s.anchor.sectionId === 'string' && typeof s.anchor.barId === 'string'
      : s.anchor.kind === 'lyric' ? typeof s.anchor.sourceLine === 'string' && !!s.anchor.sourceLine
        && Number.isSafeInteger(s.anchor.offset) && s.anchor.offset >= 0 && Number.isFinite(s.anchor.fontSize) && s.anchor.fontSize > 0
      : s.anchor.kind === 'page' && Number.isInteger(s.anchor.page) && s.anchor.page >= 0)
    && Array.isArray(s.points) && s.points.length > 0 && s.points.length <= 4096
    && (s.lyricOffsets === undefined || (s.anchor.kind === 'lyric' && Array.isArray(s.lyricOffsets)
      && s.lyricOffsets.length === s.points.length && s.lyricOffsets.every(offset => Number.isSafeInteger(offset) && offset >= 0)))
    && s.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 100)));
}
export function mergeNoteOperations(operations: Iterable<NoteOperation>): NoteStroke[] {
  const strokes = new Map<string, NoteStroke>(), removed = new Set<string>();
  for (const op of operations) {
    for (const stroke of op.strokes) strokes.set(stroke.id, stroke);
    for (const id of op.removed) removed.add(id);
  }
  return [...strokes.values()].filter(s => !removed.has(s.id)).sort((a, b) => a.id.localeCompare(b.id));
}
export type NoteFrame = { x: number; y: number; width: number; height: number };
export const projectNotePoints = (stroke: NoteStroke, frame: NoteFrame) => stroke.points.map(([x, y]) => [frame.x + x * frame.width, frame.y + y * frame.height] as [number, number]);
type InkPoint = [number, number];
const inkXY = ([x, y]: InkPoint) => `${x.toFixed(2)} ${y.toFixed(2)}`;
function inkSegment(a: InkPoint, b: InkPoint, c: InkPoint): string {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const corner = ab * bc > 0 && ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / (ab * bc) < 0.4;
  return corner ? ` L${inkXY(b)}` : ` Q${inkXY(b)} ${inkXY([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2])}`;
}
// Integer-rounded Pencil samples can alternate either side of a straight line.
// Average a small deviation toward the chord at the same relative travel.
// Larger departures describe deliberate turns and keep their original vertex.
function denoiseSample(a: InkPoint, b: InkPoint, c: InkPoint): InkPoint {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  if (!ab || !bc) return b;
  const t = ab / (ab + bc);
  const dx = a[0] + t * (c[0] - a[0]) - b[0], dy = a[1] + t * (c[1] - a[1]) - b[1];
  const deviation = Math.hypot(dx, dy);
  const weight = .5 * Math.min(1, Math.max(0, 4 - deviation));
  return [b[0] + dx * weight, b[1] + dy * weight];
}

/** Only the tail is provisional. The latest sample always reaches the Pencil
 * tip in the same event, including when the pen lifts at a sharp corner. */
export function createLiveNotePath(first: InkPoint) {
  let prefix = `M${inkXY(first)}`;
  let previousRaw: InkPoint | undefined, tip = first;
  let previousClean: InkPoint | undefined, lastClean = first;
  return {
    append(next: InkPoint) {
      if (previousRaw) {
        const clean = denoiseSample(previousRaw, tip, next);
        if (previousClean) prefix += inkSegment(previousClean, lastClean, clean);
        previousClean = lastClean;
        lastClean = clean;
      }
      previousRaw = tip;
      tip = next;
    },
    path() {
      if (!previousRaw) return prefix + ' l0.01 0';
      const tail = previousClean ? inkSegment(previousClean, lastClean, tip) : '';
      return prefix + tail + ` L${inkXY(tip)}`;
    },
  };
}
export function notePath(points: InkPoint[], smooth = true): string {
  if (!points.length) return '';
  if (!smooth) return points.map((p, i) => `${i ? 'L' : 'M'}${inkXY(p)}`).join(' ') + (points.length === 1 ? ' l0.01 0' : '');
  const ink = createLiveNotePath(points[0]);
  for (let i = 1; i < points.length; i++) ink.append(points[i]);
  return ink.path();
}
export function hitsNote(points: [number, number][], x: number, y: number, radius: number): boolean {
  return points.some(([px, py], index) => {
    const [ax, ay] = points[Math.max(0, index - 1)];
    const dx = px - ax, dy = py - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= radius;
  });
}
