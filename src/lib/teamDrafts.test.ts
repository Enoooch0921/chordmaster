import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTeamDraft, removeTeamDraft, restoreTeamDraft, writeTeamDraft } from './teamDrafts';
import type { WorkspaceData } from './workspaceMerge';

const workspace = (name: string): WorkspaceData => ({ songs: [], setlists: [], projects: [{ id: 'p', name, updatedAt: 100, createdAt: 1 }] });
const legacyKey = 'chordmaster.team-draft.v1.a.t';
const seedLegacy = () => {
  const draft = { version: 1, userId: 'a', libraryId: 't', savedAt: 10, workspace: workspace('edited'), baseline: workspace('base') };
  localStorage.setItem(legacyKey, JSON.stringify(draft));
  return draft;
};

describe('team drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('isolates drafts by both account and library', async () => {
    await writeTeamDraft('a', 'team-1', workspace('edited'), workspace('base'));
    expect((await readTeamDraft('a', 'team-1'))?.workspace.projects[0].name).toBe('edited');
    expect(await readTeamDraft('b', 'team-1')).toBeNull();
    expect(await readTeamDraft('a', 'team-2')).toBeNull();
  });

  it('does not clear a newer draft when an earlier network save finishes', async () => {
    await writeTeamDraft('a', 'team-1', workspace('newer'), workspace('base'));
    await removeTeamDraft('a', 'team-1', workspace('older'));
    expect(await readTeamDraft('a', 'team-1')).not.toBeNull();
    await removeTeamDraft('a', 'team-1', workspace('newer'));
    expect(await readTeamDraft('a', 'team-1')).toBeNull();
  });

  it('preserves remote-only items and reports conflicting edits', async () => {
    const draft = await writeTeamDraft('a', 't', workspace('local'), workspace('base'));
    const remote = workspace('cloud');
    remote.projects.push({ id: 'new', name: 'New', updatedAt: 101, createdAt: 1 });
    const restored = restoreTeamDraft(draft, remote);
    expect(restored.conflicts).toBe(1);
    expect(restored.workspace.projects.map((item) => item.name)).toEqual(['local', 'New']);
  });

  it('omits unchanged records and keeps remote changes to them', async () => {
    const draft = await writeTeamDraft('a', 't', workspace('same'), workspace('same'));
    expect(draft.workspace.projects).toEqual([]);
    expect(draft.baseline.projects).toEqual([]);
    expect(restoreTeamDraft(draft, workspace('remote edit')).workspace).toEqual(workspace('remote edit'));
  });

  it('saves a large library display change even when localStorage is full', async () => {
    const baseline: WorkspaceData = {
      songs: Array.from({ length: 2000 }, (_, index) => ({
        id: `song-${index}`, title: `Song ${index} ${'lyrics '.repeat(500)}`,
        sections: [], createdAt: 1, updatedAt: 1,
      })) as WorkspaceData['songs'], setlists: [], projects: [],
    };
    const edited: WorkspaceData = { ...baseline, songs: baseline.songs.map((song, index) => index === 0
      ? { ...song, showNashvilleNumbers: true, updatedAt: 2 } : song) };
    expect(JSON.stringify(baseline).length).toBeGreaterThan(5_000_000);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await writeTeamDraft('a', 't', edited, baseline);
    const draft = (await readTeamDraft('a', 't'))!;
    expect(draft.workspace.songs).toHaveLength(1);
    expect(draft.baseline.songs).toHaveLength(1);
    expect(JSON.stringify(draft).length).toBeLessThan(10_000);
    expect(restoreTeamDraft(draft, baseline)).toEqual({ workspace: edited, conflicts: 0 });
  });

  it('automatically migrates legacy drafts and frees their localStorage space', async () => {
    const legacy = seedLegacy();
    localStorage.setItem('unrelated-preference', 'keep');
    const draft = await readTeamDraft('a', 't');
    expect(draft?.version).toBe(2);
    expect(draft?.savedAt).toBe(legacy.savedAt);
    expect(restoreTeamDraft(draft!, legacy.baseline).workspace).toEqual(legacy.workspace);
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem('unrelated-preference')).toBe('keep');
    expect(await readTeamDraft('a', 't')).toEqual(draft);
  });

  it('migrates a newer legacy write from an older app tab instead of deleting it', async () => {
    await writeTeamDraft('a', 't', workspace('earlier'), workspace('base'));
    const legacy = seedLegacy();
    localStorage.setItem(legacyKey, JSON.stringify({ ...legacy, savedAt: Date.now() + 1000 }));
    expect((await readTeamDraft('a', 't'))?.workspace).toEqual(legacy.workspace);
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('retains the legacy backup when a migration transaction aborts', async () => {
    seedLegacy();
    const original = localStorage.getItem(legacyKey);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      const request = put.apply(this, args);
      this.transaction.abort();
      return request;
    });
    await expect(readTeamDraft('a', 't')).rejects.toThrow();
    expect(localStorage.getItem(legacyKey)).toBe(original);
  });

  it('reports transaction failure without losing the previous committed draft', async () => {
    await writeTeamDraft('a', 't', workspace('safe'), workspace('base'));
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await expect(writeTeamDraft('a', 't', workspace('new'), workspace('base'))).rejects.toThrow('Full');
    expect((await readTeamDraft('a', 't'))?.workspace.projects[0].name).toBe('safe');
  });

  it('keeps additions and deletions in compact drafts and checks them before removal', async () => {
    const base = workspace('old');
    const edited: WorkspaceData = { ...base, projects: [{ id: 'new', name: 'New', createdAt: 1, updatedAt: 2 }] };
    const draft = await writeTeamDraft('a', 't', edited, base);
    expect(restoreTeamDraft(draft, base)).toEqual({ workspace: edited, conflicts: 0 });
    await removeTeamDraft('a', 't', { ...base, projects: [...base.projects, ...edited.projects] });
    expect(await readTeamDraft('a', 't')).not.toBeNull();
    await removeTeamDraft('a', 't', edited);
    expect(await readTeamDraft('a', 't')).toBeNull();
  });

  it('serializes overlapping writes and cleanup without discarding newer edits', async () => {
    const first = writeTeamDraft('a', 't', workspace('first'), workspace('base'));
    const second = writeTeamDraft('a', 't', workspace('second'), workspace('base'));
    const cleanup = removeTeamDraft('a', 't', workspace('first'));
    await Promise.all([first, second, cleanup]);
    expect((await readTeamDraft('a', 't'))?.workspace.projects[0].name).toBe('second');
  });

  it('leaves malformed legacy backups intact', async () => {
    localStorage.setItem(legacyKey, '{broken');
    await expect(readTeamDraft('a', 't')).rejects.toThrow();
    expect(localStorage.getItem(legacyKey)).toBe('{broken');
  });
});
