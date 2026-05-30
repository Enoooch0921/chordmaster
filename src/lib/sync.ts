import { Project, Setlist, StoredSong } from '../types';
import { PendingSyncPayload, savePendingSync, serializeProjects, serializeSetlists, serializeSongLibrary } from './workspace';
import { WorkspaceRepository } from './repository';

const pickNewestByUpdatedAt = <T extends { id: string; updatedAt: number }>(localItem: T | undefined, remoteItem: T | undefined, localDeletedAt?: number) => {
  if (!localItem && remoteItem && typeof localDeletedAt === 'number') {
    return remoteItem.updatedAt > localDeletedAt ? remoteItem : undefined;
  }
  if (!localItem) return remoteItem;
  if (!remoteItem) return localItem;
  return localItem.updatedAt >= remoteItem.updatedAt ? localItem : remoteItem;
};

const mergeByUpdatedAt = <T extends { id: string; updatedAt: number }>(localItems: T[], remoteItems: T[], localDeletedAt?: number) => {
  const ids = new Set([...localItems.map((item) => item.id), ...remoteItems.map((item) => item.id)]);
  const localById = new Map(localItems.map((item) => [item.id, item] as const));
  const remoteById = new Map(remoteItems.map((item) => [item.id, item] as const));

  return Array.from(ids)
    .map((id) => pickNewestByUpdatedAt(localById.get(id), remoteById.get(id), localDeletedAt))
    .filter((item): item is T => Boolean(item));
};

export const mergeWorkspaceByUpdatedAt = (
  localWorkspace: { songs: StoredSong[]; setlists: Setlist[]; projects: Project[]; savedAt?: number },
  remoteWorkspace: { songs: StoredSong[]; setlists: Setlist[]; projects: Project[] }
) => ({
  songs: mergeByUpdatedAt(localWorkspace.songs, remoteWorkspace.songs, localWorkspace.savedAt),
  setlists: mergeByUpdatedAt(localWorkspace.setlists, remoteWorkspace.setlists, localWorkspace.savedAt),
  projects: mergeByUpdatedAt(localWorkspace.projects, remoteWorkspace.projects, localWorkspace.savedAt)
});

const diffSongs = (currentSongs: StoredSong[], savedSongs: StoredSong[]) => {
  const savedById = new Map(savedSongs.map((song) => [song.id, song] as const));
  const currentById = new Map(currentSongs.map((song) => [song.id, song] as const));

  const changed = currentSongs.filter((song) => {
    const previous = savedById.get(song.id);
    return !previous || serializeSongLibrary([song]) !== serializeSongLibrary([previous]) || song.updatedAt !== previous.updatedAt;
  });

  const deleted = savedSongs
    .filter((song) => !currentById.has(song.id))
    .map((song) => song.id);

  return {
    changed,
    deleted
  };
};

const diffSetlists = (currentSetlists: Setlist[], savedSetlists: Setlist[]) => {
  const savedById = new Map(savedSetlists.map((setlist) => [setlist.id, setlist] as const));
  const currentById = new Map(currentSetlists.map((setlist) => [setlist.id, setlist] as const));

  const changed = currentSetlists.filter((setlist) => {
    const previous = savedById.get(setlist.id);
    return !previous || serializeSetlists([setlist]) !== serializeSetlists([previous]) || setlist.updatedAt !== previous.updatedAt;
  });

  const deleted = savedSetlists
    .filter((setlist) => !currentById.has(setlist.id))
    .map((setlist) => setlist.id);

  return {
    changed,
    deleted
  };
};

const collectEmbeddedSetlistSongs = (setlists: Setlist[], songs: StoredSong[]) => {
  const songIds = new Set(songs.map((song) => song.id));
  const embeddedSongs = new Map<string, StoredSong>();

  for (const setlist of setlists) {
    for (const setlistSong of setlist.songs) {
      if (songIds.has(setlistSong.songId) || !setlistSong.songData) {
        continue;
      }

      embeddedSongs.set(setlistSong.songId, {
        ...setlistSong.songData,
        id: setlistSong.songId,
        updatedAt: setlist.updatedAt
      });
      songIds.add(setlistSong.songId);
    }
  }

  return Array.from(embeddedSongs.values());
};

const diffProjects = (currentProjects: Project[], savedProjects: Project[]) => {
  const savedById = new Map(savedProjects.map((project) => [project.id, project] as const));
  const currentById = new Map(currentProjects.map((project) => [project.id, project] as const));

  const changed = currentProjects.filter((project) => {
    const previous = savedById.get(project.id);
    return !previous || serializeProjects([project]) !== serializeProjects([previous]) || project.updatedAt !== previous.updatedAt;
  });

  const deleted = savedProjects
    .filter((project) => !currentById.has(project.id))
    .map((project) => project.id);

  return {
    changed,
    deleted
  };
};

export const syncWorkspaceDiff = async (params: {
  repository: WorkspaceRepository;
  songs: StoredSong[];
  setlists: Setlist[];
  projects: Project[];
  savedSongs: StoredSong[];
  savedSetlists: Setlist[];
  savedProjects: Project[];
}) => {
  const songDiff = diffSongs(params.songs, params.savedSongs);
  const setlistDiff = diffSetlists(params.setlists, params.savedSetlists);
  const projectDiff = diffProjects(params.projects, params.savedProjects);
  const savedSetlistById = new Map(params.savedSetlists.map((item) => [item.id, item] as const));

  // Phase 1: deletes (parallel; songs and setlists deletes are independent).
  await Promise.all([
    ...songDiff.deleted.map((songId) => params.repository.deleteSong(songId)),
    ...setlistDiff.deleted.map((setlistId) => params.repository.deleteSetlist(setlistId))
  ]);

  // Phase 2: project upserts must complete before setlist upserts so the
  // setlist.project_id FK target exists.
  if (projectDiff.changed.length > 0) {
    await Promise.all(projectDiff.changed.map((project) => params.repository.saveProject(project)));
  }

  // Phase 3: song upserts must complete before setlist upserts so each
  // setlist_song.song_id FK target exists.
  const embeddedSongs = collectEmbeddedSetlistSongs(params.setlists, params.songs);
  await Promise.all([
    ...songDiff.changed.map((song) => params.repository.saveSong(song)),
    ...embeddedSongs.map((song) => params.repository.saveSong(song))
  ]);

  // Phase 4: setlist upserts (parallel). Pass the saved previous setlist so
  // saveSetlist can skip rewriting setlist_songs when only metadata changed.
  if (setlistDiff.changed.length > 0) {
    await Promise.all(setlistDiff.changed.map((setlist) =>
      params.repository.saveSetlist(setlist, savedSetlistById.get(setlist.id))
    ));
  }

  // Phase 5: project deletes (after any setlists that used to reference them
  // have been saved with their new project_id, so the FK on-delete behavior
  // doesn't surprise us).
  if (projectDiff.deleted.length > 0) {
    await Promise.all(projectDiff.deleted.map((projectId) => params.repository.deleteProject(projectId)));
  }

  return {
    savedAt: Date.now()
  };
};

export const queuePendingWorkspace = (payload: PendingSyncPayload | null) => {
  savePendingSync(payload);
};
