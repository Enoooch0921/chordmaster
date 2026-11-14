import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import type { AuditionScope } from '../../lib/chordAudition';
import { useAnchoredPortalPanel } from '../useAnchoredPortalPanel';

interface Props {
  zh: boolean;
  scope: AuditionScope;
  labels: Record<AuditionScope, string>;
  setScope: (scope: AuditionScope) => void;
  metronome: boolean;
  setMetronome: (enabled: boolean) => void;
  melody: boolean;
  setMelody: (enabled: boolean) => void;
}

export default function ChordAuditionSettings({ zh, labels, scope, setScope, metronome, setMetronome, melody, setMelody }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const title = zh ? '試聽設定' : 'Audition settings';
  const close = useCallback(() => setOpen(false), []);
  const { panelStyle, isPositioned } = useAnchoredPortalPanel({
    isOpen: open, align: 'center', triggerRef: trigger, panelRef: panel, onRequestClose: close, zIndex: 6500
  });
  const returnFocus = () => { close(); trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (open && isPositioned) panel.current?.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true });
  }, [open, isPositioned]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const node = event.target as Node;
      if (!trigger.current?.contains(node) && !panel.current?.contains(node)) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open, close]);

  return <>
    <button ref={trigger} type="button" className="chord-audition-scope" title={title} aria-label={title}
      aria-controls={open ? id : undefined} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && createPortal(<div id={id} ref={panel} role="dialog" aria-label={title} data-preview-edit-ui data-keyboard-refined
      className="chord-audition-settings" style={panelStyle}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); returnFocus(); }
        // Move out of the portal in the editor's own tab order.
        const checkbox = event.target instanceof HTMLInputElement && event.target.type === 'checkbox';
        const last = panel.current?.querySelector('input[name="audition-melody"]');
        if (event.key === 'Tab' && (event.shiftKey ? !checkbox : event.target === last)) {
          if (event.shiftKey) event.preventDefault();
          returnFocus();
        }
      }}>
      <fieldset>
        <legend>{zh ? '試聽範圍' : 'Audition range'}</legend>
        {(['chord', 'bar', 'section', 'song'] as const).map(value =>
          <label className="chord-audition-option" key={value}>
            <input type="radio" name={id} checked={scope === value} value={value} onChange={() => setScope(value)}
              onClick={event => { if (event.detail > 0) returnFocus(); }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setScope(value); returnFocus(); } }} />
            <span>{labels[value]}</span>
            {scope === value && <Check size={16} aria-hidden="true" />}
          </label>)}
      </fieldset>
      <label className="chord-audition-click-option">
        <span>{zh ? '連播節拍器' : 'Playback metronome'}</span>
        <input name="audition-metronome" type="checkbox" checked={metronome} onChange={event => setMetronome(event.target.checked)} />
      </label>
      <label className="chord-audition-melody-option">
        <span>{zh ? '旋律（簡譜）' : 'Melody (jianpu)'}</span>
        <input name="audition-melody" type="checkbox" checked={melody} onChange={event => setMelody(event.target.checked)} />
      </label>
    </div>, document.body)}
  </>;
}
