import { AnimatedPopover } from './ui/InteractionMotion';
import SlidingSelection from './ui/SlidingSelection';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAnchoredPortalPanel } from './useAnchoredPortalPanel';
import type { AppLanguage } from '../types';

interface SetlistSongActionsProps {
  label: string;
  removeLabel: string;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  language?: AppLanguage;
  barRowCount?: 1 | 2 | 3;
  onBarRowCountChange?: (count: 1 | 2 | 3) => void;
}

export default function SetlistSongActions({ label, removeLabel, onRemove, onMoveUp, onMoveDown, language = 'zh', barRowCount = 2, onBarRowCountChange }: SetlistSongActionsProps) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  if (open && !hasOpened) setHasOpened(true);
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
    {hasOpened && createPortal(<AnimatedPopover animateOnMount open={open} ready={isPositioned} instantExit={instantExit.current} origin={transformOrigin} panelRef={panel} id={id} role="menu" aria-label={label} data-placement={placement} style={panelStyle}
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
      {onBarRowCountChange && <div role="group" aria-label={language === 'zh' ? '小節高度' : 'Bar height'} className="px-2 pb-2 pt-1">
        <div className="mb-1 text-xs font-semibold text-gray-500">{language === 'zh' ? '小節高度' : 'Bar height'}</div>
        <div className="relative flex gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-[color:var(--color-surface-sunken)]">
          <SlidingSelection index={barRowCount - 1} count={3} inset={2} gap={4}
            className="bg-white shadow-sm ring-1 ring-inset ring-indigo-200 dark:bg-[color:var(--color-indigo-950)] dark:ring-[color:var(--color-indigo-700)]" style={{ borderRadius: 6 }} />
          {([1, 2, 3] as const).map(count => <button key={count} type="button" role="menuitemradio" aria-checked={barRowCount === count}
            onClick={() => onBarRowCountChange(count)}
            className={`relative min-h-10 flex-1 rounded-md text-sm font-semibold tabular-nums transition-colors ${barRowCount === count ? 'text-indigo-800 dark:text-indigo-200' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300'}`}>
            {language === 'zh' ? `${count} 行` : `${count} ${count === 1 ? 'line' : 'lines'}`}
          </button>)}
        </div>
      </div>}
      {(onMoveUp || onMoveDown) && <>
        {onBarRowCountChange && <div role="separator" className="my-1 border-t border-gray-100 dark:border-[color:var(--color-border)]" />}
        {onMoveUp && <button type="button" role="menuitem" onClick={() => { close(true); onMoveUp(); }} className="ui-press flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">
          <ArrowUp size={16} />{language === 'zh' ? '上移一首' : 'Move up'}
        </button>}
        {onMoveDown && <button type="button" role="menuitem" onClick={() => { close(true); onMoveDown(); }} className="ui-press flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">
          <ArrowDown size={16} />{language === 'zh' ? '下移一首' : 'Move down'}
        </button>}
      </>}
      {(onBarRowCountChange || onMoveUp || onMoveDown) && <div role="separator" className="my-1 border-t border-gray-100 dark:border-[color:var(--color-border)]" />}
      <button type="button" role="menuitem" onClick={() => { close(true); onRemove(); }} className="ui-press flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40">
        <Trash2 size={16} />{removeLabel}
      </button>
    </AnimatedPopover>, document.body)}
  </>;
}
