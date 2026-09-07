import { describe, expect, it, vi } from 'vitest';
import { collectWorkspaceDeletions, mergeWorkspaceByUpdatedAt, type WorkspaceData } from './workspaceMerge';
import { syncWorkspaceDiff } from './sync';
import type { WorkspaceRepository } from './repository';
import { loadPendingSync, savePendingSync } from './workspace';

const empty = (): WorkspaceData => ({ songs: [], setlists: [], projects: [] });
const project = (id: string, updatedAt: number) => ({ id, name: id, updatedAt, createdAt: 1 });

describe('offline workspace reconciliation', () => {
  it('never treats an unseen remote item as deleted, including legacy queues', async () => {
    const remote = { ...empty(), projects: [project('other-device', 200)] };
    const merged = mergeWorkspaceByUpdatedAt({ ...empty(), savedAt: 300 }, remote);
    const deleteProject = vi.fn();
    await syncWorkspaceDiff({ repository: { deleteProject } as unknown as WorkspaceRepository,
      ...merged, savedSongs: [], savedSetlists: [], savedProjects: remote.projects });
    expect(merged.projects).toEqual(remote.projects);
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('deletes only explicitly removed baseline records', () => {
    const baseline = { ...empty(), projects: [project('deleted', 100)] };
    const local = { ...empty(), deletions: collectWorkspaceDeletions(empty(), baseline) };
    const merged = mergeWorkspaceByUpdatedAt(local, { ...baseline, projects: [...baseline.projects, project('unseen', 50)] });
    expect(merged.projects.map((item) => item.id)).toEqual(['unseen']);
  });

  it('preserves remote edits made after the deleted version was last seen', () => {
    const baseline = { ...empty(), projects: [project('updated', 100)] };
    const merged = mergeWorkspaceByUpdatedAt({ ...empty(), savedAt: 9999,
      deletions: collectWorkspaceDeletions(empty(), baseline) }, { ...empty(), projects: [project('updated', 101)] });
    expect(merged.projects).toHaveLength(1);
  });

  it('clears deletion evidence when the user restores an item', () => {
    const baseline = { ...empty(), projects: [project('restored', 100)] };
    const deletions = collectWorkspaceDeletions(empty(), baseline);
    expect(collectWorkspaceDeletions(baseline, baseline, deletions).projects).toEqual({});
  });

  it('round-trips deletion evidence without clearing another account queue', () => {
    localStorage.clear();
    const baseline = { ...empty(), projects: [project('deleted', 100)] };
    const deletions = collectWorkspaceDeletions(empty(), baseline);
    const a = { userId: 'a', libraryId: 'personal-a' };
    const b = { userId: 'b', libraryId: 'personal-b' };
    savePendingSync({ ...empty(), ...a, savedAt: 300, deletions });
    savePendingSync({ ...empty(), ...b, savedAt: 400 });
    savePendingSync(null, b);
    expect(loadPendingSync(b)).toBeNull();
    expect(loadPendingSync(a)?.deletions).toEqual(deletions);
    expect(mergeWorkspaceByUpdatedAt(loadPendingSync(a)!, baseline).projects).toEqual([]);
  });
});
