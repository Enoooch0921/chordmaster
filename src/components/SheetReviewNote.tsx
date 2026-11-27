import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Trash2 } from 'lucide-react';
import { guardDropRelease, outsideSheetPaper, SheetTrashDock } from './SheetTrashDock';
import { AnimatedPopover } from './ui/InteractionMotion';
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
  const trigger = useRef<HTMLButtonElement>(null);
  const menuItem = useRef<HTMLButtonElement>(null);
  const longPress = useRef<number | undefined>(undefined);
  const [menu, setMenu] = useState<{ x: number; y: number; remove: () => void } | null>(null);
  const suppressClick = useRef(false);
  const zh = language === 'zh';
  const dragging = view !== null;
  function cancel() {
    window.clearTimeout(longPress.current);
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
  useEffect(() => () => window.clearTimeout(longPress.current), []);
  useLayoutEffect(() => {
    if (menu) menuItem.current?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const abort = new AbortController();
    const options = { capture: true, signal: abort.signal };
    const close = () => setMenu(null);
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menuItem.current?.closest('[role="menu"]')?.contains(event.target)) close();
    };
    window.addEventListener('pointerdown', outside, options);
    window.addEventListener('focusin', outside, options);
    window.addEventListener('blur', close, { signal: abort.signal });
    window.addEventListener('resize', close, options);
    window.addEventListener('scroll', close, options);
    return () => abort.abort();
  }, [menu]);
  function openMenu(x: number, y: number) {
    cancel();
    suppressClick.current = true;
    setMenu({ x, y, remove: onRemove });
  }
  function removeAndFocus(remove: () => void) {
    const cell = trigger.current?.closest<HTMLElement>('.sheet-bar');
    setMenu(null);
    remove();
    requestAnimationFrame(() => {
      if (!cell?.isConnected || document.activeElement !== document.body) return;
      const next = cell.querySelector<HTMLElement>('[data-review-note-handle], [data-move-chord]');
      if (!next) cell.tabIndex = -1;
      (next ?? cell).focus({ preventScroll: true });
    });
  }
  const help = zh ? '右鍵或長按開啟選單，也可拖出譜面或按 Delete 刪除標註' : 'Right-click or hold for options, drag off the sheet, or press Delete';
  return <>
    <button ref={trigger} type="button" data-review-note-handle data-review-note-lifted={dragging || undefined}
      data-preview-suppress-pan="true" className="sheet-review-note" draggable={false} title={help}
      aria-description={help} aria-keyshortcuts="Shift+F10 Delete Backspace" aria-haspopup="menu" aria-expanded={!!menu}
      onContextMenu={event => {
        event.preventDefault(); event.stopPropagation();
        if (pointer.current?.moved) return;
        if (event.clientX || event.clientY) openMenu(event.clientX, event.clientY);
        else {
          const rect = event.currentTarget.getBoundingClientRect();
          openMenu(rect.left, rect.bottom);
        }
      }}
      onDragStart={event => event.preventDefault()}
      onPointerDown={event => {
        const sheet = event.currentTarget.closest<HTMLElement>('[data-chord-sheet]');
        if (!sheet || !event.isPrimary || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        suppressClick.current = false;
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, sheet, moved: false, remove: onRemove };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          event.preventDefault();
          const { clientX, clientY } = event;
          longPress.current = window.setTimeout(() => openMenu(clientX, clientY), 500);
        }
      }}
      onPointerMove={event => {
        const p = pointer.current;
        if (!p || p.id !== event.pointerId) return;
        const { clientX: x, clientY: y } = event;
        if (!p.moved && Math.hypot(x - p.x, y - p.y) < 7) return;
        window.clearTimeout(longPress.current);
        p.moved = true;
        suppressClick.current = true;
        setView({ x, y, trash: trashAt(p.sheet, x, y) });
      }}
      onPointerUp={event => {
        const p = pointer.current;
        if (!p && menu) {
          // The touch release can synthesize a click over the newly opened menu.
          const sheet = event.currentTarget.closest<HTMLElement>('[data-chord-sheet]');
          if (sheet) guardDropRelease(sheet, event.clientX, event.clientY);
          return;
        }
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
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault(); event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          openMenu(rect.left, rect.bottom);
          return;
        }
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) removeAndFocus(onRemove);
      }}>
      <GripVertical className="sheet-review-grip print:hidden" data-preview-edit-ui aria-hidden="true" />{text}
    </button>
    {createPortal(<>
      {menu && <AnimatedPopover open animateOnMount origin="0 0" role="menu" aria-label={zh ? '標註操作' : 'Note actions'}
        data-preview-only-control shellClassName="fixed z-[5300] print:hidden"
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1 shadow-lg"
        style={{ left: `clamp(8px, ${menu.x}px, calc(100% - 9rem - 8px))`,
          top: `clamp(8px, ${menu.y}px, calc(100% - 3.5rem - 8px))`, width: '9rem' }}
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault();
            setMenu(null);
            trigger.current?.focus({ preventScroll: true });
          }
        }}>
        <button ref={menuItem} type="button" role="menuitem"
          className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
          onClick={() => removeAndFocus(menu.remove)}>
          <Trash2 size={16} aria-hidden="true" />{zh ? '刪除標註' : 'Delete note'}
        </button>
      </AnimatedPopover>}
      {view && <div className="chord-drag-ghost sheet-review-ghost" data-state={view.trash ? 'trash' : 'idle'}
        data-preview-edit-ui aria-hidden="true" style={{ left: view.x, top: view.y }}>
        {view.trash ? <Trash2 size={14} /> : <GripVertical size={14} />}
        <span>{text}</span>
      </div>}
      <SheetTrashDock visible={dragging} active={!!view?.trash} label={zh ? '拖入以刪除標註' : 'Drop to delete note'} />
    </>, document.body)}
  </>;
}
