import { describe, expect, it } from 'vitest';
import { DEFAULT_TEAM_INVITE_ROLE, EDITABLE_TEAM_ROLES, canManageTeamMember, getAssignableTeamRoles, getTeamRoleDescription, getTeamRoleLabel } from './teamRoles';

describe('team role copy', () => {
  it('uses action-oriented Traditional Chinese role names', () => {
    expect(getTeamRoleLabel('editor', 'zh')).toBe('歌曲管理員');
    expect(getTeamRoleLabel('admin', 'zh')).toBe('總管理員');
    expect(getTeamRoleLabel('setlist_manager', 'zh')).toBe('歌單管理員');
    expect(getTeamRoleLabel('viewer', 'zh')).toBe('僅可檢視');
  });

  it('makes the difference between song and setlist permissions explicit', () => {
    expect(getTeamRoleDescription('editor', 'zh')).toContain('管理團隊歌曲');
    expect(getTeamRoleDescription('setlist_manager', 'zh')).toContain('不能更改團隊歌曲');
  });

  it('reserves admin delegation for owners and keeps invitation defaults read only', () => {
    expect(DEFAULT_TEAM_INVITE_ROLE).toBe('viewer');
    expect(EDITABLE_TEAM_ROLES).not.toContain('admin');
    expect(EDITABLE_TEAM_ROLES).not.toContain('owner');
    expect(getAssignableTeamRoles('owner')).toContain('admin');
    expect(getAssignableTeamRoles('admin')).not.toContain('admin');
    expect(getAssignableTeamRoles('viewer')).toEqual([]);
    expect(canManageTeamMember('owner', 'admin')).toBe(true);
    expect(canManageTeamMember('owner', 'owner')).toBe(false);
    expect(canManageTeamMember('admin', 'owner')).toBe(false);
    expect(canManageTeamMember('admin', 'admin')).toBe(false);
    expect(canManageTeamMember('admin', 'editor')).toBe(true);
    expect(canManageTeamMember('editor', 'viewer')).toBe(false);
  });
});
