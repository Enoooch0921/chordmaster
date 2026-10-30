import { AnimatedPopover } from './ui/InteractionMotion';
import { useIsPresent } from 'motion/react';
import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { AppLanguage } from '../types';
import type { TempoEvent } from '../utils/tempoEvents';
import { formatTempoBpm, MAX_TEMPO_BPM, MIN_TEMPO_BPM } from '../utils/tempoUtils';
import { useAnchoredPortalPanel } from './useAnchoredPortalPanel';

interface Props { value: TempoEvent; language: AppLanguage; label: string; onChange: (value: TempoEvent) => void }

export default function TempoChangeControl({ value, language, label, onChange }: Props) {
  const present = useIsPresent();
  const zh = language === 'zh';
  const mode = value.resetTempo ? 'reset' : value.tempo !== undefined ? 'custom' : 'inherit';
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(formatTempoBpm(value.tempo));
  const [error, setError] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const selectRef = React.useRef<HTMLSelectElement>(null);

  React.useEffect(() => { setDraft(formatTempoBpm(value.tempo)); setError(false); }, [value.tempo, value.resetTempo]);

  const commit = React.useCallback(() => {
    // Reject ranges instead of stripping their punctuation into a different BPM.
    const raw = draft.trim();
    const bpm = /^\d+(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isFinite(bpm) || bpm < MIN_TEMPO_BPM || bpm > MAX_TEMPO_BPM) { setError(true); return false; }
    setError(false);
    if (bpm !== value.tempo || value.resetTempo) onChange({ tempo: bpm, resetTempo: undefined });
    return true;
  }, [draft, onChange, value.tempo, value.resetTempo]);

  const close = React.useCallback(() => {
    if (mode === 'custom' && !commit()) return false;
    setOpen(false);
    return true;
  }, [mode, commit]);
  const cancel = () => {
    setDraft(formatTempoBpm(value.tempo)); setError(false); setOpen(false);
    triggerRef.current?.focus();
  };
  const { panelStyle, placement, transformOrigin, isPositioned } = useAnchoredPortalPanel({ isOpen: open && present, align: 'right', triggerRef, panelRef, onRequestClose: close, zIndex: 5100 });

  React.useEffect(() => {
    if (!open || !present) return;
    const handleOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) close();
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, close, present]);

  React.useEffect(() => {
    if (!open || !present) return;
    const frame = requestAnimationFrame(() => selectRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, present]);

  const display = mode === 'reset' ? (zh ? '原速' : 'Original') : formatTempoBpm(value.tempo) || '—';
  return <div className="inline-flex shrink-0" data-tempo-change-control onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); cancel(); } }}>
    <button ref={triggerRef} type="button" aria-label={zh ? `設定${label}` : `Set ${label.toLowerCase()}`} title={label} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { if (open) close(); else { setDraft(formatTempoBpm(value.tempo)); setError(false); setOpen(true); } }}
      className={`flex h-9 min-w-[92px] items-center justify-between gap-2 rounded-xl border bg-white px-2.5 text-sm font-semibold ${open ? 'border-indigo-500 ring-2 ring-indigo-500' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}>
      <span>♩ {display}</span><ChevronDown size={14} className="text-gray-500" />
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <AnimatedPopover open={open && present} instantExit={!present} ready={isPositioned} panelRef={panelRef} origin={transformOrigin} role="dialog" aria-label={`${label}${zh ? '設定' : ' settings'}`} data-preview-edit-ui data-preview-picker-popover data-placement={placement} style={panelStyle}
        className="w-64 max-w-[calc(100vw-24px)] rounded-2xl border border-gray-200 bg-white p-3 text-xs shadow-xl">
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold text-slate-500">{label}</legend>
          <select ref={selectRef} aria-label={label} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2" value={mode} onChange={event => {
            setError(false);
            const nextMode = event.target.value;
            onChange(nextMode === 'reset' ? { tempo: undefined, resetTempo: true } : nextMode === 'custom' ? { tempo: 120, resetTempo: undefined } : { tempo: undefined, resetTempo: undefined });
            if (nextMode !== 'custom') setOpen(false);
          }}>
            <option value="inherit">{zh ? '延續前一速度' : 'Inherit previous tempo'}</option>
            <option value="custom">{zh ? '指定 BPM' : 'Set BPM'}</option>
            <option value="reset">{zh ? '回到全曲速度' : 'Restore song tempo'}</option>
          </select>
          {mode === 'custom' && <label className="flex items-center gap-2"><input aria-label={`${label} BPM`} aria-invalid={error} inputMode="decimal" className="w-24 rounded-lg border border-slate-300 px-2 py-2" value={draft} onChange={event => { setDraft(event.target.value); setError(false); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (close()) triggerRef.current?.focus(); } }} /><span>BPM</span></label>}
          {error && <span role="alert" className="block text-rose-700">{zh ? '請輸入 20–400 的單一速度，最多兩位小數' : 'Enter one BPM from 20–400, up to two decimals'}</span>}
          <button type="button" className="w-full rounded-lg bg-indigo-600 py-2 font-semibold text-white" onClick={() => { if (close()) triggerRef.current?.focus(); }}>{zh ? '完成' : 'Done'}</button>
        </fieldset>
      </AnimatedPopover>, document.body
    )}
  </div>;
}
