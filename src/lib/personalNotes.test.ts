import { describe, expect, it } from 'vitest';
import { createLiveNotePath, hitsNote, mergeNoteOperations, noteId, notePath, projectNotePoints, validNoteOperation, type NoteStroke } from './personalNotes';

const stroke = (): NoteStroke => ({ id: noteId(), anchor: { kind: 'bar', sectionId: 'verse', barId: 'a' },
  color: '#2563eb', tool: 'pen', width: 2.5, points: [[.1, .2], [.5, .3]] });
describe('private handwritten note operations', () => {
  it('keeps live incremental ink identical on lift, including sharp turns and long strokes', () => {
    const points: [number, number][] = [[1, 2], [10, 2], [10, 15], ...Array.from({ length: 2000 }, (_, i): [number, number] => [i + 10, 15 + Math.sin(i / 4) * 3])];
    const live = createLiveNotePath(points[0]);
    expect(live.path()).toBe(notePath(points.slice(0, 1)));
    points.slice(1).forEach((p, i) => {
      live.append(p);
      if (i < 10 || i === points.length - 2) expect(live.path()).toBe(notePath(points.slice(0, i + 2)));
    });
  });
  it('smooths sampled handwriting without lagging the endpoint or rounding recognized shape corners', () => {
    const points: [number, number][] = [[0, 0], [5, 2], [10, 5], [15, 7]];
    expect(notePath(points)).toContain('Q');
    expect(notePath(points)).toMatch(/L15\.00 7\.00$/);
    expect(notePath([[0, 0], [10, 0], [10, 10]])).toBe('M0.00 0.00 L10.00 0.00 L10.00 10.00');
    expect(notePath(points, false)).not.toContain('Q');
    expect(notePath([[2, 3]])).toBe('M2.00 3.00 l0.01 0');
  });
  it('merges offline drawings and erasures in any arrival order without resurrecting deleted ink', () => {
    const a = stroke(), b = stroke();
    const addA = { id: noteId(), strokes: [a], removed: [] }, addB = { id: noteId(), strokes: [b], removed: [] };
    const eraseA = { id: noteId(), strokes: [], removed: [a.id] };
    expect(mergeNoteOperations([eraseA, addB, addA, addA])).toEqual([b]);
    expect(mergeNoteOperations([addA, addB, eraseA])).toEqual([b]);
  });
  it('follows a measure as headers, page placement and notation height change', () => {
    const ink = stroke();
    expect(projectNotePoints(ink, { x: 100, y: 200, width: 200, height: 100 })).toEqual([[120, 220], [200, 230]]);
    expect(projectNotePoints(ink, { x: 50, y: 400, width: 100, height: 200 })).toEqual([[60, 440], [100, 460]]);
  });
  it('erases crossings between sparse pointer samples and rejects remote malformed data', () => {
    expect(hitsNote([[0, 0], [100, 0]], 50, 3, 5)).toBe(true);
    expect(hitsNote([[0, 0], [100, 0]], 50, 20, 5)).toBe(false);
    const op = { id: noteId(), strokes: [stroke()], removed: [] };
    expect(validNoteOperation(op)).toBe(true);
    expect(validNoteOperation({ ...op, strokes: [{ ...op.strokes[0], points: [[Infinity, 0]] }] })).toBe(false);
    expect(validNoteOperation({ ...op, strokes: [{ ...op.strokes[0], color: 'url(https://example.invalid)' }] })).toBe(false);
  });
  it.each(['triangle','diamond','pentagon','hexagon','arrow'] as const)('preserves saved %s geometry when merging operations', shape => {
    const mark = { ...stroke(), shape, points: [[.1,.1],[.5,.1],[.3,.5],[.1,.1]] as [number, number][] };
    const operation = { id: noteId(), strokes: [mark], removed: [] };
    expect(validNoteOperation(operation)).toBe(true);
    expect(mergeNoteOperations([JSON.parse(JSON.stringify(operation))])[0]).toEqual(mark);
  });
});
