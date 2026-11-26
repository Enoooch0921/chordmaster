import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { AppLanguage } from '../types';
import type { BeatMove } from '../lib/chordTimingReview';
import { movableHarmony } from '../lib/chordTimingReview';
import { chordBeatPositionLabel } from '../utils/chordBeatOffsets';
import './ChordBeatDragLane.css';

export function beatHandle(source: BeatMove, label: string, language: AppLanguage) {
  if (!movableHarmony(source.chord)) return {};
  const position = chordBeatPositionLabel(source.beat, source.offset);
  const help = language === 'zh' ? '左右拖曳或用方向鍵換拍，按 Enter 編輯' : 'Drag or use the arrow keys to move. Press Enter to edit.';
  return {
    role: 'button', tabIndex: 0, 'data-preview-suppress-pan': 'true', 'data-move-chord': source.chord,
    'data-move-label': label, 'data-preview-hover-field': 'chords', 'data-move-beat': source.beat, 'data-move-offset': source.offset,
    'aria-label': language === 'zh' ? `${label}，第 ${position} 拍` : `${label}, beat ${position}`,
    'aria-keyshortcuts': 'ArrowLeft ArrowRight', title: help, 'aria-description': help
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
  canMove: (source: BeatMove, beat: number) => boolean;
  onMove: (source: BeatMove, beat: number) => void;
}

export default function ChordBeatDragLane({ beats, children, canMove, onMove }: Props) {
  const pointer = useRef<{ id: number; x: number; y: number; source: BeatMove; label: string; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [over, setOver] = useState<{ beat: number; valid: boolean; label: string } | null>(null);
  const cancel = () => { pointer.current = null; setOver(null); };
  const dropBeat = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || event.clientX < rect.left || event.clientX >= rect.right
        || event.clientY < rect.top - 12 || event.clientY > rect.bottom + 12) return -1;
    return Math.floor((event.clientX - rect.left) / rect.width * beats);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && pointer.current) {
      suppressClick.current = pointer.current.active;
      cancel();
      event.preventDefault(); event.stopPropagation();
      return;
    }
    const handle = handleAt(event.target);
    if (!handle || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation(); handle.click();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); event.stopPropagation();
    const source = readSource(handle);
    const beat = source.beat + (event.key === 'ArrowLeft' ? -1 : 1);
    if (!canMove(source, beat)) return;
    const cell = handle.closest('.sheet-bar');
    onMove(source, beat);
    requestAnimationFrame(() => cell?.querySelector<HTMLElement>(
      `[data-move-beat="${beat}"][data-move-offset="${source.offset}"]`
    )?.focus({ preventScroll: true }));
  };
  return <div className="chord-move-lane" onKeyDown={keyDown}
    onPointerDown={event => {
      suppressClick.current = false;
      const handle = handleAt(event.target);
      if (event.isPrimary === false) { cancel(); return; }
      if (!handle || event.button !== 0 || event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return;
      pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, source: readSource(handle), label: handle.dataset.moveLabel!, active: false };
      try { handle.setPointerCapture?.(event.pointerId); }
      catch { cancel(); } // Native scrolling may already have taken the pointer.
    }}
    onPointerMove={event => {
      const drag = pointer.current;
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.active) {
        const dx = Math.abs(event.clientX - drag.x), dy = Math.abs(event.clientY - drag.y);
        if (dy > 6 && dy > dx) { suppressClick.current = true; cancel(); return; }
        if (dx < 5 || dx < dy) return;
        drag.active = true;
      }
      const beat = dropBeat(event);
      const valid = canMove(drag.source, beat);
      setOver(old => old?.beat === beat && old.valid === valid ? old : { beat, valid, label: drag.label });
    }}
    onPointerUp={event => {
      const drag = pointer.current;
      if (!drag || drag.id !== event.pointerId) return;
      cancel();
      if (!drag.active) return;
      suppressClick.current = true;
      const beat = dropBeat(event);
      if (canMove(drag.source, beat)) onMove(drag.source, beat);
    }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onClickCapture={event => {
      if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
    }}>
    {children}
    {over && <div className="chord-drop-grid" data-preview-edit-ui aria-hidden="true" style={{ gridTemplateColumns: `repeat(${beats}, 1fr)` }}>
      {Array.from({ length: beats }, (_, beat) => <span key={beat} data-target={over.beat === beat ? over.valid ? 'allowed' : 'blocked' : undefined}>
        {beat + 1}{over.beat === beat && over.valid && <b>{over.label}</b>}{over.beat === beat && !over.valid ? ' ×' : ''}
      </span>)}
    </div>}
  </div>;
}
