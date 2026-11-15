import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';

interface Props {
  bpm?: number;
  original?: number;
  zh: boolean;
  beatUnit: string;
  onChange: (value: number) => void;
}

export default function DrummerTempoReadout({ bpm, original, zh, beatUnit, onChange }: Props) {
  const drag = useRef<{ id: number; x: number; y: number; start: number; last: number; horizontal: boolean } | null>(null);
  const cancel = () => { drag.current = null; };
  useEffect(() => {
    window.addEventListener('blur', cancel);
    window.addEventListener('orientationchange', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('orientationchange', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, []);

  function move(event: PointerEvent<HTMLDivElement>) {
    const press = drag.current;
    if (!press || press.id !== event.pointerId) return;
    const dx = event.clientX - press.x, dy = event.clientY - press.y;
    if (!press.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dx) <= Math.abs(dy)) { cancel(); return; }
      press.horizontal = true;
    }
    const next = Math.min(400, Math.max(20, press.start + Math.trunc(dx / 4)));
    if (next !== press.last) { press.last = next; onChange(next); }
  }

  const hint = zh ? '向右拖曳加速，向左拖曳減速' : 'Drag right to speed up or left to slow down';
  return <div className="drummer-tempo-readout">
    <div className="drummer-tempo-drag" role={bpm === undefined ? 'status' : 'slider'} tabIndex={bpm === undefined ? undefined : 0}
      aria-label={zh ? '節拍器速度 BPM' : 'Metronome tempo BPM'} aria-describedby="drummer-beat-unit" aria-description={hint} title={hint}
      aria-valuemin={bpm === undefined ? undefined : 20} aria-valuemax={bpm === undefined ? undefined : 400}
      aria-valuenow={bpm} aria-valuetext={bpm === undefined ? undefined : `${bpm} BPM`}
      onPointerDown={event => {
        if (bpm === undefined || event.isPrimary === false || event.button !== 0) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: bpm, last: bpm, horizontal: false };
        try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Synthetic pointer. */ }
      }}
      onPointerMove={move} onPointerUp={event => {
        if (drag.current?.id === event.pointerId) { move(event); cancel(); }
      }}
      onPointerCancel={cancel} onLostPointerCapture={cancel} onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        if (bpm === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
        let next: number;
        switch (event.key) {
          case 'ArrowLeft': case 'ArrowDown': next = bpm - 1; break;
          case 'ArrowRight': case 'ArrowUp': next = bpm + 1; break;
          case 'Home': next = 20; break;
          case 'End': next = 400; break;
          default: return;
        }
        event.preventDefault(); event.stopPropagation(); onChange(Math.min(400, Math.max(20, next)));
      }}>
      <output aria-hidden="true" style={{ '--tempo-digits': Math.max(3, String(bpm ?? '').length) } as CSSProperties}>{bpm ?? '—'}</output>
      <small aria-hidden="true">BPM</small>
    </div>
    <span id="drummer-beat-unit" className="sr-only">{zh ? 'BPM 計拍單位：' : 'BPM beat unit: '}{beatUnit}</span>
    <button type="button" className="drummer-original-tempo" aria-label={zh ? '還原速度' : 'Reset tempo'}
      title={original === undefined ? (zh ? '歌曲未設定原速' : 'No original tempo') : (zh ? `還原到 ${original} BPM` : `Restore ${original} BPM`)}
      disabled={original === undefined || bpm === original} onClick={() => { if (original !== undefined) onChange(original); }}>
      <RotateCcw size={15} aria-hidden="true"/>{zh ? '原速' : 'Reset'}{original !== undefined && ` ${original}`}
    </button>
  </div>;
}
