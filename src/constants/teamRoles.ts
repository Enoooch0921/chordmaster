import type { AppLanguage, LibraryRole } from '../types';

export const DEFAULT_TEAM_INVITE_ROLE: Exclude<LibraryRole, 'owner'> = 'viewer';

export const TEAM_ROLES: ReadonlyArray<LibraryRole> = ['owner', 'admin', 'editor', 'setlist_manager', 'viewer'];

// Invitations never grant administrative access. Owners promote existing
// members to admin separately after they have joined the team.
export const EDITABLE_TEAM_ROLES: ReadonlyArray<Exclude<LibraryRole, 'owner'>> = [
  'editor',
  'setlist_manager',
  'viewer'
];

export const getAssignableTeamRoles = (currentUserRole: LibraryRole): ReadonlyArray<Exclude<LibraryRole, 'owner'>> => {
  if (currentUserRole === 'owner') return ['admin', ...EDITABLE_TEAM_ROLES];
  if (currentUserRole === 'admin') return EDITABLE_TEAM_ROLES;
  return [];
};

export const canManageTeamMember = (currentUserRole: LibraryRole, targetRole: LibraryRole) =>
  targetRole !== 'owner' && (
    currentUserRole === 'owner'
    || (currentUserRole === 'admin' && targetRole !== 'admin')
  );

export const getTeamRoleLabel = (role: LibraryRole, language: AppLanguage) => {
  if (language === 'zh') {
    switch (role) {
      case 'owner': return '團隊擁有者';
      case 'admin': return '總管理員';
      case 'editor': return '歌曲管理員';
      case 'setlist_manager': return '歌單管理員';
      case 'viewer': return '僅可檢視';
      default: return role;
    }
  }

  switch (role) {
    case 'owner': return 'Team Owner';
    case 'admin': return 'Team Admin';
    case 'editor': return 'Song Manager';
    case 'setlist_manager': return 'Setlist Manager';
    case 'viewer': return 'View Only';
    default: return role;
  }
};

export const getTeamRoleDescription = (role: LibraryRole, language: AppLanguage) => {
  if (language === 'zh') {
    switch (role) {
      case 'owner': return '完整權限，可管理歌曲、歌單、專案、成員與邀請，並指派或撤銷總管理員。';
      case 'admin': return '可管理全部團隊歌曲、歌單、專案及一般成員的權限與邀請；不能變更擁有者或其他總管理員，也不能指派總管理員。';
      case 'editor': return '可管理團隊歌曲、建立歌單與專案、管理自己建立的專案，並編輯自己建立或被指派的歌單。';
      case 'setlist_manager': return '不能更改團隊歌曲或歌單內的和弦、段落內容；可建立歌單與專案、管理自己建立的專案，並在自己建立或被指派的歌單中選曲、排序及設定共用調性。';
      case 'viewer': return '可查看團隊歌曲、歌單與專案，並設定自己的 Capo；不能修改共用內容。';
      default: return '';
    }
  }

  switch (role) {
    case 'owner': return 'Full access to songs, setlists, projects, members, and invitations, including assigning and removing team admins.';
    case 'admin': return 'Can manage all team songs, setlists, projects, and regular members and invitations. Cannot change the owner or other admins, or appoint admins.';
    case 'editor': return 'Can manage team songs, create setlists and projects, manage their own projects, and edit setlists they create or are assigned.';
    case 'setlist_manager': return 'Cannot edit charts, chords, or sections. Can create setlists and projects, manage their own projects, and select songs, reorder, and set shared keys in setlists they create or are assigned.';
    case 'viewer': return 'Can view team songs, setlists, and projects and choose their own capo without changing shared content.';
    default: return '';
  }
};

export const getTeamRoleRecommendation = (role: LibraryRole, language: AppLanguage) => {
  if (language === 'zh') {
    switch (role) {
      case 'owner': return '保留團隊所有權，指派總管理員。';
      case 'admin': return '受託管理團隊日常運作與人員分工。';
      case 'editor': return '負責維護團隊原始歌譜的人員。';
      case 'setlist_manager': return '負責安排服事歌單及編排的同工。';
      case 'viewer': return '只需要看譜、練習與演出的團員。';
    }
  }
  switch (role) {
    case 'owner': return 'Retains team ownership and appoints administrators.';
    case 'admin': return 'Manages day-to-day team operations and member responsibilities.';
    case 'editor': return 'People who maintain the team’s source charts.';
    case 'setlist_manager': return 'People who arrange service setlists.';
    case 'viewer': return 'Members who need charts for practice and performance.';
  }
};
