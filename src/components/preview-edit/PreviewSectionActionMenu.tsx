import React from 'react';
import { Copy, CornerUpLeft, Pencil, Trash2, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import type { PreviewAnchorRect } from '../ChordSheet';
import type { PreviewEditorDeviceLayout } from '../../lib/previewEditorLayout';

interface PreviewSectionActionMenuProps {
  language: AppLanguage;
  deviceLayout: PreviewEditorDeviceLayout;
  title: string;
  anchorRect: PreviewAnchorRect;
  canDelete: boolean;
  canMergePrevious: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onMergePrevious: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const PreviewSectionActionMenu: React.FC<PreviewSectionActionMenuProps> = ({
  language,
  deviceLayout,
  title,
  anchorRect,
  canDelete,
  canMergePrevious,
  onRename,
  onDuplicate,
  onMergePrevious,
  onDelete,
  onClose
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const isTouchLayout = deviceLayout !== 'desktop';

  React.useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('button[data-primary-action]')?.focus({ preventScroll: true });
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const actions = (
    <div className={isTouchLayout ? 'grid gap-2' : 'grid gap-1'}>
      <button
        type="button"
        data-primary-action
        onClick={onRename}
        className={`${isTouchLayout ? 'min-h-12 px-4 text-sm' : 'min-h-10 px-3 text-xs'} flex w-full items-center gap-3 rounded-xl text-left font-bold text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-800`}
      >
        <Pencil size={17} />
        <span>{language === 'zh' ? '重新命名' : 'Rename'}</span>
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className={`${isTouchLayout ? 'min-h-12 px-4 text-sm' : 'min-h-10 px-3 text-xs'} flex w-full items-center gap-3 rounded-xl text-left font-bold text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-800`}
      >
        <Copy size={17} />
        <span>{language === 'zh' ? '複製到後方' : 'Duplicate After'}</span>
      </button>
      <button
        type="button"
        onClick={onMergePrevious}
        disabled={!canMergePrevious}
        className={`${isTouchLayout ? 'min-h-12 px-4 text-sm' : 'min-h-10 px-3 text-xs'} flex w-full items-center gap-3 rounded-xl text-left font-bold text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-800 disabled:cursor-not-allowed disabled:opacity-35`}
      >
        <CornerUpLeft size={17} />
        <span>{language === 'zh' ? '合併到前方' : 'Merge Into Previous'}</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete}
        className={`${isTouchLayout ? 'min-h-12 px-4 text-sm' : 'min-h-10 px-3 text-xs'} flex w-full items-center gap-3 rounded-xl text-left font-bold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-35`}
      >
        <Trash2 size={17} />
        <span>{language === 'zh' ? '刪除段落' : 'Delete Section'}</span>
      </button>
    </div>
  );

  if (isTouchLayout) {
    return (
      <div
        data-preview-section-action-menu
        className="fixed inset-0 z-[5300] flex items-end bg-slate-950/35 px-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[1px]"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div ref={panelRef} className="w-full rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_22px_55px_rgba(15,23,42,0.28)]">
          <div className="mb-2 flex items-center justify-between gap-3 px-2 py-1">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                {language === 'zh' ? '段落操作' : 'Section actions'}
              </div>
              <div className="mt-1 truncate text-base font-black text-slate-900">
                {title.trim() || (language === 'zh' ? '未命名段落' : 'Untitled section')}
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-label={language === 'zh' ? '關閉段落操作' : 'Close section actions'}>
              <X size={18} />
            </button>
          </div>
          {actions}
        </div>
      </div>
    );
  }

  const width = 220;
  const margin = 12;
  const left = Math.min(
    Math.max(margin, anchorRect.left),
    Math.max(margin, window.innerWidth - width - margin)
  );
  const estimatedHeight = 220;
  const opensAbove = anchorRect.bottom + estimatedHeight + margin > window.innerHeight
    && anchorRect.top > estimatedHeight + margin;
  const top = opensAbove
    ? Math.max(margin, anchorRect.top - estimatedHeight - 8)
    : Math.min(anchorRect.bottom + 8, window.innerHeight - estimatedHeight - margin);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[5290] cursor-default bg-transparent"
        onClick={onClose}
        aria-label={language === 'zh' ? '關閉段落操作' : 'Close section actions'}
      />
      <div
        ref={panelRef}
        data-preview-section-action-menu
        className="fixed z-[5300] w-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.24)]"
        style={{ left, top }}
      >
        <div className="truncate px-3 pb-2 pt-1 text-xs font-black text-slate-900">
          {title.trim() || (language === 'zh' ? '未命名段落' : 'Untitled section')}
        </div>
        {actions}
      </div>
    </>
  );
};

export default PreviewSectionActionMenu;
