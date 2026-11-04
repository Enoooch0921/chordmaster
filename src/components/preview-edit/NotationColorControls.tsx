import React from 'react';
import { useIsPresent } from 'motion/react';
import { AnimatedPopover } from '../ui/InteractionMotion';
import { createPortal } from 'react-dom';
import { Palette } from 'lucide-react';
import { ANNOTATION_COLOR_OPTIONS } from '../../constants/annotationColors';
import type { AnnotationColorId, AppLanguage } from '../../types';

interface Props {
  label: string;
  language: AppLanguage;
  selected?: AnnotationColorId;
  disabled?: boolean;
  persistent: boolean;
  onSelect: (color: AnnotationColorId) => void;
}

export default function NotationColorControls({ label, language, selected, disabled, persistent, onSelect }: Props) {
  const present = useIsPresent();
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ left: number; top: number; width: number } | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const popup = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { setOpen(false); }, [label, persistent]);
  React.useEffect(() => {
    if (open && present && position && popup.current && !popup.current.contains(document.activeElement)) {
      (popup.current.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
        ?? popup.current.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    }
  }, [open, position, present]);
  React.useLayoutEffect(() => {
    if (!open || persistent || !present) return;
    const place = () => {
      if (!trigger.current || !popup.current) return;
      const viewport = window.visualViewport;
      const width = Math.min(360, (viewport?.width ?? window.innerWidth) - 16);
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const anchor = trigger.current.getBoundingClientRect();
      const height = popup.current.getBoundingClientRect().height;
      setPosition({ width, left: Math.max(leftEdge, Math.min(anchor.right - width, leftEdge + (viewport?.width ?? window.innerWidth) - width - 16)), top: Math.max(topEdge, anchor.top - height - 8) });
    };
    const outside = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true });
    };
    place();
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open, persistent, present]);
  const choices = <div data-preview-color-controls className={`grid grid-cols-6 gap-1 ${persistent ? 'flex-1' : ''}`}>
    {ANNOTATION_COLOR_OPTIONS.map(option => <button key={option.id} type="button" disabled={disabled}
      aria-label={`${label}: ${language === 'zh' ? option.labelZh : option.label}`} aria-pressed={selected === option.id}
      title={language === 'zh' ? option.labelZh : option.label}
      className={`${persistent ? 'min-h-9' : 'min-h-11'} min-w-0 rounded-md border disabled:cursor-not-allowed disabled:opacity-35`}
      style={{ background: selected === option.id ? option.text : option.soft, borderColor: option.border, color: selected === option.id ? '#fff' : option.text }}
      onClick={() => { onSelect(option.id); if (!persistent) { setOpen(false); trigger.current?.focus({ preventScroll: true }); } }}>
      <span aria-hidden="true" className="mx-auto block h-3.5 w-3.5 rounded-full border border-white/70" style={{ background: selected === option.id ? '#fff' : option.text }}/>
    </button>)}
  </div>;
  if (persistent) return <div data-desktop-color-toolbar className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-[var(--color-surface-raised)] px-2.5 py-2"><span className="text-[11px] font-medium text-[var(--color-text-muted)]">{label}</span>{choices}</div>;
  return <>
    <button ref={trigger} type="button" data-preview-color-trigger disabled={disabled} aria-label={language === 'zh' ? '顏色' : 'Color'} aria-haspopup="dialog" aria-expanded={open}
      className="flex min-h-11 min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-300 bg-slate-100 text-slate-600 disabled:opacity-35"
      onClick={() => { setPosition(null); setOpen(value => !value); }}><Palette size={16} aria-hidden="true"/><span className="text-[11px]">{language === 'zh' ? '顏色' : 'Color'}</span></button>
    {createPortal(<AnimatedPopover open={open && present} ready={Boolean(position)} instantExit={!present} panelRef={popup} origin="100% 100%" data-preview-edit-ui data-preview-color-popover data-keyboard-refined role="dialog" aria-label={language === 'zh' ? `${label}選擇` : `${label} chooser`}
      shellClassName="fixed z-[6500]" className="rounded-xl border border-slate-200 bg-[var(--color-surface-raised)] p-2 shadow-xl"
      style={{ width: Math.min(360, (window.visualViewport?.width ?? window.innerWidth) - 16), left: position?.left ?? 8, top: position?.top ?? 8, visibility: position ? 'visible' : 'hidden' }}
      onKeyDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()}>
      <div className="mb-2 text-[12px] font-semibold text-[var(--color-text)]">{label}</div>{choices}
    </AnimatedPopover>, document.body)}
  </>;
}
