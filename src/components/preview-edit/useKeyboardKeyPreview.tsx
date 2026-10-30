import React from 'react';
import { createPortal } from 'react-dom';
import { JianpuInputGlyph, RhythmStaffKeyGlyph } from './NotationKeyGlyphs';
import type { RhythmBase } from '../../utils/rhythmUtils';
import type { JianpuInputMode } from '../../utils/jianpuUtils';

interface PressedKey {
  rect: DOMRect;
  label: string;
  content: React.ReactNode;
  musical: boolean;
  pointerId: number;
}

export function useKeyboardKeyPreview(enabled: boolean) {
  const [pressed, setPressed] = React.useState<PressedKey | null>(null);
  const current = React.useRef<PressedKey | null>(null);
  const clear = React.useCallback(() => { current.current = null; setPressed(null); }, []);
  React.useEffect(() => {
    const move = (event: PointerEvent) => {
      const key = current.current;
      if (!key || event.pointerId !== key.pointerId) return;
      const r = key.rect;
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) clear();
    };
    document.addEventListener('pointerup', clear);
    document.addEventListener('pointercancel', clear);
    document.addEventListener('pointermove', move);
    window.addEventListener('blur', clear);
    window.addEventListener('resize', clear);
    return () => {
      document.removeEventListener('pointerup', clear);
      document.removeEventListener('pointercancel', clear);
      document.removeEventListener('pointermove', move);
      window.removeEventListener('blur', clear);
      window.removeEventListener('resize', clear);
    };
  }, [clear]);
  React.useEffect(() => { if (!enabled) clear(); }, [enabled, clear]);

  const onPointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0 || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled || button.hasAttribute('aria-haspopup')
      || !(button.closest('[data-key-surface="character"]') || button.hasAttribute('data-key-preview'))) return;
    const rhythm = button.querySelector<HTMLElement>('[data-rhythm-staff-key-glyph]');
    const jianpu = button.querySelector<HTMLElement>('[data-jianpu-input-glyph]');
    let content: React.ReactNode = button.textContent?.trim();
    if (rhythm) content = <RhythmStaffKeyGlyph base={rhythm.dataset.rhythmBase as RhythmBase} isRest={rhythm.dataset.rhythmRest === 'true'} triplet={rhythm.dataset.rhythmTriplet === 'true'}/>;
    else if (jianpu) content = <JianpuInputGlyph pitch={jianpu.dataset.jianpuPitch ?? ''} accidental={jianpu.dataset.jianpuAccidental === 'natural' ? '' : jianpu.dataset.jianpuAccidental as JianpuInputMode['accidental']} octave={Number(jianpu.dataset.jianpuOctave) as JianpuInputMode['octave']} duration={jianpu.dataset.jianpuDuration as JianpuInputMode['duration']} dotted={jianpu.dataset.jianpuDotted === 'true'} triplet={jianpu.dataset.jianpuTriplet === 'true'}/>;
    const key = { rect: button.getBoundingClientRect(), label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '', content, musical: Boolean(rhythm || jianpu), pointerId: event.pointerId };
    current.current = key; setPressed(key);
  }, [enabled]);

  let preview: React.ReactPortal | null = null;
  if (pressed) {
    const viewport = window.visualViewport;
    const text = typeof pressed.content === 'string' ? pressed.content : '';
    const width = Math.min(96, Math.max(56, pressed.rect.width + 12, text.length * 16 + 18));
    const leftEdge = (viewport?.offsetLeft ?? 0) + 6;
    const left = Math.max(leftEdge, Math.min(pressed.rect.left + pressed.rect.width / 2 - width / 2, leftEdge + (viewport?.width ?? innerWidth) - width - 12));
    const top = Math.max((viewport?.offsetTop ?? 0) + 6, pressed.rect.top - 78);
    preview = createPortal(<div data-keyboard-key-preview data-keyboard-refined data-key-preview-label={pressed.label} data-preview-edit-ui aria-hidden="true" style={{ position:'fixed',left,top,width,height:70,zIndex:9000,pointerEvents:'none' }} className="flex items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.16)]">
      <div style={{width:'100%',fontSize:text.length>2?Math.min(28,(width-16)/text.length*1.5):undefined,transform:pressed.musical?'scale(1.35)':undefined}} className="flex items-center justify-center text-[32px] font-medium leading-none">{pressed.content}</div>
      <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-slate-300 bg-white"/>
    </div>,document.body);
  }
  return { onPointerDownCapture, preview };
}
