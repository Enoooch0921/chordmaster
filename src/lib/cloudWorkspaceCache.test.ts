import 'fake-indexeddb/auto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { clearCloudStartupPointer, loadCloudStartupCache, loadCloudWorkspaceCache, saveCloudWorkspaceCache } from './cloudWorkspaceCache';
import { saveActiveLibraryPreference } from './activeLibraryPreference';
import * as database from './workspaceDatabase';
import type { CloudWorkspaceCache } from './cloudWorkspaceCache';

let fixture: Omit<CloudWorkspaceCache, 'version' | 'cachedAt'>;
let sequence = 0;
beforeEach(() => {
  localStorage.clear(); window.history.replaceState(null, '', '/');
  const user = { id: `cache-test-${++sequence}`, email: 'cache@example.invalid', name: 'Test' };
  const library = { id: 'team', name: 'TopChurch', kind: 'team' as const, role: 'owner' as const, ownerUserId: user.id, createdAt: '', updatedAt: '' };
  fixture = { user, library, libraries: [library], workspace: { songs: [{ id: 'song', title: '點燃', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', updatedAt: 1,
    sections: [{ id: 'v', title: 'Verse', bars: [{ id: 'b', chords: ['C'] }] }] }], setlists: [], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 } };
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('stores a complete scoped workspace without replacing the personal snapshot or storing session credentials', async () => {
  await saveCloudWorkspaceCache({ ...fixture, user: { ...fixture.user, access_token: 'must-not-be-stored' } as typeof fixture.user });
  const restored = await loadCloudStartupCache();
  expect(restored).toMatchObject(fixture);
  expect(JSON.stringify(restored)).not.toContain('must-not-be-stored');
  expect((await database.readWorkspaceDatabase()).current).toBeUndefined();
  expect(localStorage.getItem('chordmaster.workspace-snapshot.v2')).toBeNull();
  expect(await loadCloudWorkspaceCache('another-account', 'team')).toBeNull();
});
it('keeps multiple libraries separate and only opens the requested or remembered one', async () => {
  await saveCloudWorkspaceCache(fixture);
  const personal = { ...fixture, library: { ...fixture.library, id: 'personal', kind: 'personal' as const }, workspace: { ...fixture.workspace, songs: [] } };
  personal.libraries = [fixture.library, personal.library];
  await saveCloudWorkspaceCache(personal);
  saveActiveLibraryPreference(fixture.user.id, 'team');
  expect((await loadCloudStartupCache())?.workspace.songs[0].title).toBe('點燃');
  window.history.replaceState(null, '', '/?team=not-cached');
  expect(await loadCloudStartupCache()).toBeNull();
  window.history.replaceState(null, '', '/');
  saveActiveLibraryPreference(fixture.user.id, 'personal');
  expect((await loadCloudStartupCache())?.workspace.songs).toEqual([]);
});
it('falls back to local storage when IndexedDB is unavailable, preserving the full score', async () => {
  vi.spyOn(database, 'writeWorkspaceCache').mockRejectedValueOnce(new Error('IndexedDB blocked'));
  await saveCloudWorkspaceCache(fixture);
  vi.spyOn(database, 'readWorkspaceCache').mockRejectedValueOnce(new Error('IndexedDB blocked'));
  expect((await loadCloudStartupCache())?.workspace).toEqual(fixture.workspace);
});
it('does not reactivate an account’s cache when a queued write finishes after sign-out', async () => {
  const pending = saveCloudWorkspaceCache(fixture);
  clearCloudStartupPointer();
  await pending;
  expect(await loadCloudStartupCache()).toBeNull();
  expect((await loadCloudWorkspaceCache(fixture.user.id, 'team'))?.workspace).toEqual(fixture.workspace);
});
it('retains the previous usable cache when both stores reject a new write', async () => {
  await saveCloudWorkspaceCache(fixture);
  vi.spyOn(database, 'writeWorkspaceCache').mockRejectedValueOnce(new Error('Disk full'));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
  await expect(saveCloudWorkspaceCache({ ...fixture, workspace: { ...fixture.workspace, songs: [] } })).rejects.toThrow('Quota exceeded');
  expect((await loadCloudStartupCache())?.workspace.songs[0].title).toBe('點燃');
});
it('rejects a corrupt cache instead of opening a broken workspace', async () => {
  await saveCloudWorkspaceCache(fixture);
  await database.writeWorkspaceCache(`cloud-cache:${fixture.user.id}:team`, '{"version":1}');
  expect(await loadCloudStartupCache()).toBeNull();
});
