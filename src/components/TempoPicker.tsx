import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { AnimatedPopover } from './ui/InteractionMotion';
import { useAnchoredPortalPanel, type PanelAlign } from './useAnchoredPortalPanel';
import { formatTempoBpm, MAX_TEMPO_BPM, MIN_TEMPO_BPM, normalizeTempoBpm, sanitizeTempoInput } from '../utils/tempoUtils';
import './TempoPicker.css';

interface TempoPickerProps {
  value?: number;
  onChange: (tempo: number | undefined) => void;
  language: 'zh' | 'en';
  disabled?: boolean;
  scopeText?: string;
  triggerLabel?: React.ReactNode;
  buttonClassName?: string;
  align?: PanelAlign;
  showOriginalTempo?: boolean;
  originalTempo?: number;
  onAdoptOriginalTempo?: (tempo: number) => Promise<void>;
}

/** Keep in-progress number entry local until the user applies it. */
export default function TempoPicker({ value, onChange, language, disabled = false, scopeText, triggerLabel, buttonClassName = '', align = 'right', showOriginalTempo = false, originalTempo, onAdoptOriginalTempo }: TempoPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [adopting, setAdopting] = React.useState(false);
  const [error, setError] = React.useState('');
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();
  const zh = language === 'zh';
  const close = React.useCallback(() => { if (!adopting) setOpen(false); }, [adopting]);
  const { panelStyle, isPositioned, transformOrigin } = useAnchoredPortalPanel({ isOpen: open, align, triggerRef, panelRef, onRequestClose: close });
  const numericDraft = draft.trim() ? Number(draft) : undefined;
  const valid = numericDraft === undefined || (Number.isFinite(numericDraft) && numericDraft >= MIN_TEMPO_BPM && numericDraft <= MAX_TEMPO_BPM);
  const toggle = () => {
    if (open) { close(); return; }
    setDraft(formatTempoBpm(value));
    setError('');
    setOpen(true);
  };
  const apply = () => {
    if (!valid || disabled || adopting) return;
    const next = normalizeTempoBpm(draft);
    if (next !== value) onChange(next);
    close();
    triggerRef.current?.focus({ preventScroll: true });
  };
  const step = (delta: number) => {
    if (disabled || adopting) return;
    const next = normalizeTempoBpm((Number.isFinite(numericDraft) ? numericDraft! : 120) + delta);
    setDraft(formatTempoBpm(next));
    if (!disabled && next !== value) onChange(next);
  };
  const adopt = async () => {
    if (!onAdoptOriginalTempo || disabled || adopting || !valid || numericDraft === undefined || originalTempo !== undefined) return;
    setAdopting(true); setError('');
    try {
      await onAdoptOriginalTempo(normalizeTempoBpm(numericDraft)!);
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (zh ? '原始速度尚未儲存，請重試。' : 'The original tempo was not saved. Please retry.'));
    } finally { setAdopting(false); }
  };
  React.useEffect(() => {
    if (!open) return;
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
      triggerRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('pointerdown', pointerDown);
    window.addEventListener('keydown', keyDown);
    return () => {
      window.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('keydown', keyDown);
    };
  }, [open, close]);
  React.useEffect(() => {
    if (!open || !isPositioned) return;
    // Keyboard users enter the field; touch users keep the score viewport stable.
    if (document.documentElement.dataset.uiInput === 'keyboard') inputRef.current?.focus({ preventScroll: true });
  }, [open, isPositioned]);
  React.useEffect(() => { if (disabled) close(); }, [disabled, close]);

  return <div ref={rootRef} className="tempo-picker">
    <button ref={triggerRef} type="button" className={`tempo-trigger ${buttonClassName}`} disabled={disabled || adopting} onClick={toggle}
      aria-label={`${zh ? '速度' : 'Tempo'} ${formatTempoBpm(value) || (zh ? '未設定' : 'not set')} BPM`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}>
      {triggerLabel ?? <span className="tempo-trigger-value">{formatTempoBpm(value) || '—'} <span className="tempo-trigger-unit">BPM</span></span>}
      <ChevronDown size={12} aria-hidden="true" />
    </button>
    {typeof document !== 'undefined' && createPortal(
      <AnimatedPopover open={open} ready={isPositioned} panelRef={panelRef} origin={transformOrigin} style={panelStyle} className="tempo-panel" role="dialog" aria-label={zh ? '調整速度' : 'Adjust tempo'} id={id}>
        <form onSubmit={event => { event.preventDefault(); apply(); }}>
          <div className="tempo-panel-heading"><label htmlFor={`${id}-input`}>{zh ? '速度' : 'Tempo'}</label><span>BPM</span></div>
          {scopeText && !showOriginalTempo && <p className="tempo-scope" id={`${id}-scope`}>{scopeText}</p>}
          <div className="tempo-stepper">
            <button type="button" onClick={() => step(-1)} disabled={adopting || (numericDraft !== undefined && numericDraft <= MIN_TEMPO_BPM)} aria-label={zh ? '減少 1 BPM' : 'Decrease 1 BPM'}><Minus size={18}/></button>
            <input ref={inputRef} id={`${id}-input`} aria-label={zh ? '速度 BPM' : 'Tempo BPM'} aria-describedby={`${scopeText && !showOriginalTempo ? `${id}-scope ` : ''}${id}-hint`} aria-invalid={!valid || undefined} inputMode="decimal" autoComplete="off" value={draft} placeholder="—"
              disabled={adopting} onChange={event => { setDraft(sanitizeTempoInput(event.target.value)); setError(''); }} onFocus={event => event.currentTarget.select()}/>
            <button type="button" onClick={() => step(1)} disabled={adopting || (numericDraft !== undefined && numericDraft >= MAX_TEMPO_BPM)} aria-label={zh ? '增加 1 BPM' : 'Increase 1 BPM'}><Plus size={18}/></button>
          </div>
          <p className={valid ? 'sr-only' : 'tempo-hint is-error'} id={`${id}-hint`}>{valid ? (zh ? '20–400 BPM，可輸入小數' : '20–400 BPM, decimals supported') : (zh ? '請輸入 20–400 之間的速度' : 'Enter a tempo between 20 and 400')}</p>
          {showOriginalTempo && <div className="tempo-original">
            {originalTempo !== undefined ? <button type="button" disabled={disabled || adopting || (numericDraft === originalTempo && value === originalTempo)} onClick={() => {
              setDraft(formatTempoBpm(originalTempo)); setError('');
              if (value !== originalTempo) onChange(originalTempo);
            }}>{zh ? '還原歌曲庫速度' : 'Restore library tempo'} · {formatTempoBpm(originalTempo)} BPM</button> : <>
              <p>{zh ? '歌曲庫：未設定' : 'Library: not set'}</p>
              {onAdoptOriginalTempo && <button type="button" disabled={disabled || adopting || !valid || numericDraft === undefined} onClick={() => void adopt()}>
                {adopting ? (zh ? '正在設定…' : 'Saving…') : `${zh ? '設為歌曲原始速度' : 'Set as original tempo'}${valid && numericDraft !== undefined ? ` · ${formatTempoBpm(numericDraft)} BPM` : ''}`}
              </button>}
            </>}
          </div>}
          {error && <p className="tempo-hint is-error" role="alert">{error}</p>}
          <div className="tempo-footer"><button type="button" disabled={adopting} onClick={() => { close(); triggerRef.current?.focus({ preventScroll: true }); }}>{zh ? '關閉' : 'Close'}</button><button type="submit" disabled={!valid || disabled || adopting}>{showOriginalTempo ? (zh ? '套用到歌單' : 'Apply to setlist') : (zh ? '套用' : 'Apply')}</button></div>
        </form>
      </AnimatedPopover>, document.body)}
  </div>;
}
