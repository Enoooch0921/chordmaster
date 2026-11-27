import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Trash2 } from 'lucide-react';
import { guardDropRelease, outsideSheetPaper, SheetTrashDock } from './SheetTrashDock';
import type { AppLanguage } from '../types';

interface Props {
  text: string;
  language: AppLanguage;
  onRemove: () => void;
}

function trashAt(sheet: HTMLElement, x: number, y: number) {
  if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
  const hit = document.elementFromPoint(x, y);
  if (!hit) return false;
  if (hit.closest('[data-chord-trash]')) return true;
  const otherSheet = hit.closest('[data-chord-sheet]');
  return (!otherSheet || sheet === otherSheet) && outsideSheetPaper(sheet, x, y);
}

export default function SheetReviewNote({ text, language, onRemove }: Props) {
  const pointer = useRef<{ id: number; x: number; y: number; sheet: HTMLElement; moved: boolean; remove: () => void } | null>(null);
  const [view, setView] = useState<{ x: number; y: number; trash: boolean } | null>(null);
  const suppressClick = useRef(false);
  const zh = language === 'zh';
  const dragging = view !== null;
  function cancel() {
    pointer.current = null;
    setView(null);
  }
  useEffect(() => {
    if (!dragging) return;
    const abort = new AbortController();
    const options = { capture: true, signal: abort.signal };
    window.addEventListener('blur', cancel, options);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
    }, options);
    window.addEventListener('pointerdown', event => { if (!event.isPrimary) cancel(); }, options);
    return () => abort.abort();
  }, [dragging]);
  const help = zh ? '拖出譜面或按 Delete 刪除這則標註' : 'Drag off the sheet or press Delete to remove this note';
  return <>
    <button type="button" data-review-note-handle data-review-note-lifted={dragging || undefined}
      data-preview-suppress-pan="true" className="sheet-review-note" draggable={false} title={help}
      aria-description={help} aria-keyshortcuts="Delete Backspace"
      onDragStart={event => event.preventDefault()}
      onPointerDown={event => {
        const sheet = event.currentTarget.closest<HTMLElement>('[data-chord-sheet]');
        if (!sheet || !event.isPrimary || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        suppressClick.current = false;
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, sheet, moved: false, remove: onRemove };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const p = pointer.current;
        if (!p || p.id !== event.pointerId) return;
        const { clientX: x, clientY: y } = event;
        if (!p.moved && Math.hypot(x - p.x, y - p.y) < 7) return;
        p.moved = true;
        suppressClick.current = true;
        setView({ x, y, trash: trashAt(p.sheet, x, y) });
      }}
      onPointerUp={event => {
        const p = pointer.current;
        if (!p || p.id !== event.pointerId) return;
        const { clientX: x, clientY: y } = event;
        if (p.moved) guardDropRelease(p.sheet, x, y);
        cancel();
        if (p.moved && trashAt(p.sheet, x, y)) p.remove();
      }}
      onClickCapture={event => {
        if (suppressClick.current && event.detail) { event.preventDefault(); event.stopPropagation(); }
      }}
      onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;
        event.preventDefault(); event.stopPropagation();
        if (event.repeat) return;
        const cell = event.currentTarget.closest<HTMLElement>('.sheet-bar');
        onRemove();
        requestAnimationFrame(() => {
          const next = cell?.querySelector<HTMLElement>('[data-review-note-handle], [data-move-chord]');
          if (cell?.isConnected && document.activeElement === document.body) {
            if (!next) cell.tabIndex = -1;
            (next ?? cell).focus({ preventScroll: true });
          }
        });
      }}>
      <GripVertical className="sheet-review-grip print:hidden" data-preview-edit-ui aria-hidden="true" />{text}
    </button>
    {createPortal(<>
      {view && <div className="chord-drag-ghost sheet-review-ghost" data-state={view.trash ? 'trash' : 'idle'}
        data-preview-edit-ui aria-hidden="true" style={{ left: view.x, top: view.y }}>
        {view.trash ? <Trash2 size={14} /> : <GripVertical size={14} />}
        <span>{text}</span>
      </div>}
      <SheetTrashDock visible={dragging} active={!!view?.trash} label={zh ? '拖入以刪除標註' : 'Drop to delete note'} />
    </>, document.body)}
  </>;
}
