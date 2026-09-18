import { normalizeChordSubdivisions } from '../utils/chordSubdivisions';
import { normalizeChordBeatOffset, canOffsetChord } from '../utils/chordBeatOffsets';
import { normalizeRhythmVoices } from '../utils/rhythmVoices';
import { migrateChordTimingArrows } from './chordTimingMigration';
import { parseWorkspaceDeletions, type WorkspaceDeletions } from './workspaceMerge';
import { DEFAULT_CHORD_FONT_PRESET } from '../constants/chordFonts';
import { DEFAULT_NASHVILLE_FONT_PRESET } from '../constants/nashvilleFonts';
import { Key, Project, Setlist, SetlistDisplayMode, SetlistSong, Song, StoredSong, WorkspaceSnapshot } from '../types';
import { ALL_KEYS } from '../utils/musicUtils';
import { getDefaultSectionOrder } from '../utils/setlistUtils';
import { normalizeBarChords } from '../utils/barUtils';
import { normalizeSongReferences } from '../utils/referenceUtils';
import { normalizeTempoBpm } from '../utils/tempoUtils';
import { isAnnotationColorId } from '../constants/annotationColors';
import { repairSongStructure } from './songEditing';

export const SONG_LIBRARY_STORAGE_KEY = 'chordmaster.song-library.v1';
export const SETLIST_STORAGE_KEY = 'chordmaster.setlists.v1';
export const PROJECT_STORAGE_KEY = 'chordmaster.projects.v1';
export const SELECTED_SONG_STORAGE_KEY = 'chordmaster.selected-song-id.v1';
export const SELECTED_SETLIST_STORAGE_KEY = 'chordmaster.selected-setlist-id.v1';
export const SELECTED_SETLIST_SONG_STORAGE_KEY = 'chordmaster.selected-setlist-song-id.v1';
export const WORKSPACE_MODE_STORAGE_KEY = 'chordmaster.workspace-mode.v1';
export const LAST_SAVED_AT_STORAGE_KEY = 'chordmaster.last-saved-at.v1';
export const AUTO_SAVE_STORAGE_KEY = 'chordmaster.auto-save.v1';
export const SIDEBAR_WIDTH_STORAGE_KEY = 'chordmaster.sidebar-width.v1';
export const PENDING_SYNC_STORAGE_KEY = 'chordmaster.pending-sync.v1';
export const WORKSPACE_SNAPSHOT_STORAGE_KEY = 'chordmaster.workspace-snapshot.v2';
export const WORKSPACE_SNAPSHOT_BACKUP_STORAGE_KEY = 'chordmaster.workspace-snapshot-backup.v2';
export const WORKSPACE_CORRUPT_SNAPSHOT_STORAGE_KEY = 'chordmaster.workspace-snapshot-corrupt.v2';

const WORKSPACE_SNAPSHOT_VERSION = 2 as const;

interface LocalWorkspaceEnvelope {
  version: typeof WORKSPACE_SNAPSHOT_VERSION;
  savedAt: number;
  songs: StoredSong[];
  setlists: Setlist[];
  projects: Project[];
  checksum: string;
}

export type LocalWorkspaceRecoveryNotice =
  | 'recovered-backup'
  | 'recovered-legacy'
  | 'corrupt-unrecoverable';

let pendingRecoveryNotice: LocalWorkspaceRecoveryNotice | null = null;

const VALID_KEYS = new Set<string>(ALL_KEYS);
const VALID_NAVIGATION_MARKERS = new Set([
  'segno',
  'coda',
  'ds',
  'dc',
  'fine',
  'ds-al-coda',
  'ds-al-fine'
]);
const VALID_BAR_NUMBER_MODES = new Set(['none', 'line-start', 'all']);
const VALID_NASHVILLE_FONT_PRESETS = new Set([
  'ibm-plex-serif',
  'source-serif-4',
  'atkinson-hyperlegible-next',
  'source-sans-3'
]);
const VALID_CHORD_FONT_PRESETS = new Set([
  'classic-serif',
  'stage-sans'
]);
const VALID_SETLIST_DISPLAY_MODES = new Set<SetlistDisplayMode>([
  'nashville-number-system',
  'chord-fixed-key',
  'chord-movable-key'
]);

export interface PendingSyncPayload {
  deletions?: WorkspaceDeletions;
  userId?: string;
  libraryId?: string;
  songs: StoredSong[];
  setlists: Setlist[];
  projects: Project[];
  savedAt: number;
}

export const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const normalizeOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return value;
};

const normalizeText = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : fallback
);

const normalizeBoolean = (value: unknown): boolean | undefined => (
  typeof value === 'boolean' ? value : undefined
);

const normalizeOptionalInteger = (value: unknown, min: number, max: number): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return undefined;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
};

const normalizeNavigationMarker = (value: unknown) => (
  typeof value === 'string' && VALID_NAVIGATION_MARKERS.has(value) ? value : undefined
);

const normalizeChordTokens = (value: unknown) => {
  if (Array.isArray(value)) {
    return normalizeBarChords(value.filter((token): token is string => typeof token === 'string'));
  }

  if (typeof value === 'string') {
    return normalizeBarChords(value.split(/\s+/).filter(Boolean));
  }

  return [];
};

const normalizeChordMarks = (value: unknown, chords: string[]) => {
  const chordCount = chords.length;
  if (!value || typeof value !== 'object' || chordCount <= 0) {
    return undefined;
  }

  const marks = Object.entries(value as Record<string, unknown>).reduce<Record<number, NonNullable<Song['sections'][number]['bars'][number]['chordMarks']>[number]>>((nextMarks, [rawIndex, rawMark]) => {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= chordCount || !rawMark || typeof rawMark !== 'object') {
      return nextMarks;
    }

    const mark = rawMark as Record<string, unknown>;
    const normalizedMark = {
      color: isAnnotationColorId(mark.color) ? mark.color : undefined,
      special: mark.special === true ? true : undefined,
      beatOffset: canOffsetChord(chords[index]) && !/[<>]/.test(chords[index]) ? normalizeChordBeatOffset(mark.beatOffset) : undefined
    };

    if (normalizedMark.color || normalizedMark.special || normalizedMark.beatOffset) {
      nextMarks[index] = normalizedMark;
    }

    return nextMarks;
  }, {});

  return Object.keys(marks).length > 0 ? marks : undefined;
};

const normalizeRhythmMark = (value: unknown, rhythm: string | undefined) => {
  if (!rhythm || !value || typeof value !== 'object') {
    return undefined;
  }

  const mark = value as Record<string, unknown>;
  return isAnnotationColorId(mark.color) ? { color: mark.color } : undefined;
};

const normalizeUnisonMark = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const mark = value as Record<string, unknown>;
  if (mark.enabled !== true) {
    return undefined;
  }

  return {
    enabled: true,
    color: isAnnotationColorId(mark.color) ? mark.color : undefined
  };
};

export const normalizeSongBars = <T extends Song>(song: T): T => {
  const originalKey = typeof song.originalKey === 'string' && VALID_KEYS.has(song.originalKey) ? song.originalKey as Key : 'C';
  const currentKey = typeof song.currentKey === 'string' && VALID_KEYS.has(song.currentKey) ? song.currentKey as Key : originalKey;
  const rawSections = Array.isArray(song.sections) ? song.sections : [];
  const sections = rawSections.map((section, sectionIndex) => {
    const safeSection = (section && typeof section === 'object' ? section : {}) as Partial<Song['sections'][number]> & Record<string, unknown>;
    const rawBars = Array.isArray(safeSection.bars) ? safeSection.bars : [];

    return {
      ...safeSection,
      id: typeof safeSection.id === 'string' && safeSection.id.trim() ? safeSection.id : undefined,
      title: normalizeText(safeSection.title, `Section ${sectionIndex + 1}`),
      keyChangeTo: typeof safeSection.keyChangeTo === 'string' && VALID_KEYS.has(safeSection.keyChangeTo)
        ? safeSection.keyChangeTo as Key
        : undefined,
      bars: rawBars.map((bar) => {
        const safeBar = (bar && typeof bar === 'object' ? bar : {}) as Partial<Song['sections'][number]['bars'][number]> & Record<string, unknown>;
        const chords = normalizeChordTokens(safeBar.chords);
        const rhythm = normalizeOptionalText(safeBar.rhythm);
        return {
          ...safeBar,
          id: typeof safeBar.id === 'string' && safeBar.id.trim() ? safeBar.id : undefined,
          chords,
          keyChangeTo: typeof safeBar.keyChangeTo === 'string' && VALID_KEYS.has(safeBar.keyChangeTo)
            ? safeBar.keyChangeTo as Key
            : undefined,
          timeSignature: normalizeOptionalText(safeBar.timeSignature),
          riff: normalizeOptionalText(safeBar.riff),
          rhythm,
          label: normalizeOptionalText(safeBar.label),
          labelLane: safeBar.labelLane === 'rhythm' || safeBar.labelLane === 'riff' ? safeBar.labelLane : undefined,
          riffLabel: normalizeOptionalText(safeBar.riffLabel),
          rhythmLabel: normalizeOptionalText(safeBar.rhythmLabel),
          rhythmVoices: normalizeRhythmVoices(safeBar.rhythmVoices),
          annotation: normalizeOptionalText(safeBar.annotation),
          chordMarks: normalizeChordMarks(safeBar.chordMarks, chords),
          chordSubdivisions: normalizeChordSubdivisions(safeBar.chordSubdivisions),
          rhythmMark: normalizeRhythmMark(safeBar.rhythmMark, rhythm),
          unisonMark: normalizeUnisonMark(safeBar.unisonMark),
          leftMarker: normalizeNavigationMarker(safeBar.leftMarker),
          rightMarker: normalizeNavigationMarker(safeBar.rightMarker),
          leftText: normalizeOptionalText(safeBar.leftText),
          rightText: normalizeOptionalText(safeBar.rightText),
          repeatStart: Boolean(safeBar.repeatStart),
          repeatEnd: Boolean(safeBar.repeatEnd),
          finalBar: Boolean(safeBar.finalBar),
          ending: normalizeOptionalText(safeBar.ending)
        };
      })
    };
  });

  const rawPickup = song.pickup && typeof song.pickup === 'object'
    ? song.pickup as NonNullable<Song['pickup']> & Record<string, unknown>
    : null;
  const pickup = rawPickup
    ? {
        id: typeof rawPickup.id === 'string' && rawPickup.id.trim() ? rawPickup.id : undefined,
        riff: normalizeOptionalText(rawPickup.riff),
        rhythm: normalizeOptionalText(rawPickup.rhythm)
      }
    : undefined;

  return migrateChordTimingArrows(repairSongStructure({
    ...song,
    title: normalizeText(song.title),
    lyricist: normalizeOptionalText(song.lyricist),
    composer: normalizeOptionalText(song.composer),
    translator: normalizeOptionalText(song.translator),
    groove: normalizeOptionalText(song.groove),
    shuffle: normalizeBoolean(song.shuffle),
    originalKey,
    currentKey,
    tempo: normalizeTempoBpm(song.tempo),
    timeSignature: normalizeText(song.timeSignature, '4/4'),
    useSectionColors: normalizeBoolean(song.useSectionColors),
    showNashvilleNumbers: normalizeBoolean(song.showNashvilleNumbers),
    showAbsoluteJianpu: normalizeBoolean(song.showAbsoluteJianpu) ?? false,
    jianpuInputAbsolute: normalizeBoolean(song.jianpuInputAbsolute) ?? false,
    barNumberMode: typeof song.barNumberMode === 'string' && VALID_BAR_NUMBER_MODES.has(song.barNumberMode) ? song.barNumberMode : 'none',
    barRowCount: song.barRowCount === 1 ? 1 : song.barRowCount === 3 ? 3 : 2,
    nashvilleFontPreset: typeof song.nashvilleFontPreset === 'string' && VALID_NASHVILLE_FONT_PRESETS.has(song.nashvilleFontPreset)
      ? song.nashvilleFontPreset
      : DEFAULT_NASHVILLE_FONT_PRESET,
    chordFontPreset: typeof song.chordFontPreset === 'string' && VALID_CHORD_FONT_PRESETS.has(song.chordFontPreset)
      ? song.chordFontPreset
      : DEFAULT_CHORD_FONT_PRESET,
    capo: normalizeOptionalInteger(song.capo, 0, 12),
    references: normalizeSongReferences(song.references, VALID_KEYS),
    pickup: pickup && (pickup.id || pickup.riff || pickup.rhythm) ? pickup : undefined,
    sections: sections.length > 0 ? sections : [
      {
        id: undefined,
        title: 'Verse',
        bars: [{ chords: [] }]
      }
    ]
  } as T));
};

const sanitizeSetlistSectionOrder = (order: string[], song: Song) => {
  const nextIds = getDefaultSectionOrder(song);

  if (nextIds.length === 0) {
    return [];
  }

  const remainingCounts = new Map<string, number>();
  nextIds.forEach((id) => {
    remainingCounts.set(id, (remainingCounts.get(id) ?? 0) + 1);
  });

  const preserved = order.filter((id) => {
    const remaining = remainingCounts.get(id) ?? 0;
    if (remaining <= 0) {
      return false;
    }

    remainingCounts.set(id, remaining - 1);
    return true;
  });

  const missing = nextIds.filter((id) => {
    const remaining = remainingCounts.get(id) ?? 0;
    if (remaining <= 0) {
      return false;
    }

    remainingCounts.set(id, remaining - 1);
    return true;
  });

  const merged = [...preserved, ...missing];
  return merged.length > 0 ? merged : nextIds;
};

const normalizeSetlistDisplayMode = (value: unknown): SetlistDisplayMode => (
  typeof value === 'string' && VALID_SETLIST_DISPLAY_MODES.has(value as SetlistDisplayMode)
    ? value as SetlistDisplayMode
    : 'chord-movable-key'
);

const normalizeSetlistSong = (
  setlistId: string,
  setlistSong: Partial<SetlistSong> & Record<string, unknown>,
  songsById: Map<string, StoredSong>,
  index: number
): SetlistSong => {
  const songId = typeof setlistSong.songId === 'string' ? setlistSong.songId : '';
  const sourceSong = songsById.get(songId);
  const rawSongData = setlistSong.songData && typeof setlistSong.songData === 'object'
    ? setlistSong.songData as Song
    : undefined;
  const normalizedSongData = rawSongData ? normalizeSongBars(rawSongData) : undefined;
  const sectionOrderSourceSong = normalizedSongData ?? sourceSong;
  const rawSectionOrder = Array.isArray(setlistSong.sectionOrder)
    ? setlistSong.sectionOrder.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    id: typeof setlistSong.id === 'string' && setlistSong.id.trim() ? setlistSong.id : crypto.randomUUID(),
    setlistId,
    songId,
    order: typeof setlistSong.order === 'number' && Number.isFinite(setlistSong.order) ? setlistSong.order : index,
    overrideKey: typeof setlistSong.overrideKey === 'string' && VALID_KEYS.has(setlistSong.overrideKey)
      ? setlistSong.overrideKey as Key
      : sourceSong?.currentKey,
    capo: normalizeOptionalInteger(setlistSong.capo, 0, 12) ?? sourceSong?.capo ?? 0,
    personalCapoOverride: normalizeOptionalInteger(setlistSong.personalCapoOverride, 0, 12),
    sourceArchivedAt: typeof setlistSong.sourceArchivedAt === 'number' && Number.isFinite(setlistSong.sourceArchivedAt)
      ? setlistSong.sourceArchivedAt
      : typeof setlistSong.sourceArchivedAt === 'string' && Number.isFinite(new Date(setlistSong.sourceArchivedAt).getTime())
        ? new Date(setlistSong.sourceArchivedAt).getTime()
        : sourceSong?.archivedAt ?? null,
    sectionOrder: sectionOrderSourceSong
      ? sanitizeSetlistSectionOrder(rawSectionOrder, sectionOrderSourceSong)
      : rawSectionOrder,
    songData: normalizedSongData
  };
};

export const normalizeStoredSetlist = (
  setlist: Partial<Setlist> & Record<string, unknown>,
  songsById: Map<string, StoredSong>,
  index: number
): Setlist => {
  const setlistId = typeof setlist.id === 'string' && setlist.id.trim() ? setlist.id : crypto.randomUUID();
  const rawSongs = Array.isArray(setlist.songs) ? setlist.songs : [];
  const songs = reindexSetlistSongs(
    rawSongs
      .map((item, itemIndex) => normalizeSetlistSong(setlistId, item as Partial<SetlistSong> & Record<string, unknown>, songsById, itemIndex))
      .filter((item) => songsById.has(item.songId))
      .sort((a, b) => a.order - b.order)
  );

  return {
    id: setlistId,
    name: normalizeText(setlist.name, `Setlist ${index + 1}`),
    displayMode: normalizeSetlistDisplayMode(setlist.displayMode),
    createdBy: normalizeOptionalText(setlist.createdBy),
    updatedBy: normalizeOptionalText(setlist.updatedBy),
    createdAt: typeof setlist.createdAt === 'number' && Number.isFinite(setlist.createdAt) ? setlist.createdAt : Date.now(),
    updatedAt: typeof setlist.updatedAt === 'number' && Number.isFinite(setlist.updatedAt) ? setlist.updatedAt : Date.now(),
    archived: normalizeBoolean(setlist.archived) ?? false,
    projectId: typeof setlist.projectId === 'string' && setlist.projectId.trim() ? setlist.projectId : null,
    songs
  };
};

export const normalizeStoredProject = (project: Partial<Project> & Record<string, unknown>, index: number): Project => ({
  id: typeof project.id === 'string' && project.id.trim() ? project.id : crypto.randomUUID(),
  name: normalizeText(project.name, `Project ${index + 1}`),
  archived: normalizeBoolean(project.archived) ?? false,
  createdBy: normalizeOptionalText(project.createdBy),
  updatedBy: normalizeOptionalText(project.updatedBy),
  createdAt: typeof project.createdAt === 'number' && Number.isFinite(project.createdAt) ? project.createdAt : Date.now(),
  updatedAt: typeof project.updatedAt === 'number' && Number.isFinite(project.updatedAt) ? project.updatedAt : Date.now()
});

export const serializeProjects = (projects: Project[]) =>
  JSON.stringify(projects.map((project) => ({ ...project })));

export const reindexSetlistSongs = (setlistSongs: SetlistSong[]) => setlistSongs.map((item, index) => ({
  ...item,
  order: index
}));

export const normalizeStoredSong = (song: Partial<StoredSong>, index: number): StoredSong => ({
  ...cloneValue(normalizeSongBars(song as Song)),
  id: typeof song.id === 'string' && song.id.trim() ? song.id : `song-restored-${index + 1}`,
  updatedAt: typeof song.updatedAt === 'number' ? song.updatedAt : Date.now()
});

export const serializeSongLibrary = (library: StoredSong[]) =>
  JSON.stringify(
    library.map(({ updatedAt, ...song }) => song)
  );

export const serializeSetlists = (setlists: Setlist[]) =>
  JSON.stringify(
    setlists.map(({ assignedToCurrentUser: _assignment, ...setlist }) => ({
      ...setlist,
      songs: reindexSetlistSongs(setlist.songs).map(({ personalCapoOverride, sourceArchivedAt, ...song }) => song)
    }))
  );

const createEmptyWorkspaceSnapshot = (): WorkspaceSnapshot => ({
  songs: [],
  setlists: [],
  joinedSetlists: [],
  projects: [],
  joinedProjects: [],
  lastSavedAt: null
});

const calculateWorkspaceChecksum = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const getEnvelopePayload = (envelope: Omit<LocalWorkspaceEnvelope, 'checksum'> | LocalWorkspaceEnvelope) => ({
  version: envelope.version,
  savedAt: envelope.savedAt,
  songs: envelope.songs,
  setlists: envelope.setlists,
  projects: envelope.projects
});

const createWorkspaceEnvelope = (
  songs: StoredSong[],
  setlists: Setlist[],
  projects: Project[],
  savedAt: number
): LocalWorkspaceEnvelope => {
  const payload = {
    version: WORKSPACE_SNAPSHOT_VERSION,
    savedAt,
    songs,
    setlists,
    projects
  };
  return {
    ...payload,
    checksum: calculateWorkspaceChecksum(JSON.stringify(payload))
  };
};

const parseWorkspaceEnvelope = (raw: string | null): LocalWorkspaceEnvelope | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LocalWorkspaceEnvelope>;
    if (
      parsed.version !== WORKSPACE_SNAPSHOT_VERSION
      || typeof parsed.savedAt !== 'number'
      || !Number.isFinite(parsed.savedAt)
      || !Array.isArray(parsed.songs)
      || !Array.isArray(parsed.setlists)
      || !Array.isArray(parsed.projects)
      || typeof parsed.checksum !== 'string'
    ) {
      return null;
    }

    const envelope = parsed as LocalWorkspaceEnvelope;
    const expectedChecksum = calculateWorkspaceChecksum(JSON.stringify(getEnvelopePayload(envelope)));
    return envelope.checksum === expectedChecksum ? envelope : null;
  } catch {
    return null;
  }
};

const normalizeWorkspaceEnvelope = (envelope: LocalWorkspaceEnvelope): WorkspaceSnapshot => {
  const songs = envelope.songs.map((song, index) => normalizeStoredSong(song, index));
  const songsById = new Map(songs.map((song) => [song.id, song] as const));
  const setlists = envelope.setlists.map((setlist, index) => (
    normalizeStoredSetlist(setlist as Partial<Setlist> & Record<string, unknown>, songsById, index)
  ));
  const projects = envelope.projects.map((project, index) => (
    normalizeStoredProject(project as Partial<Project> & Record<string, unknown>, index)
  ));

  return {
    songs,
    setlists,
    joinedSetlists: [],
    projects,
    joinedProjects: [],
    lastSavedAt: envelope.savedAt
  };
};

const preserveCorruptWorkspaceValue = (source: string, raw: unknown) => {
  try {
    window.localStorage.setItem(WORKSPACE_CORRUPT_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      capturedAt: Date.now(),
      source,
      raw
    }));
    return true;
  } catch {
    return false;
  }
};

const loadLegacyWorkspaceSnapshot = () => {
  const rawValues: Record<string, string | null> = {};
  let corrupt = false;

  const read = (key: string) => {
    try {
      const value = window.localStorage.getItem(key);
      rawValues[key] = value;
      return value;
    } catch {
      corrupt = true;
      rawValues[key] = null;
      return null;
    }
  };

  const storedSongs = read(SONG_LIBRARY_STORAGE_KEY);
  const storedSetlists = read(SETLIST_STORAGE_KEY);
  const storedProjects = read(PROJECT_STORAGE_KEY);
  const storedLastSavedAt = read(LAST_SAVED_AT_STORAGE_KEY);
  let songs: StoredSong[] = [];
  let setlists: Setlist[] = [];
  let projects: Project[] = [];
  let lastSavedAt: number | null = null;

  try {
    const parsedSongs = storedSongs ? JSON.parse(storedSongs) as Array<Partial<StoredSong>> : [];
    if (!Array.isArray(parsedSongs)) throw new Error('Invalid song library');
    songs = parsedSongs.map(normalizeStoredSong);
  } catch {
    corrupt = true;
  }

  try {
    const parsedSetlists = storedSetlists ? JSON.parse(storedSetlists) as Array<Partial<Setlist> & Record<string, unknown>> : [];
    if (!Array.isArray(parsedSetlists)) throw new Error('Invalid setlists');
    const songsById = new Map(songs.map((song) => [song.id, song] as const));
    setlists = parsedSetlists.map((setlist, index) => normalizeStoredSetlist(setlist, songsById, index));
  } catch {
    corrupt = true;
  }

  try {
    const parsedProjects = storedProjects ? JSON.parse(storedProjects) as Array<Partial<Project> & Record<string, unknown>> : [];
    if (!Array.isArray(parsedProjects)) throw new Error('Invalid projects');
    projects = parsedProjects.map((project, index) => normalizeStoredProject(project, index));
  } catch {
    corrupt = true;
  }

  if (storedLastSavedAt !== null) {
    const parsedLastSavedAt = Number(storedLastSavedAt);
    if (storedLastSavedAt.trim() && Number.isFinite(parsedLastSavedAt)) {
      lastSavedAt = parsedLastSavedAt;
    } else {
      corrupt = true;
    }
  }

  return {
    snapshot: {
      songs,
      setlists,
      joinedSetlists: [],
      projects,
      joinedProjects: [],
      lastSavedAt
    } satisfies WorkspaceSnapshot,
    hasStoredData: Object.values(rawValues).some((value) => value !== null),
    corrupt,
    rawValues
  };
};

export const consumeLocalWorkspaceRecoveryNotice = () => {
  const notice = pendingRecoveryNotice;
  pendingRecoveryNotice = null;
  return notice;
};

export const loadLocalWorkspaceSnapshot = (): WorkspaceSnapshot => {
  if (typeof window === 'undefined') {
    return createEmptyWorkspaceSnapshot();
  }

  let primaryRaw: string | null = null;
  let backupRaw: string | null = null;
  try {
    primaryRaw = window.localStorage.getItem(WORKSPACE_SNAPSHOT_STORAGE_KEY);
    backupRaw = window.localStorage.getItem(WORKSPACE_SNAPSHOT_BACKUP_STORAGE_KEY);
  } catch {
    pendingRecoveryNotice = 'corrupt-unrecoverable';
    return createEmptyWorkspaceSnapshot();
  }

  const primaryEnvelope = parseWorkspaceEnvelope(primaryRaw);
  if (primaryEnvelope) {
    return normalizeWorkspaceEnvelope(primaryEnvelope);
  }

  const backupEnvelope = parseWorkspaceEnvelope(backupRaw);
  if (backupEnvelope) {
    const corruptValuePreserved = primaryRaw
      ? preserveCorruptWorkspaceValue(WORKSPACE_SNAPSHOT_STORAGE_KEY, primaryRaw)
      : true;
    if (corruptValuePreserved && backupRaw) {
      try {
        window.localStorage.setItem(WORKSPACE_SNAPSHOT_STORAGE_KEY, backupRaw);
      } catch {
        // The verified backup is still used for this session.
      }
    }
    pendingRecoveryNotice = 'recovered-backup';
    return normalizeWorkspaceEnvelope(backupEnvelope);
  }

  const legacy = loadLegacyWorkspaceSnapshot();
  if (primaryRaw) {
    preserveCorruptWorkspaceValue(WORKSPACE_SNAPSHOT_STORAGE_KEY, primaryRaw);
  }
  if (legacy.corrupt && !primaryRaw) {
    preserveCorruptWorkspaceValue('legacy-workspace', legacy.rawValues);
  }
  if (primaryRaw && legacy.hasStoredData && !legacy.corrupt) {
    pendingRecoveryNotice = 'recovered-legacy';
  } else if ((primaryRaw || legacy.hasStoredData) && legacy.corrupt) {
    pendingRecoveryNotice = 'corrupt-unrecoverable';
  }
  return legacy.snapshot;
};

export const persistLocalWorkspaceSnapshot = (songs: StoredSong[], setlists: Setlist[], projects: Project[] = []) => {
  if (typeof window === 'undefined') {
    throw new Error('Local workspace storage is unavailable.');
  }

  const savedAt = Date.now();
  const envelope = createWorkspaceEnvelope(songs, setlists, projects, savedAt);
  const serializedEnvelope = JSON.stringify(envelope);
  let previousRaw: string | null = null;

  try {
    previousRaw = window.localStorage.getItem(WORKSPACE_SNAPSHOT_STORAGE_KEY);
    if (parseWorkspaceEnvelope(previousRaw)) {
      try {
        window.localStorage.setItem(WORKSPACE_SNAPSHOT_BACKUP_STORAGE_KEY, previousRaw!);
      } catch {
        // The current primary remains a valid rollback point until it is replaced.
      }
    } else if (previousRaw) {
      preserveCorruptWorkspaceValue(WORKSPACE_SNAPSHOT_STORAGE_KEY, previousRaw);
    }

    window.localStorage.setItem(WORKSPACE_SNAPSHOT_STORAGE_KEY, serializedEnvelope);
    const verifiedEnvelope = parseWorkspaceEnvelope(window.localStorage.getItem(WORKSPACE_SNAPSHOT_STORAGE_KEY));
    if (!verifiedEnvelope || verifiedEnvelope.savedAt !== savedAt) {
      throw new Error('Local workspace verification failed.');
    }
  } catch (error) {
    try {
      if (previousRaw !== null) {
        window.localStorage.setItem(WORKSPACE_SNAPSHOT_STORAGE_KEY, previousRaw);
      } else {
        window.localStorage.removeItem(WORKSPACE_SNAPSHOT_STORAGE_KEY);
      }
    } catch {
      // Preserve the original storage error below.
    }
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    throw new Error(`Unable to save the local workspace.${detail}`);
  }

  const writeLegacyValue = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // The verified v2 snapshot is authoritative; legacy keys are downgrade-only mirrors.
    }
  };
  writeLegacyValue(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(songs));
  writeLegacyValue(SETLIST_STORAGE_KEY, JSON.stringify(setlists));
  writeLegacyValue(PROJECT_STORAGE_KEY, JSON.stringify(projects));
  writeLegacyValue(LAST_SAVED_AT_STORAGE_KEY, String(savedAt));
  return savedAt;
};

export const normalizeMatchingTitle = (title: string) => title.trim().toLowerCase().replace(/\s+/g, ' ');

export const getMigrationMarkerKey = (userId: string) => `chordmaster.migration-complete.${userId}.v1`;

export const hasCompletedMigration = (userId: string) => (
  typeof window !== 'undefined' && window.localStorage.getItem(getMigrationMarkerKey(userId)) === 'true'
);

export const markMigrationCompleted = (userId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getMigrationMarkerKey(userId), 'true');
};

export interface PendingSyncScope { userId: string; libraryId: string }
const pendingSyncKey = (scope?: PendingSyncScope) => scope
  ? `chordmaster.pending-sync.v2.${encodeURIComponent(scope.userId)}.${encodeURIComponent(scope.libraryId)}`
  : PENDING_SYNC_STORAGE_KEY;

export const loadPendingSync = (scope?: PendingSyncScope): PendingSyncPayload | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(pendingSyncKey(scope));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PendingSyncPayload;
    if (!Array.isArray(parsed.songs) || !Array.isArray(parsed.setlists) || typeof parsed.savedAt !== 'number') {
      return null;
    }

    const songs = parsed.songs.map((song, index) => normalizeStoredSong(song, index));
    const songsById = new Map(songs.map((song) => [song.id, song] as const));
    const setlists = parsed.setlists.map((setlist, index) => normalizeStoredSetlist(setlist as Partial<Setlist> & Record<string, unknown>, songsById, index));
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.map((project, index) => normalizeStoredProject(project as Partial<Project> & Record<string, unknown>, index))
      : [];

    return {
      songs,
      setlists,
      projects,
      savedAt: parsed.savedAt,
      deletions: parseWorkspaceDeletions(parsed.deletions),
      userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
      libraryId: typeof parsed.libraryId === 'string' ? parsed.libraryId : undefined
    };
  } catch {
    return null;
  }
};

export const savePendingSync = (payload: PendingSyncPayload | null, scope?: PendingSyncScope) => {
  const key = pendingSyncKey(scope ?? (payload?.userId && payload.libraryId ? { userId: payload.userId, libraryId: payload.libraryId } : undefined));
  if (typeof window === 'undefined') {
    return;
  }

  if (!payload) {
    window.localStorage.removeItem(key);
    if (window.localStorage.getItem(key) !== null) {
      throw new Error('Unable to clear the pending sync queue.');
    }
    return;
  }

  const serializedPayload = JSON.stringify(payload);
  window.localStorage.setItem(key, serializedPayload);
  if (window.localStorage.getItem(key) !== serializedPayload) {
    throw new Error('Unable to verify the pending sync queue.');
  }
};
