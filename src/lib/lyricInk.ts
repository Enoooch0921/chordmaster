import { projectNotePoints, type NoteFrame, type NoteStroke } from './personalNotes';

type Point = [number, number];
type Glyph = NoteFrame & { offset: number; row: number };
type Row = { glyphs: Glyph[]; centerY: number };
type LyricAnchor = Extract<NoteStroke['anchor'], { kind: 'lyric' }>;
export type LyricLine = NoteFrame & {
  sourceLine: string; fontSize: number;
  glyphs: () => { rows: Row[]; byOffset: Map<number, Glyph> };
};

function measureGlyphs(line: HTMLElement, page: DOMRect, scale: number) {
  const rows: Row[] = [], byOffset = new Map<number, Glyph>();
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let start = 0;
    for (const character of node.textContent ?? '') {
      range.setStart(node, start);
      range.setEnd(node, start + character.length);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const glyph = { offset, row: 0, x: (rect.left - page.left) / scale, y: (rect.top - page.top) / scale,
          width: rect.width / scale, height: rect.height / scale };
        const centerY = glyph.y + glyph.height / 2;
        let row = rows.at(-1);
        // Fallback fonts on the same baseline can have different text bounds.
        if (!row || Math.abs(centerY - row.centerY) > glyph.height / 2) {
          row = { glyphs: [], centerY }; rows.push(row);
        }
        glyph.row = rows.length - 1;
        row.glyphs.push(glyph); byOffset.set(offset, glyph);
      }
      offset += character.length; start += character.length;
    }
  }
  return { rows, byOffset };
}

export function measureLyricLines(page: HTMLElement, bounds: DOMRect, scale: number): LyricLine[] {
  return Array.from(page.querySelectorAll<HTMLElement>('[data-source-line]')).flatMap(line => {
    const rect = line.getBoundingClientRect(), fontSize = parseFloat(getComputedStyle(line).fontSize);
    if (!rect.width || !rect.height || !fontSize) return [];
    let cached: ReturnType<typeof measureGlyphs> | undefined;
    return [{ sourceLine: line.dataset.sourceLine!, fontSize,
      x: (rect.left - bounds.left) / scale, y: (rect.top - bounds.top) / scale, width: rect.width / scale, height: rect.height / scale,
      // The page may have scrolled since layout. Read its current origin when
      // resolving a line for the first time. Untouched lines need no text ranges.
      glyphs: () => cached ??= measureGlyphs(line, page.getBoundingClientRect(), scale) }];
  });
}

function nearest<T>(items: T[], distance: (item: T) => number) {
  let best: T | undefined, min = Infinity;
  for (const item of items) {
    const d = distance(item);
    if (d < min) { best = item; min = d; }
  }
  return best;
}
function nearestGlyph(row: Row, x: number) {
  return nearest(row.glyphs, glyph => Math.abs(x - glyph.x - glyph.width / 2))!;
}
function glyphFrame(line: LyricLine, glyph?: Glyph): NoteFrame {
  // Sixteen ems keeps stored coordinates small even on wide desktop displays.
  return { x: glyph?.x ?? line.x, y: glyph?.y ?? line.y, width: 16 * line.fontSize, height: 16 * line.fontSize };
}

export function pickLyricAnchor(lines: LyricLine[], x: number, y: number) {
  const line = nearest(lines, l => Math.hypot(Math.max(l.x - x, 0, x - l.x - l.width), Math.max(l.y - y, 0, y - l.y - l.height)));
  if (!line) return;
  const row = nearest(line.glyphs().rows, r => Math.abs(r.centerY - y));
  const glyph = row && nearestGlyph(row, x);
  const anchor: LyricAnchor = { kind: 'lyric', sourceLine: line.sourceLine, offset: glyph?.offset ?? 0, fontSize: line.fontSize };
  return { ...glyphFrame(line, glyph), anchor, line };
}

/** Handwriting keeps its shape around one character. Horizontal marks over
 * several characters follow the text through changes of line breaks. */
export function bindLyricMark(stroke: NoteStroke, frame: NoteFrame, line: LyricLine): NoteStroke {
  if (stroke.anchor.kind !== 'lyric' || (stroke.shape && stroke.shape !== 'line') || stroke.points.length < 2) return stroke;
  const points = projectNotePoints(stroke, frame);
  const [firstX, firstY] = points[0], [lastX] = points.at(-1)!;
  let top = firstY, bottom = firstY, travel = 0;
  points.forEach(([x, y], i) => { top = Math.min(top, y); bottom = Math.max(bottom, y); if (i) travel += Math.abs(x - points[i - 1][0]); });
  const length = Math.abs(lastX - firstX);
  if (length < line.fontSize || bottom - top > Math.min(line.fontSize * .55, length / 4) || travel > length * 1.2) return stroke;
  const row = nearest(line.glyphs().rows, r => Math.abs(r.centerY - firstY));
  if (!row || Math.abs(row.centerY - firstY) > line.fontSize * 1.25 || nearestGlyph(row, firstX) === nearestGlyph(row, lastX)) return stroke;
  const offsets: number[] = [], relative: Point[] = [];
  const append = (x: number, y: number) => {
    const glyph = nearestGlyph(row, x);
    offsets.push(glyph.offset);
    relative.push([(x - glyph.x) / frame.width, (y - glyph.y) / frame.height]);
  };
  append(firstX, firstY);
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    // A snapped line can consist of just two endpoints. Sample the intervening
    // text too, so both halves remain visible when it splits across two rows.
    const count = Math.max(1, Math.ceil(Math.abs(bx - ax) / (line.fontSize / 4)));
    if (relative.length + count + points.length - i - 1 > 4096) {
      append(bx, by);
    } else for (let j = 1; j <= count; j++) append(ax + (bx - ax) * j / count, ay + (by - ay) * j / count);
  }
  return { ...stroke, points: relative, lyricOffsets: offsets };
}

export function projectLyricInk(stroke: NoteStroke, line: LyricLine) {
  if (stroke.anchor.kind !== 'lyric') return;
  const { byOffset } = line.glyphs();
  const width = stroke.width * line.fontSize / stroke.anchor.fontSize;
  const base = byOffset.get(stroke.anchor.offset);
  if (!stroke.lyricOffsets) return { segments: [projectNotePoints(stroke, glyphFrame(line, base))], width };
  const segments: Point[][] = [];
  let previousRow: number | undefined;
  stroke.points.forEach(([x, y], i) => {
    const offset = stroke.lyricOffsets![i], glyph = byOffset.get(offset);
    if (!glyph) return;
    if (previousRow !== glyph.row) segments.push([]);
    segments.at(-1)!.push([glyph.x + x * 16 * line.fontSize, glyph.y + y * 16 * line.fontSize]);
    previousRow = glyph.row;
  });
  return { segments, width };
}
