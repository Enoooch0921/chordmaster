import {
  CloudLibrarySummary,
  JoinedSetlist,
  LibraryRole,
  Setlist,
  SetlistShareStatus,
  SetlistSong,
  SharedResourcePayload,
  ShareResourceType,
  Song,
  StoredSong,
  TeamInvite,
  TeamManagementSnapshot,
  WorkspaceSnapshot
} from '../types';
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

interface SongIdentityRow {
  id: string;
  library_id: string;
}

interface SetlistRow {
  id: string;
  library_id: string;
  name: string;
  display_mode: Setlist['displayMode'];
  show_lyrics: boolean;
  client_legacy_id: string | null;
  created_by: string;
  updated_by: string;
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

interface UserSetlistCapoOverrideRow {
  setlist_song_id: string;
  capo: number;
}

interface LibraryRow {
  id: string;
  name: string;
  kind: 'personal' | 'team';
  owner_user_id: string;
  created_at?: string;
  updated_at?: string;
}

interface JoinedSetlistRpcSong {
  id?: unknown;
  setlistId?: unknown;
  songId?: unknown;
  order?: unknown;
  overrideKey?: unknown;
  capo?: unknown;
  sectionOrder?: unknown;
  songData?: unknown;
}

interface JoinedSetlistRpcRow {
  id?: unknown;
  name?: unknown;
  displayMode?: unknown;
  showLyrics?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  songs?: unknown;
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
  loadLibraryWorkspace(libraryId: string): Promise<WorkspaceSnapshot>;
  loadPersonalWorkspace(): Promise<WorkspaceSnapshot>;
  listLibraries(): Promise<CloudLibrarySummary[]>;
  setActiveLibrary(libraryId: string | null): void;
  getPersonalLibraryId(): Promise<string>;
  createTeam(name: string): Promise<CloudLibrarySummary>;
  getTeamManagement(libraryId: string): Promise<TeamManagementSnapshot>;
  createTeamInvite(libraryId: string, email: string, role: Exclude<LibraryRole, 'owner'>): Promise<TeamInvite>;
  revokeTeamInvite(inviteId: string): Promise<void>;
  updateTeamMemberRole(libraryId: string, userId: string, role: Exclude<LibraryRole, 'owner'>): Promise<void>;
  removeTeamMember(libraryId: string, userId: string): Promise<void>;
  acceptTeamInvite(token: string): Promise<string>;
  copySongToPersonal(song: StoredSong): Promise<StoredSong>;
  loadTeamSourceSong(song: StoredSong): Promise<StoredSong | null>;
  syncPersonalSongFromTeam(song: StoredSong): Promise<StoredSong>;
  savePersonalSong(song: StoredSong): Promise<void>;
  saveSong(song: StoredSong): Promise<void>;
  saveSetlist(setlist: Setlist): Promise<void>;
  deleteSong(id: string): Promise<void>;
  deleteSetlist(id: string): Promise<void>;
  importLocalWorkspace(localWorkspace: WorkspaceSnapshot): Promise<WorkspaceSnapshot>;
  createShareLink(resourceType: ShareResourceType, resourceId: string): Promise<string>;
  resolveShareLink(token: string): Promise<SharedResourcePayload>;
  joinSharedSetlist(token: string): Promise<string>;
  leaveSharedSetlist(setlistId: string): Promise<void>;
  getSetlistShareStatus(setlistId: string): Promise<SetlistShareStatus>;
  revokeSetlistSharing(setlistId: string): Promise<void>;
  saveCapoOverride(setlistSongId: string, capo: number | null): Promise<void>;
}

const mapSongRow = (row: SongRow): StoredSong => ({
  ...cloneValue(normalizeSongBars(row.content_json)),
  id: row.id,
  updatedAt: new Date(row.updated_at).getTime()
});

const assertSongIdIsWritableInLibrary = async (songId: string, libraryId: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from('songs')
    .select('id, library_id')
    .eq('id', songId)
    .maybeSingle<SongIdentityRow>();

  if (error) {
    throw error;
  }

  if (data && data.library_id !== libraryId) {
    throw new Error('This song belongs to another workspace. Import it as a copy before saving.');
  }
};

const mapSetlistRows = (
  rows: SetlistRow[],
  setlistSongs: SetlistSongRow[],
  songsById: Map<string, StoredSong>,
  personalCapoBySetlistSongId = new Map<string, number>()
) => (
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
          personalCapoOverride: personalCapoBySetlistSongId.get(item.id),
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
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      songs
    }, songsById, index);
  })
);

const VALID_SETLIST_DISPLAY_MODES = new Set<Setlist['displayMode']>([
  'nashville-number-system',
  'chord-fixed-key',
  'chord-movable-key'
]);

const normalizeSetlistDisplayMode = (value: unknown): Setlist['displayMode'] => (
  typeof value === 'string' && VALID_SETLIST_DISPLAY_MODES.has(value as Setlist['displayMode'])
    ? value as Setlist['displayMode']
    : 'chord-fixed-key'
);

const parseRemoteTimestamp = (value: unknown, fallback = Date.now()) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeJoinedSetlistRpcPayload = (payload: unknown): JoinedSetlist[] => {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((row, index): JoinedSetlist | null => {
      const setlistRow = row as JoinedSetlistRpcRow;
      const id = typeof setlistRow.id === 'string' ? setlistRow.id : '';
      if (!id) return null;

      const rawSongs = Array.isArray(setlistRow.songs) ? setlistRow.songs as JoinedSetlistRpcSong[] : [];
      const songs = reindexSetlistSongs(rawSongs
        .map((song, songIndex): SetlistSong | null => {
          const setlistSongId = typeof song.id === 'string' ? song.id : '';
          const songId = typeof song.songId === 'string' ? song.songId : '';
          const rawSongData = song.songData && typeof song.songData === 'object'
            ? normalizeSongBars(cloneValue(song.songData as Song))
            : undefined;

          if (!setlistSongId || !songId || !rawSongData) {
            return null;
          }

          return {
            id: setlistSongId,
            setlistId: typeof song.setlistId === 'string' ? song.setlistId : id,
            songId,
            order: typeof song.order === 'number' && Number.isFinite(song.order) ? song.order : songIndex,
            overrideKey: typeof song.overrideKey === 'string' ? song.overrideKey as SetlistSong['overrideKey'] : undefined,
            capo: typeof song.capo === 'number' && Number.isFinite(song.capo) ? song.capo : rawSongData.capo ?? 0,
            sectionOrder: Array.isArray(song.sectionOrder)
              ? song.sectionOrder.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              : [],
            songData: rawSongData
          };
        })
        .filter((song): song is SetlistSong => Boolean(song)));

      return {
        id,
        name: typeof setlistRow.name === 'string' && setlistRow.name.trim() ? setlistRow.name : `Shared Setlist ${index + 1}`,
        displayMode: normalizeSetlistDisplayMode(setlistRow.displayMode),
        showLyrics: Boolean(setlistRow.showLyrics),
        createdAt: parseRemoteTimestamp(setlistRow.createdAt),
        updatedAt: parseRemoteTimestamp(setlistRow.updatedAt),
        songs,
        isJoined: true
      };
    })
    .filter((setlist): setlist is JoinedSetlist => Boolean(setlist));
};

const VALID_LIBRARY_ROLES = new Set<LibraryRole>(['owner', 'editor', 'setlist_manager', 'viewer']);
const VALID_LIBRARY_KINDS = new Set(['personal', 'team']);

const normalizeLibrarySummary = (value: unknown): CloudLibrarySummary | null => {
  const row = value as Partial<CloudLibrarySummary> & Record<string, unknown>;
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null;
  const kind = typeof row.kind === 'string' && VALID_LIBRARY_KINDS.has(row.kind) ? row.kind as CloudLibrarySummary['kind'] : 'personal';
  const role = typeof row.role === 'string' && VALID_LIBRARY_ROLES.has(row.role as LibraryRole) ? row.role as LibraryRole : 'viewer';
  return {
    id: row.id,
    name: row.name,
    kind,
    ownerUserId: typeof row.ownerUserId === 'string' ? row.ownerUserId : '',
    role,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString()
  };
};

const normalizeLibrarySummaries = (payload: unknown): CloudLibrarySummary[] => (
  Array.isArray(payload)
    ? payload.map(normalizeLibrarySummary).filter((item): item is CloudLibrarySummary => Boolean(item))
    : []
);

const normalizeTeamInvite = (value: unknown): TeamInvite | null => {
  const row = value as Partial<TeamInvite> & Record<string, unknown>;
  if (!row || typeof row.id !== 'string' || typeof row.email !== 'string') return null;
  const role = typeof row.role === 'string' && VALID_LIBRARY_ROLES.has(row.role as LibraryRole) && row.role !== 'owner'
    ? row.role as Exclude<LibraryRole, 'owner'>
    : 'viewer';
  return {
    id: row.id,
    email: row.email,
    role,
    token: typeof row.token === 'string' ? row.token : '',
    invitedBy: typeof row.invitedBy === 'string' ? row.invitedBy : '',
    invitedAt: typeof row.invitedAt === 'string' ? row.invitedAt : new Date().toISOString(),
    expiresAt: typeof row.expiresAt === 'string' ? row.expiresAt : null,
    acceptedAt: typeof row.acceptedAt === 'string' ? row.acceptedAt : null,
    revokedAt: typeof row.revokedAt === 'string' ? row.revokedAt : null
  };
};

const normalizeTeamManagementSnapshot = (payload: unknown): TeamManagementSnapshot => {
  const row = payload as Partial<TeamManagementSnapshot> & Record<string, unknown>;
  const rawMembers = Array.isArray(row?.members) ? row.members : [];
  const rawInvites = Array.isArray(row?.invites) ? row.invites : [];
  return {
    members: rawMembers.map((member) => {
      const item = member as Partial<TeamManagementSnapshot['members'][number]> & Record<string, unknown>;
      const role = typeof item.role === 'string' && VALID_LIBRARY_ROLES.has(item.role as LibraryRole) ? item.role as LibraryRole : 'viewer';
      return {
        userId: typeof item.userId === 'string' ? item.userId : '',
        email: typeof item.email === 'string' ? item.email : '',
        name: typeof item.name === 'string' ? item.name : '',
        picture: typeof item.picture === 'string' ? item.picture : undefined,
        role,
        joinedAt: typeof item.joinedAt === 'string' ? item.joinedAt : new Date().toISOString()
      };
    }).filter((member) => member.userId),
    invites: rawInvites.map(normalizeTeamInvite).filter((invite): invite is TeamInvite => Boolean(invite))
  };
};

const buildPersonalCopyTitle = (personalSongs: StoredSong[], sourceTitle: string) => {
  const baseTitle = `${sourceTitle.trim() || 'Untitled Song'} (團隊轉存)`;
  const existingTitles = new Set(personalSongs.map((song) => normalizeMatchingTitle(song.title)));
  if (!existingTitles.has(normalizeMatchingTitle(baseTitle))) {
    return baseTitle;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseTitle} ${index}`;
    if (!existingTitles.has(normalizeMatchingTitle(candidate))) {
      return candidate;
    }
  }

  return `${baseTitle} ${Date.now()}`;
};

export const createLocalRepository = (): WorkspaceRepository => ({
  async loadWorkspace() {
    return loadLocalWorkspaceSnapshot();
  },
  async loadLibraryWorkspace() {
    return loadLocalWorkspaceSnapshot();
  },
  async loadPersonalWorkspace() {
    return loadLocalWorkspaceSnapshot();
  },
  async listLibraries() {
    return [];
  },
  setActiveLibrary() {
    // Local mode only has one browser-local workspace.
  },
  async getPersonalLibraryId() {
    throw new Error('Please sign in before using cloud libraries.');
  },
  async createTeam() {
    throw new Error('Please sign in before creating a team.');
  },
  async getTeamManagement() {
    throw new Error('Please sign in before managing a team.');
  },
  async createTeamInvite() {
    throw new Error('Please sign in before inviting team members.');
  },
  async revokeTeamInvite() {
    throw new Error('Please sign in before managing team invites.');
  },
  async updateTeamMemberRole() {
    throw new Error('Please sign in before managing team members.');
  },
  async removeTeamMember() {
    throw new Error('Please sign in before managing team members.');
  },
  async acceptTeamInvite() {
    throw new Error('Please sign in before accepting a team invite.');
  },
  async copySongToPersonal(song) {
    return song;
  },
  async loadTeamSourceSong() {
    return null;
  },
  async syncPersonalSongFromTeam(song) {
    return song;
  },
  async savePersonalSong() {
    throw new Error('Local repository savePersonalSong is not used directly.');
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
  },
  async joinSharedSetlist() {
    throw new Error('Please sign in to join a shared setlist.');
  },
  async leaveSharedSetlist() {
    throw new Error('Please sign in to leave a setlist.');
  },
  async getSetlistShareStatus() {
    throw new Error('Please sign in to view sharing status.');
  },
  async revokeSetlistSharing() {
    throw new Error('Please sign in to manage sharing.');
  },
  async saveCapoOverride() {
    throw new Error('Please sign in to save capo overrides.');
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

const getLibraryWorkspace = async (libraryId: string, userId?: string): Promise<WorkspaceSnapshot> => {
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
      .select('id, library_id, name, display_mode, show_lyrics, client_legacy_id, created_by, updated_by, created_at, updated_at')
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

  const setlistSongIds = (setlistSongRows ?? []).map((row) => row.id);
  const { data: personalCapoRows, error: personalCapoError } = userId && setlistSongIds.length > 0
    ? await supabase
      .from('user_setlist_capo_overrides')
      .select('setlist_song_id, capo')
      .in('setlist_song_id', setlistSongIds)
      .eq('user_id', userId)
      .returns<UserSetlistCapoOverrideRow[]>()
    : { data: [] as UserSetlistCapoOverrideRow[], error: null };

  if (personalCapoError) {
    throw personalCapoError;
  }

  const personalCapoBySetlistSongId = new Map((personalCapoRows ?? []).map((row) => [row.setlist_song_id, row.capo] as const));
  const songs = (songRows ?? []).map(mapSongRow);
  const songsById = new Map(songs.map((song) => [song.id, song] as const));
  const setlists = mapSetlistRows(setlistRows ?? [], setlistSongRows ?? [], songsById, personalCapoBySetlistSongId);
  const lastSavedAt = Math.max(
    0,
    ...songs.map((song) => song.updatedAt),
    ...setlists.map((setlist) => setlist.updatedAt)
  ) || null;

  return {
    songs,
    setlists,
    joinedSetlists: [],
    lastSavedAt
  };
};

const getJoinedSetlists = async (userId: string): Promise<JoinedSetlist[]> => {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.rpc('get_joined_setlists');
    if (error) throw error;
    return normalizeJoinedSetlistRpcPayload(data);
  } catch (error) {
    console.warn('Unable to load joined setlists via RPC; falling back to direct reads.', error);
    try {
      return await getJoinedSetlistsUnsafe(userId);
    } catch (fallbackError) {
      console.error('Unable to load joined setlists.', fallbackError);
      throw fallbackError;
    }
  }
};

const getJoinedSetlistsUnsafe = async (userId: string): Promise<JoinedSetlist[]> => {
  if (!supabase) return [];

  const { data: memberships, error: membershipError } = await supabase
    .from('user_setlist_memberships')
    .select('setlist_id')
    .eq('user_id', userId);

  if (membershipError) throw membershipError;

  const joinedSetlistIds = (memberships ?? []).map((m: { setlist_id: string }) => m.setlist_id);
  if (joinedSetlistIds.length === 0) return [];

  const [
    { data: setlistRows, error: slError },
    { data: ssRows, error: ssError }
  ] = await Promise.all([
    supabase
      .from('setlists')
      .select('id, library_id, name, display_mode, show_lyrics, created_by, updated_by, created_at, updated_at')
      .in('id', joinedSetlistIds)
      .returns<SetlistRow[]>(),
    supabase
      .from('setlist_songs')
      .select('id, setlist_id, song_id, order_index, override_json')
      .in('setlist_id', joinedSetlistIds)
      .returns<SetlistSongRow[]>()
  ]);

  if (slError) throw slError;
  if (ssError) throw ssError;

  const songIds = [...new Set((ssRows ?? []).map((r) => r.song_id))];
  const { data: songRows, error: songError } = songIds.length > 0
    ? await supabase
      .from('songs')
      .select('id, title, content_json, updated_at')
      .in('id', songIds)
    : { data: [] as { id: string; title: string; content_json: Song; updated_at: string }[], error: null };

  if (songError) throw songError;

  const songItemIds = (ssRows ?? []).map((r) => r.id);
  const { data: capoRows, error: capoError } = songItemIds.length > 0
    ? await supabase
      .from('user_setlist_capo_overrides')
      .select('setlist_song_id, capo')
      .in('setlist_song_id', songItemIds)
      .eq('user_id', userId)
    : { data: [] as { setlist_song_id: string; capo: number }[], error: null };

  if (capoError) throw capoError;

  const capoByItemId = new Map((capoRows ?? []).map((r) => [r.setlist_song_id, r.capo]));
  const songRowById = new Map((songRows ?? []).map((r) => [r.id, r]));

  return (setlistRows ?? []).map((row): JoinedSetlist => {
    const songs = (ssRows ?? [])
      .filter((s) => s.setlist_id === row.id)
      .sort((a, b) => a.order_index - b.order_index)
      .map((s, i): SetlistSong => {
        const songRow = songRowById.get(s.song_id);
        const userCapo = capoByItemId.get(s.id);
        return {
          id: s.id,
          setlistId: row.id,
          songId: s.song_id,
          order: i,
          overrideKey: s.override_json?.overrideKey,
          capo: userCapo ?? s.override_json?.capo,
          sectionOrder: Array.isArray(s.override_json?.sectionOrder) ? s.override_json.sectionOrder : [],
          songData: songRow ? normalizeSongBars(cloneValue(songRow.content_json)) : undefined
        };
      });

    return {
      id: row.id,
      name: row.name,
      displayMode: row.display_mode,
      showLyrics: row.show_lyrics,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      songs,
      isJoined: true
    };
  });
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
  let activeLibraryId: string | null = null;

  const ensurePersonalLibraryId = async () => {
    if (cachedLibraryId) {
      return cachedLibraryId;
    }

    const library = await ensureProfileAndLibrary(params.userId, params.email, params.name, params.picture);
    cachedLibraryId = library.id;
    return library.id;
  };

  const ensureLibraryId = async () => activeLibraryId ?? await ensurePersonalLibraryId();

  return {
    async loadWorkspace() {
      const libraryId = await ensureLibraryId();
      const [workspace, joinedSetlists] = await Promise.all([
        getLibraryWorkspace(libraryId, params.userId),
        getJoinedSetlists(params.userId)
      ]);
      if (libraryId === cachedLibraryId || !activeLibraryId) {
        persistLocalWorkspaceSnapshot(workspace.songs, workspace.setlists);
      }
      return { ...workspace, joinedSetlists };
    },

    async loadLibraryWorkspace(libraryId) {
      activeLibraryId = libraryId;
      const workspace = await getLibraryWorkspace(libraryId, params.userId);
      const joinedSetlists = libraryId === await ensurePersonalLibraryId()
        ? await getJoinedSetlists(params.userId)
        : [];
      return { ...workspace, joinedSetlists };
    },

    async loadPersonalWorkspace() {
      const personalLibraryId = await ensurePersonalLibraryId();
      const workspace = await getLibraryWorkspace(personalLibraryId, params.userId);
      return { ...workspace, joinedSetlists: [] };
    },

    async listLibraries() {
      if (!supabase) throw new Error('Supabase is not configured.');
      await ensurePersonalLibraryId();
      const { data, error } = await supabase.rpc('get_user_libraries');
      if (error) throw error;
      return normalizeLibrarySummaries(data);
    },

    setActiveLibrary(libraryId) {
      activeLibraryId = libraryId;
    },

    async getPersonalLibraryId() {
      return ensurePersonalLibraryId();
    },

    async createTeam(name) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('create_team', { p_name: name });
      if (error) throw error;
      const library = normalizeLibrarySummary(data);
      if (!library) throw new Error('Unable to create team.');
      return library;
    },

    async getTeamManagement(libraryId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('get_team_management', { p_library_id: libraryId });
      if (error) throw error;
      return normalizeTeamManagementSnapshot(data);
    },

    async createTeamInvite(libraryId, email, role) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('create_team_invite', {
        p_library_id: libraryId,
        p_email: email,
        p_role: role
      });
      if (error) throw error;
      const invite = normalizeTeamInvite(data);
      if (!invite) throw new Error('Unable to create invite.');
      return invite;
    },

    async revokeTeamInvite(inviteId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('revoke_team_invite', { p_invite_id: inviteId });
      if (error) throw error;
    },

    async updateTeamMemberRole(libraryId, userId, role) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('update_team_member_role', {
        p_library_id: libraryId,
        p_user_id: userId,
        p_role: role
      });
      if (error) throw error;
    },

    async removeTeamMember(libraryId, userId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('remove_team_member', {
        p_library_id: libraryId,
        p_user_id: userId
      });
      if (error) throw error;
    },

    async acceptTeamInvite(token) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('accept_team_invite', { p_token: token });
      if (error) throw error;
      return data as string;
    },

    async copySongToPersonal(sourceSong) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const personalLibraryId = await ensurePersonalLibraryId();
      const personalWorkspace = await getLibraryWorkspace(personalLibraryId, params.userId);
      const copiedSong: StoredSong = {
        ...cloneValue(normalizeSongBars(sourceSong)),
        id: crypto.randomUUID(),
        title: buildPersonalCopyTitle(personalWorkspace.songs, sourceSong.title),
        updatedAt: Date.now()
      };
      const payload = {
        id: copiedSong.id,
        library_id: personalLibraryId,
        title: copiedSong.title,
        content_json: normalizeSongBars(cloneValue(copiedSong)),
        client_legacy_id: sourceSong.id,
        created_by: params.userId,
        updated_by: params.userId,
        updated_at: new Date(copiedSong.updatedAt).toISOString()
      };
      const { error } = await supabase
        .from('songs')
        .upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      return copiedSong;
    },

    async loadTeamSourceSong(song) {
      if (!supabase || !song.teamSource) return null;
      const { data, error } = await supabase
        .from('songs')
        .select('id, library_id, title, content_json, client_legacy_id, created_at, updated_at')
        .eq('library_id', song.teamSource.libraryId)
        .eq('id', song.teamSource.songId)
        .maybeSingle<SongRow>();
      if (error) throw error;
      return data ? mapSongRow(data) : null;
    },

    async syncPersonalSongFromTeam(song) {
      if (!song.teamSource) return song;
      const sourceSong = await this.loadTeamSourceSong(song);
      if (!sourceSong) {
        throw new Error('The linked team song could not be found.');
      }
      const syncedSong: StoredSong = {
        ...cloneValue(normalizeSongBars(sourceSong)),
        id: song.id,
        title: song.title,
        capo: song.capo,
        updatedAt: Date.now(),
        teamSource: {
          ...song.teamSource,
          updatedAt: sourceSong.updatedAt
        }
      };
      await this.saveSong(syncedSong);
      return syncedSong;
    },

    async savePersonalSong(song) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const personalLibraryId = await ensurePersonalLibraryId();
      await assertSongIdIsWritableInLibrary(song.id, personalLibraryId);
      const now = new Date(song.updatedAt || Date.now()).toISOString();
      const payload = {
        id: song.id,
        library_id: personalLibraryId,
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

    async saveSong(song) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const libraryId = await ensureLibraryId();
      await assertSongIdIsWritableInLibrary(song.id, libraryId);
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
        created_by: setlist.createdBy ?? params.userId,
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

      const libraryId = await ensureLibraryId();
      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', id)
        .eq('library_id', libraryId);

      if (error) {
        throw error;
      }
    },

    async deleteSetlist(id) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const libraryId = await ensureLibraryId();
      await supabase
        .from('setlist_songs')
        .delete()
        .eq('setlist_id', id);

      const { error } = await supabase
        .from('setlists')
        .delete()
        .eq('id', id)
        .eq('library_id', libraryId);

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
    },

    async joinSharedSetlist(token) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('join_shared_setlist', { p_token: token });
      if (error) throw error;
      return data as string;
    },

    async leaveSharedSetlist(setlistId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase
        .from('user_setlist_memberships')
        .delete()
        .eq('setlist_id', setlistId)
        .eq('user_id', params.userId);
      if (error) throw error;
    },

    async getSetlistShareStatus(setlistId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('get_setlist_share_status', { p_setlist_id: setlistId });
      if (error) throw error;
      return data as SetlistShareStatus;
    },

    async revokeSetlistSharing(setlistId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('revoke_setlist_sharing', { p_setlist_id: setlistId });
      if (error) throw error;
    },

    async saveCapoOverride(setlistSongId, capo) {
      if (!supabase) throw new Error('Supabase is not configured.');
      if (capo === null) {
        const { error } = await supabase
          .from('user_setlist_capo_overrides')
          .delete()
          .eq('setlist_song_id', setlistSongId)
          .eq('user_id', params.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_setlist_capo_overrides')
          .upsert(
            { user_id: params.userId, setlist_song_id: setlistSongId, capo, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,setlist_song_id' }
          );
        if (error) throw error;
      }
    }
  };
};
