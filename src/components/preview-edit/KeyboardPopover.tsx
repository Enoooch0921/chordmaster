import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function KeyboardPopover({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ left: 8, top: 8, width: 360 });
  const trigger = React.useRef<HTMLButtonElement>(null), panel = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const viewport = window.visualViewport;
      const width = Math.min(400, (viewport?.width ?? innerWidth) - 16);
      const anchor = trigger.current.getBoundingClientRect();
      const left = Math.max((viewport?.offsetLeft ?? 0) + 8, Math.min(anchor.right - width, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) - width - 8));
      const top = Math.max((viewport?.offsetTop ?? 0) + 8, anchor.top - panel.current.getBoundingClientRect().height - 8);
      setPosition(current => current.left === left && current.top === top && current.width === width ? current : {left, top, width});
    };
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({preventScroll:true}); } };
    place(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place); if (panel.current) observer?.observe(panel.current); panel.current?.focus({preventScroll:true});
    window.addEventListener('resize', place); window.visualViewport?.addEventListener('resize', place);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  return <><button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600" onClick={()=>setOpen(value=>!value)}>{label}</button>{open&&createPortal(<div ref={panel} data-preview-edit-ui data-keyboard-auxiliary data-keyboard-refined tabIndex={-1} role="dialog" aria-label={label} style={{position:'fixed',...position,zIndex:6500}} className="rounded-xl border border-slate-200 bg-[var(--color-surface-raised)] p-2 shadow-xl" onKeyDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()}><header className="mb-2 flex items-center justify-between text-xs font-semibold"><span>{label}</span><button type="button" className="flex size-8 items-center justify-center rounded-md" aria-label={`關閉${label}`} onClick={()=>setOpen(false)}><X size={16}/></button></header>{children}</div>,document.body)}</>;
}

export function KeyboardNotice({message,anchorRef}:{message:string|null;anchorRef:React.RefObject<HTMLElement|null>}){
  const [position,setPosition]=React.useState({left:8,top:8,width:320});const notice=React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(()=>{if(!message)return;const place=()=>{const anchor=anchorRef.current?.getBoundingClientRect();if(!anchor)return;const width=Math.min(360,innerWidth-16,anchor.width);const top=Math.max((window.visualViewport?.offsetTop??0)+8,anchor.top-(notice.current?.getBoundingClientRect().height??48)-8);setPosition({left:Math.max(8,Math.min(anchor.left,innerWidth-width-8)),top,width});};place();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(place);if(anchorRef.current)observer?.observe(anchorRef.current);window.visualViewport?.addEventListener('resize',place);return()=>{observer?.disconnect();window.visualViewport?.removeEventListener('resize',place);};},[message,anchorRef]);
  return message?createPortal(<div ref={notice} role="status" data-keyboard-feedback style={{position:'fixed',...position,zIndex:6600,pointerEvents:'none'}} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900 shadow-md">{message}</div>,document.body):null;
}
