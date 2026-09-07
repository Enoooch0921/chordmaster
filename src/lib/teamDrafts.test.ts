import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTeamDraft, removeTeamDraft, restoreTeamDraft, writeTeamDraft } from './teamDrafts';
import type { WorkspaceData } from './workspaceMerge';

const workspace = (name: string): WorkspaceData => ({ songs: [], setlists: [], projects: [{ id: 'p', name, updatedAt: 100, createdAt: 1 }] });

describe('team drafts', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('isolates drafts by both account and library', () => {
    writeTeamDraft('a', 'team-1', workspace('edited'), workspace('base'));
    expect(readTeamDraft('a', 'team-1')?.workspace.projects[0].name).toBe('edited');
    expect(readTeamDraft('b', 'team-1')).toBeNull();
    expect(readTeamDraft('a', 'team-2')).toBeNull();
  });

  it('does not clear a newer draft when an earlier network save finishes', () => {
    writeTeamDraft('a', 'team-1', workspace('newer'), workspace('base'));
    removeTeamDraft('a', 'team-1', workspace('older'));
    expect(readTeamDraft('a', 'team-1')).not.toBeNull();
    removeTeamDraft('a', 'team-1', workspace('newer'));
    expect(readTeamDraft('a', 'team-1')).toBeNull();
  });

  it('preserves remote-only items and reports conflicting edits', () => {
    const draft = writeTeamDraft('a', 't', workspace('local'), workspace('base'));
    const remote = workspace('cloud');
    remote.projects.push({ id: 'new', name: 'New', updatedAt: 101, createdAt: 1 });
    const restored = restoreTeamDraft(draft, remote);
    expect(restored.conflicts).toBe(1);
    expect(restored.workspace.projects.map((item) => item.name)).toEqual(['local', 'New']);
  });

  it('keeps remote changes to untouched records', () => {
    const draft = writeTeamDraft('a', 't', workspace('same'), workspace('same'));
    expect(restoreTeamDraft(draft, workspace('remote edit')).workspace).toEqual(workspace('remote edit'));
  });

  it('reports quota failure without losing the previous draft', () => {
    writeTeamDraft('a', 't', workspace('safe'), workspace('base'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    expect(() => writeTeamDraft('a', 't', workspace('new'), workspace('base'))).toThrow('Quota');
    expect(readTeamDraft('a', 't')?.workspace.projects[0].name).toBe('safe');
  });
});
