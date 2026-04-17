import { Setlist, SetlistSong, SharedResourcePayload, ShareResourceType, Song, StoredSong, WorkspaceSnapshot } from '../types';
import {
  cloneValue,
  loadLocalWorkspaceSnapshot,
  normalizeMatchingTitle,
  normalizeSongBars,
  normalizeStoredSetlist,
  persistLocalWorkspaceSnapshot,
  reindexSetlistSongs
} from './workspace';
import { createShareLink as createEdgeShareLink, resolveShareLink as resolveEdgeShareLink } from './sharing';
import { supabase } from './supabase';

interface SongRow {
  id: string;
  library_id: string;
  title: string;
  content_json: Song;
  client_legacy_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SetlistRow {
  id: string;
  library_id: string;
  name: string;
  display_mode: Setlist['displayMode'];
  show_lyrics: boolean;
  client_legacy_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SetlistSongRow {
  id: string;
  setlist_id: string;
  song_id: string;
  order_index: number;
  override_json: {
    overrideKey?: SetlistSong['overrideKey'];
    capo?: number;
    sectionOrder?: string[];
    songData?: Song;
  } | null;
}

interface LibraryRow {
  id: string;
  name: string;
  kind: 'personal' | 'team';
  owner_user_id: string;
}

const ensureLibraryMembership = async (libraryId: string, userId: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error: membershipError } = await supabase
    .from('library_members')
    .upsert({
      library_id: libraryId,
      user_id: userId,
      role: 'owner'
    }, {
      onConflict: 'library_id,user_id'
    });

  if (membershipError) {
    throw membershipError;
  }
};

export interface WorkspaceRepository {
  loadWorkspace(): Promise<WorkspaceSnapshot>;
  saveSong(song: StoredSong): Promise<void>;
  saveSetlist(setlist: Setlist): Promise<void>;
  deleteSong(id: string): Promise<void>;
  deleteSetlist(id: string): Promise<void>;
  importLocalWorkspace(localWorkspace: WorkspaceSnapshot): Promise<WorkspaceSnapshot>;
  createShareLink(resourceType: ShareResourceType, resourceId: string): Promise<string>;
  resolveShareLink(token: string): Promise<SharedResourcePayload>;
}

const mapSongRow = (row: SongRow): StoredSong => ({
  ...cloneValue(normalizeSongBars(row.content_json)),
  id: row.id,
  updatedAt: new Date(row.updated_at).getTime()
});

const mapSetlistRows = (rows: SetlistRow[], setlistSongs: SetlistSongRow[], songsById: Map<string, StoredSong>) => (
  rows.map((row, index) => {
    const songs = reindexSetlistSongs(
      setlistSongs
        .filter((item) => item.setlist_id === row.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((item, orderIndex) => ({
          id: item.id,
          setlistId: row.id,
          songId: item.song_id,
          order: orderIndex,
          overrideKey: item.override_json?.overrideKey,
          capo: item.override_json?.capo,
          sectionOrder: Array.isArray(item.override_json?.sectionOrder) ? item.override_json.sectionOrder : [],
          songData: item.override_json?.songData ? normalizeSongBars(item.override_json.songData) : undefined
        }))
        .filter((item) => songsById.has(item.songId))
    );

    return normalizeStoredSetlist({
      id: row.id,
      name: row.name,
      displayMode: row.display_mode,
      showLyrics: row.show_lyrics,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      songs
    }, songsById, index);
  })
);

export const createLocalRepository = (): WorkspaceRepository => ({
  async loadWorkspace() {
    return loadLocalWorkspaceSnapshot();
  },
  async saveSong() {
    throw new Error('Local repository saveSong is not used directly.');
  },
  async saveSetlist() {
    throw new Error('Local repository saveSetlist is not used directly.');
  },
  async deleteSong() {
    throw new Error('Local repository deleteSong is not used directly.');
  },
  async deleteSetlist() {
    throw new Error('Local repository deleteSetlist is not used directly.');
  },
  async importLocalWorkspace(localWorkspace) {
    return localWorkspace;
  },
  async createShareLink() {
    throw new Error('Please sign in before creating a share link.');
  },
  async resolveShareLink(token) {
    return resolveEdgeShareLink(token);
  }
});

const ensureProfileAndLibrary = async (userId: string, email: string, name: string, picture?: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const profilePayload = {
    id: userId,
    email,
    display_name: name,
    avatar_url: picture ?? null,
    updated_at: new Date().toISOString()
  };

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileError) {
    throw profileError;
  }

  const { data: existingLibrary, error: libraryError } = await supabase
    .from('libraries')
    .select('id, name, kind, owner_user_id')
    .eq('owner_user_id', userId)
    .eq('kind', 'personal')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<LibraryRow>();

  if (libraryError) {
    throw libraryError;
  }

  if (existingLibrary?.id) {
    await ensureLibraryMembership(existingLibrary.id, userId);
    return existingLibrary;
  }

  const libraryId = crypto.randomUUID();
  const now = new Date().toISOString();
  const libraryPayload = {
    id: libraryId,
    name: `${name || email}'s Library`,
    kind: 'personal',
    owner_user_id: userId,
    created_at: now,
    updated_at: now
  };

  const { error: insertLibraryError } = await supabase
    .from('libraries')
    .insert(libraryPayload);

  if (insertLibraryError) {
    throw insertLibraryError;
  }

  await ensureLibraryMembership(libraryId, userId);

  return {
    id: libraryId,
    name: libraryPayload.name,
    kind: 'personal' as const,
    owner_user_id: userId
  };
};

const getLibraryWorkspace = async (libraryId: string): Promise<WorkspaceSnapshot> => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const [{ data: songRows, error: songError }, { data: setlistRows, error: setlistError }] = await Promise.all([
    supabase
      .from('songs')
      .select('id, library_id, title, content_json, client_legacy_id, created_at, updated_at')
      .eq('library_id', libraryId)
      .returns<SongRow[]>(),
    supabase
      .from('setlists')
      .select('id, library_id, name, display_mode, show_lyrics, client_legacy_id, created_at, updated_at')
      .eq('library_id', libraryId)
      .returns<SetlistRow[]>()
  ]);

  if (songError) {
    throw songError;
  }
  if (setlistError) {
    throw setlistError;
  }

  const setlistIds = (setlistRows ?? []).map((row) => row.id);
  const { data: setlistSongRows, error: setlistSongError } = setlistIds.length > 0
    ? await supabase
      .from('setlist_songs')
      .select('id, setlist_id, song_id, order_index, override_json')
      .in('setlist_id', setlistIds)
      .returns<SetlistSongRow[]>()
    : { data: [] as SetlistSongRow[], error: null };

  if (setlistSongError) {
    throw setlistSongError;
  }

  const songs = (songRows ?? []).map(mapSongRow);
  const songsById = new Map(songs.map((song) => [song.id, song] as const));
  const setlists = mapSetlistRows(setlistRows ?? [], setlistSongRows ?? [], songsById);
  const lastSavedAt = Math.max(
    0,
    ...songs.map((song) => song.updatedAt),
    ...setlists.map((setlist) => setlist.updatedAt)
  ) || null;

  return {
    songs,
    setlists,
    lastSavedAt
  };
};

const persistSetlistSongs = async (setlist: Setlist) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  await supabase
    .from('setlist_songs')
    .delete()
    .eq('setlist_id', setlist.id);

  if (setlist.songs.length === 0) {
    return;
  }

  const rows = reindexSetlistSongs(setlist.songs).map((song, index) => ({
    id: song.id,
    setlist_id: setlist.id,
    song_id: song.songId,
    order_index: index,
    override_json: {
      overrideKey: song.overrideKey,
      capo: song.capo,
      sectionOrder: song.sectionOrder,
      songData: song.songData
    }
  }));

  const { error } = await supabase
    .from('setlist_songs')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    throw error;
  }
};

export const createCloudRepository = (params: {
  userId: string;
  email: string;
  name: string;
  picture?: string;
}): WorkspaceRepository => {
  let cachedLibraryId: string | null = null;

  const ensureLibraryId = async () => {
    if (cachedLibraryId) {
      return cachedLibraryId;
    }

    const library = await ensureProfileAndLibrary(params.userId, params.email, params.name, params.picture);
    cachedLibraryId = library.id;
    return library.id;
  };

  return {
    async loadWorkspace() {
      const libraryId = await ensureLibraryId();
      const workspace = await getLibraryWorkspace(libraryId);
      persistLocalWorkspaceSnapshot(workspace.songs, workspace.setlists);
      return workspace;
    },

    async saveSong(song) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const libraryId = await ensureLibraryId();
      const now = new Date(song.updatedAt || Date.now()).toISOString();
      const payload = {
        id: song.id,
        library_id: libraryId,
        title: song.title,
        content_json: normalizeSongBars(cloneValue(song)),
        created_by: params.userId,
        updated_by: params.userId,
        updated_at: now
      };

      const { error } = await supabase
        .from('songs')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        throw error;
      }
    },

    async saveSetlist(setlist) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const libraryId = await ensureLibraryId();
      const updatedAtIso = new Date(setlist.updatedAt || Date.now()).toISOString();
      const payload = {
        id: setlist.id,
        library_id: libraryId,
        name: setlist.name,
        display_mode: setlist.displayMode,
        show_lyrics: setlist.showLyrics,
        created_by: params.userId,
        updated_by: params.userId,
        updated_at: updatedAtIso
      };

      const { error } = await supabase
        .from('setlists')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        throw error;
      }

      await persistSetlistSongs(setlist);
    },

    async deleteSong(id) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }
    },

    async deleteSetlist(id) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      await supabase
        .from('setlist_songs')
        .delete()
        .eq('setlist_id', id);

      const { error } = await supabase
        .from('setlists')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }
    },

    async importLocalWorkspace(localWorkspace) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const libraryId = await ensureLibraryId();
      const remoteWorkspace = await getLibraryWorkspace(libraryId);
      const remoteByTitle = new Map<string, StoredSong[]>();

      remoteWorkspace.songs.forEach((song) => {
        const key = normalizeMatchingTitle(song.title);
        const group = remoteByTitle.get(key) ?? [];
        group.push(song);
        remoteByTitle.set(key, group);
      });

      const songIdMap = new Map<string, string>();

      for (const localSong of localWorkspace.songs) {
        const normalizedTitle = normalizeMatchingTitle(localSong.title);
        const matches = normalizedTitle ? (remoteByTitle.get(normalizedTitle) ?? []) : [];

        if (matches.length === 1) {
          const remoteSong = matches[0];
          const preferred = localSong.updatedAt >= remoteSong.updatedAt ? localSong : remoteSong;
          const mergedSong: StoredSong = {
            ...cloneValue(normalizeSongBars(preferred)),
            id: remoteSong.id,
            updatedAt: preferred.updatedAt
          };
          await this.saveSong(mergedSong);
          songIdMap.set(localSong.id, remoteSong.id);
          continue;
        }

        const importedId = crypto.randomUUID();
        const importedSong: StoredSong = {
          ...cloneValue(normalizeSongBars(localSong)),
          id: importedId,
          title: matches.length > 1 ? `${localSong.title || 'Untitled'} (Imported)` : localSong.title,
          updatedAt: localSong.updatedAt
        };

        const payload = {
          id: importedSong.id,
          library_id: libraryId,
          title: importedSong.title,
          content_json: normalizeSongBars(cloneValue(importedSong)),
          client_legacy_id: localSong.id,
          created_by: params.userId,
          updated_by: params.userId,
          updated_at: new Date(importedSong.updatedAt).toISOString()
        };

        const { error } = await supabase
          .from('songs')
          .upsert(payload, { onConflict: 'id' });

        if (error) {
          throw error;
        }

        songIdMap.set(localSong.id, importedSong.id);
      }

      for (const localSetlist of localWorkspace.setlists) {
        const normalizedTitle = normalizeMatchingTitle(localSetlist.name);
        const existingMatches = normalizedTitle
          ? remoteWorkspace.setlists.filter((item) => normalizeMatchingTitle(item.name) === normalizedTitle)
          : [];

        const targetSetlistId = existingMatches.length === 1 ? existingMatches[0].id : crypto.randomUUID();
        const targetName = existingMatches.length > 1 ? `${localSetlist.name || 'Setlist'} (Imported)` : localSetlist.name;
        const preferredTimestamp = existingMatches.length === 1
          ? Math.max(localSetlist.updatedAt, existingMatches[0].updatedAt)
          : localSetlist.updatedAt;
        const normalizedSetlist: Setlist = {
          ...cloneValue(localSetlist),
          id: targetSetlistId,
          name: targetName,
          updatedAt: preferredTimestamp,
          songs: reindexSetlistSongs(localSetlist.songs
            .map((song, index) => {
              const mappedSongId = songIdMap.get(song.songId);
              if (!mappedSongId) {
                return null;
              }

              return {
                ...song,
                id: existingMatches.length === 1 && existingMatches[0].songs[index]
                  ? existingMatches[0].songs[index].id
                  : crypto.randomUUID(),
                setlistId: targetSetlistId,
                songId: mappedSongId,
                order: index
              };
            })
            .filter((song): song is SetlistSong => Boolean(song)))
        };

        await this.saveSetlist(normalizedSetlist);
      }

      return this.loadWorkspace();
    },

    async createShareLink(resourceType, resourceId) {
      return createEdgeShareLink(resourceType, resourceId);
    },

    async resolveShareLink(token) {
      return resolveEdgeShareLink(token);
    }
  };
};
