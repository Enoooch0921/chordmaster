import {
  AppNotification,
  CloudLibrarySummary,
  JoinedProject,
  JoinedSetlist,
  LibraryChangeKind,
  LibraryRole,
  NotificationResourceType,
  Project,
  ProjectMemberRole,
  ProjectShareStatus,
  ShareContact,
  Setlist,
  SetlistAssignableMember,
  SetlistEditorAssignmentSnapshot,
  SetlistShareStatus,
  SetlistSong,
  SharedResourcePayload,
  SharedSongImportInspection,
  SharedSongImportResult,
  ShareResourceType,
  SongImportResolution,
  Song,
  StoredSong,
  TeamInvite,
  TeamManagementSnapshot,
  TeamSongArchiveResult,
  TeamSongDeleteResult,
  TeamSongImportCandidate,
  TeamSongImportInspection,
  TeamSongImportRequestItem,
  TeamSongImportResolution,
  TeamSongImportResult,
  WorkspaceSnapshot
} from '../types';
import {
  cloneValue,
  loadLocalWorkspaceSnapshot,
  normalizeMatchingTitle,
  normalizeSongBars,
  normalizeStoredProject,
  normalizeStoredSetlist,
  persistLocalWorkspaceSnapshot,
  reindexSetlistSongs
} from './workspace';
import {
  createShareLink as createEdgeShareLink,
  createSongBundleShare as createEdgeSongBundleShare,
  importSharedSongs as importEdgeSharedSongs,
  inspectSharedSongImport as inspectEdgeSharedSongImport,
  resolveShareLink as resolveEdgeShareLink
} from './sharing';
import { supabase } from './supabase';

interface SongRow {
  id: string;
  library_id: string;
  title: string;
  content_json: Song;
  client_legacy_id: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

const SONG_SELECT = 'id, library_id, title, content_json, client_legacy_id, archived_at, archived_by, created_by, updated_by, created_at, updated_at';

interface SongIdentityRow {
  id: string;
  library_id: string;
  created_by: string;
}

interface SetlistRow {
  id: string;
  library_id: string;
  name: string;
  display_mode: Setlist['displayMode'];
  show_lyrics: boolean;
  archived: boolean | null;
  project_id: string | null;
  client_legacy_id: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  library_id: string;
  name: string;
  archived: boolean | null;
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
    sectionOrder?: string[];
    songData?: Song;
  } | null;
}

interface UserSetlistCapoOverrideRow {
  setlist_song_id: string;
  capo: number;
  updated_at?: string;
}

interface CurrentUserSetlistAssignmentRow {
  setlist_id: string;
  user_id: string;
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
  sourceArchivedAt?: unknown;
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

const getExistingPersonalLibrary = async (userId: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
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

  return existingLibrary;
};

const upsertProfile = async (userId: string, email: string, name: string, picture?: string) => {
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
};

export interface WorkspaceRepository {
  loadWorkspace(): Promise<WorkspaceSnapshot>;
  loadLibraryWorkspace(libraryId: string): Promise<WorkspaceSnapshot>;
  loadLibrarySongs(libraryId: string): Promise<StoredSong[]>;
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
  getSetlistEditorAssignments(setlistId: string): Promise<SetlistEditorAssignmentSnapshot>;
  setSetlistEditorAssignment(setlistId: string, userId: string, enabled: boolean): Promise<SetlistEditorAssignmentSnapshot>;
  inspectTeamSongImport(teamLibraryId: string, sourceSongIds: string[]): Promise<TeamSongImportInspection>;
  importPersonalSongsToTeam(teamLibraryId: string, items: TeamSongImportRequestItem[]): Promise<TeamSongImportResult>;
  archiveTeamSongs(libraryId: string, songIds: string[], archived: boolean): Promise<TeamSongArchiveResult>;
  deleteTeamSongs(libraryId: string, songIds: string[]): Promise<TeamSongDeleteResult>;
  subscribeToLibraryChanges(libraryId: string, onChange: (kind: LibraryChangeKind) => void): () => void;
  copySongToPersonal(song: StoredSong): Promise<StoredSong>;
  loadTeamSourceSong(song: StoredSong): Promise<StoredSong | null>;
  syncPersonalSongFromTeam(song: StoredSong): Promise<StoredSong>;
  savePersonalSong(song: StoredSong): Promise<void>;
  saveSong(song: StoredSong): Promise<void>;
  saveSetlist(setlist: Setlist, previousSetlist?: Setlist): Promise<void>;
  saveProject(project: Project): Promise<void>;
  deleteSong(id: string): Promise<void>;
  deleteSetlist(id: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  importLocalWorkspace(localWorkspace: WorkspaceSnapshot): Promise<WorkspaceSnapshot>;
  createShareLink(resourceType: ShareResourceType, resourceId: string): Promise<string>;
  createSongBundleShare(songIds: string[]): Promise<string>;
  resolveShareLink(token: string): Promise<SharedResourcePayload>;
  inspectSharedSongImport(token: string): Promise<SharedSongImportInspection>;
  importSharedSongs(token: string, defaultResolution: SongImportResolution, perSongResolutions?: Record<string, SongImportResolution>): Promise<SharedSongImportResult>;
  joinSharedSetlist(token: string): Promise<string>;
  leaveSharedSetlist(setlistId: string): Promise<void>;
  getSetlistShareStatus(setlistId: string): Promise<SetlistShareStatus>;
  revokeSetlistSharing(setlistId: string): Promise<void>;
  joinSharedProject(token: string): Promise<string>;
  leaveSharedProject(projectId: string): Promise<void>;
  getProjectShareStatus(projectId: string): Promise<ProjectShareStatus>;
  revokeProjectSharing(projectId: string): Promise<void>;
  setProjectMemberRole(projectId: string, userId: string, role: ProjectMemberRole): Promise<void>;
  removeSharedMember(resourceType: ShareResourceType, resourceId: string, userId: string): Promise<void>;
  setProjectSetlistSongKey(setlistSongId: string, key: string | null): Promise<void>;
  reorderProjectSetlist(setlistId: string, songIds: string[]): Promise<void>;
  saveCapoOverride(setlistSongId: string, capo: number | null): Promise<void>;
  getShareContacts(): Promise<ShareContact[]>;
  shareToContacts(resourceType: NotificationResourceType, resourceId: string, userIds: string[]): Promise<number>;
  getNotifications(): Promise<AppNotification[]>;
  markNotificationsRead(ids: string[]): Promise<void>;
}

const mapSongRow = (row: SongRow): StoredSong => ({
  ...cloneValue(normalizeSongBars(row.content_json)),
  id: row.id,
  archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : null,
  archivedBy: row.archived_by,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: new Date(row.created_at).getTime(),
  updatedAt: new Date(row.updated_at).getTime()
});

const getLibrarySongs = async (libraryId: string): Promise<StoredSong[]> => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from('songs')
    .select(SONG_SELECT)
    .eq('library_id', libraryId)
    .returns<SongRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapSongRow);
};

const assertSongIdIsWritableInLibrary = async (songId: string, libraryId: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from('songs')
    .select('id, library_id, created_by')
    .eq('id', songId)
    .maybeSingle<SongIdentityRow>();

  if (error) {
    throw error;
  }

  if (data && data.library_id !== libraryId) {
    throw new Error('This song belongs to another workspace. Import it as a copy before saving.');
  }

  return data;
};

const mapSetlistRows = (
  rows: SetlistRow[],
  setlistSongs: SetlistSongRow[],
  songsById: Map<string, StoredSong>,
  personalCapoBySetlistSongId = new Map<string, number>(),
  assignedSetlistIds = new Set<string>()
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
          personalCapoOverride: personalCapoBySetlistSongId.get(item.id),
          sourceArchivedAt: songsById.get(item.song_id)?.archivedAt ?? null,
          sectionOrder: Array.isArray(item.override_json?.sectionOrder) ? item.override_json.sectionOrder : [],
          songData: item.override_json?.songData ? normalizeSongBars(item.override_json.songData) : undefined
        }))
        .filter((item) => songsById.has(item.songId) || Boolean(item.songData))
    );

    const normalizedSetlist = normalizeStoredSetlist({
      id: row.id,
      name: row.name,
      displayMode: row.display_mode,
      archived: row.archived ?? false,
      projectId: row.project_id,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      songs
    }, songsById, index);

    return {
      ...normalizedSetlist,
      assignedToCurrentUser: assignedSetlistIds.has(row.id)
    };
  })
);

const mapProjectRows = (rows: ProjectRow[]): Project[] => (
  rows.map((row, index) => normalizeStoredProject({
    id: row.id,
    name: row.name,
    archived: row.archived ?? false,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  }, index))
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

const parseNullableRemoteTimestamp = (value: unknown): number | null => {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  const parsed = parseRemoteTimestamp(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
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
            sourceArchivedAt: parseNullableRemoteTimestamp(song.sourceArchivedAt),
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

const normalizeLibrarySummaries = (payload: unknown): CloudLibrarySummary[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const summaries = payload
    .map(normalizeLibrarySummary)
    .filter((item): item is CloudLibrarySummary => Boolean(item));
  const seenIds = new Set<string>();
  let hasPersonalLibrary = false;

  return summaries.filter((library) => {
    if (seenIds.has(library.id)) {
      return false;
    }
    seenIds.add(library.id);

    if (library.kind !== 'personal') {
      return true;
    }

    if (hasPersonalLibrary) {
      return false;
    }

    hasPersonalLibrary = true;
    return true;
  });
};

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

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readString = (value: unknown, fallback = '') => (
  typeof value === 'string' ? value : fallback
);

const readNullableString = (value: unknown) => (
  typeof value === 'string' ? value : null
);

const readNonNegativeInteger = (value: unknown, fallback = 0) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
);

const normalizeSetlistEditorAssignmentSnapshot = (
  payload: unknown,
  setlistId: string
): SetlistEditorAssignmentSnapshot => {
  const row = asRecord(payload);
  const assignableMembers = Array.isArray(row.assignableMembers)
    ? row.assignableMembers.flatMap((value) => {
      const member = asRecord(value);
      const userId = readString(member.userId);
      if (!userId) return [];
      const role: SetlistAssignableMember['role'] | null = member.role === 'editor' || member.role === 'setlist_manager'
        ? member.role
        : null;
      if (!role) return [];
      return [{
        userId,
        email: readString(member.email),
        name: readString(member.name),
        picture: typeof member.picture === 'string' ? member.picture : undefined,
        role
      }];
    })
    : [];
  const assignments = Array.isArray(row.assignments)
    ? row.assignments.flatMap((value) => {
      const assignment = asRecord(value);
      const userId = readString(assignment.userId);
      if (!userId) return [];
      return [{
        userId,
        assignedBy: readString(assignment.assignedBy),
        assignedAt: readString(assignment.assignedAt)
      }];
    })
    : [];

  return {
    setlistId: readString(row.setlistId, setlistId),
    assignableMembers,
    assignments
  };
};

const TEAM_SONG_IMPORT_RESOLUTIONS = new Set<TeamSongImportResolution>([
  'create',
  'overwrite',
  'duplicate'
]);

const normalizeTeamSongImportResolution = (value: unknown): TeamSongImportResolution => (
  typeof value === 'string' && TEAM_SONG_IMPORT_RESOLUTIONS.has(value as TeamSongImportResolution)
    ? value as TeamSongImportResolution
    : 'create'
);

const normalizeTeamSongImportInspection = (payload: unknown): TeamSongImportInspection => {
  const row = asRecord(payload);
  const normalizeCandidate = (value: unknown): TeamSongImportCandidate | null => {
    const candidate = asRecord(value);
    const songId = readString(candidate.songId);
    if (!songId) return null;
    return {
      songId,
      title: readString(candidate.title),
      currentKey: typeof candidate.currentKey === 'string' ? candidate.currentKey : undefined,
      originalKey: typeof candidate.originalKey === 'string' ? candidate.originalKey : undefined,
      version: typeof candidate.version === 'string' ? candidate.version : undefined,
      lyricist: typeof candidate.lyricist === 'string' ? candidate.lyricist : undefined,
      composer: typeof candidate.composer === 'string' ? candidate.composer : undefined
    };
  };
  const songs = Array.isArray(row.songs)
    ? row.songs.flatMap((value) => {
      const item = asRecord(value);
      const sourceSongId = readString(item.sourceSongId);
      if (!sourceSongId) return [];
      const possibleMatches = Array.isArray(item.possibleMatches)
        ? item.possibleMatches.flatMap((matchValue) => {
          const candidate = normalizeCandidate(matchValue);
          return candidate ? [candidate] : [];
        })
        : [];
      const existingSong = normalizeCandidate(item.existingSong);
      return [{
        sourceSongId,
        title: readString(item.title),
        existingSongId: existingSong?.songId ?? readNullableString(item.existingSongId),
        existingTitle: existingSong?.title ?? readNullableString(item.existingTitle),
        existingSong,
        possibleMatches
      }];
    })
    : [];

  return { songs };
};

const normalizeTeamSongImportResult = (payload: unknown): TeamSongImportResult => {
  const row = asRecord(payload);
  const songs = Array.isArray(row.songs)
    ? row.songs.flatMap((value) => {
      const item = asRecord(value);
      const sourceSongId = readString(item.sourceSongId);
      const songId = readString(item.songId);
      if (!sourceSongId || !songId) return [];
      return [{
        sourceSongId,
        songId,
        title: readString(item.title),
        resolution: normalizeTeamSongImportResolution(item.resolution),
        isPrimary: item.isPrimary === true
      }];
    })
    : [];

  return {
    createdCount: readNonNegativeInteger(row.createdCount),
    overwrittenCount: readNonNegativeInteger(row.overwrittenCount),
    duplicateCount: readNonNegativeInteger(row.duplicateCount),
    songs
  };
};

const normalizeTeamSongArchiveResult = (payload: unknown, archived: boolean): TeamSongArchiveResult => {
  const row = asRecord(payload);
  const archivedCount = readNonNegativeInteger(row.archivedCount);
  return {
    archivedCount,
    changedCount: readNonNegativeInteger(row.changedCount, archivedCount),
    songIds: Array.isArray(row.songIds)
      ? row.songIds.filter((songId): songId is string => typeof songId === 'string')
      : [],
    archived: typeof row.archived === 'boolean' ? row.archived : archived
  };
};

const normalizeTeamSongDeleteResult = (payload: unknown): TeamSongDeleteResult => {
  const row = asRecord(payload);
  return {
    deletedCount: readNonNegativeInteger(row.deletedCount),
    songIds: Array.isArray(row.songIds)
      ? row.songIds.filter((songId): songId is string => typeof songId === 'string')
      : []
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
  async loadLibrarySongs() {
    return loadLocalWorkspaceSnapshot().songs;
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
  async getSetlistEditorAssignments(setlistId) {
    return { setlistId, assignableMembers: [], assignments: [] };
  },
  async setSetlistEditorAssignment(setlistId) {
    return { setlistId, assignableMembers: [], assignments: [] };
  },
  async inspectTeamSongImport() {
    return { songs: [] };
  },
  async importPersonalSongsToTeam() {
    return { createdCount: 0, overwrittenCount: 0, duplicateCount: 0, songs: [] };
  },
  async archiveTeamSongs(_libraryId, _songIds, archived) {
    return { archivedCount: 0, changedCount: 0, songIds: [], archived };
  },
  async deleteTeamSongs() {
    return { deletedCount: 0, songIds: [] };
  },
  subscribeToLibraryChanges() {
    return () => undefined;
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
  async saveProject() {
    throw new Error('Local repository saveProject is not used directly.');
  },
  async deleteProject() {
    throw new Error('Local repository deleteProject is not used directly.');
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
  async createSongBundleShare() {
    throw new Error('Please sign in before creating a song bundle share.');
  },
  async resolveShareLink(token) {
    return resolveEdgeShareLink(token);
  },
  async inspectSharedSongImport() {
    throw new Error('Please sign in before importing shared songs.');
  },
  async importSharedSongs() {
    throw new Error('Please sign in before importing shared songs.');
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
  async joinSharedProject() {
    throw new Error('Please sign in to join a shared project.');
  },
  async leaveSharedProject() {
    throw new Error('Please sign in to leave a project.');
  },
  async getProjectShareStatus() {
    throw new Error('Please sign in to view sharing status.');
  },
  async revokeProjectSharing() {
    throw new Error('Please sign in to manage sharing.');
  },
  async setProjectMemberRole() {
    throw new Error('Please sign in to manage project members.');
  },
  async removeSharedMember() {
    throw new Error('Please sign in to manage project members.');
  },
  async setProjectSetlistSongKey() {
    throw new Error('Please sign in to edit a shared project.');
  },
  async reorderProjectSetlist() {
    throw new Error('Please sign in to edit a shared project.');
  },
  async saveCapoOverride() {
    throw new Error('Please sign in to save capo overrides.');
  },
  async getShareContacts() {
    return [];
  },
  async shareToContacts() {
    throw new Error('Please sign in to share.');
  },
  async getNotifications() {
    return [];
  },
  async markNotificationsRead() {
    // No notifications exist for anonymous users.
  }
});

const ensureProfileAndLibrary = async (userId: string, email: string, name: string, picture?: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const existingLibrary = await getExistingPersonalLibrary(userId);

  if (existingLibrary?.id) {
    const maintenanceResults = await Promise.allSettled([
      upsertProfile(userId, email, name, picture),
      ensureLibraryMembership(existingLibrary.id, userId)
    ]);
    maintenanceResults.forEach((result) => {
      if (result.status === 'rejected') {
        console.warn('Unable to refresh account metadata while opening an existing library.', result.reason);
      }
    });
    return existingLibrary;
  }

  await upsertProfile(userId, email, name, picture);

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

  const [
    { data: songRows, error: songError },
    { data: setlistRows, error: setlistError },
    { data: projectRows, error: projectError }
  ] = await Promise.all([
    supabase
      .from('songs')
      .select(SONG_SELECT)
      .eq('library_id', libraryId)
      .returns<SongRow[]>(),
    supabase
      .from('setlists')
      .select('id, library_id, name, display_mode, show_lyrics, archived, project_id, client_legacy_id, created_by, updated_by, created_at, updated_at')
      .eq('library_id', libraryId)
      .returns<SetlistRow[]>(),
    supabase
      .from('projects')
      .select('id, library_id, name, archived, created_by, updated_by, created_at, updated_at')
      .eq('library_id', libraryId)
      .returns<ProjectRow[]>()
  ]);

  if (songError) {
    throw songError;
  }
  if (setlistError) {
    throw setlistError;
  }
  if (projectError) {
    throw projectError;
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

  const { data: assignmentRows, error: assignmentError } = userId && setlistIds.length > 0
    ? await supabase
      .from('setlist_editor_assignments')
      .select('setlist_id, user_id')
      .in('setlist_id', setlistIds)
      .eq('user_id', userId)
      .returns<CurrentUserSetlistAssignmentRow[]>()
    : { data: [] as CurrentUserSetlistAssignmentRow[], error: null };

  if (assignmentError) {
    throw assignmentError;
  }

  const setlistSongIds = (setlistSongRows ?? []).map((row) => row.id);
  const { data: personalCapoRows, error: personalCapoError } = userId && setlistSongIds.length > 0
    ? await supabase
      .from('user_setlist_capo_overrides')
      .select('setlist_song_id, capo, updated_at')
      .in('setlist_song_id', setlistSongIds)
      .eq('user_id', userId)
      .returns<UserSetlistCapoOverrideRow[]>()
    : { data: [] as UserSetlistCapoOverrideRow[], error: null };

  if (personalCapoError) {
    throw personalCapoError;
  }

  const personalCapoBySetlistSongId = new Map((personalCapoRows ?? []).map((row) => [row.setlist_song_id, row.capo] as const));
  const assignedSetlistIds = new Set((assignmentRows ?? []).map((row) => row.setlist_id));
  const songs = (songRows ?? []).map(mapSongRow);
  const songsById = new Map(songs.map((song) => [song.id, song] as const));
  const setlists = mapSetlistRows(
    setlistRows ?? [],
    setlistSongRows ?? [],
    songsById,
    personalCapoBySetlistSongId,
    assignedSetlistIds
  );
  const projects = mapProjectRows(projectRows ?? []);
  const lastSavedAt = Math.max(
    0,
    ...songs.map((song) => song.updatedAt),
    ...setlists.map((setlist) => setlist.updatedAt),
    ...projects.map((project) => project.updatedAt),
    ...(personalCapoRows ?? []).map((row) => row.updated_at ? new Date(row.updated_at).getTime() : 0)
  ) || null;

  return {
    songs,
    setlists,
    joinedSetlists: [],
    projects,
    joinedProjects: [],
    lastSavedAt
  };
};

const getJoinedProjects = async (): Promise<JoinedProject[]> => {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('get_joined_projects');
    if (error) throw error;
    if (!Array.isArray(data)) return [];

    return (data as Array<Record<string, unknown>>)
      .map((row, index): JoinedProject | null => {
        const id = typeof row.id === 'string' ? row.id : '';
        if (!id) return null;
        const rawSetlists = Array.isArray(row.setlists)
          ? row.setlists as Array<Partial<Setlist> & Record<string, unknown>>
          : [];
        // Build an embedded songsById from each setlist's songs so the joined
        // setlists normalize cleanly without needing a separate songs fetch.
        const embeddedSongsById = new Map<string, StoredSong>();
        for (const sl of rawSetlists) {
          const songsArr = Array.isArray(sl.songs) ? sl.songs : [];
          for (const ss of songsArr as unknown as Array<Record<string, unknown>>) {
            const songId = typeof ss.songId === 'string' ? ss.songId : '';
            if (!songId || embeddedSongsById.has(songId)) continue;
            const songData = ss.songData && typeof ss.songData === 'object' ? ss.songData as Song : null;
            if (!songData) continue;
            embeddedSongsById.set(songId, {
              ...cloneValue(normalizeSongBars(songData)),
              id: songId,
              archivedAt: parseNullableRemoteTimestamp(ss.sourceArchivedAt),
              updatedAt: Date.now()
            });
          }
        }
        const setlists = rawSetlists.map((sl, slIndex) =>
          normalizeStoredSetlist(sl, embeddedSongsById, slIndex)
        );
        return {
          id,
          name: typeof row.name === 'string' && row.name.trim() ? row.name : `Shared Project ${index + 1}`,
          archived: Boolean(row.archived),
          role: row.role === 'manager' ? 'manager' : 'viewer',
          createdAt: row.createdAt ? new Date(row.createdAt as string).getTime() : Date.now(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt as string).getTime() : Date.now(),
          isJoined: true,
          setlists
        };
      })
      .filter((project): project is JoinedProject => Boolean(project));
  } catch (error) {
    console.warn('Unable to load joined projects.', error);
    return [];
  }
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
      .select('id, library_id, name, display_mode, show_lyrics, archived, project_id, created_by, updated_by, created_at, updated_at')
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
      .select('id, title, content_json, archived_at, updated_at')
      .in('id', songIds)
    : { data: [] as { id: string; title: string; content_json: Song; archived_at: string | null; updated_at: string }[], error: null };

  if (songError) throw songError;

  const songItemIds = (ssRows ?? []).map((r) => r.id);
  const { data: capoRows, error: capoError } = songItemIds.length > 0
    ? await supabase
      .from('user_setlist_capo_overrides')
      .select('setlist_song_id, capo, updated_at')
      .in('setlist_song_id', songItemIds)
      .eq('user_id', userId)
      .returns<UserSetlistCapoOverrideRow[]>()
    : { data: [] as UserSetlistCapoOverrideRow[], error: null };

  if (capoError) throw capoError;

  const capoByItemId = new Map((capoRows ?? []).map((r) => [r.setlist_song_id, r.capo]));
  const songRowById = new Map((songRows ?? []).map((r) => [r.id, r]));

  return (setlistRows ?? []).map((row): JoinedSetlist => {
    const songs = (ssRows ?? [])
      .filter((s) => s.setlist_id === row.id)
      .sort((a, b) => a.order_index - b.order_index)
      .map((s, i): SetlistSong => {
        const songRow = songRowById.get(s.song_id);
        const overrideSongData = s.override_json?.songData
          ? normalizeSongBars(cloneValue(s.override_json.songData))
          : undefined;
        const userCapo = capoByItemId.get(s.id);
        return {
          id: s.id,
          setlistId: row.id,
          songId: s.song_id,
          order: i,
          overrideKey: s.override_json?.overrideKey,
          personalCapoOverride: userCapo,
          sourceArchivedAt: songRow?.archived_at ? new Date(songRow.archived_at).getTime() : null,
          sectionOrder: Array.isArray(s.override_json?.sectionOrder) ? s.override_json.sectionOrder : [],
          songData: overrideSongData ?? (songRow ? normalizeSongBars(cloneValue(songRow.content_json)) : undefined)
        };
      });

    return {
      id: row.id,
      name: row.name,
      displayMode: row.display_mode,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      songs,
      isJoined: true
    };
  });
};

// Stable signature used to decide whether to re-upload setlist_songs. Capo is
// per-user, so both local personal overrides and legacy shared capos are ignored.
const setlistSongsSignature = (songs: SetlistSong[]) => JSON.stringify(
  reindexSetlistSongs(songs).map(({ capo: _sharedCapo, personalCapoOverride: _personalCapo, ...rest }) => rest)
);

const persistSetlistSongs = async (setlist: Setlist) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error: deleteError } = await supabase
    .from('setlist_songs')
    .delete()
    .eq('setlist_id', setlist.id);

  if (deleteError) {
    throw deleteError;
  }

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

  const ensurePersonalImportLibraryId = async () => {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const selectedLibraryId = activeLibraryId;
    if (selectedLibraryId) {
      const { data: selectedLibrary, error } = await supabase
        .from('libraries')
        .select('id, kind')
        .eq('id', selectedLibraryId)
        .maybeSingle<Pick<LibraryRow, 'id' | 'kind'>>();

      if (error) {
        throw error;
      }

      if (!selectedLibrary || selectedLibrary.kind !== 'personal') {
        throw new Error('Local workspace imports are only allowed in your personal library. Switch to your personal library before importing.');
      }
    }

    const personalLibraryId = await ensurePersonalLibraryId();
    if (selectedLibraryId && selectedLibraryId !== personalLibraryId) {
      throw new Error('Local workspace imports are only allowed in your personal library. Switch to your personal library before importing.');
    }

    return personalLibraryId;
  };

  const saveSongToLibrary = async (
    song: StoredSong,
    libraryId: string,
    clientLegacyId?: string
  ) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const existingSong = await assertSongIdIsWritableInLibrary(song.id, libraryId);
    const createdBy = existingSong?.created_by ?? params.userId;
    const now = new Date(song.updatedAt || Date.now()).toISOString();
    const contentJson = {
      ...normalizeSongBars(cloneValue(song)),
      createdBy,
      updatedBy: params.userId
    };
    const payload = {
      id: song.id,
      library_id: libraryId,
      title: song.title,
      content_json: contentJson,
      ...(clientLegacyId ? { client_legacy_id: clientLegacyId } : {}),
      created_by: createdBy,
      updated_by: params.userId,
      updated_at: now
    };

    const { error } = await supabase
      .from('songs')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      throw error;
    }
  };

  const saveSetlistToLibrary = async (
    setlist: Setlist,
    libraryId: string,
    previousSetlist?: Setlist
  ) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const updatedAtIso = new Date(setlist.updatedAt || Date.now()).toISOString();
    const payload = {
      id: setlist.id,
      library_id: libraryId,
      name: setlist.name,
      display_mode: setlist.displayMode,
      archived: setlist.archived ?? false,
      project_id: setlist.projectId ?? null,
      created_by: setlist.createdBy ?? params.userId,
      updated_by: params.userId,
      updated_at: updatedAtIso
    };

    // Skip rewriting setlist_songs (delete-all + bulk upsert) when the songs
    // haven't actually changed — this turns pure metadata edits (rename,
    // archive, move-to-project) into a single round-trip instead of three.
    const songsUnchanged = previousSetlist
      && setlistSongsSignature(setlist.songs) === setlistSongsSignature(previousSetlist.songs);

    const { error } = await supabase
      .from('setlists')
      .upsert(payload, { onConflict: 'id' });
    if (error) {
      throw error;
    }

    if (!songsUnchanged) {
      await persistSetlistSongs(setlist);
    }
  };

  const saveProjectToLibrary = async (project: Project, libraryId: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const updatedAtIso = new Date(project.updatedAt || Date.now()).toISOString();
    const payload = {
      id: project.id,
      library_id: libraryId,
      name: project.name,
      archived: project.archived ?? false,
      created_by: project.createdBy ?? params.userId,
      updated_by: params.userId,
      updated_at: updatedAtIso
    };

    const { error } = await supabase
      .from('projects')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      throw error;
    }
  };

  return {
    async loadWorkspace() {
      const libraryId = await ensureLibraryId();
      const [workspace, joinedSetlists, joinedProjects] = await Promise.all([
        getLibraryWorkspace(libraryId, params.userId),
        getJoinedSetlists(params.userId),
        getJoinedProjects()
      ]);
      if (libraryId === cachedLibraryId || !activeLibraryId) {
        persistLocalWorkspaceSnapshot(workspace.songs, workspace.setlists, workspace.projects);
      }
      return { ...workspace, joinedSetlists, joinedProjects };
    },

    async loadLibraryWorkspace(libraryId) {
      // Loading is intentionally side-effect free. A real workspace switch
      // calls setActiveLibrary only after this complete snapshot succeeds;
      // background Realtime/access reads must never redirect later writes.
      const workspace = await getLibraryWorkspace(libraryId, params.userId);
      const personalLibraryId = await ensurePersonalLibraryId();
      const isPersonal = libraryId === personalLibraryId;
      const [joinedSetlists, joinedProjects] = await Promise.all([
        isPersonal ? getJoinedSetlists(params.userId) : Promise.resolve([] as JoinedSetlist[]),
        isPersonal ? getJoinedProjects() : Promise.resolve([] as JoinedProject[])
      ]);
      return { ...workspace, joinedSetlists, joinedProjects };
    },

    async loadLibrarySongs(libraryId) {
      return getLibrarySongs(libraryId);
    },

    async loadPersonalWorkspace() {
      const personalLibraryId = await ensurePersonalLibraryId();
      const workspace = await getLibraryWorkspace(personalLibraryId, params.userId);
      return { ...workspace, joinedSetlists: [], joinedProjects: [] };
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

    async getSetlistEditorAssignments(setlistId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('get_setlist_editor_assignments', {
        p_setlist_id: setlistId
      });
      if (error) throw error;
      return normalizeSetlistEditorAssignmentSnapshot(data, setlistId);
    },

    async setSetlistEditorAssignment(setlistId, userId, enabled) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('set_setlist_editor_assignment', {
        p_setlist_id: setlistId,
        p_user_id: userId,
        p_assigned: enabled
      });
      if (error) throw error;
      return normalizeSetlistEditorAssignmentSnapshot(data, setlistId);
    },

    async inspectTeamSongImport(teamLibraryId, sourceSongIds) {
      if (!supabase) throw new Error('Supabase is not configured.');
      if (sourceSongIds.length === 0) return { songs: [] };
      const { data, error } = await supabase.rpc('inspect_team_song_import', {
        p_team_library_id: teamLibraryId,
        p_source_song_ids: sourceSongIds
      });
      if (error) throw error;
      return normalizeTeamSongImportInspection(data);
    },

    async importPersonalSongsToTeam(teamLibraryId, items) {
      if (!supabase) throw new Error('Supabase is not configured.');
      if (items.length === 0) {
        return { createdCount: 0, overwrittenCount: 0, duplicateCount: 0, songs: [] };
      }
      const { data, error } = await supabase.rpc('import_personal_songs_to_team', {
        p_team_library_id: teamLibraryId,
        p_items: items.map((item) => ({
          sourceSongId: item.sourceSongId,
          resolution: item.resolution,
          ...(item.targetSongId ? { targetSongId: item.targetSongId } : {})
        }))
      });
      if (error) throw error;
      return normalizeTeamSongImportResult(data);
    },

    async archiveTeamSongs(libraryId, songIds, archived) {
      if (!supabase) throw new Error('Supabase is not configured.');
      if (songIds.length === 0) {
        return { archivedCount: 0, changedCount: 0, songIds: [], archived };
      }
      const { data, error } = await supabase.rpc('archive_team_songs', {
        p_team_library_id: libraryId,
        p_song_ids: songIds,
        p_archived: archived
      });
      if (error) throw error;
      return normalizeTeamSongArchiveResult(data, archived);
    },

    async deleteTeamSongs(libraryId, songIds) {
      if (!supabase) throw new Error('Supabase is not configured.');
      if (songIds.length === 0) return { deletedCount: 0, songIds: [] };
      const { data, error } = await supabase.rpc('delete_team_songs', {
        p_team_library_id: libraryId,
        p_song_ids: songIds
      });
      if (error) throw error;
      return normalizeTeamSongDeleteResult(data);
    },

    subscribeToLibraryChanges(libraryId, onChange) {
      const client = supabase;
      if (!client) return () => undefined;

      const belongsToLibrary = (record: unknown) => asRecord(record).library_id === libraryId;
      let subscribed = true;
      const channel = client
        .channel(`library-changes:${libraryId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'songs', filter: `library_id=eq.${libraryId}` },
          () => {
            // Do not suppress same-account events: another tab or device may
            // legitimately update the team library with this same user id.
            if (subscribed) onChange('songs');
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'setlist_editor_assignments', filter: `user_id=eq.${params.userId}` },
          (payload) => {
            if (subscribed && (belongsToLibrary(payload.new) || belongsToLibrary(payload.old))) {
              onChange('assignments');
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'library_members', filter: `user_id=eq.${params.userId}` },
          (payload) => {
            if (subscribed && (belongsToLibrary(payload.new) || belongsToLibrary(payload.old))) {
              onChange('membership');
            }
          }
        )
        .subscribe();

      return () => {
        if (!subscribed) return;
        subscribed = false;
        void client.removeChannel(channel);
      };
    },

    async copySongToPersonal(sourceSong) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const personalLibraryId = await ensurePersonalLibraryId();
      const personalWorkspace = await getLibraryWorkspace(personalLibraryId, params.userId);
      const copiedAt = Date.now();
      const copiedSong: StoredSong = {
        ...cloneValue(normalizeSongBars(sourceSong)),
        id: crypto.randomUUID(),
        title: buildPersonalCopyTitle(personalWorkspace.songs, sourceSong.title),
        archivedAt: null,
        archivedBy: null,
        createdBy: params.userId,
        updatedBy: params.userId,
        createdAt: copiedAt,
        updatedAt: copiedAt
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
        .select(SONG_SELECT)
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
        archivedAt: song.archivedAt ?? null,
        archivedBy: song.archivedBy ?? null,
        createdBy: song.createdBy,
        updatedBy: params.userId,
        createdAt: song.createdAt,
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
      const personalLibraryId = await ensurePersonalLibraryId();
      await saveSongToLibrary(song, personalLibraryId);
    },

    async saveSong(song) {
      const libraryId = await ensureLibraryId();
      await saveSongToLibrary(song, libraryId);
    },

    async saveSetlist(setlist, previousSetlist) {
      const libraryId = await ensureLibraryId();
      await saveSetlistToLibrary(setlist, libraryId, previousSetlist);
    },

    async saveProject(project) {
      const libraryId = await ensureLibraryId();
      await saveProjectToLibrary(project, libraryId);
    },

    async deleteProject(id) {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const libraryId = await ensureLibraryId();
      const { data, error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)
        .eq('library_id', libraryId)
        .select('id')
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data?.id) {
        throw new Error('Project deletion was not authorized, or the project no longer exists.');
      }
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

      // Resolve and validate the destination before the first per-record write.
      // The fixed personal-library id is then passed to every save helper so an
      // active-workspace switch cannot redirect a running import into a team.
      const libraryId = await ensurePersonalImportLibraryId();
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
          await saveSongToLibrary(mergedSong, libraryId);
          songIdMap.set(localSong.id, remoteSong.id);
          continue;
        }

        const importedId = crypto.randomUUID();
        const importedSong: StoredSong = {
          ...cloneValue(normalizeSongBars(localSong)),
          id: importedId,
          title: matches.length > 1 ? `${localSong.title || 'Untitled'} (Imported)` : localSong.title,
          createdBy: params.userId,
          updatedBy: params.userId,
          updatedAt: localSong.updatedAt
        };

        await saveSongToLibrary(importedSong, libraryId, localSong.id);

        songIdMap.set(localSong.id, importedSong.id);
      }

      const projectIdMap = new Map<string, string>();
      for (const localProject of localWorkspace.projects) {
        const normalizedTitle = normalizeMatchingTitle(localProject.name);
        const matches = normalizedTitle
          ? remoteWorkspace.projects.filter((item) => normalizeMatchingTitle(item.name) === normalizedTitle)
          : [];
        const targetId = matches.length === 1 ? matches[0].id : crypto.randomUUID();
        const targetName = matches.length > 1 ? `${localProject.name || 'Project'} (Imported)` : localProject.name;
        const preferredTimestamp = matches.length === 1
          ? Math.max(localProject.updatedAt, matches[0].updatedAt)
          : localProject.updatedAt;
        const normalizedProject: Project = {
          ...cloneValue(localProject),
          id: targetId,
          name: targetName,
          createdBy: matches.length === 1 ? matches[0].createdBy ?? params.userId : params.userId,
          updatedBy: params.userId,
          updatedAt: preferredTimestamp
        };
        await saveProjectToLibrary(normalizedProject, libraryId);
        projectIdMap.set(localProject.id, targetId);
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
        const mappedProjectId = localSetlist.projectId ? projectIdMap.get(localSetlist.projectId) ?? null : null;
        const normalizedSetlist: Setlist = {
          ...cloneValue(localSetlist),
          id: targetSetlistId,
          name: targetName,
          createdBy: existingMatches.length === 1
            ? existingMatches[0].createdBy ?? params.userId
            : params.userId,
          updatedBy: params.userId,
          updatedAt: preferredTimestamp,
          projectId: mappedProjectId,
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

        await saveSetlistToLibrary(normalizedSetlist, libraryId);
      }

      const [workspace, joinedSetlists, joinedProjects] = await Promise.all([
        getLibraryWorkspace(libraryId, params.userId),
        getJoinedSetlists(params.userId),
        getJoinedProjects()
      ]);
      persistLocalWorkspaceSnapshot(workspace.songs, workspace.setlists, workspace.projects);
      return { ...workspace, joinedSetlists, joinedProjects };
    },

    async createShareLink(resourceType, resourceId) {
      return createEdgeShareLink(resourceType, resourceId);
    },

    async createSongBundleShare(songIds) {
      return createEdgeSongBundleShare(songIds);
    },

    async resolveShareLink(token) {
      return resolveEdgeShareLink(token);
    },

    async inspectSharedSongImport(token) {
      return inspectEdgeSharedSongImport(token);
    },

    async importSharedSongs(token, defaultResolution, perSongResolutions = {}) {
      return importEdgeSharedSongs(token, defaultResolution, perSongResolutions);
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

    async joinSharedProject(token) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('join_shared_project', { p_token: token });
      if (error) throw error;
      return data as string;
    },

    async leaveSharedProject(projectId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase
        .from('user_project_memberships')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', params.userId);
      if (error) throw error;
    },

    async getProjectShareStatus(projectId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('get_project_share_status', { p_project_id: projectId });
      if (error) throw error;
      return data as ProjectShareStatus;
    },

    async revokeProjectSharing(projectId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('revoke_project_sharing', { p_project_id: projectId });
      if (error) throw error;
    },

    async setProjectMemberRole(projectId, userId, role) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('set_project_member_role', {
        p_project_id: projectId,
        p_user_id: userId,
        p_role: role
      });
      if (error) throw error;
    },

    async removeSharedMember(resourceType, resourceId, userId) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('remove_shared_member', {
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_user_id: userId
      });
      if (error) throw error;
    },

    async setProjectSetlistSongKey(setlistSongId, key) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('set_project_setlist_song_key', {
        p_setlist_song_id: setlistSongId,
        p_key: key
      });
      if (error) throw error;
    },

    async reorderProjectSetlist(setlistId, songIds) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.rpc('reorder_project_setlist', {
        p_setlist_id: setlistId,
        p_song_ids: songIds
      });
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
    },

    async getShareContacts() {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('get_share_contacts');
      if (error) throw error;
      return (data ?? []) as ShareContact[];
    },

    async shareToContacts(resourceType, resourceId, userIds) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('share_to_contacts', {
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_user_ids: userIds
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },

    async getNotifications() {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.rpc('get_notifications');
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },

    async markNotificationsRead(ids) {
      if (!supabase) throw new Error('Supabase is not configured.');
      if (ids.length === 0) return;
      const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids });
      if (error) throw error;
    }
  };
};
