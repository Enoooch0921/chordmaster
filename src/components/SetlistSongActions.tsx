import { AnimatedPopover } from './ui/InteractionMotion';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useAnchoredPortalPanel } from './useAnchoredPortalPanel';

export default function SetlistSongActions({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const instantExit = useRef(false);
  const close = useCallback((immediate = false) => { instantExit.current = immediate; setOpen(false); }, []);
  const { panelStyle, placement, isPositioned, transformOrigin } = useAnchoredPortalPanel({ isOpen: open, align: 'right', triggerRef: trigger, panelRef: panel, onRequestClose: close });
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [close, open]);
  useEffect(() => { if (open && isPositioned) panel.current?.querySelector('button')?.focus({ preventScroll: true }); }, [open, isPositioned]);
  return <>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { instantExit.current = false; setOpen(value => !value); }} className="ui-press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100">
      <MoreHorizontal size={18} />
    </button>
    {createPortal(<AnimatedPopover open={open} ready={isPositioned} instantExit={instantExit.current} origin={transformOrigin} panelRef={panel} id={id} role="menu" aria-label={label} data-placement={placement} style={panelStyle}
      className="w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface-raised)]"
      onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); panel.current?.querySelector('button')?.focus(); }
        if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus({ preventScroll: true }); }
      }}>
      <button type="button" role="menuitem" onClick={() => { close(true); onRemove(); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40">
        <Trash2 size={16} />{removeLabel}
      </button>
    </AnimatedPopover>, document.body)}
  </>;
}
