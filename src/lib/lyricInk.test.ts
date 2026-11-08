import { expect, it } from 'vitest';
import { bindLyricMark, pickLyricAnchor, projectLyricInk, type LyricLine } from './lyricInk';
import { noteId, validNoteOperation, type NoteStroke } from './personalNotes';

function layout(size: number, columns: number, originX: number, originY: number): LyricLine {
  const glyphs = Array.from({ length: 12 }, (_, offset) => ({
    offset, row: Math.floor(offset / columns), x: originX + offset % columns * size,
    y: originY + Math.floor(offset / columns) * size * 1.5, width: size, height: size,
  }));
  const byOffset = new Map(glyphs.map(glyph => [glyph.offset, glyph]));
  const rows = Array.from(new Set(glyphs.map(glyph => glyph.row)), row => ({
    glyphs: glyphs.filter(glyph => glyph.row === row), centerY: originY + (row * 1.5 + .5) * size,
  }));
  return { sourceLine: 'chorus:chinese:2', fontSize: size, x: originX, y: originY, width: size * columns,
    height: rows.length * size * 1.5, glyphs: () => ({ rows, byOffset }) };
}
const wide = layout(20, 12, 30, 80);
const narrow = layout(40, 4, 12, 18);
const frame = pickLyricAnchor([wide], 80, 90)!;
const stroke: NoteStroke = { id: noteId(), anchor: frame.anchor, points: [[10 / frame.width, 10 / frame.height], [130 / frame.width, 10 / frame.height]],
  tool: 'highlighter', width: 14, color: '#d97706' };

it('splits a sparse horizontal mark at the new glyph wraps and rejoins it on rotation back', () => {
  const saved = JSON.parse(JSON.stringify(bindLyricMark(stroke, frame, wide)));
  expect(validNoteOperation({ id: noteId(), strokes: [saved], removed: [] })).toBe(true);
  const { segments, width } = projectLyricInk(saved, narrow)!;
  expect(width).toBe(28);
  expect(segments).toHaveLength(3);
  expect(segments[0][0]).toEqual([112, 38]);
  expect(segments[2].at(-1)).toEqual([32, 158]);
  expect(segments.map(segment => new Set(segment.map(p => p[1])).size)).toEqual([1, 1, 1]);
  const restored = projectLyricInk(saved, wide)!;
  expect(restored.segments).toHaveLength(1);
  expect(restored.segments[0][0]).toEqual([80, 90]);
  expect(restored.segments[0].at(-1)).toEqual([200, 90]);
});
it('keeps a handwritten symbol intact and scales its geometry and width around its character', () => {
  const mark: NoteStroke = { ...stroke, tool: 'pen', width: 2.5, points: [[0,0], [.025,-.025], [.05,0], [.025,.025], [0,0]] };
  const saved = bindLyricMark(mark, frame, wide);
  expect(saved.anchor).toMatchObject({ sourceLine: wide.sourceLine, offset: 2 });
  expect(saved.lyricOffsets).toBeUndefined();
  const ink = projectLyricInk(saved, narrow)!;
  expect(ink.width).toBe(5);
  expect(ink.segments).toEqual([[[92,18],[108,2],[124,18],[108,34],[92,18]]]);
});
