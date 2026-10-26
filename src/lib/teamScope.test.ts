import { describe, expect, it } from 'vitest';
import type { LibraryRole, Project, Setlist, TeamManagementScope } from '../types';
import { buildTeamManagementScope, getTeamScopeBoundary, getTeamScopeSummary, normalizeTeamManagementScope } from './teamScope';

const project = (id: string, createdBy?: string, archived = false): Project => ({
  id, name: id, createdBy, archived, createdAt: 1, updatedAt: 1,
});
const setlist = (id: string, createdBy?: string, assignedToCurrentUser = false, archived = false): Setlist => ({
  id, name: id, createdBy, assignedToCurrentUser, archived, displayMode: 'chord-fixed-key', songs: [], createdAt: 1, updatedAt: 1,
});

describe('team management scope', () => {
  const source = {
    userId: 'me',
    projects: [project('other-project', 'other'), project('own-project', 'me'), project('unknown-project')],
    setlists: [setlist('other-list', 'other'), setlist('own-list', 'me'), setlist('assigned-list', 'other', true), setlist('unknown-list')],
  };

  it.each(['editor', 'setlist_manager'] as LibraryRole[])('shows only resources the %s can actually manage', (role) => {
    expect(buildTeamManagementScope(role, source)).toEqual({
      projects: [{ id: 'own-project', name: 'own-project', archived: false }],
      setlists: [
        { id: 'assigned-list', name: 'assigned-list', archived: false, projectId: null, access: 'assigned' },
        { id: 'own-list', name: 'own-list', archived: false, projectId: null, access: 'created' },
      ],
    });
  });

  it.each(['owner', 'admin'] as LibraryRole[])('includes all team resources for %s without claiming they created every resource', (role) => {
    const scope = buildTeamManagementScope(role, source)!;
    expect(scope.projects).toHaveLength(3);
    expect(scope.setlists).toHaveLength(4);
    expect(scope.setlists.find((entry) => entry.id === 'own-list')?.access).toBe('created');
    expect(scope.setlists.find((entry) => entry.id === 'assigned-list')?.access).toBe('administrator');
    expect(scope.setlists.find((entry) => entry.id === 'unknown-list')?.access).toBe('administrator');
    expect(getTeamScopeSummary(role, scope, 'zh')).toBe('全團隊管理');
  });

  it('does not grant viewers scope from ownership or assignments', () => {
    const scope = buildTeamManagementScope('viewer', source);
    expect(scope).toEqual({ projects: [], setlists: [] });
    expect(getTeamScopeBoundary('viewer', 'zh')).toContain('Capo 只影響自己的畫面');
  });

  it('keeps archived resources visible and chooses created over assigned for owned lists', () => {
    const scope = buildTeamManagementScope('setlist_manager', {
      userId: 'me', projects: [project('A', 'me', true), project('Z', 'me')],
      setlists: [setlist('A', 'me', true, true), setlist('Z', 'other', true)],
    })!;
    expect(scope.projects.map(({ id }) => id)).toEqual(['Z', 'A']);
    expect(scope.setlists).toEqual([
      expect.objectContaining({ id: 'Z', access: 'assigned', archived: false }),
      expect.objectContaining({ id: 'A', access: 'created', archived: true }),
    ]);
  });

  it('falls back to generic permissions when ownership metadata is unavailable', () => {
    expect(buildTeamManagementScope('editor', { ...source, userId: undefined })).toBeUndefined();
    expect(getTeamScopeSummary('editor', undefined, 'zh')).toBe('全部歌曲 · 自建專案 · 自建或指派歌單');
    expect(getTeamScopeSummary('setlist_manager', undefined, 'en')).not.toMatch(/\d/);
    expect(getTeamScopeBoundary('setlist_manager', 'zh')).toContain('不能修改歌詞、和弦或段落');
    expect(getTeamScopeBoundary('owner', 'zh')).toContain('指派或撤銷總管理員');
    expect(getTeamScopeBoundary('admin', 'zh')).toContain('不能變更擁有者或其他總管理員，也不能指派總管理員');
  });

  it('preserves complete server scope and removes unrelated fields', () => {
    const scope: TeamManagementScope = {
      projects: [{ id: 'p', name: 'Project', archived: true }],
      setlists: [{ id: 's', name: 'Sunday', projectId: 'p', archived: false, access: 'assigned' }],
    };
    expect(normalizeTeamManagementScope({ ...scope, extra: 'ignored' }, 'setlist_manager')).toEqual(scope);
    expect(normalizeTeamManagementScope(undefined, 'editor')).toBeUndefined();
  });

  it.each([
    { projects: [] },
    { projects: [{ id: 'p', name: 'P' }], setlists: [] },
    { projects: [], setlists: [{ id: 's', name: 'S', projectId: null, archived: false, access: 'invalid' }] },
    { projects: [{ id: 'p', name: 'P', archived: false }, { id: 'p', name: 'P', archived: false }], setlists: [] },
    { projects: [], setlists: [null] },
  ])('rejects incomplete or ambiguous server scope without inventing counts: %j', (scope) => {
    expect(normalizeTeamManagementScope(scope, 'admin')).toBeUndefined();
  });

  it('rejects server scope that conflicts with the actual member role', () => {
    const scope = { projects: [], setlists: [{ id: 's', name: 'S', projectId: null, archived: false, access: 'administrator' }] };
    expect(normalizeTeamManagementScope(scope, 'admin')).toEqual(scope);
    expect(normalizeTeamManagementScope(scope, 'setlist_manager')).toBeUndefined();
    expect(normalizeTeamManagementScope(scope, 'editor')).toBeUndefined();
    expect(normalizeTeamManagementScope(scope, 'viewer')).toBeUndefined();
    expect(normalizeTeamManagementScope({ projects: [], setlists: [] }, 'viewer')).toEqual({ projects: [], setlists: [] });
  });
});
