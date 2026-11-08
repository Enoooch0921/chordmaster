import { expect, it } from 'vitest';
import { recognizeNoteShape } from './noteShapes';
type Point = [number, number];
const trace = (vertices: Point[]) => vertices.slice(1).flatMap((b, i) => Array.from({ length: 12 }, (_, n): Point => {
  const a = vertices[i], t = n / 11; return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}));
const length = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const expectEqual = (values: number[]) => expect(Math.max(...values) - Math.min(...values)).toBeLessThan(.001);
it('makes uneven triangles equilateral and stretched stars regular, while preserving their drawn size', () => {
  const triangle = recognizeNoteShape(trace([[10, 10], [12, 80], [100, 82], [10, 10]]))!;
  expect(triangle.kind).toBe('triangle');
  expectEqual(triangle.points.slice(1).map((p, i) => length(p, triangle.points[i])));
  for (const factor of [.7, 1.4]) {
    const vertices = Array.from({ length: 6 }, (_, i): Point => [100 + factor * 50 * Math.cos(-Math.PI / 2 + i * Math.PI * .8), 100 + 50 * Math.sin(-Math.PI / 2 + i * Math.PI * .8)]);
    const star = recognizeNoteShape(trace(vertices))!;
    expect(star.kind).toBe('star');
    expectEqual(star.points.slice(1).map((p, i) => length(p, star.points[i])));
    const center: Point = [star.points.slice(0, 5).reduce((n,p)=>n+p[0],0)/5, star.points.slice(0,5).reduce((n,p)=>n+p[1],0)/5];
    expectEqual(star.points.slice(0,5).map(p=>length(p,center)));
    expect(length(center,[100,100])).toBeLessThan(5);
    expect(length(star.points[0],center)).toBeGreaterThan(35);
    expect(length(star.points[0],center)).toBeLessThan(65);
  }
});
it('turns a roughly round loop into a true circle but retains an intentional elongated oval', () => {
  const loop = (ratio: number) => Array.from({ length: 65 }, (_, i): Point => [100 + ratio * 45 * Math.cos(i * Math.PI / 32), 100 + 45 * Math.sin(i * Math.PI / 32)]);
  const circle = recognizeNoteShape(loop(.8))!;
  expect(circle.kind).toBe('ellipse');
  const center: Point = [circle.points.slice(0,64).reduce((n,p)=>n+p[0],0)/64, circle.points.slice(0,64).reduce((n,p)=>n+p[1],0)/64];
  expectEqual(circle.points.map(p=>length(p,center)));
  const oval = recognizeNoteShape(loop(.4))!;
  const w = Math.max(...oval.points.map(p=>p[0]))-Math.min(...oval.points.map(p=>p[0]));
  const h = Math.max(...oval.points.map(p=>p[1]))-Math.min(...oval.points.map(p=>p[1]));
  expect(w/h).toBeCloseTo(.4,1);
});
it('gives an uneven arrow two equal wings symmetric around its shaft', () => {
  const arrow = recognizeNoteShape(trace([[8,50],[102,52],[80,30],[102,52],[70,81]]))!;
  expect(arrow.kind).toBe('arrow');
  const tip = arrow.points[1];
  const others = arrow.points.filter(p=>length(p,tip)>1).sort((a,b)=>length(b,tip)-length(a,tip));
  const [tail,left,right] = others;
  expectEqual([length(left,tip),length(right,tip)]);
  const middle: Point = [(left[0]+right[0])/2,(left[1]+right[1])/2];
  expect(Math.abs((middle[0]-tip[0])*(tail[1]-tip[1])-(middle[1]-tip[1])*(tail[0]-tip[0]))).toBeLessThan(.001);
  expect(Math.abs(tail[1]-tip[1])).toBeLessThan(.001);
});
it('straightens a held highlighter and preserves a deliberate curve', () => {
  expect(recognizeNoteShape(Array.from({ length: 60 }, (_, i) => [i * 2, Math.sin(i / 8) * 5]), true)?.kind).toBe('line');
  expect(recognizeNoteShape(trace([[0, 0], [40, 60], [80, 0]]), true)).toBeNull();
});
it('recognizes dense Pencil traces with sub-pixel zigzags and sparse fast lines', () => {
  const points: Point[] = Array.from({ length: 400 }, (_, i) => [i * .3, (i % 2 ? 1 : -1) * .6]);
  expect(recognizeNoteShape(points, true)?.kind).toBe('line');
  expect(recognizeNoteShape([[0, 0], [100, 1]], true)?.kind).toBe('line');
});
it('recognizes a hand-drawn pentagram and preserves its crossing strokes', () => {
  const vertices = Array.from({ length: 6 }, (_, i): Point => [60 + 45 * Math.cos(-Math.PI / 2 + i * Math.PI * .8), 60 + 45 * Math.sin(-Math.PI / 2 + i * Math.PI * .8)]);
  const star = recognizeNoteShape(trace(vertices));
  expect(star?.kind).toBe('star'); expect(star?.points).toHaveLength(6);
});
it.each([false, true])('recognizes uneven crossing stars starting on an edge, reverse=%s', reverse => {
  const vertices: Point[] = [[14, 92], [53, 8], [98, 93], [8, 37], [107, 43], [14, 92]];
  const points = trace(vertices).slice(0, -1);
  const offset = [...points.slice(7), ...points.slice(0, 7)];
  offset.push(offset[0]);
  const wavy = offset.map(([x, y], i): Point => [x + Math.sin(i * .8) * 2, y + Math.cos(i * .7) * 2]);
  const result = recognizeNoteShape(reverse ? wavy.reverse() : wavy);
  expect(result?.kind).toBe('star'); expect(result?.points).toHaveLength(6);
});
it('recognizes the outlined star without inserting crossed lines', () => {
  const outline = [[50, 5], [62, 35], [95, 38], [70, 58], [80, 95], [50, 73], [20, 95], [28, 58], [5, 38], [38, 34], [50, 5]] as Point[];
  const result = recognizeNoteShape(trace(outline));
  expect(result?.kind).toBe('star'); expect(result?.points).toHaveLength(11);
});
it.each([
  ['triangle', [[20, 95], [58, 8], [104, 92], [20, 95]]],
  ['triangle', [[10, 10], [12, 80], [100, 82], [10, 10]]],
  ['diamond', [[52, 8], [80, 60], [50, 108], [20, 57], [52, 8]]],
  ['diamond', [[50, 5], [95, 50], [50, 95], [5, 50], [50, 5]]],
  ['pentagon', [[50, 5], [95, 40], [79, 94], [20, 95], [5, 40], [50, 5]]],
  ['hexagon', [[25, 5], [75, 6], [99, 49], [75, 93], [25, 94], [2, 50], [25, 5]]],
  ['arrow', [[8, 50], [102, 51], [75, 26], [102, 51], [74, 77]]],
  ['arrow', [[75, 26], [102, 51], [8, 50], [102, 51], [74, 77]]],
] as [string, Point[]][])('recognizes common hand-drawn %s marks', (kind, vertices) => {
  const points = trace(vertices).map(([x,y],i): Point=>[x+Math.sin(i)*1.3,y+Math.cos(i*.7)*1.3]);
  expect(recognizeNoteShape(points)?.kind).toBe(kind);
});
it('accepts rough pen lines, imperfectly closed loops, and highlighter stars', () => {
  expect(recognizeNoteShape(trace([[0, 0], [25, 7], [65, -5], [100, 0]]))?.kind).toBe('line');
  const circle = Array.from({ length: 61 }, (_, i): Point => {
    const angle = i * Math.PI / 32, radius = 40 + Math.sin(i * .8) * 4;
    return [50 + radius * Math.cos(angle), 60 + radius * Math.sin(angle)];
  });
  expect(recognizeNoteShape(circle, true)?.kind).toBe('ellipse');
  const star = trace([[60, 10], [86, 99], [15, 38], [108, 35], [32, 103], [61, 14]]);
  expect(recognizeNoteShape(star, true)?.kind).toBe('star');
});
it('recognizes rectangles and round loops but leaves small written characters alone', () => {
  expect(recognizeNoteShape(trace([[10, 10], [90, 12], [88, 70], [9, 68], [10, 10]]))?.kind).toBe('rectangle');
  const circle = Array.from({ length: 65 }, (_, i): Point => [50 + 40 * Math.cos(i * Math.PI / 32), 60 + 40 * Math.sin(i * Math.PI / 32)]);
  expect(recognizeNoteShape(circle)?.kind).toBe('ellipse');
  expect(recognizeNoteShape(circle.map(([x, y]) => [x / 5, y / 5]))).toBeNull();
  expect(recognizeNoteShape(trace([[0, 0], [25, 50], [50, 0], [25, 10], [70, 80]]))).toBeNull();
});

it('preserves a small hexagon with integer-rounded WebKit pointer coordinates', () => {
  const points: Point[] = [[332,435],[334,435],[336,434],[338,434],[339,434],[341,435],[343,435],[346,435],[348,435],[350,434],[351,434],[353,435],[355,435],[357,437],[358,438],[358,440],[359,442],[360,444],[361,446],[363,447],[364,449],[364,450],[365,452],[365,454],[367,456],[367,458],[366,459],[364,460],[363,462],[362,465],[361,467],[361,468],[360,470],[359,471],[357,473],[356,475],[355,477],[354,477],[352,477],[350,476],[347,477],[345,477],[343,478],[342,477],[340,477],[338,477],[335,477],[333,477],[331,478],[331,476],[330,473],[329,471],[327,470],[326,469],[326,467],[325,465],[325,463],[323,461],[322,459],[321,458],[320,457],[322,455],[323,452],[323,450],[324,449],[325,447],[326,446],[327,444],[328,442],[329,439],[329,438],[330,436],[331,435]];
  expect(recognizeNoteShape(points)?.kind).toBe('hexagon');
});

it.each([
  ['triangle', [[12, 10], [25, 131], [50, 105], [17, 18]]],
  ['triangle', [[3, 21], [10, 2], [24, 21], [9, 21]]],
  ['star', [[52, 3], [68, 82], [8, 40], [106, 28], [18, 103], [42, 49]]],
  ['star', [[3, 82], [41, 4], [80, 75], [3, 18], [103, 42], [26, 64]]],
] as [string, Point[]][])('accepts an uneven or partly open %s without requiring a perfect model fit', (kind, vertices) => {
  const path = trace(vertices);
  for (const ink of [path, [...path].reverse()]) {
    const result = recognizeNoteShape(ink);
    expect(result?.kind).toBe(kind);
    expect(result?.points).toHaveLength(kind === 'star' ? 6 : 4);
  }
});
