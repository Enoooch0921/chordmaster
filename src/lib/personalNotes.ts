export const NOTE_COLORS = ['#1e293b', '#dc2626', '#2563eb', '#238454', '#d97706'] as const;
export type NoteTool = 'pen' | 'highlighter' | 'eraser';
export type NoteAnchor = { kind: 'bar'; sectionId: string; barId: string } | { kind: 'page'; page: number };
export interface NoteStroke {
  id: string;
  anchor: NoteAnchor;
  points: [number, number][];
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
      : s.anchor.kind === 'page' && Number.isInteger(s.anchor.page) && s.anchor.page >= 0)
    && Array.isArray(s.points) && s.points.length > 0 && s.points.length <= 4096
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
/** Append only new geometry while drawing; use the same curves as persisted ink. */
export function createLiveNotePath(first: InkPoint) {
  let prefix = `M${inkXY(first)}`, previous: InkPoint | undefined, last = first;
  return {
    append(next: InkPoint) {
      if (previous) prefix += inkSegment(previous, last, next);
      previous = last; last = next;
    },
    path: () => `${prefix}${previous ? ` L${inkXY(last)}` : ' l0.01 0'}`,
  };
}
export function notePath(points: [number, number][], smooth = true): string {
  if (points.length < 3 || !smooth) return points.map((p, i) => `${i ? 'L' : 'M'}${inkXY(p)}`).join(' ') + (points.length === 1 ? ' l0.01 0' : '');
  // Local midpoint curves remove sample corners without a delayed moving average.
  // Keep the live endpoint at the pen and leave deliberate sharp turns intact.
  let path = `M${inkXY(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    path += inkSegment(points[i - 1], points[i], points[i + 1]);
  }
  return `${path} L${inkXY(points[points.length - 1])}`;
}
export function hitsNote(points: [number, number][], x: number, y: number, radius: number): boolean {
  return points.some(([px, py], index) => {
    const [ax, ay] = points[Math.max(0, index - 1)];
    const dx = px - ax, dy = py - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= radius;
  });
}
