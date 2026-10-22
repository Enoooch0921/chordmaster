import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadActiveLibraryPreference, resolveInitialLibrary, saveActiveLibraryPreference } from './activeLibraryPreference';

const personal = { id: 'personal', kind: 'personal' as const };
const teamA = { id: 'team-a', kind: 'team' as const };
const teamB = { id: 'team-b', kind: 'team' as const };
const libraries = [personal, teamA, teamB];
const resolve = (rememberedLibraryId: string | null, requestedTeamId: string | null = null) =>
  resolveInitialLibrary(libraries, { rememberedLibraryId, requestedTeamId });

describe('remembered workspace selection', () => {
  beforeEach(() => window.localStorage.clear());

  it('restores the same team after a successful switch and page reload', () => {
    saveActiveLibraryPreference('user-a', teamA.id);
    expect(resolve(loadActiveLibraryPreference('user-a'))).toBe(teamA);
    saveActiveLibraryPreference('user-a', teamB.id);
    expect(resolve(loadActiveLibraryPreference('user-a'))).toBe(teamB);
  });

  it('keeps each account’s workspace choice separate', () => {
    saveActiveLibraryPreference('user-a', teamA.id);
    saveActiveLibraryPreference('user-b', teamB.id);
    expect(loadActiveLibraryPreference('user-a')).toBe(teamA.id);
    expect(loadActiveLibraryPreference('user-b')).toBe(teamB.id);
    expect(loadActiveLibraryPreference('new-user')).toBeNull();
    expect(resolve(loadActiveLibraryPreference('new-user'))).toBe(personal);
  });

  it('remembers an explicit return to the personal workspace', () => {
    saveActiveLibraryPreference('user-a', teamA.id);
    saveActiveLibraryPreference('user-a', personal.id);
    expect(resolve(loadActiveLibraryPreference('user-a'))).toBe(personal);
  });

  it('prioritizes a valid team link over the remembered workspace', () => {
    expect(resolve(teamA.id, teamB.id)).toBe(teamB);
    expect(resolve(teamA.id, personal.id)).toBe(teamA);
    expect(resolve(teamA.id, 'missing-team')).toBe(teamA);
  });

  it('falls back to personal when the remembered team is no longer accessible', () => {
    const remaining = [personal, teamB];
    expect(resolveInitialLibrary(remaining, { requestedTeamId: null, rememberedLibraryId: teamA.id })).toBe(personal);
    expect(resolve('deleted-team')).toBe(personal);
  });

  it('handles accounts with no personal workspace or no accessible workspaces', () => {
    const options = { requestedTeamId: null, rememberedLibraryId: null };
    expect(resolveInitialLibrary([teamB], options)).toBe(teamB);
    expect(resolveInitialLibrary([], options)).toBeNull();
  });

  it('continues working when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    expect(loadActiveLibraryPreference('user-a')).toBeNull();
    expect(() => saveActiveLibraryPreference('user-a', teamA.id)).not.toThrow();
  });
});
