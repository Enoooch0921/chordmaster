import type { LibraryRole, Project, Setlist, SetlistSong, StoredSong } from '../types';
import { getDefaultSectionOrder } from '../utils/setlistUtils';
import { canArrangeTeamSetlist, canManageTeamProject, isTeamAdministrator } from './teamPermissions';
import type { WorkspaceData } from './workspaceMerge';

export type TeamWorkspacePermissionCode =
  | 'team-library-read-only'
  | 'team-setlist-read-only'
  | 'team-project-read-only'
  | 'team-score-read-only';

/** The caller must retain the local draft when this preflight fails. */
export class TeamWorkspacePermissionError extends Error {
  constructor(public readonly code: TeamWorkspacePermissionCode, public readonly resourceId: string) {
    const messages: Record<TeamWorkspacePermissionCode, string> = {
      'team-library-read-only': 'Your current role cannot save changes to team library songs.',
      'team-setlist-read-only': 'Your current role cannot save changes to this setlist.',
      'team-project-read-only': 'Your current role cannot save changes to this project.',
      'team-score-read-only': 'Your current role cannot save chart or section changes inside a setlist.',
    };
    super(messages[code]);
    this.name = 'TeamWorkspacePermissionError';
  }
}

const without = (value: object, fields: readonly string[]) => Object.fromEntries(
  Object.entries(value).filter(([key]) => !fields.includes(key)),
);

// Compare JSON content rather than object insertion order. Undefined fields
// disappear just as they do in the repository's JSON request payloads.
const signature = (value: unknown) => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
});

const revisionFields = ['updatedAt', 'updatedBy'] as const;
const localEntryFields = ['capo', 'personalCapoOverride', 'sourceArchivedAt', 'copySourceId', 'sourceBaseline'] as const;
const sharedSong = (song: StoredSong) => without(song, revisionFields);
const sharedProject = (project: Project) => without(project, revisionFields);
const sharedSetlist = (setlist: Setlist) => ({
  ...without(setlist, [...revisionFields, 'assignedToCurrentUser']),
  // Array order is authoritative when the repository persists entries.
  songs: setlist.songs.map((entry, order) => ({ ...without(entry, localEntryFields), order })),
});
const protectedEntry = (entry: SetlistSong) => without(entry, [
  ...localEntryFields, 'id', 'setlistId', 'order', 'overrideKey',
]);

const changedItems = <T extends { id: string }>(current: T[], baseline: T[], comparable: (item: T) => unknown) => {
  const before = new Map(baseline.map((item) => [item.id, item]));
  const after = new Map(current.map((item) => [item.id, item]));
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((id) => {
    const previous = before.get(id);
    const next = after.get(id);
    return signature(previous && comparable(previous)) === signature(next && comparable(next))
      ? []
      : [{ id, previous, next }];
  });
};

const assertManagerEntries = (
  setlist: Setlist,
  savedEntries: Map<string, SetlistSong>,
  savedSongs: Map<string, StoredSong>,
) => {
  for (const entry of setlist.songs) {
    const reject = () => { throw new TeamWorkspacePermissionError('team-score-read-only', setlist.id); };
    if (entry.setlistId !== setlist.id) reject();
    const previous = savedEntries.get(entry.id);
    if (previous) {
      if (previous.setlistId !== entry.setlistId
        || signature(protectedEntry(previous)) !== signature(protectedEntry(entry))) reject();
      continue;
    }

    if (entry.copySourceId) {
      const source = savedEntries.get(entry.copySourceId);
      if (!source || signature(protectedEntry(source)) !== signature(protectedEntry(entry))) reject();
      continue;
    }

    // A new selection receives the server's canonical team chart. Accept only
    // the same section order, with no client-supplied score or extra overrides.
    const source = savedSongs.get(entry.songId);
    if (!source || source.archivedAt != null) reject();
    if (signature(protectedEntry(entry)) !== signature({
      songId: entry.songId,
      sectionOrder: getDefaultSectionOrder(source!),
    })) reject();
  }
};

/**
 * Validate the whole pending save before its first remote mutation. In
 * particular, a draft created as an editor must not be silently canonicalized
 * and then discarded after the account becomes a setlist manager.
 *
 * Baseline is the last saved/loaded workspace, not a draft's editable metadata.
 * Server authorization remains authoritative; this prevents lossy local saves.
 */
export const assertTeamWorkspaceSaveAllowed = (
  role: LibraryRole,
  userId: string | undefined,
  current: WorkspaceData,
  baseline: WorkspaceData,
): void => {
  if (isTeamAdministrator(role)) return;

  const songChanges = changedItems(current.songs, baseline.songs, sharedSong);
  if (role !== 'editor' && songChanges.length > 0) {
    throw new TeamWorkspacePermissionError('team-library-read-only', songChanges[0].id);
  }

  for (const { id, previous, next } of changedItems(current.projects, baseline.projects, sharedProject)) {
    const target = previous ?? next!;
    const isAllowed = previous
      ? canManageTeamProject(role, userId, previous)
      : Boolean(userId) && (!target.createdBy || target.createdBy === userId)
        && canManageTeamProject(role, userId, { createdBy: userId });
    if (!isAllowed) throw new TeamWorkspacePermissionError('team-project-read-only', id);
  }

  const savedEntries = new Map(baseline.setlists.flatMap((setlist) => setlist.songs.map((entry) => [entry.id, entry] as const)));
  const savedSongs = new Map(baseline.songs.map((song) => [song.id, song]));
  const allProjects = new Map([...baseline.projects, ...current.projects].map((project) => [project.id, project]));
  const baselineProjects = new Map(baseline.projects.map((project) => [project.id, project]));

  for (const { id, previous, next } of changedItems(current.setlists, baseline.setlists, sharedSetlist)) {
    const isAllowed = previous
      ? canArrangeTeamSetlist(role, userId, previous)
        && (!next || canArrangeTeamSetlist(role, userId, {
          ...previous,
          // A refreshed revocation takes precedence over an older baseline.
          assignedToCurrentUser: next.assignedToCurrentUser ?? previous.assignedToCurrentUser,
        }))
      : Boolean(userId) && (!next!.createdBy || next!.createdBy === userId)
        && canArrangeTeamSetlist(role, userId, { createdBy: userId });
    if (!isAllowed) throw new TeamWorkspacePermissionError('team-setlist-read-only', id);

    if (next && (previous?.projectId ?? null) !== (next.projectId ?? null)) {
      for (const projectId of [previous?.projectId, next.projectId]) {
        if (!projectId) continue;
        const project = baselineProjects.get(projectId) ?? allProjects.get(projectId);
        if (!project || !canManageTeamProject(role, userId, { ...project, createdBy: project.createdBy ?? (baselineProjects.has(projectId) ? undefined : userId) })) {
          throw new TeamWorkspacePermissionError('team-project-read-only', projectId);
        }
      }
    }

    if (role === 'setlist_manager' && next) assertManagerEntries(next, savedEntries, savedSongs);
  }
};
