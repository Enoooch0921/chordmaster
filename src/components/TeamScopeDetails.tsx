import { getTeamRoleDescription, getTeamRoleLabel } from '../constants/teamRoles';
import { getTeamScopeBoundary, getTeamScopeSummary } from '../lib/teamScope';
import { isTeamAdministrator } from '../lib/teamPermissions';
import type { AppLanguage, LibraryRole, TeamManagementScope } from '../types';

interface TeamScopeDetailsProps {
  language: AppLanguage;
  role: LibraryRole;
  scope?: TeamManagementScope;
  className?: string;
  summaryLabel?: string;
}

export default function TeamScopeDetails({ language, role, scope, className = '', summaryLabel }: TeamScopeDetailsProps) {
  const zh = language === 'zh';
  const all = isTeamAdministrator(role);
  const accessLabels = zh
    ? { created: '自己建立', assigned: '被指派', administrator: '全團隊' }
    : { created: 'Created', assigned: 'Assigned', administrator: 'Team access' };
  return (
    <details className={`text-xs leading-5 text-stone-600 ${className}`}>
      <summary className="cursor-pointer py-1 marker:text-stone-400 hover:text-stone-700">
        {summaryLabel ?? getTeamScopeSummary(role, scope, language)}
        {!summaryLabel ? <span className="ml-2 text-stone-500">{zh ? '查看範圍' : 'View scope'}</span> : null}
      </summary>
      <div className="space-y-2 pb-2 pt-1">
        <p className="font-medium text-stone-600">{getTeamRoleLabel(role, language)}</p>
        <p>{scope ? getTeamScopeBoundary(role, language) : getTeamRoleDescription(role, language)}</p>
        {scope && role !== 'viewer' ? (
          <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
            <div>
              <p className="font-medium text-stone-600">{zh ? `${all ? '全部' : '自己建立的'}專案 · ${scope.projects.length}` : `${all ? 'All' : 'Own'} projects · ${scope.projects.length}`}</p>
              {scope.projects.length ? <ul className="mt-0.5 space-y-0.5">
                {scope.projects.map((project) => <li key={project.id} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 break-words">{project.name || (zh ? '未命名專案' : 'Untitled project')}</span>
                  {project.archived ? <span className="shrink-0 text-stone-500">{zh ? '已封存' : 'Archived'}</span> : null}
                </li>)}
              </ul> : <p>{zh ? '尚無可管理的專案' : 'No projects in scope'}</p>}
            </div>
            <div>
              <p className="font-medium text-stone-600">{zh ? `${all ? '全部' : '可管理的'}歌單 · ${scope.setlists.length}` : `${all ? 'All' : 'Managed'} setlists · ${scope.setlists.length}`}</p>
              {scope.setlists.length ? <ul className="mt-0.5 space-y-0.5">
                {scope.setlists.map((setlist) => <li key={setlist.id} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 break-words">{setlist.name || (zh ? '未命名歌單' : 'Untitled setlist')}</span>
                  <span className="shrink-0 text-stone-500">{accessLabels[setlist.access]}{setlist.archived ? ` · ${zh ? '已封存' : 'Archived'}` : ''}</span>
                </li>)}
              </ul> : <p>{zh ? '尚無可管理的歌單' : 'No setlists in scope'}</p>}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
