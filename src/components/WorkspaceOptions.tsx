import { Check, Plus, Users } from 'lucide-react';
import { getTeamRoleLabel } from '../constants/teamRoles';
import { buildTeamManagementScope, type TeamWorkspaceScopeSource } from '../lib/teamScope';
import type { AppLanguage, CloudLibrarySummary } from '../types';
import TeamScopeDetails from './TeamScopeDetails';

interface WorkspaceOptionsProps {
  language: AppLanguage;
  libraries: CloudLibrarySummary[];
  activeId?: string;
  activeScope?: TeamWorkspaceScopeSource;
  disabled: boolean;
  canManage: boolean;
  createOpen: boolean;
  onSelect: (id: string) => void;
  onManage: () => void;
  onCreate: () => void;
}

export default function WorkspaceOptions({ language, libraries, activeId, activeScope, disabled, canManage, createOpen, onSelect, onManage, onCreate }: WorkspaceOptionsProps) {
  const zh = language === 'zh';
  const activeLibrary = libraries.find((library) => library.id === activeId);
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
      {activeLibrary?.kind === 'team' ? <p className="px-2 py-2 text-xs leading-5 text-gray-500">{zh ? '團隊成員都能查看此工作區的歌譜與歌單。專案用來整理歌單；大家開啟同一份歌單，就能使用同一份編排。' : 'Team members can view the charts and setlists in this workspace. Projects organize setlists; open the same setlist to use the same arrangement.'}</p> : null}
      {activeLibrary?.kind === 'team' ? <TeamScopeDetails
        key={activeLibrary.id}
        language={language}
        role={activeLibrary.role}
        scope={activeScope ? buildTeamManagementScope(activeLibrary.role, activeScope) : undefined}
        summaryLabel={zh ? '我的管理範圍' : 'My scope'}
        className="px-2"
      /> : null}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 border-t border-gray-100">
        {canManage ? <button type="button" disabled={disabled} onClick={onManage} aria-haspopup="dialog" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-medium text-gray-600 hover:text-indigo-700 disabled:opacity-40"><Users size={14} />{zh ? '管理成員' : 'Manage members'}</button> : null}
        <button type="button" disabled={disabled} onClick={onCreate} aria-expanded={createOpen} className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-gray-500 hover:text-indigo-700 disabled:opacity-40"><Plus size={14} />{zh ? '建立團隊' : 'Create team'}</button>
      </div>
    </div>
  );
}
