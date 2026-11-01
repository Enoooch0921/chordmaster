import { AnimatedPopover } from './ui/InteractionMotion';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useAnchoredPortalPanel } from './useAnchoredPortalPanel';
import type { AppLanguage } from '../types';

interface SetlistSongActionsProps {
  label: string;
  removeLabel: string;
  onRemove: () => void;
  language?: AppLanguage;
  barRowCount?: 1 | 2 | 3;
  onBarRowCountChange?: (count: 1 | 2 | 3) => void;
}

export default function SetlistSongActions({ label, removeLabel, onRemove, language = 'zh', barRowCount = 2, onBarRowCountChange }: SetlistSongActionsProps) {
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
      className="w-52 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface-raised)]"
      onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (current + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
        if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus({ preventScroll: true }); }
      }}>
      {onBarRowCountChange && <div role="group" aria-label={language === 'zh' ? '小節高度' : 'Bar height'} className="border-b border-gray-100 px-2 pb-2 pt-1 dark:border-[color:var(--color-border)]">
        <div className="mb-1 text-xs font-semibold text-gray-500">{language === 'zh' ? '小節高度' : 'Bar height'}</div>
        <div className="flex gap-1">
          {([1, 2, 3] as const).map(count => <button key={count} type="button" role="menuitemradio" aria-checked={barRowCount === count}
            onClick={() => onBarRowCountChange(count)}
            className={`ui-press min-h-11 flex-1 rounded-lg text-sm font-semibold ${barRowCount === count ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10'}`}>
            {language === 'zh' ? `${count} 行` : `${count} ${count === 1 ? 'line' : 'lines'}`}
          </button>)}
        </div>
      </div>}
      <button type="button" role="menuitem" onClick={() => { close(true); onRemove(); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40">
        <Trash2 size={16} />{removeLabel}
      </button>
    </AnimatedPopover>, document.body)}
  </>;
}
