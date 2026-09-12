import { Check, Plus, Users } from 'lucide-react';
import { getTeamRoleLabel } from '../constants/teamRoles';
import type { AppLanguage, CloudLibrarySummary } from '../types';

interface WorkspaceOptionsProps {
  language: AppLanguage;
  libraries: CloudLibrarySummary[];
  activeId?: string;
  disabled: boolean;
  canManage: boolean;
  createOpen: boolean;
  onSelect: (id: string) => void;
  onManage: () => void;
  onCreate: () => void;
}

export default function WorkspaceOptions({ language, libraries, activeId, disabled, canManage, createOpen, onSelect, onManage, onCreate }: WorkspaceOptionsProps) {
  const zh = language === 'zh';
  return (
    <div>
      <div aria-label={zh ? '切換工作區' : 'Switch workspace'} className="max-h-52 overflow-y-auto">
        {libraries.map((library) => (
          <button key={library.id} type="button" aria-current={library.id === activeId ? 'true' : undefined} disabled={disabled || library.id === activeId} onClick={() => onSelect(library.id)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-gray-700 hover:bg-gray-50 aria-current:bg-indigo-50/60 aria-current:text-indigo-700 disabled:cursor-default">
            <span className="min-w-0 flex-1 break-words font-medium">{library.kind === 'personal' ? (zh ? '個人區' : 'Personal') : library.name}</span>
            {library.kind === 'team' ? <span className="shrink-0 text-[10px] text-gray-500">{getTeamRoleLabel(library.role, language)}</span> : null}
            <span className="w-3.5 shrink-0">{library.id === activeId ? <Check size={14} /> : null}</span>
          </button>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 border-t border-gray-100">
        {canManage ? <button type="button" onClick={onManage} aria-haspopup="dialog" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-medium text-gray-600 hover:text-indigo-700"><Users size={14} />{zh ? '管理成員' : 'Manage members'}</button> : null}
        <button type="button" onClick={onCreate} aria-expanded={createOpen} className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-gray-500 hover:text-indigo-700"><Plus size={14} />{zh ? '建立團隊' : 'Create team'}</button>
      </div>
    </div>
  );
}
