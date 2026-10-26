import type { AppLanguage, LibraryRole, Project, Setlist, TeamManagementScope } from '../types';
import { canArrangeTeamSetlist, canManageTeamProject, isTeamAdministrator } from './teamPermissions';

export interface TeamWorkspaceScopeSource {
  userId?: string;
  projects: readonly Project[];
  setlists: readonly Setlist[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isResource = (value: unknown): value is TeamManagementScope['projects'][number] & Record<string, unknown> =>
  isRecord(value) && typeof value.id === 'string' && value.id.length > 0
  && typeof value.name === 'string' && typeof value.archived === 'boolean';

// Scope arrays are complete. Reject a malformed payload as a whole instead of
// silently dropping entries and presenting an incomplete list as the full scope.
export const normalizeTeamManagementScope = (value: unknown, role: LibraryRole): TeamManagementScope | undefined => {
  if (!isRecord(value) || !Array.isArray(value.projects) || !Array.isArray(value.setlists)) return undefined;
  if (!value.projects.every(isResource) || !value.setlists.every((item): item is TeamManagementScope['setlists'][number] =>
    isResource(item)
    && (item.projectId === null || (typeof item.projectId === 'string' && item.projectId.length > 0))
    && (item.access === 'created' || item.access === 'assigned' || item.access === 'administrator')
    && (isTeamAdministrator(role) || item.access !== 'administrator')
  )) return undefined;
  if (role === 'viewer' && (value.projects.length || value.setlists.length)) return undefined;
  if (new Set(value.projects.map((item) => item.id)).size !== value.projects.length
    || new Set(value.setlists.map((item) => item.id)).size !== value.setlists.length) return undefined;
  return {
    projects: value.projects.map(({ id, name, archived }) => ({ id, name, archived })),
    setlists: value.setlists.map(({ id, name, archived, projectId, access }) => ({ id, name, archived, projectId, access })),
  };
};

const compareResources = (a: { archived: boolean; name: string; id: string }, b: { archived: boolean; name: string; id: string }) =>
  Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export const buildTeamManagementScope = (
  role: LibraryRole,
  { userId, projects, setlists }: TeamWorkspaceScopeSource,
): TeamManagementScope | undefined => {
  if (role === 'viewer') return { projects: [], setlists: [] };
  if (!isTeamAdministrator(role) && !userId) return undefined;
  return {
    projects: projects.filter((project) => canManageTeamProject(role, userId, project))
      .map(({ id, name, archived }) => ({ id, name, archived: Boolean(archived) }))
      .sort(compareResources),
    setlists: setlists.filter((setlist) => canArrangeTeamSetlist(role, userId, setlist))
      .map(({ id, name, archived, projectId, createdBy }) => ({
        id, name, archived: Boolean(archived), projectId: projectId ?? null,
        access: userId && createdBy === userId ? 'created' as const
          : isTeamAdministrator(role) ? 'administrator' as const : 'assigned' as const,
      }))
      .sort(compareResources),
  };
};

export const getTeamScopeSummary = (role: LibraryRole, scope: TeamManagementScope | undefined, language: AppLanguage) => {
  const zh = language === 'zh';
  if (isTeamAdministrator(role)) return zh ? '全團隊管理' : 'Entire team';
  if (role === 'viewer') return zh ? '共用內容僅可檢視 · 個人 Capo' : 'View shared content · Personal capo';
  const resources = scope
    ? zh ? `${scope.projects.length} 個專案 · ${scope.setlists.length} 份歌單`
      : `${scope.projects.length} projects · ${scope.setlists.length} setlists`
    : zh ? '自建專案 · 自建或指派歌單' : 'Own projects · Own or assigned setlists';
  return role === 'editor' ? `${zh ? '全部歌曲' : 'All songs'} · ${resources}` : resources;
};

export const getTeamScopeBoundary = (role: LibraryRole, language: AppLanguage) => {
  const zh = language === 'zh';
  if (role === 'owner') return zh ? '可管理全部團隊歌曲、專案、歌單與成員，並指派或撤銷總管理員。' : 'Can manage every team song, project, setlist, and member, including appointing and removing admins.';
  if (role === 'admin') return zh ? '可管理全部團隊歌曲、專案、歌單及一般成員權限；不能變更擁有者或其他總管理員，也不能指派總管理員。' : 'Can manage every team song, project, setlist, and regular member. Cannot change the owner or other admins, or appoint admins.';
  if (role === 'editor') return zh ? '可編輯全部團隊歌曲，以及範圍內的專案與歌單內容。' : 'Can edit every team song and the projects and setlists in this scope.';
  if (role === 'setlist_manager') return zh ? '曲庫僅可檢視；範圍內的歌單可選曲、排序及設定共用調性，不能修改歌詞、和弦或段落。' : 'The song library is view only. Scoped setlists allow song selection, ordering, and shared keys; lyrics, chords, and sections cannot be edited.';
  return zh ? '不能修改共用內容；Capo 只影響自己的畫面。' : 'Shared content cannot be edited. Capo changes only affect your own view.';
};
