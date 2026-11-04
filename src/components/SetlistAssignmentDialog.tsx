import { AnimatePresence } from 'motion/react';
import { useNativeDialogMotion } from '../hooks/useNativeDialogMotion';
import React from 'react';
import { createPortal } from 'react-dom';
import { Check, LoaderCircle, RefreshCw, Search, UserRoundCog, X } from 'lucide-react';
import { AppLanguage, SetlistEditorAssignmentSnapshot } from '../types';
import { getTeamRoleLabel } from '../constants/teamRoles';

interface SetlistAssignmentDialogProps {
  open: boolean;
  language: AppLanguage;
  setlistName: string;
  snapshot: SetlistEditorAssignmentSnapshot | null;
  loading: boolean;
  updatingUserId: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onToggle: (userId: string, enabled: boolean) => void;
}

export const SetlistAssignmentDialog: React.FC<SetlistAssignmentDialogProps> = props => (
  <AnimatePresence initial={false}>{props.open && <AssignmentDialogBody key="assignment" {...props}/>}</AnimatePresence>
);

const AssignmentDialogBody: React.FC<SetlistAssignmentDialogProps> = ({
  open,
  language,
  setlistName,
  snapshot,
  loading,
  updatingUserId,
  onClose,
  onRefresh,
  onToggle
}) => {
  const [query, setQuery] = React.useState('');
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  React.useEffect(() => { if (open) setQuery(''); }, [open]);
  useNativeDialogMotion(dialogRef);
  const assignedIds = new Set((snapshot?.assignments ?? []).map((assignment) => assignment.userId));
  const isUpdating = Boolean(updatingUserId);
  const visibleMembers = (snapshot?.assignableMembers ?? []).filter((member) =>
    `${member.name} ${member.email}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  return createPortal(
    <dialog ref={dialogRef} aria-modal="true" aria-busy={loading || isUpdating} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!isUpdating) onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
      className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-full max-w-none overflow-hidden border-0 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-stone-950/45 backdrop:backdrop-blur-[2px] sm:h-[min(700px,90dvh)] sm:max-w-lg sm:rounded-2xl sm:border sm:border-gray-200">
      <div className="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><UserRoundCog size={18} /></div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-black text-gray-900">{language === 'zh' ? '歌單協作者' : 'Setlist collaborators'}</h2>
            <div className="mt-0.5 truncate text-xs font-medium text-gray-500">{setlistName}</div>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading || isUpdating} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-40" aria-label={language === 'zh' ? '重新整理' : 'Refresh'}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button type="button" autoFocus onClick={onClose} disabled={isUpdating} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-wait disabled:opacity-40" aria-label={language === 'zh' ? '關閉' : 'Close'}><X size={17} /></button>
        </div>
        <p className="shrink-0 px-4 pt-3 text-xs leading-5 text-gray-600">{language === 'zh' ? '團隊成員都能查看這份歌單。指派協作者是開放編輯，不需要為了看譜而指派。' : 'All team members can view this setlist. Assign collaborators only when they need editing access.'}</p>
        <details className="shrink-0 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium leading-5 text-gray-600">
          <summary className="cursor-pointer py-2">{language === 'zh' ? '協作者可以做什麼？' : 'What can collaborators do?'}</summary>
          {language === 'zh'
            ? '被指派的歌曲管理員或歌單管理員，可以新增、移除、排序歌曲並設定這份歌單的共用調性。歌單管理員不能修改譜面的和弦或段落內容。'
            : 'Assigned song managers and setlist managers can add, remove, reorder songs and set shared keys. Setlist managers cannot edit chart chords or sections.'}
        </details>
        <div className="shrink-0 px-4 py-3">
          <label className="flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3"><Search size={16} className="shrink-0 text-gray-400" /><input aria-label={language === 'zh' ? '搜尋團隊成員' : 'Search team members'} placeholder={language === 'zh' ? '搜尋姓名或信箱' : 'Search name or email'} value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base outline-none" /></label>
          <p className="mt-2 text-xs text-gray-500">{language === 'zh' ? `已指派 ${assignedIds.size} 位協作者` : `${assignedIds.size} collaborators assigned`}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {loading && !snapshot ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-gray-500"><LoaderCircle size={18} className="animate-spin" />{language === 'zh' ? '載入成員…' : 'Loading members…'}</div>
          ) : (snapshot?.assignableMembers ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">{language === 'zh' ? '沒有可指派的團隊成員' : 'No team members can be assigned'}</div>
          ) : (
            <div className="space-y-2">
              {visibleMembers.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{language === 'zh' ? '沒有符合的成員' : 'No matching members'}</p> : null}
              {visibleMembers.map((member) => {
                const assigned = assignedIds.has(member.userId);
                const updating = updatingUserId === member.userId;
                return (
                  <button key={member.userId} type="button" onClick={() => onToggle(member.userId, !assigned)} disabled={loading || isUpdating} aria-pressed={assigned} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${assigned ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-200'}`}>
                    {member.picture ? <img src={member.picture} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-500">{(member.name || '?').slice(0, 1).toUpperCase()}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-bold text-gray-900">{member.name}</span>
                      {member.email ? <span className="mt-0.5 block break-all text-xs leading-5 text-gray-500">{member.email}</span> : null}
                      <span className="mt-0.5 block break-all text-xs leading-5 text-gray-500">{getTeamRoleLabel(member.role, language)}</span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${assigned ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-transparent'}`}>{updating ? <LoaderCircle size={13} className="animate-spin text-indigo-600" /> : <Check size={14} strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t border-gray-200 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"><button type="button" onClick={onClose} disabled={isUpdating} className="min-h-11 rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-wait disabled:opacity-50">{language === 'zh' ? '完成' : 'Done'}</button></div>
      </div>
    </dialog>,
    document.body
  );
};

export default SetlistAssignmentDialog;
