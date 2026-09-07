import type { Project, Setlist, StoredSong } from '../types';
import { isLocalOnlySymbolTestSong } from './symbolTestSongs';

export interface WorkspaceData {
  songs: StoredSong[];
  setlists: Setlist[];
  projects: Project[];
}

// Values are the last observed remote revision, not the device's deletion time.
// A remote edit newer than that revision must survive an offline deletion.
export type WorkspaceDeletions = Record<keyof WorkspaceData, Record<string, number>>;

export const collectWorkspaceDeletions = (
  current: WorkspaceData,
  baseline: WorkspaceData,
  previous?: WorkspaceDeletions
): WorkspaceDeletions => {
  const collect = (key: keyof WorkspaceData) => {
    const present = new Set(current[key].map((item) => item.id));
    const deleted = { ...previous?.[key] };
    for (const item of baseline[key]) {
      if (!present.has(item.id)) deleted[item.id] ??= item.updatedAt;
    }
    for (const id of present) delete deleted[id];
    return deleted;
  };
  return { songs: collect('songs'), setlists: collect('setlists'), projects: collect('projects') };
};

const mergeItems = <T extends { id: string; updatedAt: number }>(
  local: T[], remote: T[], deletions: Record<string, number> = {}
) => {
  const merged = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const localItem = merged.get(item.id);
    const deletedRevision = Object.hasOwn(deletions, item.id) ? deletions[item.id] : undefined;
    if (!localItem && deletedRevision !== undefined && item.updatedAt <= deletedRevision) continue;
    if (!localItem || item.updatedAt > localItem.updatedAt) merged.set(item.id, item);
  }
  return [...merged.values()];
};

export const mergeWorkspaceByUpdatedAt = (
  local: WorkspaceData & { savedAt?: number; deletions?: WorkspaceDeletions },
  remote: WorkspaceData
): WorkspaceData => ({
  songs: mergeItems(local.songs, remote.songs.filter((song) => !isLocalOnlySymbolTestSong(song)), local.deletions?.songs),
  setlists: mergeItems(local.setlists, remote.setlists, local.deletions?.setlists),
  projects: mergeItems(local.projects, remote.projects, local.deletions?.projects)
});

export const parseWorkspaceDeletions = (value: unknown): WorkspaceDeletions | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const result = { songs: {}, setlists: {}, projects: {} } as WorkspaceDeletions;
  for (const key of ['songs', 'setlists', 'projects'] as const) {
    const entries = (value as Record<string, unknown>)[key];
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return undefined;
    for (const [id, revision] of Object.entries(entries)) {
      if (typeof revision !== 'number' || !Number.isFinite(revision) || revision < 0) return undefined;
      Object.defineProperty(result[key], id, { value: revision, enumerable: true, configurable: true, writable: true });
    }
  }
  return result;
};
