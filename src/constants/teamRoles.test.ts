import { describe, expect, it } from 'vitest';
import { getTeamRoleDescription, getTeamRoleLabel } from './teamRoles';

describe('team role copy', () => {
  it('uses action-oriented Traditional Chinese role names', () => {
    expect(getTeamRoleLabel('editor', 'zh')).toBe('歌曲管理員');
    expect(getTeamRoleLabel('setlist_manager', 'zh')).toBe('歌單協作者');
    expect(getTeamRoleLabel('viewer', 'zh')).toBe('僅可檢視');
  });

  it('makes the difference between song and setlist permissions explicit', () => {
    expect(getTeamRoleDescription('editor', 'zh')).toContain('管理團隊歌曲');
    expect(getTeamRoleDescription('setlist_manager', 'zh')).toContain('不能更改團隊歌曲');
  });
});
