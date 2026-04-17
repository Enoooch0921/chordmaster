import { Setlist, StoredSong } from '../types';
import { PendingSyncPayload, savePendingSync, serializeSetlists, serializeSongLibrary } from './workspace';
import { WorkspaceRepository } from './repository';

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

export const syncWorkspaceDiff = async (params: {
  repository: WorkspaceRepository;
  songs: StoredSong[];
  setlists: Setlist[];
  savedSongs: StoredSong[];
  savedSetlists: Setlist[];
}) => {
  const songDiff = diffSongs(params.songs, params.savedSongs);
  const setlistDiff = diffSetlists(params.setlists, params.savedSetlists);

  for (const songId of songDiff.deleted) {
    await params.repository.deleteSong(songId);
  }

  for (const setlistId of setlistDiff.deleted) {
    await params.repository.deleteSetlist(setlistId);
  }

  for (const song of songDiff.changed) {
    await params.repository.saveSong(song);
  }

  for (const setlist of setlistDiff.changed) {
    await params.repository.saveSetlist(setlist);
  }

  return {
    savedAt: Date.now()
  };
};

export const queuePendingWorkspace = (payload: PendingSyncPayload | null) => {
  savePendingSync(payload);
};
