import { Users } from 'lucide-react';
import type { SongEditorPresence } from '../lib/songEditingPresence';

export const SongEditingNotice = ({ editors, language, compact = false }: {
  editors: SongEditorPresence[]; language: 'zh' | 'en'; compact?: boolean;
}) => {
  if (!editors.length) return null;
  const names = editors.map((editor) => editor.name || (language === 'zh' ? '團隊成員' : 'A teammate')).join('、');
  const text = language === 'zh' ? `${names} 正在編輯這首歌` : `${names} ${editors.length === 1 ? 'is' : 'are'} editing this song`;
  return <div role="status" className={compact
    ? 'mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700'
    : 'flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:px-6'}>
    <Users size={compact ? 12 : 15} className="shrink-0" />
    <span className="min-w-0 truncate" title={text}>{text}</span>
  </div>;
};
