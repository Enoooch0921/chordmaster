import { DEFAULT_CHORD_FONT_PRESET } from '../constants/chordFonts';
import { DEFAULT_NASHVILLE_FONT_PRESET } from '../constants/nashvilleFonts';
import { Key, Setlist, SetlistDisplayMode, SetlistSong, Song, StoredSong, WorkspaceSnapshot } from '../types';
import { ALL_KEYS } from '../utils/musicUtils';
import { getDefaultSectionOrder } from '../utils/setlistUtils';
import { normalizeBarChords } from '../utils/barUtils';

export const SONG_LIBRARY_STORAGE_KEY = 'chordmaster.song-library.v1';
export const SETLIST_STORAGE_KEY = 'chordmaster.setlists.v1';
export const SELECTED_SONG_STORAGE_KEY = 'chordmaster.selected-song-id.v1';
export const SELECTED_SETLIST_STORAGE_KEY = 'chordmaster.selected-setlist-id.v1';
export const SELECTED_SETLIST_SONG_STORAGE_KEY = 'chordmaster.selected-setlist-song-id.v1';
export const WORKSPACE_MODE_STORAGE_KEY = 'chordmaster.workspace-mode.v1';
export const LAST_SAVED_AT_STORAGE_KEY = 'chordmaster.last-saved-at.v1';
export const AUTO_SAVE_STORAGE_KEY = 'chordmaster.auto-save.v1';
export const SIDEBAR_WIDTH_STORAGE_KEY = 'chordmaster.sidebar-width.v1';
export const PENDING_SYNC_STORAGE_KEY = 'chordmaster.pending-sync.v1';

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
  songs: StoredSong[];
  setlists: Setlist[];
  savedAt: number;
}

export const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const normalizeTempo = (tempo: unknown): number | undefined => {
  if (tempo === '' || tempo === null || tempo === undefined) return undefined;
  const numericTempo = typeof tempo === 'number' ? tempo : Number(tempo);
  if (!Number.isFinite(numericTempo)) return undefined;
  return Math.min(400, Math.max(20, Math.round(numericTempo)));
};

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

const normalizeLyricTokens = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value.map((token) => (
    typeof token === 'string'
      ? token.replace(/\r\n?/g, '\n')
      : ''
  ));

  let lastNonEmptyIndex = normalized.length - 1;
  while (lastNonEmptyIndex >= 0 && normalized[lastNonEmptyIndex].trim() === '') {
    lastNonEmptyIndex -= 1;
  }

  return normalized.slice(0, lastNonEmptyIndex + 1);
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
        return {
          ...safeBar,
          id: typeof safeBar.id === 'string' && safeBar.id.trim() ? safeBar.id : undefined,
          chords: normalizeChordTokens(safeBar.chords),
          lyrics: normalizeLyricTokens(safeBar.lyrics),
          timeSignature: normalizeOptionalText(safeBar.timeSignature),
          riff: normalizeOptionalText(safeBar.riff),
          rhythm: normalizeOptionalText(safeBar.rhythm),
          label: normalizeOptionalText(safeBar.label),
          riffLabel: normalizeOptionalText(safeBar.riffLabel),
          rhythmLabel: normalizeOptionalText(safeBar.rhythmLabel),
          annotation: normalizeOptionalText(safeBar.annotation),
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

  return {
    ...song,
    title: normalizeText(song.title),
    lyricist: normalizeOptionalText(song.lyricist),
    composer: normalizeOptionalText(song.composer),
    translator: normalizeOptionalText(song.translator),
    groove: normalizeOptionalText(song.groove),
    shuffle: normalizeBoolean(song.shuffle),
    originalKey,
    currentKey,
    tempo: normalizeTempo(song.tempo),
    timeSignature: normalizeText(song.timeSignature, '4/4'),
    useSectionColors: normalizeBoolean(song.useSectionColors),
    showNashvilleNumbers: normalizeBoolean(song.showNashvilleNumbers),
    showAbsoluteJianpu: normalizeBoolean(song.showAbsoluteJianpu) ?? false,
    showLyrics: normalizeBoolean(song.showLyrics) ?? false,
    barNumberMode: typeof song.barNumberMode === 'string' && VALID_BAR_NUMBER_MODES.has(song.barNumberMode) ? song.barNumberMode : 'none',
    nashvilleFontPreset: typeof song.nashvilleFontPreset === 'string' && VALID_NASHVILLE_FONT_PRESETS.has(song.nashvilleFontPreset)
      ? song.nashvilleFontPreset
      : DEFAULT_NASHVILLE_FONT_PRESET,
    chordFontPreset: typeof song.chordFontPreset === 'string' && VALID_CHORD_FONT_PRESETS.has(song.chordFontPreset)
      ? song.chordFontPreset
      : DEFAULT_CHORD_FONT_PRESET,
    capo: normalizeOptionalInteger(song.capo, 0, 12),
    pickup: pickup && (pickup.id || pickup.riff || pickup.rhythm) ? pickup : undefined,
    sections: sections.length > 0 ? sections : [
      {
        id: undefined,
        title: 'Verse',
        bars: [{ chords: [] }]
      }
    ]
  } as T;
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
    showLyrics: normalizeBoolean(setlist.showLyrics) ?? false,
    createdAt: typeof setlist.createdAt === 'number' && Number.isFinite(setlist.createdAt) ? setlist.createdAt : Date.now(),
    updatedAt: typeof setlist.updatedAt === 'number' && Number.isFinite(setlist.updatedAt) ? setlist.updatedAt : Date.now(),
    songs
  };
};

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
    setlists.map((setlist) => ({
      ...setlist,
      songs: reindexSetlistSongs(setlist.songs)
    }))
  );

export const loadLocalWorkspaceSnapshot = (): WorkspaceSnapshot => {
  if (typeof window === 'undefined') {
    return {
      songs: [],
      setlists: [],
      joinedSetlists: [],
      lastSavedAt: null
    };
  }

  let songs: StoredSong[] = [];
  let setlists: Setlist[] = [];
  let lastSavedAt: number | null = null;

  try {
    const storedSongs = window.localStorage.getItem(SONG_LIBRARY_STORAGE_KEY);
    const storedLastSavedAt = window.localStorage.getItem(LAST_SAVED_AT_STORAGE_KEY);
    const parsedSongs = storedSongs ? JSON.parse(storedSongs) as Array<Partial<StoredSong> & Record<string, unknown>> : [];
    songs = Array.isArray(parsedSongs) ? parsedSongs.map(normalizeStoredSong) : [];
    const parsedLastSavedAt = storedLastSavedAt ? Number(storedLastSavedAt) : null;
    lastSavedAt = Number.isFinite(parsedLastSavedAt) ? parsedLastSavedAt : null;
  } catch {
    songs = [];
    lastSavedAt = null;
  }

  try {
    const storedSetlists = window.localStorage.getItem(SETLIST_STORAGE_KEY);
    const parsedSetlists = storedSetlists ? JSON.parse(storedSetlists) as Array<Partial<Setlist> & Record<string, unknown>> : [];
    const songsById = new Map(songs.map((song) => [song.id, song] as const));
    setlists = Array.isArray(parsedSetlists)
      ? parsedSetlists.map((setlist, index) => normalizeStoredSetlist(setlist, songsById, index))
      : [];
  } catch {
    setlists = [];
  }

  return {
    songs,
    setlists,
    joinedSetlists: [],
    lastSavedAt
  };
};

export const persistLocalWorkspaceSnapshot = (songs: StoredSong[], setlists: Setlist[]) => {
  const savedAt = Date.now();
  window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(songs));
  window.localStorage.setItem(SETLIST_STORAGE_KEY, JSON.stringify(setlists));
  window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(savedAt));
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

export const loadPendingSync = (): PendingSyncPayload | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
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

    return {
      songs,
      setlists,
      savedAt: parsed.savedAt
    };
  } catch {
    return null;
  }
};

export const savePendingSync = (payload: PendingSyncPayload | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!payload) {
    window.localStorage.removeItem(PENDING_SYNC_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(payload));
};
