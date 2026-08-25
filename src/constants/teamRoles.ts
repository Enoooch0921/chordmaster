import type { AppLanguage, LibraryRole } from '../types';

export const EDITABLE_TEAM_ROLES: ReadonlyArray<Exclude<LibraryRole, 'owner'>> = [
  'editor',
  'setlist_manager',
  'viewer'
];

export const getTeamRoleLabel = (role: LibraryRole, language: AppLanguage) => {
  if (language === 'zh') {
    switch (role) {
      case 'owner': return '團隊擁有者';
      case 'editor': return '歌曲管理員';
      case 'setlist_manager': return '歌單協作者';
      case 'viewer': return '僅可檢視';
      default: return role;
    }
  }

  switch (role) {
    case 'owner': return 'Team Owner';
    case 'editor': return 'Song Manager';
    case 'setlist_manager': return 'Setlist Collaborator';
    case 'viewer': return 'View Only';
    default: return role;
  }
};

export const getTeamRoleDescription = (role: LibraryRole, language: AppLanguage) => {
  if (language === 'zh') {
    switch (role) {
      case 'owner': return '完整權限，可管理歌曲、歌單、專案、成員與邀請。';
      case 'editor': return '可管理團隊歌曲、建立歌單與專案，並編輯自己建立或被指派的歌單。';
      case 'setlist_manager': return '不能更改團隊歌曲；可建立歌單與專案，並編輯自己建立或被指派的歌單。';
      case 'viewer': return '可查看團隊歌曲、歌單與專案，但不能修改內容。';
      default: return '';
    }
  }

  switch (role) {
    case 'owner': return 'Full access to songs, setlists, projects, members, and invitations.';
    case 'editor': return 'Can manage team songs, create setlists and projects, and edit setlists they create or are assigned.';
    case 'setlist_manager': return 'Cannot change team songs; can create setlists and projects and edit setlists they create or are assigned.';
    case 'viewer': return 'Can view team songs, setlists, and projects without changing them.';
    default: return '';
  }
};
