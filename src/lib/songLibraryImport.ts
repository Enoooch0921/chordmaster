import type { Setlist, StoredSong } from '../types';

export type SongLibraryImportMode = 'append-single' | 'replace-library';

export const getSongLibraryImportMode = (songCount: number): SongLibraryImportMode => (
  songCount === 1 ? 'append-single' : 'replace-library'
);

interface ResolveImportedSongIdentityParams {
  sourceId?: string;
  existingSongIds: ReadonlySet<string>;
  mode: SongLibraryImportMode;
  isCloudMode: boolean;
  createId: () => string;
  fallbackId: string;
}

export const resolveImportedSongIdentity = ({
  sourceId,
  existingSongIds,
  mode,
  isCloudMode,
  createId,
  fallbackId
}: ResolveImportedSongIdentityParams): { id: string; importedAsCopy: boolean } => {
  const importedAsCopy = mode === 'append-single'
    || (isCloudMode && (!sourceId || !existingSongIds.has(sourceId)));

  return {
    id: importedAsCopy ? createId() : sourceId || fallbackId,
    importedAsCopy
  };
};

interface ApplySongLibraryImportParams {
  currentSongs: StoredSong[];
  currentSetlists: Setlist[];
  importedSongs: StoredSong[];
  mode: SongLibraryImportMode;
  updatedAt?: number;
}

/**
 * Applies an already-normalized import to the in-memory workspace.
 *
 * A one-song file is always additive: retaining every current song and the
 * exact setlist collection prevents the cloud diff from issuing deletes.
 * Multi-song files keep the existing full-library restore semantics.
 */
export const applySongLibraryImport = ({
  currentSongs,
  currentSetlists,
  importedSongs,
  mode,
  updatedAt = Date.now()
}: ApplySongLibraryImportParams): { songs: StoredSong[]; setlists: Setlist[] } => {
  if (mode === 'append-single') {
    const importedSong = importedSongs[0];
    return {
      songs: importedSong ? [importedSong, ...currentSongs] : currentSongs,
      setlists: currentSetlists
    };
  }

  const importedSongIds = new Set(importedSongs.map((song) => song.id));
  const nextSetlists = currentSetlists.map((setlist) => {
    const songsInLibrary = setlist.songs.filter((item) => importedSongIds.has(item.songId));
    if (songsInLibrary.length === setlist.songs.length) {
      return setlist;
    }

    return {
      ...setlist,
      songs: songsInLibrary.map((item, index) => ({ ...item, order: index })),
      updatedAt
    };
  });

  return {
    songs: importedSongs,
    setlists: nextSetlists
  };
};
