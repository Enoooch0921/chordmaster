import { describe, expect, it } from 'vitest';
import { canArrangeTeamSetlist, canEditTeamSetlistScore, canManageTeamProject, isTeamAdministrator } from './teamPermissions';
import type { LibraryRole } from '../types';

describe('team role boundaries', () => {
  it.each(['owner', 'admin'] as LibraryRole[])('%s manages every project and setlist, including scores', (role) => {
    const other = { createdBy: 'someone-else' };
    expect(isTeamAdministrator(role)).toBe(true);
    expect(canManageTeamProject(role, 'user', other)).toBe(true);
    expect(canArrangeTeamSetlist(role, 'user', other)).toBe(true);
    expect(canEditTeamSetlistScore(role, 'user', other)).toBe(true);
  });

  it('lets a setlist manager arrange owned or assigned setlists without modifying scores', () => {
    for (const list of [{ createdBy: 'user' }, { createdBy: 'other', assignedToCurrentUser: true }]) {
      expect(canArrangeTeamSetlist('setlist_manager', 'user', list)).toBe(true);
      expect(canEditTeamSetlistScore('setlist_manager', 'user', list)).toBe(false);
    }
    expect(canArrangeTeamSetlist('setlist_manager', 'user', { createdBy: 'other' })).toBe(false);
    expect(canManageTeamProject('setlist_manager', 'user', { createdBy: 'other' })).toBe(false);
  });

  it('allows song managers to edit assigned scores but never grants viewers edit access', () => {
    const assigned = { createdBy: 'other', assignedToCurrentUser: true };
    expect(canEditTeamSetlistScore('editor', 'user', assigned)).toBe(true);
    expect(canEditTeamSetlistScore('editor', 'user', { createdBy: 'other' })).toBe(false);
    expect(canArrangeTeamSetlist('viewer', 'user', assigned)).toBe(false);
    expect(canEditTeamSetlistScore('viewer', 'user', { createdBy: 'user' })).toBe(false);
    expect(canManageTeamProject('viewer', 'user', { createdBy: 'user' })).toBe(false);
  });

  it('does not mistake missing author or account metadata for ownership', () => {
    expect(canArrangeTeamSetlist('setlist_manager', undefined, {})).toBe(false);
    expect(canManageTeamProject('editor', undefined, {})).toBe(false);
    expect(canEditTeamSetlistScore('admin', 'user', null)).toBe(false);
  });
});
