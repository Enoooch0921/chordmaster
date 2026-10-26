import { describe, expect, it } from 'vitest';
import type { LibraryRole, SetlistSong, StoredSong } from '../types';
import type { WorkspaceData } from './workspaceMerge';
import { assertTeamWorkspaceSaveAllowed, TeamWorkspacePermissionError } from './teamWorkspacePermissions';

const song: StoredSong = {
  id: 'song', title: 'Shared chart', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }, { id: 'chorus', title: 'Chorus', bars: [] }],
  updatedAt: 1,
};
const entry: SetlistSong = {
  id: 'entry', setlistId: 'list', songId: song.id, order: 0, overrideKey: 'C',
  sectionOrder: ['verse', 'chorus'], songData: { ...structuredClone(song), title: 'Arranged chart' },
};
const workspace = (): WorkspaceData => structuredClone({
  songs: [song],
  setlists: [{ id: 'list', name: 'Sunday', createdBy: 'me', displayMode: 'chord-fixed-key', createdAt: 1, updatedAt: 1, songs: [entry] }],
  projects: [{ id: 'project', name: 'Services', createdBy: 'me', createdAt: 1, updatedAt: 1 }],
});

const expectDenied = (role: LibraryRole, next: WorkspaceData, before: WorkspaceData, code: TeamWorkspacePermissionError['code']) => {
  try {
    assertTeamWorkspaceSaveAllowed(role, 'me', next, before);
    throw new Error('Expected the save to be rejected');
  } catch (error) {
    expect(error).toBeInstanceOf(TeamWorkspacePermissionError);
    expect((error as TeamWorkspacePermissionError).code).toBe(code);
  }
};

describe('team workspace save preflight', () => {
  it.each(['owner', 'admin'] as LibraryRole[])('allows %s to save the complete workspace', (role) => {
    const before = workspace();
    const next = workspace();
    next.songs[0].title = 'Edited song';
    next.setlists[0].songs[0].songData!.sections = [];
    next.projects = [];
    expect(() => assertTeamWorkspaceSaveAllowed(role, 'me', next, before)).not.toThrow();
  });

  it('preserves a former editor’s draft when the role no longer permits library changes', () => {
    const before = workspace();
    const next = workspace();
    next.songs[0].sections[0].bars[0].chords = ['Dm'];
    const draft = structuredClone(next);
    expectDenied('setlist_manager', next, before, 'team-library-read-only');
    expect(next).toEqual(draft);
  });

  it.each(['score', 'sectionOrder', 'songId', 'unknown'] as const)('rejects a manager’s protected %s change before saving', (field) => {
    const before = workspace();
    const next = workspace();
    const target = next.setlists[0].songs[0];
    if (field === 'score') target.songData!.sections[0].bars[0].chords = ['Dm'];
    if (field === 'sectionOrder') target.sectionOrder.reverse();
    if (field === 'songId') target.songId = 'another-song';
    if (field === 'unknown') Object.assign(target, { tempoOverride: 120 });
    expectDenied('setlist_manager', next, before, 'team-score-read-only');
  });

  it('allows manager Key changes, add/remove/reorder, and ordinary owned list/project management', () => {
    const before = workspace();
    before.setlists[0].songs.push({ ...structuredClone(entry), id: 'removed' });
    const next = structuredClone(before);
    next.setlists[0].name = 'Morning service';
    next.setlists[0].projectId = 'project';
    next.projects[0].name = 'Weekly services';
    next.setlists[0].songs = [
      { id: 'new-entry', setlistId: 'list', songId: 'song', order: 0, sectionOrder: ['verse', 'chorus'], overrideKey: 'D' },
      { ...next.setlists[0].songs[0], order: 1, overrideKey: 'G', personalCapoOverride: 3 },
    ];
    expect(() => assertTeamWorkspaceSaveAllowed('setlist_manager', 'me', next, before)).not.toThrow();
  });

  it('allows assigned list arrangements but rejects forged assignment or ownership in a draft', () => {
    const before = workspace();
    before.setlists[0].createdBy = 'other';
    const next = structuredClone(before);
    next.setlists[0].songs[0].overrideKey = 'G';
    next.setlists[0].assignedToCurrentUser = true;
    expectDenied('setlist_manager', next, before, 'team-setlist-read-only');
    next.setlists[0].createdBy = 'me';
    expectDenied('setlist_manager', next, before, 'team-setlist-read-only');
    next.setlists[0].createdBy = 'other';
    before.setlists[0].assignedToCurrentUser = true;
    expect(() => assertTeamWorkspaceSaveAllowed('setlist_manager', 'me', next, before)).not.toThrow();
    next.setlists[0].assignedToCurrentUser = false;
    expectDenied('setlist_manager', next, before, 'team-setlist-read-only');
  });

  it('allows a canonical source copy and rejects edited or untrusted copies', () => {
    const before = workspace();
    const next = workspace();
    const copy = { ...structuredClone(entry), id: 'copied-entry', setlistId: 'copy-list', copySourceId: entry.id, overrideKey: 'D' as const };
    next.setlists.push({ ...structuredClone(next.setlists[0]), id: 'copy-list', songs: [copy] });
    expect(() => assertTeamWorkspaceSaveAllowed('setlist_manager', 'me', next, before)).not.toThrow();
    copy.songData!.title = 'Unsaved editor draft';
    expectDenied('setlist_manager', next, before, 'team-score-read-only');
    copy.songData = structuredClone(entry.songData);
    copy.copySourceId = 'unsaved-source';
    expectDenied('setlist_manager', next, before, 'team-score-read-only');
  });

  it.each(['songData', 'sectionOrder', 'archived', 'missing'] as const)('rejects noncanonical fresh manager insertion: %s', (variant) => {
    const before = workspace();
    const next = workspace();
    const fresh: SetlistSong = { id: 'fresh', setlistId: 'list', songId: 'song', order: 1, sectionOrder: ['verse', 'chorus'] };
    if (variant === 'songData') fresh.songData = structuredClone(song);
    if (variant === 'sectionOrder') fresh.sectionOrder.reverse();
    if (variant === 'archived') { before.songs[0].archivedAt = 2; next.songs[0].archivedAt = 2; }
    if (variant === 'missing') fresh.songId = 'unavailable';
    next.setlists[0].songs.push(fresh);
    expectDenied('setlist_manager', next, before, 'team-score-read-only');
  });

  it('allows new manager projects/lists while retaining canonical score checks', () => {
    const before = workspace();
    const next = workspace();
    next.projects.push({ id: 'new-project', name: 'Next service', createdAt: 2, updatedAt: 2 });
    next.setlists.push({ id: 'new-list', name: 'Next week', displayMode: 'chord-fixed-key', createdAt: 2, updatedAt: 2, projectId: 'new-project', songs: [
      { id: 'fresh', setlistId: 'new-list', songId: 'song', order: 0, sectionOrder: ['verse', 'chorus'] },
    ] });
    expect(() => assertTeamWorkspaceSaveAllowed('setlist_manager', 'me', next, before)).not.toThrow();
  });

  it('does not treat timestamp, object-key order or personal Capo changes as shared editing', () => {
    const before = workspace();
    const next = workspace();
    next.songs[0] = { updatedBy: 'remote', ...next.songs[0], updatedAt: 20 };
    next.projects[0].updatedAt = 20;
    next.setlists[0].updatedAt = 20;
    next.setlists[0].assignedToCurrentUser = false;
    next.setlists[0].songs[0].capo = 4;
    next.setlists[0].songs[0].personalCapoOverride = 4;
    next.setlists[0].songs[0].sourceArchivedAt = 20;
    next.setlists[0].songs[0].copySourceId = 'discarded-provenance';
    expect(() => assertTeamWorkspaceSaveAllowed('viewer', 'me', next, before)).not.toThrow();
  });

  it.each(['songs', 'setlists', 'projects'] as const)('rejects viewer %s deletion as a shared change', (collection) => {
    const before = workspace();
    const next = workspace();
    next[collection] = [];
    const code = collection === 'songs' ? 'team-library-read-only' : collection === 'setlists' ? 'team-setlist-read-only' : 'team-project-read-only';
    expectDenied('viewer', next, before, code);
  });

  it('allows editors to update team songs and assigned chart snapshots, but not unassigned lists/projects', () => {
    const before = workspace();
    before.setlists[0].createdBy = 'other';
    before.setlists[0].assignedToCurrentUser = true;
    const next = structuredClone(before);
    next.songs[0].title = 'Edited source';
    next.setlists[0].songs[0].songData!.title = 'Edited arrangement';
    expect(() => assertTeamWorkspaceSaveAllowed('editor', 'me', next, before)).not.toThrow();
    before.setlists[0].assignedToCurrentUser = false;
    expectDenied('editor', next, before, 'team-setlist-read-only');

    const foreignProject = workspace();
    foreignProject.projects[0].createdBy = 'other';
    const changed = structuredClone(foreignProject);
    changed.projects[0].createdBy = 'me';
    changed.projects[0].name = 'Changed';
    expectDenied('editor', changed, foreignProject, 'team-project-read-only');
  });
});
