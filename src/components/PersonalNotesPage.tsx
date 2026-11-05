import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLiveNotePath, hitsNote, noteId, notePath, projectNotePoints, type NoteAnchor, type NoteFrame, type NoteStroke, type NoteTool } from '../lib/personalNotes';
import { recognizeNoteShape, type NoteShapeFeedback } from '../lib/noteShapes';
import { stationaryNoteEndpoint, type NoteHoldSample } from '../lib/noteHold';

interface Props {
  page: HTMLElement; pageIndex: number; strokes: NoteStroke[]; drawing: boolean; visible: boolean;
  performance: boolean; tool: NoteTool; color: string; width: number;
  shapeEnabled: boolean; onShape: (shape: NoteShapeFeedback) => void;
  onEdit: (edit: { add: NoteStroke[]; remove: string[] }) => void;
}
type Frame = NoteFrame & { anchor: NoteAnchor };
// Storage (including JSONB) may reorder object keys. Match semantic identity so
// synced and restored ink still finds the same bar/page as a freshly drawn mark.
const anchorKey = (anchor: NoteAnchor) => JSON.stringify(anchor.kind === 'bar'
  ? ['bar', anchor.sectionId, anchor.barId]
  : ['page', anchor.page]);
export default function PersonalNotesPage(props: Props) {
  const { page, pageIndex, strokes, drawing, visible, performance, tool, color, width, onEdit } = props;
  const latest = useRef(props); latest.current = props;
  const [frames, setFrames] = useState<Frame[]>([]);
  const [size, setSize] = useState({ width: 794, height: 1123 });
  const livePen = useRef<SVGPathElement>(null), liveHighlighter = useRef<SVGPathElement>(null);
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const svg = useRef<SVGSVGElement>(null);
  const active = useRef<{ pointer: number; frame: Frame; stroke: NoteStroke; rawPoints: [number, number][];
    ink: ReturnType<typeof createLiveNotePath>; path: SVGPathElement | null;
    holdSamples: NoteHoldSample[]; holdStarted?: number; holdResultAt?: [number, number]; erased: Set<string>; eraser: boolean } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number; root: HTMLElement } | null>(null);
  const animation = useRef<number | null>(null);
  const framesRef = useRef(frames); framesRef.current = frames;
  const renderedStrokes = useMemo(() => {
    const byAnchor = new Map(frames.map(frame => [anchorKey(frame.anchor), frame]));
    return strokes.flatMap(stroke => {
      const frame = byAnchor.get(anchorKey(stroke.anchor));
      if (!frame) return [];
      const points = projectNotePoints(stroke, frame);
      return [{ stroke, points, path: notePath(points, !stroke.shape) }];
    });
  }, [strokes, frames]);
  const renderedRef = useRef(renderedStrokes); renderedRef.current = renderedStrokes;
  useLayoutEffect(() => {
    let scheduled = 0;
    const measure = () => {
      const bounds = page.getBoundingClientRect(), scale = bounds.width / page.offsetWidth;
      if (!scale) return;
      const newFrames: Frame[] = [{ anchor: { kind: 'page', page: pageIndex }, x: 0, y: 0, width: page.offsetWidth, height: page.offsetHeight }];
      for (const bar of page.querySelectorAll<HTMLElement>('[data-preview-clipboard-bar]')) {
        const sectionId = bar.dataset.previewClipboardSection, barId = bar.dataset.previewClipboardBar;
        if (!sectionId || !barId) continue;
        const rect = bar.getBoundingClientRect();
        newFrames.push({ anchor: { kind: 'bar', sectionId, barId }, x: (rect.left - bounds.left) / scale,
          y: (rect.top - bounds.top) / scale, width: rect.width / scale, height: rect.height / scale });
      }
      setFrames(old => JSON.stringify(old) === JSON.stringify(newFrames) ? old : newFrames);
      setSize(old => old.width === page.offsetWidth && old.height === page.offsetHeight ? old : { width: page.offsetWidth, height: page.offsetHeight });
    };
    const schedule = () => { cancelAnimationFrame(scheduled); scheduled = requestAnimationFrame(measure); };
    measure();
    const resize = new ResizeObserver(schedule); resize.observe(page);
    for (const bar of page.querySelectorAll('[data-preview-clipboard-bar]')) resize.observe(bar);
    // Header visibility and rearrangement can move bars without resizing them.
    const mutations = new MutationObserver(records => {
      if (records.some(r => !(r.target as Element).closest?.('[data-personal-notes-layer]'))) schedule();
    });
    mutations.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    return () => { resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(scheduled); };
  }, [page, pageIndex]);

  const screenPoint = (x: number, y: number): [number, number] => {
    const rect = page.getBoundingClientRect();
    return [(x - rect.left) * page.offsetWidth / rect.width, (y - rect.top) * page.offsetHeight / rect.height];
  };
  const finish = () => {
    const current = active.current; active.current = null;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    if (holdTimer.current !== null) { clearTimeout(holdTimer.current); latest.current.onShape(null); }
    holdTimer.current = null;
    current?.path?.removeAttribute('d');
    if (current?.eraser) setErasing(new Set());
    if (!current) return;
    latest.current.onEdit(current.eraser ? { add: [], remove: [...current.erased] } : { add: [current.stroke], remove: [] });
  };
  const finishRef = useRef(finish); finishRef.current = finish;
  useLayoutEffect(() => {
    if (!drawing) finishRef.current();
    return () => { if (active.current) finishRef.current(); };
  }, [drawing]);

  const scheduleHold = (current: NonNullable<typeof active.current>) => {
    if (holdTimer.current !== null || current.holdResultAt || !latest.current.shapeEnabled) return;
    const tick = () => {
      holdTimer.current = null;
      if (active.current !== current || !latest.current.shapeEnabled) return;
      const now = Date.now(), endpoint = stationaryNoteEndpoint(current.holdSamples, now);
      if (!endpoint) {
        if (current.holdStarted !== undefined) latest.current.onShape(null);
        current.holdStarted = undefined;
      } else if (current.holdStarted === undefined) {
        current.holdStarted = now;
        latest.current.onShape('holding');
      } else if (now - current.holdStarted >= 150) {
        const scale = page.offsetWidth / page.getBoundingClientRect().width;
        // Preserve the complete geometry; a pause window may contain the last
        // corner as well as endpoint jitter, so it must never crop the trace.
        const trace = projectNotePoints({ ...current.stroke, points: current.rawPoints }, current.frame)
          .map(([x, y]): [number, number] => [x / scale, y / scale]);
        const shape = recognizeNoteShape(trace, current.stroke.tool === 'highlighter');
        current.holdResultAt = [endpoint.x, endpoint.y];
        if (!shape) { latest.current.onShape('unrecognized'); return; }
        const paperPoints = shape.points.map(([x, y]): [number, number] => [x * scale, y * scale]);
        current.stroke.shape = shape.kind;
        current.stroke.points = paperPoints.map(([x, y]) => [(x - current.frame.x) / current.frame.width, (y - current.frame.y) / current.frame.height]);
        current.path?.setAttribute('d', notePath(paperPoints, false));
        latest.current.onShape(shape.kind);
        return;
      }
      holdTimer.current = setTimeout(tick, 50);
    };
    holdTimer.current = setTimeout(tick, 50);
  };

  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = active.current;
    if (!current || current.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const bounds = page.getBoundingClientRect(), scale = page.offsetWidth / bounds.width;
    for (const sample of samples.length ? samples : [event.nativeEvent]) {
      const x = (sample.clientX - bounds.left) * scale, y = (sample.clientY - bounds.top) * scale;
      if (current.eraser) {
        for (const { stroke, points } of renderedRef.current) {
          if (hitsNote(points, x, y, 9 + stroke.width / 2)) current.erased.add(stroke.id);
        }
      } else {
        const p: [number, number] = [(x - current.frame.x) / current.frame.width, (y - current.frame.y) / current.frame.height];
        const last = current.rawPoints.at(-1)!;
        if (current.rawPoints.length < 4096 && Math.hypot((p[0] - last[0]) * current.frame.width, (p[1] - last[1]) * current.frame.height) > 0.45) {
          current.rawPoints.push(p);
          current.ink.append([x, y]);
          if (current.holdResultAt && Math.hypot(x / scale - current.holdResultAt[0], y / scale - current.holdResultAt[1]) > 12) {
            current.holdResultAt = undefined; current.holdStarted = undefined;
            current.stroke.shape = undefined;
            latest.current.onShape(null);
          }
          if (!current.stroke.shape) current.stroke.points = current.rawPoints;
        }
      }
    }
    if (!current.eraser && current.rawPoints.length > 1) {
      const p = current.rawPoints.at(-1)!, now = Date.now();
      current.holdSamples.push({ x: (current.frame.x + p[0] * current.frame.width) / scale,
        y: (current.frame.y + p[1] * current.frame.height) / scale, time: now });
      while (current.holdSamples.length > 2 && current.holdSamples[1].time < now - 800) current.holdSamples.shift();
      scheduleHold(current);
    }
    // Ink reaches the DOM in this input event, without a frame + React commit
    // queue or rebuilding every previous curve. Erasing can still be batched.
    if (!current.eraser && !current.stroke.shape) current.path?.setAttribute('d', current.ink.path());
    if (current.eraser && animation.current === null) animation.current = requestAnimationFrame(() => {
      animation.current = null;
      if (active.current !== current) return;
      setErasing(new Set(current.erased));
    });
  };
  const layerStyle = { visibility: visible ? 'visible' as const : 'hidden' as const };
  return <>
    <svg data-personal-notes-layer data-personal-highlighter-layer data-preview-edit-ui data-preview-only-control aria-hidden="true"
      className="personal-notes-layer personal-notes-highlighter" viewBox={`0 0 ${size.width} ${size.height}`} style={layerStyle}>
      {renderedStrokes.filter(({ stroke }) => stroke.tool === 'highlighter' && !erasing.has(stroke.id)).map(({ stroke, path }) =>
        <path key={stroke.id} data-personal-note-stroke={stroke.id} d={path} stroke={stroke.color} strokeWidth={stroke.width} opacity={0.36} />)}
      <path ref={liveHighlighter} data-personal-note-live="highlighter" opacity={0.36} />
    </svg>
    <svg ref={svg} data-personal-notes-layer data-personal-notes-drawing={drawing || undefined}
    data-preview-edit-ui data-preview-only-control aria-label="Personal handwritten notes"
    className={`personal-notes-layer ${drawing ? 'is-drawing' : ''}`} viewBox={`0 0 ${size.width} ${size.height}`}
    style={{ pointerEvents: drawing ? 'auto' : 'none', touchAction: drawing ? 'none' : 'auto', visibility: visible ? 'visible' : 'hidden' }}
    onContextMenu={event => { if (drawing) event.preventDefault(); }}
    onClick={event => { if (drawing) { event.preventDefault(); event.stopPropagation(); } }}
    onMouseDown={event => { if (drawing) event.stopPropagation(); }}
    onPointerDown={event => {
      if (!drawing || event.pointerType === 'touch' || event.button !== 0 || active.current) return;
      event.preventDefault(); event.stopPropagation();
      const [x, y] = screenPoint(event.clientX, event.clientY);
      let frame = framesRef.current[0];
      let distance = 60;
      for (const candidate of framesRef.current.slice(1)) {
        const d = Math.hypot(Math.max(candidate.x - x, 0, x - candidate.x - candidate.width), Math.max(candidate.y - y, 0, y - candidate.y - candidate.height));
        if (d < distance) { frame = candidate; distance = d; }
      }
      if (!frame) return;
      const path = tool === 'eraser' ? null : tool === 'highlighter' ? liveHighlighter.current : livePen.current;
      path?.setAttribute('stroke', color);
      path?.setAttribute('stroke-width', String(tool === 'highlighter' ? 14 : width));
      active.current = { pointer: event.pointerId, frame, erased: new Set(), eraser: tool === 'eraser',
        ink: createLiveNotePath([x, y]), path,
        holdSamples: [{ x: event.clientX - page.getBoundingClientRect().left, y: event.clientY - page.getBoundingClientRect().top, time: Date.now() }],
        rawPoints: [[(x - frame.x) / frame.width, (y - frame.y) / frame.height]],
        stroke: { id: noteId(), anchor: frame.anchor, points: [[(x - frame.x) / frame.width, (y - frame.y) / frame.height]], color,
          width: tool === 'highlighter' ? 14 : width, tool: tool === 'highlighter' ? 'highlighter' : 'pen' } };
      latest.current.onShape(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      move(event);
    }}
    onPointerMove={move}
    onPointerUp={event => { if (active.current?.pointer === event.pointerId) { move(event); finish(); event.stopPropagation(); } }}
    onPointerCancel={event => { if (active.current?.pointer === event.pointerId) finish(); }}
    onLostPointerCapture={event => { if (active.current?.pointer === event.pointerId) finish(); }}
    onTouchStart={event => {
      if (active.current || Array.from(event.touches).some(t => (t as Touch & { touchType?: string }).touchType === 'stylus')) { event.preventDefault(); event.stopPropagation(); return; }
      if (!performance && event.touches.length === 1) {
        const root = page.closest<HTMLElement>('[data-print-preview-container]');
        if (root) touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, root };
      } else touch.current = null;
    }}
    onTouchMove={event => {
      if (active.current) { event.preventDefault(); event.stopPropagation(); return; }
      if (touch.current && event.touches.length === 1) {
        const t = event.touches[0], previous = touch.current;
        previous.root.scrollLeft += previous.x - t.clientX; previous.root.scrollTop += previous.y - t.clientY;
        previous.x = t.clientX; previous.y = t.clientY;
        event.preventDefault(); event.stopPropagation();
      }
    }}
    onTouchEnd={event => {
      touch.current = null;
      if (active.current || Array.from(event.changedTouches).some(t => (t as Touch & { touchType?: string }).touchType === 'stylus')) event.stopPropagation();
    }}>
    {renderedStrokes.filter(({ stroke }) => stroke.tool !== 'highlighter').map(({ stroke, path }) => {
      return !erasing.has(stroke.id) ? <path key={stroke.id} data-personal-note-stroke={stroke.id} d={path}
        stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.tool === 'highlighter' ? 0.28 : 1} /> : null;
    })}
    <path ref={livePen} data-personal-note-live="pen" />
  </svg></>;
}
