import { Project, Setlist, StoredSong } from '../types';
import { PendingSyncPayload, savePendingSync, serializeProjects, serializeSetlists, serializeSongLibrary } from './workspace';
import { WorkspaceRepository } from './repository';
import { isLocalOnlySymbolTestSong } from './symbolTestSongs';

export { mergeWorkspaceByUpdatedAt } from './workspaceMerge';

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
  const cloudSongs = params.songs.filter((song) => !isLocalOnlySymbolTestSong(song));
  const cloudSavedSongs = params.savedSongs.filter((song) => !isLocalOnlySymbolTestSong(song));
  const localOnlySongIds = new Set(
    params.songs
      .filter(isLocalOnlySymbolTestSong)
      .map((song) => song.id)
  );
  const sanitizeSetlistForCloud = (setlist: Setlist): Setlist => ({
    ...setlist,
    songs: setlist.songs.filter((setlistSong) => (
      !localOnlySongIds.has(setlistSong.songId)
      && !(setlistSong.songData && isLocalOnlySymbolTestSong(setlistSong.songData))
    ))
  });
  const cloudSetlists = params.setlists.map(sanitizeSetlistForCloud);
  const cloudSavedSetlists = params.savedSetlists.map(sanitizeSetlistForCloud);
  const songDiff = diffSongs(cloudSongs, cloudSavedSongs);
  const setlistDiff = diffSetlists(cloudSetlists, cloudSavedSetlists);
  const projectDiff = diffProjects(params.projects, params.savedProjects);
  const savedSetlistById = new Map(cloudSavedSetlists.map((item) => [item.id, item] as const));

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
  const embeddedSongs = collectEmbeddedSetlistSongs(cloudSetlists, cloudSongs)
    .filter((song) => !isLocalOnlySymbolTestSong(song));
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
