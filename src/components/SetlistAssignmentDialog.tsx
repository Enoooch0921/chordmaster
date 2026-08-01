import React from 'react';
import { Check, LoaderCircle, RefreshCw, UserRoundCog, X } from 'lucide-react';
import { AppLanguage, SetlistEditorAssignmentSnapshot } from '../types';

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

export const SetlistAssignmentDialog: React.FC<SetlistAssignmentDialogProps> = ({
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
  if (!open) return null;
  const assignedIds = new Set((snapshot?.assignments ?? []).map((assignment) => assignment.userId));
  const isUpdating = Boolean(updatingUserId);

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-stone-950/45 px-3 py-6 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-busy={loading || isUpdating} aria-label={language === 'zh' ? '歌單協作者' : 'Setlist collaborators'} className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><UserRoundCog size={18} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-black text-gray-900">{language === 'zh' ? '歌單協作者' : 'Setlist collaborators'}</div>
            <div className="mt-0.5 truncate text-xs font-medium text-gray-500">{setlistName}</div>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading || isUpdating} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-40" aria-label={language === 'zh' ? '重新整理' : 'Refresh'}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button type="button" onClick={onClose} disabled={isUpdating} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-wait disabled:opacity-40" aria-label={language === 'zh' ? '關閉' : 'Close'}><X size={17} /></button>
        </div>
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium leading-5 text-gray-600">
          {language === 'zh'
            ? '被指派的曲庫管理員或歌單編輯者，可以新增、移除與排序這份歌單的團隊歌曲。'
            : 'Assigned song-library managers and setlist editors can add, remove, and reorder team songs in this setlist.'}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && !snapshot ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-gray-500"><LoaderCircle size={18} className="animate-spin" />{language === 'zh' ? '載入成員…' : 'Loading members…'}</div>
          ) : (snapshot?.assignableMembers ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">{language === 'zh' ? '沒有可指派的團隊成員' : 'No team members can be assigned'}</div>
          ) : (
            <div className="space-y-2">
              {snapshot!.assignableMembers.map((member) => {
                const assigned = assignedIds.has(member.userId);
                const updating = updatingUserId === member.userId;
                return (
                  <button key={member.userId} type="button" onClick={() => onToggle(member.userId, !assigned)} disabled={isUpdating} aria-pressed={assigned} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${assigned ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-200'}`}>
                    {member.picture ? <img src={member.picture} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-500">{(member.name || '?').slice(0, 1).toUpperCase()}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-gray-900">{member.name}</span>
                      {member.email ? <span className="mt-0.5 block truncate text-[11px] text-gray-500">{member.email}</span> : null}
                      <span className="mt-0.5 block truncate text-[11px] text-gray-500">{member.role === 'editor' ? (language === 'zh' ? '曲庫管理員' : 'Song Library Manager') : (language === 'zh' ? '歌單編輯者' : 'Setlist Editor')}</span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${assigned ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-transparent'}`}>{updating ? <LoaderCircle size={13} className="animate-spin text-indigo-600" /> : <Check size={14} strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-gray-200 px-4 py-3"><button type="button" onClick={onClose} disabled={isUpdating} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-wait disabled:opacity-50">{language === 'zh' ? '完成' : 'Done'}</button></div>
      </div>
    </div>
  );
};

export default SetlistAssignmentDialog;
