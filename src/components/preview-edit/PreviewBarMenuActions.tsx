import React from 'react';
import { ArrowLeft, ChevronRight, ClipboardPaste, Copy, Eraser, Hash, ListStart, Minus, Plus, Trash2 } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { PreviewPasteChoices, type NotationPasteKind } from '../PreviewPasteMenu';

interface Props {
  language: AppLanguage;
  selectedCount: number;
  allClosed: boolean;
  canClose: boolean;
  canClear: boolean;
  clipboardCount: number;
  canInsertCopiedBars: boolean;
  onCopy: () => void;
  onPaste: (kind: NotationPasteKind) => void;
  onPasteAt: (side: 'before' | 'after') => void;
  onInsertBefore: () => void;
  onClear: () => void;
  onToggleClosed: () => void;
  onEnding: (ending?: string) => void;
  onDelete: () => void;
}

const rowClass = 'flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-indigo-50 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';

export default function PreviewBarMenuActions(props: Props) {
  const { language, selectedCount, allClosed, canClose, canClear, clipboardCount, canInsertCopiedBars } = props;
  const zh = language === 'zh';
  const [page, setPage] = React.useState<'main' | 'paste' | 'ending'>('main');
  const contentRef = React.useRef<HTMLDivElement>(null);
  const returnToRef = React.useRef<'paste' | 'ending' | null>(null);
  React.useEffect(() => {
    // The outer menu owns initial focus so it can remember the editor input.
    if (page === 'main' && !returnToRef.current) return;
    const target = page === 'main' && returnToRef.current
      ? contentRef.current?.querySelector<HTMLButtonElement>(`[data-menu-page="${returnToRef.current}"]`)
      : contentRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    target?.focus({ preventScroll: true });
  }, [page]);
  const open = (next: 'paste' | 'ending') => { returnToRef.current = next; setPage(next); };
  const cellLabel = selectedCount > 1 ? (zh ? '選取小節' : 'selected bars') : (zh ? '此小節' : 'this bar');
  return <div ref={contentRef} onKeyDown={event => {
    if (page !== 'main' && (event.key === 'Escape' || event.key === 'ArrowLeft' && !(event.target as HTMLElement).closest('[role="group"]'))) {
      event.preventDefault(); event.stopPropagation(); setPage('main');
    }
  }}>
    {page !== 'main' ? <>
      <button type="button" role="menuitem" className={`${rowClass} border-b border-[var(--color-border)]`} onClick={() => setPage('main')} aria-label={zh ? '返回小節操作' : 'Back to bar actions'}>
        <ArrowLeft size={16} aria-hidden="true" /><span>{page === 'paste' ? (zh ? '貼上' : 'Paste') : (zh ? '房子' : 'Ending')}</span>
      </button>
      {page === 'paste' ? <>
        <PreviewPasteChoices language={language} count={clipboardCount} onChoose={props.onPaste} />
        <button type="button" role="menuitem" className={rowClass} disabled={!canInsertCopiedBars} onClick={() => props.onPasteAt('before')}><ClipboardPaste size={16} /><span>{zh ? '貼到前方' : 'Paste before'}</span></button>
        <button type="button" role="menuitem" className={rowClass} disabled={!canInsertCopiedBars} onClick={() => props.onPasteAt('after')}><ClipboardPaste size={16} /><span>{zh ? '貼到後方' : 'Paste after'}</span></button>
      </> : <>
        <div role="group" aria-label={zh ? '選擇房子' : 'Choose ending'} className="grid grid-cols-4 gap-1 py-2">
          {['1', '2', '3', '1,2'].map(ending => <button key={ending} type="button" role="menuitem" className="min-h-11 rounded-md bg-[var(--color-surface-muted)] text-sm font-semibold text-[var(--color-text)] hover:bg-indigo-50 focus-visible:outline-indigo-500" onClick={() => props.onEnding(ending)}>{ending}</button>)}
        </div>
        <button type="button" role="menuitem" className={rowClass} onClick={() => props.onEnding()}><Minus size={16} /><span>{zh ? '清除房子' : 'Clear ending'}</span></button>
      </>}
    </> : <>
      <div className="px-3 pb-1 pt-1 text-xs text-[var(--color-text-muted)]">{zh ? `已選 ${selectedCount} 小節` : `${selectedCount} bar${selectedCount === 1 ? '' : 's'} selected`}</div>
      <button type="button" role="menuitem" className={rowClass} onClick={props.onCopy}><Copy size={16} /><span>{zh ? '複製小節' : 'Copy bars'}</span></button>
      <button type="button" role="menuitem" data-menu-page="paste" aria-expanded={false} className={rowClass} disabled={!clipboardCount} onClick={() => open('paste')}><ClipboardPaste size={16} /><span>{zh ? '貼上…' : 'Paste…'}</span><ChevronRight size={14} className="ml-auto" /></button>
      <button type="button" role="menuitem" className={rowClass} onClick={props.onInsertBefore}><ListStart size={16} /><span>{zh ? '在前面插入一小節' : 'Insert bar before'}</span></button>
      <div role="separator" className="my-1 border-t border-[var(--color-border)]" />
      <button type="button" role="menuitem" className={rowClass} disabled={!canClear} title={zh ? '移除內容與記號，保留小節位置' : 'Remove content and marks; keep the cell'} onClick={props.onClear}><Eraser size={16} /><span>{zh ? `清空${cellLabel}` : `Clear ${cellLabel}`}</span></button>
      <button type="button" role="menuitem" className={rowClass} disabled={!allClosed && !canClose} title={zh ? allClosed ? '恢復空白格，可繼續輸入' : canClose ? '顯示橫線，後方小節不移動' : '請先清空小節，再關閉' : allClosed ? 'Restore an empty cell for entry' : canClose ? 'Show a line; keep later bars in place' : 'Clear the bar before closing it'} onClick={props.onToggleClosed}>{allClosed ? <Plus size={16} /> : <Minus size={16} />}<span>{zh ? `${allClosed ? '重新開啟' : '關閉'}${cellLabel}` : `${allClosed ? 'Reopen' : 'Close'} ${cellLabel}`}</span></button>
      <button type="button" role="menuitem" data-menu-page="ending" aria-expanded={false} className={rowClass} onClick={() => open('ending')}><Hash size={16} /><span>{zh ? '房子…' : 'Ending…'}</span><ChevronRight size={14} className="ml-auto" /></button>
      <div role="separator" className="my-1 border-t border-[var(--color-border)]" />
      <button type="button" role="menuitem" className={`${rowClass} !text-[var(--color-danger)] hover:!bg-[var(--color-danger-soft)]`} disabled={!selectedCount} title={zh ? '移除小節，後方小節往前移' : 'Remove bars; move later bars forward'} onClick={props.onDelete}><Trash2 size={16} /><span>{zh ? selectedCount > 1 ? '刪除選取小節' : '刪除小節' : selectedCount > 1 ? 'Delete selected bars' : 'Delete bar'}</span></button>
    </>}
  </div>;
}
