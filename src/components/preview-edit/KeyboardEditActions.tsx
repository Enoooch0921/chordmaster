import { ClipboardPaste, Copy, Delete } from 'lucide-react';
import type { AppLanguage } from '../../types';

interface Props {
  language: AppLanguage;
  canPaste: boolean;
  pasteLabel: string;
  deleteLabel: string;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
}

/** One stationary action row, shared by every notation keyboard. */
export default function KeyboardEditActions({ language, canPaste, pasteLabel, deleteLabel, onCopy, onPaste, onDelete }: Props) {
  const zh = language === 'zh';
  return <div data-keyboard-common-actions data-keyboard-surface="actions" data-key-surface="utility"
    role="group" aria-label={zh ? '編輯操作' : 'Editing actions'}
    className="grid shrink-0 grid-cols-3 gap-2 border-b border-[color:var(--keyboard-border)] px-2.5 py-2">
    <button type="button" data-keyboard-edit-action="copy" onClick={onCopy} aria-label={zh ? '複製小節' : 'Copy bar'}>
      <Copy size={20} aria-hidden="true"/><span>{zh ? '複製' : 'Copy'}</span>
    </button>
    <button type="button" data-keyboard-edit-action="paste" onClick={onPaste} disabled={!canPaste} aria-label={pasteLabel}>
      <ClipboardPaste size={20} aria-hidden="true"/><span>{zh ? '貼上' : 'Paste'}</span>
    </button>
    <button type="button" data-keyboard-edit-action="delete" data-key-emphasis="delete" onClick={onDelete} aria-label={deleteLabel}>
      <Delete size={20} aria-hidden="true"/><span>{zh ? '刪除' : 'Delete'}</span>
    </button>
  </div>;
}
