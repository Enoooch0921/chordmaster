import { useIsPresent } from 'motion/react';
import { AnimatedPopover } from './ui/InteractionMotion';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, FolderInput, Trash2, CheckSquare, Share2 } from 'lucide-react';
import type { AppLanguage } from '../types';

interface SetlistContextMenuProps {
  language: AppLanguage;
  title: string;
  archived: boolean;
  x: number;
  y: number;
  onSelect?: () => void;
  onShare?: () => void;
  onArchive: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function SetlistContextMenu({ language, title, archived, x, y, onArchive, onMove, onDelete, onClose, onSelect, onShare }: SetlistContextMenuProps) {
  const present = useIsPresent();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!present) return;
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    });
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [x, y, present]);

  useEffect(() => {
    if (!present) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const dismiss = () => onClose();
    window.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('pointerdown', dismissOutside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [onClose, present]);

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return createPortal(
    <AnimatedPopover open={present} animateOnMount propagate panelRef={menuRef}
      origin={`${Math.max(0, x - position.left)}px ${Math.max(0, y - position.top)}px`}
      role="menu"
      aria-label={title}
      style={position}
      shellClassName="fixed z-[5300]" className="w-56 max-w-[calc(100vw-16px)] rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          onClose();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[index]?.focus();
        }
      }}
    >
      <div className="truncate px-3 py-2 text-xs font-semibold text-gray-500">{title}</div>
      {onShare && <button type="button" role="menuitem" onClick={() => run(onShare)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"><Share2 size={16}/>{language === 'zh' ? '分享／邀請' : 'Share / invite'}</button>}
      {onSelect && <button type="button" role="menuitem" onClick={() => run(onSelect)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"><CheckSquare size={16}/>{language==='zh'?'選取多份歌單':'Select multiple setlists'}</button>}
      <button type="button" role="menuitem" onClick={() => run(onArchive)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none">
        {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        {language === 'zh' ? (archived ? '取消歸檔' : '歸檔') : (archived ? 'Unarchive' : 'Archive')}
      </button>
      <button type="button" role="menuitem" onClick={() => run(onMove)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none">
        <FolderInput size={16} />{language === 'zh' ? '移至專案' : 'Move to project'}
      </button>
      <button type="button" role="menuitem" onClick={() => run(onDelete)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50 focus:bg-rose-50 focus:outline-none">
        <Trash2 size={16} />{language === 'zh' ? '刪除' : 'Delete'}
      </button>
    </AnimatedPopover>,
    document.body
  );
}
