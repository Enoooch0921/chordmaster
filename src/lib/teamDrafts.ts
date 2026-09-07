import type { WorkspaceData } from './workspaceMerge';

export interface TeamDraft {
  version: 1;
  userId: string;
  libraryId: string;
  savedAt: number;
  workspace: WorkspaceData;
  baseline: WorkspaceData;
}

const draftKey = (userId: string, libraryId: string) =>
  `chordmaster.team-draft.v1.${encodeURIComponent(userId)}.${encodeURIComponent(libraryId)}`;

export const writeTeamDraft = (userId: string, libraryId: string, workspace: WorkspaceData, baseline: WorkspaceData) => {
  const draft: TeamDraft = { version: 1, userId, libraryId, savedAt: Date.now(), workspace, baseline };
  const serialized = JSON.stringify(draft);
  const key = draftKey(userId, libraryId);
  window.localStorage.setItem(key, serialized);
  if (window.localStorage.getItem(key) !== serialized) throw new Error('草稿寫入驗證失敗');
  return draft;
};

const isWorkspaceData = (value: unknown): value is WorkspaceData => {
  if (!value || typeof value !== 'object') return false;
  return (['songs', 'setlists', 'projects'] as const).every((key) => {
    const items = (value as WorkspaceData)[key];
    return Array.isArray(items) && items.every((item) => item && typeof item.id === 'string'
      && Number.isFinite(item.updatedAt))
      && new Set(items.map((item) => item.id)).size === items.length;
  }) && (value as WorkspaceData).songs.every((song) => typeof song.title === 'string' && Array.isArray(song.sections))
    && (value as WorkspaceData).setlists.every((setlist) => typeof setlist.name === 'string' && Array.isArray(setlist.songs))
    && (value as WorkspaceData).projects.every((project) => typeof project.name === 'string');
};

export const readTeamDraft = (userId: string, libraryId: string): TeamDraft | null => {
  const raw = window.localStorage.getItem(draftKey(userId, libraryId));
  if (!raw) return null;
  const draft = JSON.parse(raw) as TeamDraft;
  if (draft.version !== 1 || draft.userId !== userId || draft.libraryId !== libraryId
    || !Number.isFinite(draft.savedAt) || !isWorkspaceData(draft.workspace) || !isWorkspaceData(draft.baseline)) {
    throw new Error('無法讀取草稿，原始備份仍保留在本機');
  }
  return draft;
};

export const removeTeamDraft = (userId: string, libraryId: string, expected?: WorkspaceData) => {
  if (expected) {
    const draft = readTeamDraft(userId, libraryId);
    if (!draft || JSON.stringify(draft.workspace) !== JSON.stringify(expected)) return;
  }
  window.localStorage.removeItem(draftKey(userId, libraryId));
};

// Apply only draft edits relative to its baseline. Remote-only items and remote
// edits to untouched records survive. Conflicts require an explicit UI choice.
export const restoreTeamDraft = (draft: TeamDraft, remote: WorkspaceData) => {
  let conflicts = 0;
  const merge = <T extends { id: string }>(local: T[], baseline: T[], current: T[]) => {
    const base = new Map(baseline.map((item) => [item.id, item]));
    const edited = new Map(local.map((item) => [item.id, item]));
    const result = new Map(current.map((item) => [item.id, item]));
    for (const id of new Set([...base.keys(), ...edited.keys()])) {
      const before = JSON.stringify(base.get(id));
      const after = JSON.stringify(edited.get(id));
      if (before === after) continue;
      const cloud = JSON.stringify(result.get(id));
      if (cloud !== before && cloud !== after) conflicts += 1;
      const value = edited.get(id);
      if (value) result.set(id, value);
      else result.delete(id);
    }
    return [...result.values()];
  };
  const workspace: WorkspaceData = {
    songs: merge(draft.workspace.songs, draft.baseline.songs, remote.songs),
    setlists: merge(draft.workspace.setlists, draft.baseline.setlists, remote.setlists),
    projects: merge(draft.workspace.projects, draft.baseline.projects, remote.projects)
  };
  return { workspace, conflicts };
};
