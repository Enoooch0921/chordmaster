import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Ban, CornerUpLeft, GripVertical, Trash2 } from 'lucide-react';
import type { AppLanguage } from '../types';
import {
  movableHarmony,
  type BeatMove,
  type ChartBeatTarget,
  type ChordBeatOffsetValue
} from '../lib/chordTimingReview';
import { chordBeatPositionLabel } from '../utils/chordBeatOffsets';
import { useUiMotion } from '../hooks/useUiMotion';
import { floatingActionVariants } from '../lib/uiMotion';
import './ChordBeatDragLane.css';

export function beatHandle(source: BeatMove, label: string, language: AppLanguage) {
  if (!movableHarmony(source.chord)) return {};
  const position = chordBeatPositionLabel(source.beat, source.offset);
  const help = language === 'zh'
    ? '拖曳或按方向鍵移動和弦，Alt+方向鍵微調半拍，Delete 刪除，Enter 編輯'
    : 'Drag or use arrow keys to move. Alt+arrows nudge half a beat. Delete to remove. Enter to edit.';
  return {
    role: 'button', tabIndex: 0, draggable: false, 'data-preview-suppress-pan': 'true', 'data-move-chord': source.chord,
    'data-move-label': label, 'data-preview-hover-field': 'chords', 'data-move-beat': source.beat, 'data-move-offset': source.offset,
    'aria-label': language === 'zh' ? `${label}，第 ${position} 拍` : `${label}, beat ${position}`,
    'aria-keyshortcuts': 'ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight Delete', title: help, 'aria-description': help
  };
}

function handleAt(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>('[data-move-chord]') : null;
}
function readSource(handle: HTMLElement): BeatMove {
  return { beat: Number(handle.dataset.moveBeat), offset: Number(handle.dataset.moveOffset), chord: handle.dataset.moveChord! };
}

interface Props {
  beats: number;
  children: ReactNode;
  language: AppLanguage;
  renderChord: (source: BeatMove, destination?: ChartBeatTarget) => ReactNode;
  canMove: (source: BeatMove, beat: number, targetOffset?: ChordBeatOffsetValue) => boolean;
  onMove: (source: BeatMove, beat: number, targetOffset?: ChordBeatOffsetValue) => void;
  transfer?: (source: BeatMove, destination: ChartBeatTarget | null, commit: boolean) => boolean;
}

function targetFor(cell: HTMLElement, beat: number, offset?: ChordBeatOffsetValue): ChartBeatTarget {
  return {
    sectionId: cell.dataset.auditionSection!,
    barId: cell.dataset.auditionBar!,
    beats: Number(cell.dataset.chordDropBeats),
    beat,
    ...(offset !== undefined ? { offset } : {})
  };
}

type BeatDrop = {
  kind: 'beat';
  cell: HTMLElement;
  beat: number;
  offset: ChordBeatOffsetValue;
  outcome: 'allow' | 'blocked';
  splitRail: boolean;
  downbeatShare: number;
};
type Drop = { kind: 'idle' | 'trash' } | BeatDrop;

interface Drag {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  active: boolean;
  handle: HTMLElement;
  releaseTouch?: () => void;
  preview?: Drop;
  previewRules?: Props['transfer'];
  localRules?: Props['canMove'];
  source: BeatMove;
  cell: HTMLElement;
  sheet: HTMLElement;
  scroll: HTMLElement | null;
}

function scrollContainer(node: HTMLElement) {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.clientHeight && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return document.scrollingElement as HTMLElement | null;
}

function focusBeat(cell: HTMLElement, beat: number, offset: number) {
  requestAnimationFrame(() => {
    const element = cell.querySelector<HTMLElement>(`[data-move-beat="${beat}"][data-move-offset="${offset}"]`)
      ?? cell.querySelector<HTMLElement>('[data-move-chord]') ?? cell;
    if (element === cell) cell.tabIndex = -1;
    element.focus({ preventScroll: true });
  });
}

// A cross-bar move can unmount the source handle before Safari dispatches click.
function guardDropRelease(sheet: HTMLElement, x: number, y: number) {
  const listeners = new AbortController();
  const options = { capture: true, signal: listeners.signal };
  sheet.setAttribute('data-chord-drop-release', '');
  const clear = () => {
    sheet.removeAttribute('data-chord-drop-release');
    listeners.abort();
    window.clearTimeout(timer);
  };
  const timer = window.setTimeout(clear, 450);
  window.addEventListener('pointerdown', clear, options);
  window.addEventListener('keydown', clear, options);
  window.addEventListener('click', event => {
    if (event.detail && Math.abs(event.clientX - x) <= 2 && Math.abs(event.clientY - y) <= 2) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, options);
}

function beaconLeftPercent(beat: number, offset: ChordBeatOffsetValue, beats: number, splitRail: boolean) {
  const inBeat = splitRail ? (offset === 0 ? 0.3 : 0.78) : 0.5;
  return ((beat + inBeat) / Math.max(1, beats)) * 100;
}

export default function ChordBeatDragLane({
  beats,
  children,
  language,
  renderChord,
  canMove,
  onMove,
  transfer
}: Props) {
  const uiMotion = useUiMotion();
  const pointer = useRef<Drag | null>(null);
  const frame = useRef(0);
  const hold = useRef(0);
  const suppressClick = useRef(false);
  const [view, setView] = useState<{ drop: Drop; x: number; y: number; drag: Drag } | null>(null);

  const cancel = useCallback(() => {
    if (pointer.current?.active) suppressClick.current = true;
    clearTimeout(hold.current);
    pointer.current?.releaseTouch?.();
    pointer.current?.handle.removeAttribute('data-chord-lifted');
    pointer.current = null;
    cancelAnimationFrame(frame.current);
    setView(null);
  }, []);

  function containTouch(event: TouchEvent) {
    if (event.touches.length > 1) { cancel(); return; }
    if (pointer.current?.active && event.cancelable) event.preventDefault();
  }

  useEffect(() => () => {
    clearTimeout(hold.current);
    cancelAnimationFrame(frame.current);
    pointer.current?.releaseTouch?.();
  }, []);

  const dragging = Boolean(view);
  useEffect(() => {
    if (!dragging) return;
    const abort = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    };
    const multi = (e: globalThis.PointerEvent) => { if (!e.isPrimary) cancel(); };
    window.addEventListener('keydown', abort, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('pointerdown', multi, true);
    return () => {
      window.removeEventListener('keydown', abort, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pointerdown', multi, true);
      cancelAnimationFrame(frame.current);
    };
  }, [dragging, cancel]);

  function hit(d: Drag, recheck = false): Drop {
    const { x, y, sheet } = d;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return { kind: 'idle' };
    const el = document.elementFromPoint(x, y);
    if (!el) return { kind: 'idle' };
    const trash = () => ({ kind: transfer?.(d.source, null, false) ? 'trash' : 'idle' } as const);
    if (el.closest('[data-chord-trash]')) return trash();
    const cell = el.closest<HTMLElement>('.sheet-bar');
    if (cell?.dataset.chordDropBeats && cell.closest('[data-chord-sheet]') === sheet) {
      const rect = cell.getBoundingClientRect();
      const cellBeats = Math.max(1, Number(cell.dataset.chordDropBeats));
      const ratio = Math.max(0, Math.min(0.9999, (x - rect.left) / Math.max(1, rect.width)));
      const beatFloat = ratio * cellBeats;
      const beat = Math.floor(beatFloat);
      const frac = beatFloat - beat;
      const beatWidth = rect.width / cellBeats;
      const allowHalfSnap = Boolean(transfer);
      const fromOffbeat = d.source.offset !== 0;
      const splitRail = allowHalfSnap && (fromOffbeat || beatWidth >= 46);
      const downbeatShare = fromOffbeat ? 0.6 : 0.65;
      const offset: ChordBeatOffsetValue = splitRail
        ? (frac < downbeatShare ? 0 : 0.5)
        : (d.source.offset as ChordBeatOffsetValue);

      if (cell === d.cell && beat === d.source.beat && offset === d.source.offset) return { kind: 'idle' };
      if (!recheck && d.preview?.kind === 'beat' && d.preview.cell === cell && d.preview.beat === beat
          && d.preview.offset === offset && d.previewRules === transfer && d.localRules === canMove) {
        return d.preview;
      }

      const valid = cell === d.cell
        ? canMove(d.source, beat, offset)
        : Boolean(transfer?.(d.source, targetFor(cell, beat, offset), false));
      return { kind: 'beat', cell, beat, offset, outcome: valid ? 'allow' : 'blocked', splitRail, downbeatShare };
    }
    if (el.closest('[data-chord-sheet]') && !sheet.contains(el)) return { kind: 'idle' };
    // Use the paper edges, including the gaps between pages. A row gutter or floating editor covering the paper is neutral.
    const pages = sheet.querySelectorAll('[data-export-page-index]');
    const first = pages[0]?.getBoundingClientRect(), last = pages[pages.length - 1]?.getBoundingClientRect();
    if (!first || !last) return { kind: 'idle' };
    const skirt = 26;
    return x < first.left - skirt || x >= first.right + skirt || y < first.top - skirt || y >= last.bottom + skirt ? trash() : { kind: 'idle' };
  }

  function paint() {
    const d = pointer.current;
    if (!d?.active) return;
    const drop = hit(d);
    d.preview = drop;
    d.previewRules = transfer;
    d.localRules = canMove;
    setView({ drop, x: d.x, y: d.y, drag: d });
    const scroller = d.scroll;
    if (!scroller || drop.kind === 'trash') return;
    const rect = scroller.getBoundingClientRect();
    const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    if (d.x < rect.left || d.x >= rect.right || d.y < top || d.y > bottom) return;
    const delta = d.y < top + 42 ? -Math.ceil((top + 42 - d.y) / 4) : d.y > bottom - 42 ? Math.ceil((d.y - bottom + 42) / 4) : 0;
    if (!delta) return;
    const before = scroller.scrollTop;
    scroller.scrollTop += delta;
    if (scroller.scrollTop !== before) frame.current = requestAnimationFrame(paint);
  }

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const handle = handleAt(event.target);
    if (!handle || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (!event.altKey && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); event.stopPropagation(); handle.click(); return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'].includes(event.key)) return;
    if (event.altKey && (event.key === 'Delete' || event.key === 'Backspace')) return;
    event.preventDefault(); event.stopPropagation();
    const source = readSource(handle), cell = handle.closest<HTMLElement>('.sheet-bar');
    if (!cell) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!event.repeat && transfer?.(source, null, true)) focusBeat(cell, source.beat, source.offset);
      return;
    }
    const direction = event.key === 'ArrowLeft' ? -1 : 1;

    // Alt + ArrowLeft/Right nudges by half a beat (e.g. 3& -> 3, 3& -> 4, 3 -> 3&, 4& -> next bar 1).
    if (event.altKey && transfer) {
      const snappedHalf = direction < 0
        ? (source.offset > 0.5 ? 0.5 : source.offset > 0 ? 0 : -0.5)
        : (source.offset < 0.5 ? 0.5 : 1);
      const rawPos = source.beat + snappedHalf;
      if (rawPos >= 0 && rawPos < beats) {
        const destBeat = Math.floor(rawPos);
        const destOffset = (rawPos - destBeat) as ChordBeatOffsetValue;
        const dest = targetFor(cell, destBeat, destOffset);
        if (transfer(source, dest, true)) focusBeat(cell, destBeat, destOffset);
        return;
      }
      const cells = Array.from(cell.closest('[data-chord-sheet]')?.querySelectorAll<HTMLElement>('.sheet-bar[data-audition-bar]') ?? []);
      const neighbor = cells[cells.indexOf(cell) + direction];
      if (!neighbor?.dataset.chordDropBeats) return;
      const neighborBeats = Number(neighbor.dataset.chordDropBeats);
      const destBeat = direction < 0 ? neighborBeats - 1 : 0;
      const destOffset: ChordBeatOffsetValue = direction < 0 ? 0.5 : 0;
      const dest = targetFor(neighbor, destBeat, destOffset);
      if (transfer(source, dest, true)) focusBeat(neighbor, destBeat, destOffset);
      return;
    }

    const beat = source.beat + direction;
    if (beat >= 0 && beat < beats) {
      if (canMove(source, beat)) { onMove(source, beat); focusBeat(cell, beat, source.offset); }
      return;
    }
    const cells = Array.from(cell.closest('[data-chord-sheet]')?.querySelectorAll<HTMLElement>('.sheet-bar[data-audition-bar]') ?? []);
    const neighbor = cells[cells.indexOf(cell) + direction];
    if (!neighbor?.dataset.chordDropBeats) return;
    const dest = targetFor(neighbor, direction < 0 ? Number(neighbor.dataset.chordDropBeats) - 1 : 0);
    if (transfer?.(source, dest, true)) focusBeat(neighbor, dest.beat, source.offset);
  };

  const source = view?.drag.source;
  const beatDrop = view?.drop.kind === 'beat' ? view.drop : null;
  const destinationCell = beatDrop?.cell;
  const destinationBeat = beatDrop?.beat;
  const destinationOffset = beatDrop?.offset;
  const ghostChord = useMemo(() => source && renderChord(source, destinationCell && destinationBeat !== undefined
    ? targetFor(destinationCell, destinationBeat, destinationOffset) : undefined),
  [renderChord, source, destinationCell, destinationBeat, destinationOffset]);

  const ghostVisualState = beatDrop?.outcome ?? view?.drop.kind ?? 'idle';

  return <div className="chord-move-lane" onKeyDown={keyDown}
    onPointerDown={event => {
      suppressClick.current = false;
      const handle = handleAt(event.target);
      if (event.isPrimary === false) { cancel(); return; }
      if (!handle || event.button !== 0 || event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return;
      const cell = handle.closest<HTMLElement>('.sheet-bar'), sheet = handle.closest<HTMLElement>('[data-chord-sheet]');
      if (!cell || !sheet) return;
      pointer.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
        active: false, handle, source: readSource(handle), cell, sheet, scroll: scrollContainer(sheet)
      };
      if (event.pointerType === 'touch') {
        handle.addEventListener('touchmove', containTouch, { passive: false });
        const candidate = pointer.current;
        candidate.releaseTouch = () => handle.removeEventListener('touchmove', containTouch);
        hold.current = window.setTimeout(() => {
          if (pointer.current !== candidate || candidate.active) return;
          candidate.active = true;
          handle.setAttribute('data-chord-lifted', '');
          paint();
        }, 180);
      }
      try { handle.setPointerCapture?.(event.pointerId); } catch { cancel(); }
    }}
    onPointerMove={event => {
      const d = pointer.current;
      if (!d || d.id !== event.pointerId) return;
      d.x = event.clientX; d.y = event.clientY;
      if (!d.active && Math.hypot(d.x - d.startX, d.y - d.startY) < 7) return;
      if (!d.active && event.pointerType === 'touch' && Math.abs(d.y - d.startY) > Math.abs(d.x - d.startX)) {
        suppressClick.current = true;
        cancel();
        return;
      }
      if (!d.active) d.handle.setAttribute('data-chord-lifted', '');
      d.active = true;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(paint);
    }}
    onPointerUp={event => {
      const d = pointer.current;
      if (!d || d.id !== event.pointerId) return;
      d.x = event.clientX; d.y = event.clientY;
      const drop = d.active ? hit(d, true) : null;
      if (d.active) guardDropRelease(d.sheet, d.x, d.y);
      cancel();
      if (drop?.kind === 'trash' && d.preview?.kind === 'trash') transfer?.(d.source, null, true);
      if (drop?.kind === 'beat' && drop.outcome === 'allow') {
        if (drop.cell === d.cell) onMove(d.source, drop.beat, drop.offset);
        else transfer?.(d.source, targetFor(drop.cell, drop.beat, drop.offset), true);
      }
    }}
    onDragStart={event => { if (handleAt(event.target)) event.preventDefault(); }}
    onContextMenu={event => { if (pointer.current?.active) { event.preventDefault(); event.stopPropagation(); } }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onClickCapture={event => {
      if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
    }}>
    {children}
    {beatDrop && createPortal(
      <>
        <div className="chord-drop-rail" data-preview-edit-ui aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${beatDrop.cell.dataset.chordDropBeats}, 1fr)` }}>
          {Array.from({ length: Number(beatDrop.cell.dataset.chordDropBeats) }, (_, beat) => {
            const isBeat = beatDrop.beat === beat;
            const splitStyle = beatDrop.splitRail
              ? { gridTemplateColumns: `${Math.round(beatDrop.downbeatShare * 100)}% ${Math.round((1 - beatDrop.downbeatShare) * 100)}%` }
              : { gridTemplateColumns: '1fr' };
            return <span key={beat} className="chord-drop-rail-beat" style={splitStyle}>
              {beatDrop.splitRail ? ([0, 0.5] as const).map(off => (
                <i key={off} className="chord-drop-rail-cell"
                  data-target={isBeat && beatDrop.offset === off ? beatDrop.outcome : undefined} />
              )) : (
                <i className="chord-drop-rail-cell" data-target={isBeat ? beatDrop.outcome : undefined} />
              )}
            </span>;
          })}
        </div>
        <div className="chord-snap-beacon" data-outcome={beatDrop.outcome} data-preview-edit-ui aria-hidden="true"
          style={{ left: `${beaconLeftPercent(beatDrop.beat, beatDrop.offset, Number(beatDrop.cell.dataset.chordDropBeats), beatDrop.splitRail)}%` }}>
          <span className="chord-snap-badge">
            {beatDrop.outcome === 'blocked'
              ? <Ban size={10} aria-hidden="true" />
              : chordBeatPositionLabel(beatDrop.beat, beatDrop.offset)}
          </span>
          <span className="chord-snap-line" />
        </div>
      </>,
      beatDrop.cell
    )}
    {typeof document !== 'undefined' && createPortal(
      <>
        {view && (
          <div className="chord-drag-ghost" data-state={ghostVisualState} data-preview-edit-ui aria-hidden="true"
            style={{ left: view.x, top: view.y }}>
            {ghostVisualState === 'trash'
              ? <Trash2 size={14} aria-hidden="true" />
              : ghostVisualState === 'idle'
                ? <CornerUpLeft size={14} aria-hidden="true" />
                : ghostVisualState === 'blocked'
                  ? <Ban size={14} aria-hidden="true" />
                  : <GripVertical size={13} aria-hidden="true" />}
            <div className="chord-ghost-label">{ghostChord}</div>
            {beatDrop && beatDrop.outcome !== 'blocked' && (
              <span className="chord-ghost-beat">
                {chordBeatPositionLabel(beatDrop.beat, beatDrop.offset)}
              </span>
            )}
          </div>
        )}
        <AnimatePresence custom={uiMotion}>
          {view && transfer && (
            <motion.div
              key="chord-trash-dock"
              data-chord-trash
              data-active={view.drop.kind === 'trash'}
              className="chord-trash-dock"
              data-preview-edit-ui
              role="status"
              aria-label={language === 'zh' ? '拖入以刪除和弦' : 'Drop to delete chord'}
              custom={uiMotion}
              variants={floatingActionVariants}
              initial={uiMotion.instant ? false : 'hidden'}
              animate="visible"
              exit="exit"
            >
              <Trash2 size={22} aria-hidden="true" />
            </motion.div>
          )}
        </AnimatePresence>
      </>,
      document.body
    )}
  </div>;
}
