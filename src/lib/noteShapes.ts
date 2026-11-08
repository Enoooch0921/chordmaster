type Point = [number, number];
export type NoteShape = 'line' | 'ellipse' | 'rectangle' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'arrow';
export type NoteShapeFeedback = NoteShape | 'holding' | 'unrecognized' | null;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const count = 64;
const polygon = (sides: number, step = 1): Point[] => Array.from({ length: sides + 1 }, (_, i) =>
  [Math.cos(-Math.PI / 2 + i * Math.PI * 2 * step / sides), Math.sin(-Math.PI / 2 + i * Math.PI * 2 * step / sides)]);

// Equal arc-length samples make comparison independent of drawing speed,
// rounded corners, where a loop starts, and clockwise/counterclockwise order.
function resample(points: Point[], closed: boolean): Point[] {
  const trace = closed ? [...points, points[0]] : points;
  const lengths = [0];
  for (let i = 1; i < trace.length; i++) lengths.push(lengths[i - 1] + distance(trace[i - 1], trace[i]));
  const total = lengths.at(-1)!;
  let edge = 1;
  return Array.from({ length: count }, (_, i) => {
    const along = total * i / (closed ? count : count - 1);
    while (edge < trace.length - 1 && lengths[edge] < along) edge++;
    const span = lengths[edge] - lengths[edge - 1];
    const t = span ? (along - lengths[edge - 1]) / span : 0;
    return [trace[edge - 1][0] + t * (trace[edge][0] - trace[edge - 1][0]), trace[edge - 1][1] + t * (trace[edge][1] - trace[edge - 1][1])];
  });
}
const centered = (points: Point[]) => {
  const center: Point = [points.reduce((n, p) => n + p[0], 0) / points.length, points.reduce((n, p) => n + p[1], 0) / points.length];
  return { center, points: points.map(([x, y]): Point => [x - center[0], y - center[1]]) };
};
type Template = { kind: NoteShape; closed: boolean; vertices: Point[]; points: Point[]; energy: number; regular?: Template };
const templates: Template[] = [];
function makeTemplate(kind: NoteShape, vertices: Point[], closed: boolean): Template {
  const sample = centered(resample(vertices, closed));
  return { kind, closed, vertices: vertices.map(([x, y]) => [x - sample.center[0], y - sample.center[1]]),
    points: sample.points, energy: sample.points.reduce((n, [x, y]) => n + x * x + y * y, 0) };
}
function template(kind: NoteShape, vertices: Point[], ratios: number[], closed = true, ideal = vertices) {
  const regular = makeTemplate(kind, ideal, closed);
  for (const ratio of ratios) {
    const scaled = vertices.map(([x, y]): Point => [x * ratio, y]);
    const target = makeTemplate(kind, scaled, closed);
    // Distorted templates accept rough handwriting; the output has uniform
    // proportions. Clearly elongated ovals and rectangles retain their aspect.
    if (['triangle', 'pentagon', 'hexagon', 'star', 'arrow'].includes(kind) || (kind === 'ellipse' && ratio >= .7)) target.regular = regular;
    templates.push(target);
  }
}
template('ellipse', polygon(64), Array.from({ length: 16 }, (_, i) => .25 + i * .05));
template('rectangle', [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]], [.25, .4, .55, .7, .85, 1]);
template('diamond', [[0, -1], [1, 0], [0, 1], [-1, 0], [0, -1]], [.4, .6, .8]);
template('triangle', polygon(3), [.5, .75, 1, 1.4, 2]);
template('triangle', [[-1, -1], [-1, 1], [1, 1], [-1, -1]], [.5, 1, 2], true, polygon(3));
template('pentagon', polygon(5), [.75, 1, 1.35]);
template('hexagon', polygon(6), [.75, 1, 1.35]);
// Keep both familiar ways of drawing a star: crossing strokes and an outline.
template('star', polygon(5, 2), [.7, 1, 1.4]);
template('star', Array.from({ length: 11 }, (_, i) => {
  const r = i % 2 ? .382 : 1, angle = -Math.PI / 2 + i * Math.PI / 5;
  return [r * Math.cos(angle), r * Math.sin(angle)];
}), [.7, 1, 1.4]);
template('arrow', [[-1, 0], [1, 0], [.4, -.5], [1, 0], [.4, .5]], [.7, 1, 1.5, 2], false);
template('arrow', [[.4, -.5], [1, 0], [-1, 0], [1, 0], [.4, .5]], [.7, 1, 1.5, 2], false);
template('arrow', [[-1, 0], [1, 0], [.4, -.5], [.4, .5], [1, 0]], [.7, 1, 1.5, 2], false);

function fitTemplate(source: ReturnType<typeof centered>, energy: number, target: Template) {
  let best = { template: target, score: Infinity, a: 0, b: 0 };
  for (const direction of [1, -1]) for (let start = 0; start < (target.closed ? count : 1); start++) {
    let dot = 0, cross = 0;
    for (let i = 0; i < count; i++) {
      const index = target.closed ? (start + direction * i + count) % count : direction > 0 ? i : count - 1 - i;
      const [x, y] = target.points[index], [px, py] = source.points[i];
      dot += x * px + y * py; cross += x * py - y * px;
    }
    const error = Math.sqrt(Math.max(0, 1 - (dot * dot + cross * cross) / (energy * target.energy)));
    const score = error + (target.kind === 'pentagon' || target.kind === 'hexagon' ? .008 : 0);
    if (score < best.score) best = { template: target, score, a: dot / target.energy, b: cross / target.energy };
  }
  return best;
}

const turn = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function edgeDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Simplify the two arcs of a closed loop. Split at distant points so starting
 * halfway down an edge, or reversing the stroke, does not add an extra corner. */
function contourCorners(loop: Point[], tolerance: number) {
  const farthest = (p: Point) => loop.reduce((best, q, i) => distance(q, p) > distance(loop[best], p) ? i : best, 0);
  const a = farthest(loop[0]), b = farthest(loop[a]);
  const start = Math.min(a, b), split = Math.max(a, b);
  const corners: Point[] = [];
  const simplify = (arc: Point[], lo: number, hi: number) => {
    let error = tolerance, pivot = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = edgeDistance(arc[i], arc[lo], arc[hi]);
      if (d > error) { error = d; pivot = i; }
    }
    if (pivot < 0) { corners.push(arc[lo]); return; }
    simplify(arc, lo, pivot); simplify(arc, pivot, hi);
  };
  const first = loop.slice(start, split + 1), second = [...loop.slice(split), ...loop.slice(0, start + 1)];
  simplify(first, 0, first.length - 1); simplify(second, 0, second.length - 1);
  // The two forced split points can sit on a rounded edge.
  for (let i = corners.length - 1; i >= 0 && corners.length > 3; i--) {
    const n = corners.length;
    if (edgeDistance(corners[i], corners[(i + n - 1) % n], corners[(i + 1) % n]) < tolerance) corners.splice(i, 1);
  }
  return corners;
}

function polygonHint(loop: Point[], w: number, h: number, gap: number) {
  const corners = contourCorners(loop, Math.max(.9, Math.min(Math.hypot(w, h) * .04, Math.min(w, h) * .1)));
  const n = corners.length;
  if (n === 3 && gap < Math.min(w, h) * .85) return { kind: 'triangle', vertices: 4 };
  if (n < 5 || n > 12) return;
  let crossings = 0, leftTurns = 0;
  for (let i = 0; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % n];
    if (turn(a, b, corners[(i + 2) % n]) > 0) leftTurns++;
    for (let j = i + 2; j < n; j++) {
      const c = corners[j], d = corners[(j + 1) % n];
      if (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) crossings++;
    }
  }
  if (n <= 7 && crossings >= 4 && crossings <= 6) return { kind: 'star', vertices: 6 };
  if (!crossings && n >= 9 && Math.min(leftTurns, n - leftTurns) >= 4) return { kind: 'star', vertices: 11 };
}

/** Fit complete stroke trajectories rather than requiring an exact corner count. */
export function recognizeNoteShape(samples: Point[], highlighter = false): { kind: NoteShape; points: Point[] } | null {
  if (samples.length < 2) return null;
  const first = samples[0], last = samples.at(-1)!;
  const direct = distance(first, last);
  const minX = Math.min(...samples.map(p => p[0])), maxX = Math.max(...samples.map(p => p[0]));
  const minY = Math.min(...samples.map(p => p[1])), maxY = Math.max(...samples.map(p => p[1]));
  const w = maxX - minX, h = maxY - minY;
  if (Math.max(w, h) < 18) return null;
  if (direct >= 24) {
    // Fit the whole stroke, so a noisy final sample cannot tilt the intended line.
    const { center, points } = centered(samples);
    let xx = 0, xy = 0, yy = 0;
    for (const [x, y] of points) { xx += x * x; xy += x * y; yy += y * y; }
    const angle = Math.atan2(2 * xy, xx - yy) / 2, c = Math.cos(angle), s = Math.sin(angle);
    const deviation = Math.max(...points.map(([x, y]) => Math.abs(-x * s + y * c)));
    if (deviation < Math.max(highlighter ? 10 : 7, direct * (highlighter ? .18 : .12))) {
      return { kind: 'line', points: [first, last].map(([x, y]) => {
        const along = (x - center[0]) * c + (y - center[1]) * s;
        return [center[0] + along * c, center[1] + along * s];
      }) };
    }
  }
  if (Math.min(w, h) < 10) return null;
  const closed = direct < Math.min(w, h) * .55;
  const polygonLoop = direct <= Math.hypot(w, h) * .55 ? resample(samples, true) : undefined;
  const hint = polygonLoop && polygonHint(polygonLoop, w, h, direct);
  if (!hint && (Math.max(w, h) < 24 || Math.min(w, h) < 16)) return null;
  const source = centered(polygonLoop && (closed || hint) ? polygonLoop : resample(samples, closed));
  const energy = source.points.reduce((n, [x, y]) => n + x * x + y * y, 0);
  let best: ReturnType<typeof fitTemplate> | undefined;
  for (const target of templates) {
    if (hint ? target.kind !== hint.kind || target.vertices.length !== hint.vertices : target.closed !== closed) continue;
    const fit = fitTemplate(source, energy, target);
    if (!best || fit.score < best.score) best = fit;
  }
  if (!best || best.score > (hint ? .40 : .24)) return null;
  // Refit the ideal shape with a single scale, so recognition tolerance never
  // turns into unequal star arms, a stretched circle or a scalene triangle.
  if (best.template.regular) best = fitTemplate(source, energy, best.template.regular);
  const { template: target } = best;
  let { a, b } = best;
  const angle = Math.atan2(b, a), scale = Math.hypot(a, b);
  const step = target.kind === 'star' || target.kind === 'pentagon' ? Math.PI * 2 / 5
    : target.kind === 'triangle' || target.kind === 'hexagon' ? Math.PI / 3 : Math.PI / 2;
  const aligned = Math.round(angle / step) * step;
  if (Math.abs(angle - aligned) < Math.PI / 18) { a = scale * Math.cos(aligned); b = scale * Math.sin(aligned); }
  const points = target.vertices.map(([x, y]): Point => [source.center[0] + a * x - b * y, source.center[1] + b * x + a * y]);
  // A square drawn on its point is normally labelled a diamond by the user.
  const edgeAngle = Math.abs(Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0])) % (Math.PI / 2);
  const square = target.kind === 'rectangle' && Math.abs(distance(points[0], points[1]) / distance(points[1], points[2]) - 1) < .1;
  const kind = square && Math.abs(edgeAngle - Math.PI / 4) < .15 ? 'diamond' : target.kind;
  return { kind, points };
}
