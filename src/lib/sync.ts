import { Setlist, StoredSong } from '../types';
import { PendingSyncPayload, savePendingSync, serializeSetlists, serializeSongLibrary } from './workspace';
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
  localWorkspace: { songs: StoredSong[]; setlists: Setlist[]; savedAt?: number },
  remoteWorkspace: { songs: StoredSong[]; setlists: Setlist[] }
) => ({
  songs: mergeByUpdatedAt(localWorkspace.songs, remoteWorkspace.songs, localWorkspace.savedAt),
  setlists: mergeByUpdatedAt(localWorkspace.setlists, remoteWorkspace.setlists, localWorkspace.savedAt)
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

  for (const song of collectEmbeddedSetlistSongs(params.setlists, params.songs)) {
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
