import React from 'react';
import { ClipboardPaste, X } from 'lucide-react';
import type { AppLanguage } from '../types';

export type NotationPasteKind = 'bars' | 'chords' | 'rhythm' | 'jianpu';
export function PreviewPasteChoices({ language, count, disabled, onChoose }: {
  language: AppLanguage; count: number; disabled?: boolean; onChoose: (kind: NotationPasteKind) => void;
}) {
  return <div role="group" aria-label={language === 'zh' ? '貼上' : 'Paste'} className="px-1 py-2">
    <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-slate-600">
      <ClipboardPaste size={14} aria-hidden="true" />
      <span>{language === 'zh' ? `貼上（${count} 小節）` : `Paste (${count} bars)`}</span>
    </div>
    <div className="grid grid-cols-4 gap-1">
      {(['bars', 'chords', 'rhythm', 'jianpu'] as const).map(kind => {
        const label = language === 'zh' ? { bars: '小節', chords: '和弦', rhythm: '節奏', jianpu: '簡譜' }[kind]
          : { bars: 'Bars', chords: 'Chords', rhythm: 'Rhythm', jianpu: 'Jianpu' }[kind];
        return <button key={kind} type="button" role="menuitem" disabled={disabled}
          aria-label={language === 'zh' ? `貼上${label}` : `Paste ${label.toLowerCase()}`}
          className="flex min-h-11 min-w-0 items-center justify-center rounded-md bg-slate-100 px-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onChoose(kind)}>{label}</button>;
      })}
    </div>
  </div>;
}

export default function PreviewPasteMenu({ language, count, left, top, onChoose, onClose }: {
  language: AppLanguage; count: number; left: number; top: number;
  onChoose: (kind: NotationPasteKind) => void; onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = menuRef.current;
    node?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !node?.contains(event.target)) closeRef.current();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      if (document.activeElement === document.body || node?.contains(document.activeElement)) previous?.isConnected && previous.focus({ preventScroll: true });
    };
  }, []);
  return <div ref={menuRef} role="menu" aria-label={language === 'zh' ? '選擇貼上內容' : 'Choose what to paste'} data-preview-edit-ui data-preview-paste-menu
    className="fixed z-[5400] w-[280px] max-w-[calc(100vw-16px)] rounded-xl bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
    style={{ left: Math.min(Math.max(8, left), Math.max(8, window.innerWidth - 288)), top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - 148)) }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); onClose(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }}>
    <div className="flex items-center justify-between px-1 text-sm font-semibold text-slate-800">
      <span>{language === 'zh' ? '選擇貼上內容' : 'Choose what to paste'}</span>
      <button type="button" onClick={onClose} aria-label={language === 'zh' ? '取消貼上' : 'Cancel paste'} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><X size={16} /></button>
    </div>
    <PreviewPasteChoices language={language} count={count} onChoose={onChoose} />
  </div>;
}
