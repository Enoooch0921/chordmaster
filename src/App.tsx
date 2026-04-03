/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Song, Key, AppLanguage } from './types';
import { ALL_KEYS, getPlayKey, getTransposeOffset, transposeKey, transposeKeyPreferFlats } from './utils/musicUtils';
import { normalizeBarChords } from './utils/barUtils';
import { DEFAULT_NASHVILLE_FONT_PRESET } from './constants/nashvilleFonts';
import { APP_NAME, APP_VERSION, APP_GITHUB_URL, getLocalizedAppMeta } from './constants/appMeta';
import { getUiCopy } from './constants/i18n';
import ChordSheet from './components/ChordSheet';
import SongEditor from './components/SongEditor';
import { Edit3, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Save, Hash, Music2, Plus, FileText, Trash2, Undo2, Redo2, Search, Copy, LogOut, Upload, Download, Info, BookOpen, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const SONG_LIBRARY_STORAGE_KEY = 'chordmaster.song-library.v1';
const SELECTED_SONG_STORAGE_KEY = 'chordmaster.selected-song-id.v1';
const LAST_SAVED_AT_STORAGE_KEY = 'chordmaster.last-saved-at.v1';
const AUTO_SAVE_STORAGE_KEY = 'chordmaster.auto-save.v1';
const GOOGLE_SESSION_STORAGE_KEY = 'chordmaster.google-session.v1';
const SIDEBAR_WIDTH_STORAGE_KEY = 'chordmaster.sidebar-width.v1';
const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services-script';
const COLLAPSED_SIDEBAR_WIDTH = 80;
const DEFAULT_EXPANDED_SIDEBAR_WIDTH = 420;
const MIN_EXPANDED_SIDEBAR_WIDTH = 360;
const MAX_EXPANDED_SIDEBAR_WIDTH = 640;
const PREVIEW_TARGET_WIDTH = 794;
const PREVIEW_MIN_SCALE = 0.35;
const PREVIEW_MAX_SCALE = 2.4;
const PREVIEW_ZOOM_STEP = 0.15;
const PREVIEW_SAFETY_MARGIN = 20;
const PREVIEW_PAGE_HEIGHT = 1123;
const PDF_EXPORT_PIXEL_RATIO = 3;
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

interface GoogleUserSession {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

interface ExportedSongLibraryPayload {
  version: 1;
  exportedAt: number;
  songs: Array<Omit<StoredSong, 'updatedAt'> & { updatedAt?: number }>;
}

const buildPdfFileName = (title: string) => {
  const normalized = title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ');
  return normalized || 'ChordMaster';
};

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

const formatSongLibraryCredits = (song: Song) => {
  const lyricist = song.lyricist?.trim();
  const composer = song.composer?.trim();
  const translator = song.translator?.trim();
  const versionNames = Array.from(new Set([lyricist, composer].filter(Boolean)));
  const parts: string[] = [];

  if (versionNames.length > 0) parts.push(versionNames.join(' / '));
  if (translator) parts.push(translator);

  return parts;
};

const getSongLibraryMeta = (song: Song, shuffleLabel: string) => {
  const creditParts = formatSongLibraryCredits(song);
  const primary = [
    song.currentKey,
    typeof song.tempo === 'number' ? `${song.tempo} BPM` : '',
    song.timeSignature
  ].filter(Boolean).join(' · ');
  const isShuffle = song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle';

  if (creditParts.length > 0 || isShuffle) {
    return {
      primary,
      secondary: [isShuffle ? shuffleLabel : '', ...creditParts].filter(Boolean).join(' · '),
      tooltip: [primary, isShuffle ? shuffleLabel : '', ...creditParts].filter(Boolean).join('\n'),
    };
  }

  return {
    primary,
    secondary: '',
    tooltip: primary,
  };
};

const INITIAL_SONG: Song = {
  title: "Speak Jesus",
  shuffle: true,
  originalKey: "E",
  currentKey: "E",
  showAbsoluteJianpu: false,
  tempo: 74,
  timeSignature: "4/4",
  barNumberMode: 'none',
  nashvilleFontPreset: DEFAULT_NASHVILLE_FONT_PRESET,
  sections: [
    {
      id: "s1",
      title: "Intro",
      bars: [
        { chords: ["E"], riff: "3 - 4 -", riffLabel: "Riff" },
        { chords: ["%"] },
        { chords: ["C#m"], riff: "5 - 7 i", riffLabel: "Riff" },
        { chords: ["/"] },
        { chords: ["A"] },
        { chords: ["%"] }
      ]
    },
    {
      id: "s2",
      title: "Verse 1, 2",
      bars: [
        { chords: ["E"], repeatStart: true },
        { chords: ["%"] },
        { chords: ["C#m"] },
        { chords: ["%"] },
        { chords: ["A"] },
        { chords: ["%"] },
        { chords: ["E"], riff: "3 - 4 -", riffLabel: "Riff" },
        { chords: ["E"], riff: "5 - 7 i", riffLabel: "Riff", repeatEnd: true }
      ]
    },
    {
      id: "s3",
      title: "Chorus",
      bars: [
        { chords: ["B", "E/G#"], repeatStart: true },
        { chords: ["A"] },
        { chords: ["E"] },
        { chords: ["E"] },
        { chords: ["B", "E/G#"] },
        { chords: ["A"] },
        { chords: ["E"], ending: "1", riff: "3 - 4 -", riffLabel: "Riff" },
        { chords: ["E"], ending: "1", riff: "5 - 7 i", riffLabel: "Riff", repeatEnd: true }
      ]
    },
    {
      id: "s4",
      title: "Breakdown",
      bars: [
        { chords: ["E"], ending: "2" },
        { chords: ["E"], ending: "2" }
      ]
    },
    {
      id: "s5",
      title: "Verse 3",
      bars: [
        { chords: ["E"] },
        { chords: ["%"] },
        { chords: ["C#m"] },
        { chords: ["%"] },
        { chords: ["A"] },
        { chords: ["%"] },
        { chords: ["E"] },
        { chords: ["E"] }
      ]
    },
    {
      id: "s6",
      title: "Chorus",
      bars: [
        { chords: ["B", "E/G#"] },
        { chords: ["A"] },
        { chords: ["E"] },
        { chords: ["E"] },
        { chords: ["B", "E/G#"] },
        { chords: ["A"] },
        { chords: ["E"] },
        { chords: ["E"] }
      ]
    },
    {
      id: "s7",
      title: "Bridge",
      bars: [
        { chords: ["E"], annotation: "AG 8 beats" },
        { chords: ["Esus4", "E"] },
        { chords: ["C#m"] },
        { chords: ["C#m6", "C#m"] },
        { chords: ["A"] },
        { chords: ["A"] },
        { chords: ["E"], annotation: "Kick In" },
        { chords: ["E"] }
      ]
    },
    {
      id: "s8",
      title: "Bridge",
      bars: [
        { chords: ["E"], annotation: "8 beat build" },
        { chords: ["E"] },
        { chords: ["C#m"] },
        { chords: ["C#m"] },
        { chords: ["A"] },
        { chords: ["A"] },
        { chords: ["E"], annotation: "16 beat build" },
        { chords: ["E"] }
      ]
    },
    {
      id: "s9",
      title: "Up Chorus",
      bars: [
        { chords: ["B", "E/G#"], repeatStart: true },
        { chords: ["A"] },
        { chords: ["E"] },
        { chords: ["E", "C#m"] },
        { chords: ["B", "E/G#"] },
        { chords: ["A"] },
        { chords: ["E"], ending: "1" },
        { chords: ["E"], ending: "1", repeatEnd: true }
      ]
    },
    {
      id: "s10",
      title: "Breakdown",
      bars: [
        { chords: ["E"], ending: "2" },
        { chords: ["E"], ending: "2" }
      ]
    }
  ]
};

interface StoredSong extends Song {
  id: string;
  updatedAt: number;
}

interface SongHistoryState {
  past: Song[];
  future: Song[];
}

type AppView = 'sheet' | 'about' | 'help';
type EditorFocusField = 'chords' | 'riff' | 'label' | 'annotation' | 'rhythm';

interface EditorFocusRequest {
  sIdx: number;
  bIdx: number;
  field: EditorFocusField;
  requestId: number;
}

interface PreviewDragState {
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
}

const KEY_MENU_LAYOUT: Array<Array<Key | null>> = [
  ['Ab', 'A', null],
  ['Bb', 'B', null],
  [null, 'C', 'C#'],
  ['Db', 'D', null],
  ['Eb', 'E', null],
  [null, 'F', 'F#'],
  ['Gb', 'G', 'G#']
];

const cloneSong = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const createSongId = () => `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeSongBars = <T extends Song>(song: T): T => {
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
      bars: rawBars.map((bar) => {
        const safeBar = (bar && typeof bar === 'object' ? bar : {}) as Partial<Song['sections'][number]['bars'][number]> & Record<string, unknown>;
        return {
          ...safeBar,
          id: typeof safeBar.id === 'string' && safeBar.id.trim() ? safeBar.id : undefined,
          chords: normalizeChordTokens(safeBar.chords),
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
    barNumberMode: typeof song.barNumberMode === 'string' && VALID_BAR_NUMBER_MODES.has(song.barNumberMode) ? song.barNumberMode : 'none',
    nashvilleFontPreset: typeof song.nashvilleFontPreset === 'string' && VALID_NASHVILLE_FONT_PRESETS.has(song.nashvilleFontPreset)
      ? song.nashvilleFontPreset
      : DEFAULT_NASHVILLE_FONT_PRESET,
    capo: normalizeOptionalInteger(song.capo, 0, 12),
    sections: sections.length > 0 ? sections : [
      {
        id: undefined,
        title: 'Verse',
        bars: [{ chords: [] }]
      }
    ]
  } as T;
};

const createStoredSong = (song: Song, id = createSongId()): StoredSong => ({
  ...cloneSong(normalizeSongBars(song)),
  id,
  updatedAt: Date.now()
});

const buildDuplicateSongTitle = (existingSongs: StoredSong[], originalTitle: string, untitledSong: string, copyLabel: string) => {
  const baseTitle = originalTitle.trim() || untitledSong;
  const existingTitles = new Set(existingSongs.map((song) => song.title.trim().toLowerCase()));

  let copyIndex = 1;
  let nextTitle = `${baseTitle} ${copyLabel}`;

  while (existingTitles.has(nextTitle.trim().toLowerCase())) {
    copyIndex += 1;
    nextTitle = `${baseTitle} ${copyLabel} ${copyIndex}`;
  }

  return nextTitle;
};

const createEmptySong = (title: string): StoredSong =>
  createStoredSong({
    title,
    shuffle: false,
    originalKey: 'C',
    currentKey: 'C',
    showAbsoluteJianpu: false,
    tempo: 120,
    timeSignature: '4/4',
    barNumberMode: 'none',
    nashvilleFontPreset: DEFAULT_NASHVILLE_FONT_PRESET,
    sections: [
      {
        id: 's1',
        title: 'Verse',
        bars: [{ chords: [] }, { chords: [] }, { chords: [] }, { chords: [] }]
      }
    ]
  });

const getDefaultLibrary = () => {
  const defaultSong = createStoredSong(INITIAL_SONG, 'song-default');
  return {
    songs: [defaultSong],
    selectedSongId: defaultSong.id
  };
};

const loadSongLibrary = () => {
  if (typeof window === 'undefined') {
    return {
      ...getDefaultLibrary(),
      lastSavedAt: null as number | null
    };
  }

  try {
    const storedSongs = window.localStorage.getItem(SONG_LIBRARY_STORAGE_KEY);
    const storedSelectedId = window.localStorage.getItem(SELECTED_SONG_STORAGE_KEY);
    const storedLastSavedAt = window.localStorage.getItem(LAST_SAVED_AT_STORAGE_KEY);

    if (!storedSongs) {
      return {
        ...getDefaultLibrary(),
        lastSavedAt: null as number | null
      };
    }

    const parsedSongs = JSON.parse(storedSongs) as StoredSong[];
    if (!Array.isArray(parsedSongs) || parsedSongs.length === 0) {
      return {
        ...getDefaultLibrary(),
        lastSavedAt: null as number | null
      };
    }

    const songs = parsedSongs.map((song, index) => normalizeSongBars({
      ...song,
      id: song.id || `song-restored-${index + 1}`,
      updatedAt: typeof song.updatedAt === 'number' ? song.updatedAt : Date.now()
    }));
    const selectedSongId = songs.some((song) => song.id === storedSelectedId) ? (storedSelectedId as string) : songs[0].id;
    const parsedLastSavedAt = storedLastSavedAt ? Number(storedLastSavedAt) : null;

    return {
      songs,
      selectedSongId,
      lastSavedAt: Number.isFinite(parsedLastSavedAt) ? parsedLastSavedAt : null
    };
  } catch {
    return {
      ...getDefaultLibrary(),
      lastSavedAt: null as number | null
    };
  }
};

const formatSavedAt = (timestamp: number | null, language: AppLanguage) => {
  if (!timestamp) {
    return language === 'zh' ? '尚未儲存' : 'Not saved yet';
  }

  return `${language === 'zh' ? '已儲存 ' : 'Saved '}${new Date(timestamp).toLocaleTimeString(language === 'zh' ? 'zh-TW' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
};

const serializeSongLibrary = (library: StoredSong[]) =>
  JSON.stringify(
    library.map(({ updatedAt, ...song }) => song)
  );

const loadAutoSavePreference = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(AUTO_SAVE_STORAGE_KEY) === 'true';
};

const loadGoogleSession = (): GoogleUserSession | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedSession = window.localStorage.getItem(GOOGLE_SESSION_STORAGE_KEY);
    if (!storedSession) {
      return null;
    }

    const parsedSession = JSON.parse(storedSession) as GoogleUserSession;
    if (!parsedSession?.sub || !parsedSession?.name || !parsedSession?.email) {
      return null;
    }

    return parsedSession;
  } catch {
    return null;
  }
};

const loadSidebarWidthPreference = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_EXPANDED_SIDEBAR_WIDTH;
  }

  const rawValue = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(rawValue)) {
    return DEFAULT_EXPANDED_SIDEBAR_WIDTH;
  }

  return Math.max(MIN_EXPANDED_SIDEBAR_WIDTH, Math.min(MAX_EXPANDED_SIDEBAR_WIDTH, rawValue));
};

const parseGoogleCredential = (credential: string): GoogleUserSession | null => {
  try {
    const payloadSegment = credential.split('.')[1];
    if (!payloadSegment) {
      return null;
    }

    const normalizedPayload = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const payload = JSON.parse(window.atob(paddedPayload)) as Partial<GoogleUserSession>;

    if (!payload.sub || !payload.name || !payload.email) {
      return null;
    }

    return {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      picture: payload.picture
    };
  } catch {
    return null;
  }
};

const loadGoogleIdentityScript = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.google?.accounts?.id) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;

    const handleLoad = () => resolve();
    const handleError = () => reject(new Error('Failed to load Google Identity Services.'));

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.head.appendChild(script);
  });
};

export default function App() {
  const [activeBar, setActiveBar] = useState<{ sIdx: number; bIdx: number } | null>(null);
  const [language, setLanguage] = useState<AppLanguage>('zh');
  const initialLibraryRef = useRef(loadSongLibrary());
  const [songs, setSongs] = useState<StoredSong[]>(initialLibraryRef.current.songs);
  const [savedSongs, setSavedSongs] = useState<StoredSong[]>(cloneSong(initialLibraryRef.current.songs));
  const [selectedSongId, setSelectedSongId] = useState(initialLibraryRef.current.selectedSongId);
  const [songHistories, setSongHistories] = useState<Record<string, SongHistoryState>>({});
  const [selectedSongIdsForBulkDelete, setSelectedSongIdsForBulkDelete] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isLibraryEditing, setIsLibraryEditing] = useState(false);
  const [activeAppView, setActiveAppView] = useState<AppView>('sheet');
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(loadAutoSavePreference);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(initialLibraryRef.current.lastSavedAt);
  const [highlightedSectionIds, setHighlightedSectionIds] = useState<string[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState<EditorFocusRequest | null>(null);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidthPreference);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [googleUser, setGoogleUser] = useState<GoogleUserSession | null>(loadGoogleSession);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const keyMenuRef = useRef<HTMLDivElement>(null);
  const capoMenuRef = useRef<HTMLDivElement>(null);
  const importLibraryInputRef = useRef<HTMLInputElement>(null);
  const googleSignInRef = useRef<HTMLDivElement>(null);
  const googleIdentityInitializedRef = useRef(false);
  const editorFocusTimeoutRef = useRef<number | null>(null);
  const editorFocusRequestIdRef = useRef(0);
  const previewDragStateRef = useRef<PreviewDragState | null>(null);
  const previewSuppressClickTimeoutRef = useRef<number | null>(null);
  const suppressPreviewClickRef = useRef(false);
  const [isKeyMenuOpen, setIsKeyMenuOpen] = useState(false);
  const [isCapoMenuOpen, setIsCapoMenuOpen] = useState(false);
  const [previewBaseScale, setPreviewBaseScale] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewViewportWidth, setPreviewViewportWidth] = useState(PREVIEW_TARGET_WIDTH);
  const [previewViewportHeight, setPreviewViewportHeight] = useState(1123);
  const [previewPageHeight, setPreviewPageHeight] = useState(PREVIEW_PAGE_HEIGHT);
  const [sheetMetrics, setSheetMetrics] = useState({ width: PREVIEW_TARGET_WIDTH, height: 1123 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
  const logoSrc = `${import.meta.env.BASE_URL}logo.svg`;
  const copy = getUiCopy(language);
  const { aboutSections, helpSections, changelogEntries } = getLocalizedAppMeta(language);
  const showGoogleAuth = Boolean(googleClientId);
  const song = songs.find((item) => item.id === selectedSongId) ?? songs[0];
  const libraryIsDirty = serializeSongLibrary(songs) !== serializeSongLibrary(savedSongs);
  const isSheetView = activeAppView === 'sheet';
  const isSidebarExpanded = isSidebarPinned || isSidebarHovered;
  const currentSidebarWidth = isSidebarExpanded ? sidebarWidth : COLLAPSED_SIDEBAR_WIDTH;
  const currentSongHistory = songHistories[song?.id || ''] ?? { past: [], future: [] };
  const activeAppViewLabel = activeAppView === 'about' ? copy.about : activeAppView === 'help' ? copy.help : song.title || copy.untitledSong;
  const normalizedLibrarySearchQuery = librarySearchQuery.trim().toLowerCase();
  const currentCapo = song.capo || 0;
  const currentPlayKey = getPlayKey(song.currentKey, currentCapo);
  const duplicateLabel = language === 'zh' ? '副本' : 'Copy';
  const previewScale = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, previewBaseScale * previewZoom));
  const previewSheetWidth = sheetMetrics.width * previewScale;
  const previewSheetHeight = sheetMetrics.height * previewScale;
  const previewCanvasWidth = Math.max(previewSheetWidth, previewViewportWidth);
  const previewFitHeightScale = Math.min(
    PREVIEW_MAX_SCALE,
    Math.max(PREVIEW_MIN_SCALE, previewViewportHeight / Math.max(1, previewPageHeight))
  );
  const previewScalePercent = Math.round((previewScale / previewFitHeightScale) * 100);
  const previewFitWidthScale = Math.min(
    PREVIEW_MAX_SCALE,
    Math.max(PREVIEW_MIN_SCALE, previewViewportWidth / Math.max(1, sheetMetrics.width))
  );
  const filteredSongs = songs.filter((item) => {
    if (!normalizedLibrarySearchQuery) {
      return true;
    }

    const librarySearchText = [
      item.title,
      item.originalKey,
      item.currentKey,
      item.timeSignature,
      typeof item.tempo === 'number' ? String(item.tempo) : '',
      item.lyricist,
      item.composer,
      item.translator,
      ...item.sections.map((section) => section.title)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return librarySearchText.includes(normalizedLibrarySearchQuery);
  });

  const createNewSongTitle = (index: number) => language === 'zh' ? `新歌 ${index}` : `New Song ${index}`;
  const createDefaultSong = (index = 1) => createEmptySong(createNewSongTitle(index));

  useEffect(() => {
    if (!song) {
      setActiveSectionId(null);
      setActiveBar(null);
      return;
    }

    if (activeSectionId && song.sections.some((section) => section.id === activeSectionId)) {
      if (activeBar) {
        const targetSection = song.sections[activeBar.sIdx];
        if (!targetSection?.bars[activeBar.bIdx]) {
          setActiveBar(null);
        }
      }
      return;
    }

    setActiveSectionId(song.sections[0]?.id ?? null);
    setActiveBar(null);
  }, [activeBar, activeSectionId, song]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isSidebarResizing) {
      return;
    }

    const handlePointerMove = (event: MouseEvent) => {
      const nextWidth = Math.max(
        MIN_EXPANDED_SIDEBAR_WIDTH,
        Math.min(MAX_EXPANDED_SIDEBAR_WIDTH, event.clientX)
      );
      setSidebarWidth(nextWidth);
    };

    const handlePointerUp = () => {
      setIsSidebarResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [isSidebarResizing]);

  useEffect(() => {
    if (!isEditing || !activeSectionId) return;

    const scrollRoot = previewRef.current;
    if (!scrollRoot) return;

    const target = scrollRoot.querySelector<HTMLElement>(`[data-preview-section-id="${activeSectionId}"]`);
    if (!target) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const currentTop = scrollRoot.scrollTop;
    const offsetTop = targetRect.top - rootRect.top + currentTop;
    const desiredTop = Math.max(0, offsetTop - Math.min(120, rootRect.height * 0.18));

    if (Math.abs(scrollRoot.scrollTop - desiredTop) < 12) return;

    scrollRoot.scrollTo({
      top: desiredTop,
      behavior: 'smooth'
    });
  }, [activeSectionId, isEditing]);

  const persistSongLibrary = (nextSongs: StoredSong[], nextSelectedSongId: string) => {
    try {
      const savedAt = Date.now();
      window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(nextSongs));
      window.localStorage.setItem(SELECTED_SONG_STORAGE_KEY, nextSelectedSongId);
      window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(savedAt));
      setSavedSongs(cloneSong(nextSongs));
      setLastSavedAt(savedAt);
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  };

  const pushSongHistory = (songId: string, previousSong: Song) => {
    setSongHistories((currentHistory) => {
      const entry = currentHistory[songId] ?? { past: [], future: [] };
      return {
        ...currentHistory,
        [songId]: {
          past: [...entry.past.slice(-29), cloneSong(previousSong)],
          future: []
        }
      };
    });
  };

  const replaceSongInLibrary = (songId: string, nextSong: Song) => {
    setSongs((currentSongs) =>
      currentSongs.map((item) =>
        item.id === songId
          ? {
              ...cloneSong(nextSong),
              id: item.id,
              updatedAt: Date.now()
            }
          : item
      )
    );
  };

  const handleSaveLibrary = () => {
    if (!song) {
      return;
    }

    persistSongLibrary(songs, song.id);
  };

  const handleAppViewChange = (nextView: AppView) => {
    setActiveAppView((currentView) => currentView === nextView ? 'sheet' : nextView);
    setIsKeyMenuOpen(false);
    setIsCapoMenuOpen(false);
  };

  const handleSelectSong = (nextSongId: string) => {
    setActiveAppView('sheet');

    if (nextSongId === selectedSongId) {
      return;
    }

    if (isAutoSaveEnabled && libraryIsDirty) {
      persistSongLibrary(songs, nextSongId);
      setSelectedSongId(nextSongId);
      return;
    }

    if (!libraryIsDirty) {
      setSelectedSongId(nextSongId);
      return;
    }

    const shouldSave = window.confirm(copy.confirmSaveBeforeSwitch);

    if (shouldSave) {
      persistSongLibrary(songs, nextSongId);
      setSelectedSongId(nextSongId);
      return;
    }

    const restoredSongs = cloneSong(savedSongs);
    const restoredSelection = restoredSongs.some((item) => item.id === nextSongId)
      ? nextSongId
      : restoredSongs[0]?.id;

    setSongs(restoredSongs);

    if (restoredSelection) {
      setSelectedSongId(restoredSelection);
    }
  };

  const handleSongChange = (newSong: Song) => {
    if (!song) {
      return;
    }

    let nextSong = newSong;

    if (newSong.originalKey !== song.originalKey && newSong.currentKey === song.currentKey) {
      const keyShift = getTransposeOffset(song.originalKey, newSong.originalKey);
      nextSong = {
        ...newSong,
        currentKey: transposeKey(song.currentKey, keyShift)
      };
    }

    // Detect if sections were reordered
    const oldIds = song.sections.map(s => s.id);
    const newIds = nextSong.sections.map(s => s.id);
    
    if (oldIds.join(',') !== newIds.join(',') && oldIds.length === newIds.length) {
      // Find all IDs that are at different indices
      const movedIds = newIds.filter((id, index) => id !== oldIds[index]);
      
      if (movedIds.length > 0) {
        setHighlightedSectionIds(movedIds);
        setTimeout(() => setHighlightedSectionIds([]), 1500);
      }
    }

    pushSongHistory(song.id, song);
    replaceSongInLibrary(song.id, nextSong);
  };

  React.useEffect(() => {
    const updateScale = () => {
      if (!previewRef.current) {
        return;
      }

      const isMobile = window.innerWidth < 768;
      const padding = isMobile ? 32 : 96;
      const containerWidth = Math.max(220, previewRef.current.offsetWidth - padding - PREVIEW_SAFETY_MARGIN);
      const containerHeight = Math.max(220, previewRef.current.offsetHeight - padding - PREVIEW_SAFETY_MARGIN);
      setPreviewViewportWidth(containerWidth);
      setPreviewViewportHeight(containerHeight);

      if (containerWidth < PREVIEW_TARGET_WIDTH) {
        setPreviewBaseScale(Math.max(PREVIEW_MIN_SCALE, containerWidth / PREVIEW_TARGET_WIDTH));
      } else {
        setPreviewBaseScale(1);
      }
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateScale);
    });

    if (previewRef.current) {
      observer.observe(previewRef.current);
    }

    updateScale();
    return () => observer.disconnect();
  }, [isEditing]);

  React.useEffect(() => {
    const updateSheetMetrics = () => {
      if (!sheetRef.current) {
        return;
      }

      const nextWidth = Math.max(PREVIEW_TARGET_WIDTH, sheetRef.current.scrollWidth || PREVIEW_TARGET_WIDTH);
      const nextHeight = Math.max(1, sheetRef.current.scrollHeight || sheetRef.current.offsetHeight || 1);
      const firstPageHeight = sheetRef.current.querySelector<HTMLElement>('[data-print-page]')?.offsetHeight || PREVIEW_PAGE_HEIGHT;

      setSheetMetrics((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return { width: nextWidth, height: nextHeight };
      });
      setPreviewPageHeight((current) => current === firstPageHeight ? current : firstPageHeight);
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateSheetMetrics);
    });

    if (sheetRef.current) {
      observer.observe(sheetRef.current);
    }

    updateSheetMetrics();
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => () => {
    if (previewSuppressClickTimeoutRef.current !== null) {
      window.clearTimeout(previewSuppressClickTimeoutRef.current);
    }
  }, []);

  React.useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const dragState = previewDragStateRef.current;
      const scrollRoot = previewRef.current;

      if (!dragState || !scrollRoot) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!dragState.moved && Math.hypot(deltaX, deltaY) >= 4) {
        dragState.moved = true;
        setIsPreviewDragging(true);
        document.body.style.userSelect = 'none';
      }

      if (!dragState.moved) {
        return;
      }

      scrollRoot.scrollLeft = dragState.startScrollLeft - deltaX;
      scrollRoot.scrollTop = dragState.startScrollTop - deltaY;
    };

    const handleWindowMouseUp = () => {
      if (!previewDragStateRef.current) {
        return;
      }

      endPreviewDrag();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const handleKeyChange = (newKey: Key) => {
    handleSongChange({ ...song, currentKey: newKey });
  };

  const getKeyOptionMeta = (key: Key) => {
    const rawOffset = getTransposeOffset(song.originalKey, key);
    const normalizedOffset = rawOffset > 6 ? rawOffset - 12 : rawOffset < -6 ? rawOffset + 12 : rawOffset;

    if (normalizedOffset === 0) {
      return copy.original;
    }

    return normalizedOffset > 0 ? `+${normalizedOffset}` : `${normalizedOffset}`;
  };

  const getCapoPlayKeyTextClass = (key: Key) => {
    if (['C', 'D', 'E', 'G', 'A'].includes(key)) {
      return 'text-gray-900';
    }

    if (key.includes('#') || key.includes('b')) {
      return 'text-gray-400';
    }

    return 'text-gray-500';
  };

  const getCapoOptionTextClass = (key: Key) => {
    if (['C', 'D', 'E', 'G', 'A'].includes(key)) {
      return 'text-gray-900';
    }

    if (key.includes('#') || key.includes('b')) {
      return 'text-gray-400';
    }

    return 'text-gray-700';
  };

  const handleTranspose = (steps: number) => {
    handleSongChange({ ...song, currentKey: transposeKeyPreferFlats(song.currentKey, steps) });
  };

  const handleCreateSong = () => {
    const newSong = createDefaultSong(songs.length + 1);
    const nextSongs = [newSong, ...songs];
    setSongs(nextSongs);
    setSelectedSongId(newSong.id);
    setActiveAppView('sheet');
    setIsEditing(true);
  };

  const handleExportSongLibraryJson = () => {
    const payload: ExportedSongLibraryPayload = {
      version: 1,
      exportedAt: Date.now(),
      songs: songs.map(({ updatedAt, ...song }) => ({
        ...cloneSong(song),
        updatedAt
      }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const objectUrl = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = `chordmaster-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.URL.revokeObjectURL(objectUrl);
  };

  const handleImportSongLibraryClick = () => {
    importLibraryInputRef.current?.click();
  };

  const handleImportSongLibrary = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const rawContent = await file.text();
      const parsedContent = JSON.parse(rawContent) as ExportedSongLibraryPayload | Song[];
      const importedSongs = Array.isArray(parsedContent) ? parsedContent : parsedContent.songs;

      if (!Array.isArray(importedSongs) || importedSongs.length === 0) {
        window.alert(copy.importEmptyError);
        return;
      }

      const nextSongs = importedSongs.map((item, index) => {
        const storedLikeItem = item as Partial<StoredSong>;
        return {
          ...cloneSong(normalizeSongBars(item as Song)),
          id: storedLikeItem.id || `song-imported-${Date.now()}-${index + 1}`,
          updatedAt: typeof storedLikeItem.updatedAt === 'number' ? storedLikeItem.updatedAt : Date.now()
        };
      }) as StoredSong[];

      const confirmed = window.confirm(
        language === 'zh'
          ? `要匯入 ${nextSongs.length} 首歌並取代目前的 Song Library 嗎？`
          : `Import ${nextSongs.length} songs and replace the current Song Library?`
      );
      if (!confirmed) {
        return;
      }

      const nextSelectedSongId = nextSongs[0].id;
      setSongs(nextSongs);
      setSelectedSongId(nextSelectedSongId);
      setSongHistories({});
      setSelectedSongIdsForBulkDelete([]);
      setIsLibraryEditing(false);
      persistSongLibrary(nextSongs, nextSelectedSongId);
    } catch {
      window.alert(copy.importInvalidError);
    }
  };

  const handleDuplicateSong = (songId: string) => {
    const targetSong = songs.find((item) => item.id === songId);
    if (!targetSong) {
      return;
    }

    const duplicatedSong = createStoredSong({
      ...cloneSong(targetSong),
      title: buildDuplicateSongTitle(songs, targetSong.title, copy.untitledSong, duplicateLabel)
    });

    setSongs((currentSongs) => {
      const targetIndex = currentSongs.findIndex((item) => item.id === songId);
      if (targetIndex === -1) {
        return [duplicatedSong, ...currentSongs];
      }

      const nextSongs = [...currentSongs];
      nextSongs.splice(targetIndex + 1, 0, duplicatedSong);
      return nextSongs;
    });
    setSongHistories((currentHistory) => ({
      ...currentHistory,
      [duplicatedSong.id]: { past: [], future: [] }
    }));
    setSelectedSongId(duplicatedSong.id);
    setActiveAppView('sheet');
    setIsEditing(true);
  };

  const handleSongListTitleChange = (songId: string, title: string) => {
    const targetSong = songs.find((item) => item.id === songId);
    if (!targetSong || targetSong.title === title) {
      return;
    }

    pushSongHistory(songId, targetSong);
    replaceSongInLibrary(songId, { ...targetSong, title });
  };

  const handleDeleteSong = (songId: string) => {
    const targetSong = songs.find((item) => item.id === songId);
    if (!targetSong) {
      return;
    }

    const confirmed = window.confirm(
      language === 'zh'
        ? `要刪除「${targetSong.title || copy.untitledSong}」嗎？`
        : `Delete "${targetSong.title || copy.untitledSong}"?`
    );
    if (!confirmed) {
      return;
    }

    const remainingSongs = songs.filter((item) => item.id !== songId);

    if (remainingSongs.length === 0) {
      const replacementSong = createDefaultSong(1);
      setSongs([replacementSong]);
      setSelectedSongId(replacementSong.id);
      setSongHistories({});
      setSelectedSongIdsForBulkDelete([]);
      setIsEditing(true);
      return;
    }

    setSongs(remainingSongs);
    setSongHistories((currentHistory) =>
      Object.fromEntries(Object.entries(currentHistory).filter(([id]) => id !== songId))
    );
    setSelectedSongIdsForBulkDelete((currentIds) => currentIds.filter((id) => id !== songId));

    if (selectedSongId === songId) {
      setSelectedSongId(remainingSongs[0].id);
    }
  };

  const handleToggleSongBulkSelection = (songId: string) => {
    setSelectedSongIdsForBulkDelete((currentIds) =>
      currentIds.includes(songId)
        ? currentIds.filter((id) => id !== songId)
        : [...currentIds, songId]
    );
  };

  const handleDeleteSelectedSongs = () => {
    if (selectedSongIdsForBulkDelete.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      language === 'zh'
        ? `要刪除選取的 ${selectedSongIdsForBulkDelete.length} 首歌曲嗎？`
        : `Delete ${selectedSongIdsForBulkDelete.length} selected songs?`
    );
    if (!confirmed) {
      return;
    }

    const selectedIdSet = new Set(selectedSongIdsForBulkDelete);
    const remainingSongs = songs.filter((item) => !selectedIdSet.has(item.id));

    if (remainingSongs.length === 0) {
      const replacementSong = createDefaultSong(1);
      setSongs([replacementSong]);
      setSelectedSongId(replacementSong.id);
      setSongHistories({});
      setSelectedSongIdsForBulkDelete([]);
      setIsEditing(true);
      return;
    }

    setSongs(remainingSongs);
    setSongHistories((currentHistory) =>
      Object.fromEntries(Object.entries(currentHistory).filter(([id]) => !selectedIdSet.has(id)))
    );
    setSelectedSongIdsForBulkDelete([]);

    if (selectedIdSet.has(selectedSongId)) {
      setSelectedSongId(remainingSongs[0].id);
    }
  };

  const handleUndo = () => {
    if (!song || currentSongHistory.past.length === 0) {
      return;
    }

    const previousSong = currentSongHistory.past[currentSongHistory.past.length - 1];
    const newPast = currentSongHistory.past.slice(0, currentSongHistory.past.length - 1);

    setSongHistories((currentHistory) => ({
      ...currentHistory,
      [song.id]: {
        past: newPast,
        future: [cloneSong(song), ...currentSongHistory.future]
      }
    }));

    replaceSongInLibrary(song.id, previousSong);
  };

  const handleRedo = () => {
    if (!song || currentSongHistory.future.length === 0) {
      return;
    }

    const nextSong = currentSongHistory.future[0];
    const newFuture = currentSongHistory.future.slice(1);

    setSongHistories((currentHistory) => ({
      ...currentHistory,
      [song.id]: {
        past: [...currentSongHistory.past, cloneSong(song)],
        future: newFuture
      }
    }));

    replaceSongInLibrary(song.id, nextSong);
  };

  const handleScrollEditorToTop = () => {
    const editorScrollRoot = document.querySelector<HTMLElement>('[data-editor-scroll-root]');
    if (!editorScrollRoot) return;
    editorScrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExportPdf = async () => {
    if (!song || isExportingPdf || !sheetRef.current) {
      return;
    }

    setIsExportingPdf(true);
    const captureHost = document.createElement('div');

    try {
      const previewClone = sheetRef.current.cloneNode(true) as HTMLDivElement;

      captureHost.setAttribute('aria-hidden', 'true');
      captureHost.style.position = 'fixed';
      captureHost.style.top = '0';
      captureHost.style.left = '-10000px';
      captureHost.style.width = '794px';
      captureHost.style.padding = '0';
      captureHost.style.margin = '0';
      captureHost.style.background = '#ffffff';
      captureHost.style.overflow = 'visible';
      captureHost.style.pointerEvents = 'none';
      captureHost.style.zIndex = '-1';

      previewClone.style.transform = 'none';
      previewClone.style.transformOrigin = 'top center';
      previewClone.style.width = '794px';
      previewClone.style.minWidth = '794px';
      previewClone.style.maxWidth = '794px';
      previewClone.style.margin = '0';

      // Export the clean sheet preview, not the transient editing highlight state.
      previewClone.querySelectorAll<HTMLElement>('[data-print-page]').forEach((node) => {
        node.style.boxShadow = 'none';
        node.style.borderColor = 'transparent';
        node.style.outline = 'none';
        node.style.background = '#ffffff';
      });
      previewClone.querySelectorAll<HTMLElement>('[data-preview-section-id]').forEach((node) => {
        node.style.backgroundColor = 'rgba(255, 255, 255, 0)';
        node.style.boxShadow = 'none';
      });
      previewClone.querySelectorAll<HTMLElement>('.sheet-bar').forEach((node) => {
        node.style.backgroundColor = '';
        node.style.boxShadow = 'none';
      });

      captureHost.appendChild(previewClone);
      document.body.appendChild(captureHost);

      try {
        await document.fonts.ready;
      } catch {
        // Continue with a best-effort export if font readiness isn't available.
      }

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });

      const pages = Array.from(captureHost.querySelectorAll('[data-print-page]')) as HTMLElement[];
      if (pages.length === 0) {
        throw new Error('No preview pages found for PDF export.');
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
        compress: true,
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const imageData = await toPng(page, {
          backgroundColor: '#ffffff',
          cacheBust: true,
          pixelRatio: PDF_EXPORT_PIXEL_RATIO,
          skipAutoScale: true,
          width: page.scrollWidth,
          height: page.scrollHeight,
        });

        if (index > 0) {
          pdf.addPage();
        }
        pdf.addImage(imageData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      pdf.save(`${buildPdfFileName(song.title)}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      window.alert(`${copy.pdfExportError} ${errorMessage}`);
    } finally {
      captureHost.remove();
      setIsExportingPdf(false);
    }
  };

  useEffect(() => {
    if (song && song.id !== selectedSongId) {
      setSelectedSongId(song.id);
    }
  }, [selectedSongId, song]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_SAVE_STORAGE_KEY, String(isAutoSaveEnabled));
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [isAutoSaveEnabled]);

  useEffect(() => {
    if (!isAutoSaveEnabled || !song || !libraryIsDirty) {
      return;
    }

    persistSongLibrary(songs, selectedSongId);
  }, [isAutoSaveEnabled, libraryIsDirty, selectedSongId, song, songs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SELECTED_SONG_STORAGE_KEY, selectedSongId);
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [selectedSongId]);

  useEffect(() => {
    setSelectedSongIdsForBulkDelete((currentIds) =>
      currentIds.filter((id) => songs.some((item) => item.id === id))
    );
  }, [songs]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (googleUser) {
      window.localStorage.setItem(GOOGLE_SESSION_STORAGE_KEY, JSON.stringify(googleUser));
      return;
    }

    window.localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
  }, [googleUser]);

  useEffect(() => {
    if (!isLibraryEditing && selectedSongIdsForBulkDelete.length > 0) {
      setSelectedSongIdsForBulkDelete([]);
    }
  }, [isLibraryEditing, selectedSongIdsForBulkDelete.length]);

  useEffect(() => {
    const handleSaveKeyDown = (event: KeyboardEvent) => {
      const isMetaKey = event.ctrlKey || event.metaKey;

      if (isMetaKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSaveLibrary();
      }
    };

    window.addEventListener('keydown', handleSaveKeyDown);
    return () => window.removeEventListener('keydown', handleSaveKeyDown);
  }, [songs, song, selectedSongId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (keyMenuRef.current && !keyMenuRef.current.contains(event.target as Node)) {
        setIsKeyMenuOpen(false);
      }

      if (capoMenuRef.current && !capoMenuRef.current.contains(event.target as Node)) {
        setIsCapoMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (editorFocusTimeoutRef.current !== null) {
        window.clearTimeout(editorFocusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showGoogleAuth) {
      setGoogleAuthError(null);
      return;
    }

    let isCancelled = false;

    const setupGoogleIdentity = async () => {
      try {
        await loadGoogleIdentityScript();

        if (isCancelled || !window.google?.accounts?.id) {
          return;
        }

        if (!googleIdentityInitializedRef.current) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (response) => {
              const nextSession = response.credential ? parseGoogleCredential(response.credential) : null;
              if (!nextSession) {
                setGoogleAuthError(copy.googleCredentialError);
                return;
              }

              setGoogleUser(nextSession);
              setGoogleAuthError(null);
            },
            auto_select: false,
            cancel_on_tap_outside: true
          });
          googleIdentityInitializedRef.current = true;
        }

        if (googleSignInRef.current) {
          googleSignInRef.current.innerHTML = '';

          if (!googleUser) {
            window.google.accounts.id.renderButton(googleSignInRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'medium',
              shape: 'pill',
              text: 'signin_with',
              width: 220
            });
          }
        }

        setGoogleAuthError(null);
      } catch {
        if (!isCancelled) {
          setGoogleAuthError(copy.googleLoadError);
        }
      }
    };

    setupGoogleIdentity();

    return () => {
      isCancelled = true;
    };
  }, [copy.googleCredentialError, copy.googleLoadError, googleClientId, googleUser, showGoogleAuth]);

  const focusEditorField = React.useCallback((sIdx: number, bIdx: number, field: EditorFocusField) => {
    setEditorFocusRequest({
      sIdx,
      bIdx,
      field,
      requestId: editorFocusRequestIdRef.current += 1
    });
  }, []);

  const handleElementClick = React.useCallback((sIdx: number, bIdx: number, field: EditorFocusField) => {
    if (!song) {
      return;
    }

    setActiveSectionId(song.sections[sIdx]?.id ?? null);
    setActiveBar({ sIdx, bIdx });

    if (editorFocusTimeoutRef.current !== null) {
      window.clearTimeout(editorFocusTimeoutRef.current);
      editorFocusTimeoutRef.current = null;
    }

    if (!isEditing) {
      setIsEditing(true);
      editorFocusTimeoutRef.current = window.setTimeout(() => {
        focusEditorField(sIdx, bIdx, field);
        editorFocusTimeoutRef.current = null;
      }, 500);
    } else {
      focusEditorField(sIdx, bIdx, field);
    }
  }, [focusEditorField, isEditing, song]);

  const previewSheet = React.useMemo(() => (
    <ChordSheet 
      song={song} 
      language={language}
      currentKey={song.currentKey} 
      onElementClick={handleElementClick}
      highlightedSectionIds={highlightedSectionIds}
      activeSectionId={isEditing ? activeSectionId : null}
      activeBar={isEditing ? activeBar : null}
    />
  ), [activeBar, activeSectionId, handleElementClick, highlightedSectionIds, isEditing, language, song]);

  const setPreviewScale = (nextScale: number, mode: 'preserve' | 'fit-width' | 'fit-height' = 'preserve') => {
    const clampedScale = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, nextScale));
    const scrollRoot = previewRef.current;

    if (!scrollRoot) {
      setPreviewZoom(clampedScale / previewBaseScale);
      return;
    }

    const widthRatio = previewSheetWidth > scrollRoot.clientWidth
      ? Math.min(1, Math.max(0, (scrollRoot.scrollLeft + scrollRoot.clientWidth / 2) / previewSheetWidth))
      : 0.5;
    const heightRatio = previewSheetHeight > scrollRoot.clientHeight
      ? Math.min(1, Math.max(0, (scrollRoot.scrollTop + scrollRoot.clientHeight / 2) / previewSheetHeight))
      : 0;

    setPreviewZoom(clampedScale / previewBaseScale);

    window.requestAnimationFrame(() => {
      const nextScrollRoot = previewRef.current;
      if (!nextScrollRoot) {
        return;
      }

      const nextWidth = sheetMetrics.width * clampedScale;
      const nextHeight = sheetMetrics.height * clampedScale;
      const nextLeft = mode === 'fit-width' || mode === 'fit-height'
        ? Math.max(0, nextWidth / 2 - nextScrollRoot.clientWidth / 2)
        : Math.max(0, nextWidth * widthRatio - nextScrollRoot.clientWidth / 2);
      const nextTop = mode === 'fit-width' || mode === 'fit-height'
        ? 0
        : Math.max(0, nextHeight * heightRatio - nextScrollRoot.clientHeight / 2);

      nextScrollRoot.scrollTo({
        left: nextLeft,
        top: nextTop,
        behavior: 'auto'
      });
    });
  };

  const handleZoomInPreview = () => {
    setPreviewScale(previewScale + PREVIEW_ZOOM_STEP);
  };

  const handleZoomOutPreview = () => {
    setPreviewScale(previewScale - PREVIEW_ZOOM_STEP);
  };

  const handleResetPreviewZoom = () => {
    const isAtPageFitHeight = Math.abs(previewScale - previewFitHeightScale) < 0.01;

    if (isAtPageFitHeight) {
      setPreviewScale(previewFitWidthScale, 'fit-width');
      return;
    }

    setPreviewScale(previewFitHeightScale, 'fit-height');
  };

  const endPreviewDrag = () => {
    const dragState = previewDragStateRef.current;
    previewDragStateRef.current = null;
    setIsPreviewDragging(false);
    document.body.style.userSelect = '';

    if (dragState?.moved) {
      suppressPreviewClickRef.current = true;
      if (previewSuppressClickTimeoutRef.current !== null) {
        window.clearTimeout(previewSuppressClickTimeoutRef.current);
      }
      previewSuppressClickTimeoutRef.current = window.setTimeout(() => {
        suppressPreviewClickRef.current = false;
        previewSuppressClickTimeoutRef.current = null;
      }, 120);
    }
  };

  const handlePreviewMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !previewRef.current) {
      return;
    }

    previewDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: previewRef.current.scrollLeft,
      startScrollTop: previewRef.current.scrollTop,
      moved: false
    };
  };

  const handlePreviewClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressPreviewClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressPreviewClickRef.current = false;

    if (previewSuppressClickTimeoutRef.current !== null) {
      window.clearTimeout(previewSuppressClickTimeoutRef.current);
      previewSuppressClickTimeoutRef.current = null;
    }
  };

  if (!song) {
    return null;
  }

  const handleSidebarHoverTrigger = (event: React.MouseEvent<HTMLElement>) => {
    if (isSidebarPinned || isSidebarHovered) {
      return;
    }

    const sidebarRect = event.currentTarget.getBoundingClientRect();
    const pointerY = event.clientY - sidebarRect.top;

    if (pointerY <= sidebarRect.height / 3) {
      setIsSidebarHovered(true);
    }
  };

  const handleGoogleSignOut = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }

    setGoogleUser(null);
  };

  const handleSidebarResizeStart = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsSidebarPinned(true);
    setIsSidebarHovered(true);
    setIsSidebarResizing(true);
  };

  return (
    <div
      data-app-root
      className="h-screen flex bg-[#F5F5F4] text-[#1C1917] font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden"
    >
      {/* Navigation Rail / Sidebar */}
      <motion.aside
        data-sidebar
        initial={false}
        animate={{ width: currentSidebarWidth }}
        transition={isSidebarResizing ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.32 }}
        onMouseEnter={handleSidebarHoverTrigger}
        onMouseMove={handleSidebarHoverTrigger}
        onMouseLeave={() => {
          if (!isSidebarPinned) {
            setIsSidebarHovered(false);
          }
        }}
        className="relative flex-shrink-0 bg-white border-r border-gray-200 z-50 overflow-hidden"
      >
        {isSidebarExpanded && (
          <button
            type="button"
            onMouseDown={handleSidebarResizeStart}
            className="absolute right-0 top-1/2 z-50 h-14 w-5 -translate-y-1/2 cursor-col-resize bg-transparent"
            title={copy.resizeSongList}
            aria-label={copy.resizeSongList}
          >
            <span className="absolute right-[2px] top-1/2 h-12 w-[8px] -translate-y-1/2 rounded-full border border-indigo-100 bg-white shadow-sm" />
          </button>
        )}
        <div className="h-full flex">
          <div className="w-20 shrink-0 border-r border-gray-200 flex flex-col items-center py-5 gap-3 bg-white">
            <div className="w-11 h-11 rounded-2xl overflow-hidden shadow-lg shadow-indigo-200 ring-1 ring-indigo-100">
              <img src={logoSrc} alt="ChordMaster" className="h-full w-full object-cover" />
            </div>

            <button
              type="button"
              onClick={() => {
                if (isSidebarPinned) {
                  setIsSidebarPinned(false);
                  setIsSidebarHovered(false);
                } else {
                  setIsSidebarPinned(true);
                  setIsSidebarHovered(true);
                }
              }}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                isSidebarExpanded ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={isSidebarPinned ? copy.collapseSongList : copy.pinSongList}
            >
              {isSidebarExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>

            <button
              type="button"
              onClick={handleCreateSong}
              className="w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100"
              title={copy.newSong}
            >
              <Plus size={18} />
            </button>

            <div className="mt-auto flex w-full flex-col items-center gap-3 px-2">
              <div className="flex flex-col items-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                <span>{copy.songs}</span>
                <div className="min-w-10 rounded-full bg-gray-100 px-2 py-1 text-center text-xs text-gray-700">
                  {songs.length}
                </div>
              </div>
              <div className="flex w-full flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAppViewChange('about')}
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                    activeAppView === 'about'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  title={activeAppView === 'about' ? copy.backToPreview : copy.about}
                  aria-label={activeAppView === 'about' ? copy.backToPreview : copy.about}
                >
                  <Info size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => handleAppViewChange('help')}
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                    activeAppView === 'help'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  title={activeAppView === 'help' ? copy.backToPreview : copy.help}
                  aria-label={activeAppView === 'help' ? copy.backToPreview : copy.help}
                >
                  <BookOpen size={18} />
                </button>
              </div>
            </div>
          </div>

          <motion.div
            initial={false}
            animate={{
              opacity: isSidebarExpanded ? 1 : 0,
              x: isSidebarExpanded ? 0 : -20
            }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="min-w-0 flex-1 flex flex-col"
            style={{ pointerEvents: isSidebarExpanded ? 'auto' : 'none' }}
          >
            <div className="px-5 py-6 border-b border-gray-200">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <img src={logoSrc} alt="ChordMaster" className="h-7 w-7 rounded-lg shadow-sm ring-1 ring-indigo-100" />
                  <div className="text-lg font-bold tracking-tight">ChordMaster</div>
                </div>
                <div className="text-xs font-medium text-gray-500">{copy.songLibrary}</div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateSong}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                >
                  <Plus size={16} />
                  <span>{copy.newSong}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsLibraryEditing(!isLibraryEditing)}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                    isLibraryEditing ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
                  <Edit3 size={16} />
                  <span>{isLibraryEditing ? copy.done : copy.manage}</span>
                </button>
              </div>
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                <Search size={15} className="text-gray-400" />
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(event) => setLibrarySearchQuery(event.target.value)}
                  placeholder={copy.searchSongs}
                  className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportSongLibraryJson}
                  className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download size={15} />
                  <span>{copy.exportJson}</span>
                </button>
                <button
                  type="button"
                  onClick={handleImportSongLibraryClick}
                  className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Upload size={15} />
                  <span>{copy.importJson}</span>
                </button>
                <input
                  ref={importLibraryInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportSongLibrary}
                  className="hidden"
                />
              </div>
              {isLibraryEditing && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedSongs}
                  disabled={selectedSongIdsForBulkDelete.length === 0}
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={16} />
                  <span>{`${copy.deleteSelected} (${selectedSongIdsForBulkDelete.length})`}</span>
                </button>
              )}
            </div>

            <div className="px-3 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                <span>{copy.songs}</span>
                <span>{normalizedLibrarySearchQuery ? `${filteredSongs.length}/${songs.length}` : songs.length}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredSongs.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  {copy.noSongsMatch}
                </div>
              )}
              {filteredSongs.map((item) => {
                const isActive = item.id === song.id;
                const libraryMeta = getSongLibraryMeta(item, copy.editor.shuffle);

                return (
                  <div
                    key={item.id}
                    className={`relative rounded-xl border transition-all ${
                      isActive
                      ? 'border-indigo-200 bg-indigo-50 shadow-sm shadow-indigo-100'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  >
                    {isLibraryEditing ? (
                      <div className="px-3 py-3 pr-14">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedSongIdsForBulkDelete.includes(item.id)}
                            onChange={() => handleToggleSongBulkSelection(item.id)}
                            className="mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className={`mt-0.5 rounded-lg p-2 ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <FileText size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <input
                              value={item.title}
                              onChange={(event) => handleSongListTitleChange(item.id, event.target.value)}
                              className={`w-full rounded-md border px-2 py-1 text-sm font-bold outline-none transition-colors ${
                                isActive
                                  ? 'border-indigo-200 bg-white text-indigo-900 focus:border-indigo-400'
                                  : 'border-gray-200 bg-white text-gray-800 focus:border-gray-400'
                              }`}
                              placeholder={copy.untitledSong}
                            />
                            <div className="mt-1 truncate text-xs text-gray-500" title={libraryMeta.tooltip}>
                              {libraryMeta.primary}
                            </div>
                            {libraryMeta.secondary && (
                              <div className="mt-0.5 truncate text-xs text-gray-500" title={libraryMeta.tooltip}>
                                {libraryMeta.secondary}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectSong(item.id);
                          setIsKeyMenuOpen(false);
                        }}
                        className="w-full px-3 py-3 pr-14 text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 rounded-lg p-2 ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <FileText size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-bold leading-snug whitespace-normal break-words ${isActive ? 'text-indigo-900' : 'text-gray-800'}`}>
                              {item.title || copy.untitledSong}
                            </div>
                            <div className="mt-1 truncate text-xs text-gray-500" title={libraryMeta.tooltip}>
                              {libraryMeta.primary}
                            </div>
                            {libraryMeta.secondary && (
                              <div className="mt-0.5 truncate text-xs text-gray-500" title={libraryMeta.tooltip}>
                                {libraryMeta.secondary}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )}
                    <div className="absolute right-2 top-1/2 flex w-6 -translate-y-1/2 flex-col items-center justify-center gap-0">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDuplicateSong(item.id);
                          setIsKeyMenuOpen(false);
                        }}
                        className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-white hover:text-indigo-600"
                        aria-label={`${copy.duplicate} ${item.title || copy.untitledSong}`}
                        title={`${copy.duplicate} ${item.title || copy.untitledSong}`}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectSong(item.id);
                          setIsEditing(true);
                          setIsKeyMenuOpen(false);
                        }}
                        className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-white hover:text-indigo-600"
                        aria-label={`${copy.edit} ${item.title || copy.untitledSong}`}
                        title={`${copy.edit} ${item.title || copy.untitledSong}`}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteSong(item.id);
                        }}
                        className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-white hover:text-rose-600"
                        aria-label={`${copy.delete} ${item.title || copy.untitledSong}`}
                        title={`${copy.delete} ${item.title || copy.untitledSong}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-200 px-5 py-4">
              <div className={`text-xs font-medium ${libraryIsDirty ? 'text-amber-600' : 'text-gray-500'}`}>
                {libraryIsDirty ? copy.unsavedChanges : formatSavedAt(lastSavedAt, language)}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {isAutoSaveEnabled
                  ? copy.autoSavedHint
                  : copy.manualSaveHint}
              </div>
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                v{APP_VERSION}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main data-main-panel className="flex-1 flex flex-col min-w-0">
        <div className="flex-shrink-0 border-b border-amber-200 bg-amber-50 px-8 py-2.5">
          <p className="text-sm font-medium text-amber-800">
            {copy.testVersionWarning}
          </p>
        </div>

        {/* Top Control Bar */}
        <header data-topbar className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-8 py-4 flex justify-between items-center z-40 flex-shrink-0">
            <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2">
              <img src={logoSrc} alt="ChordMaster" className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-indigo-100" />
              <h2 className="font-display text-lg font-bold tracking-tight">{APP_NAME}</h2>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-500">
                v{APP_VERSION}
              </span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-sm font-medium text-gray-500 truncate">{activeAppViewLabel}</span>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setLanguage('zh')}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                    language === 'zh' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  中文
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                    language === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
            {isSheetView ? (
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {showGoogleAuth && googleUser ? (
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5 shadow-sm">
                  {googleUser.picture ? (
                    <img
                      src={googleUser.picture}
                      alt={googleUser.name}
                      className="h-8 w-8 rounded-full border border-gray-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {googleUser.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 text-left">
                    <div className="max-w-[180px] truncate text-sm font-bold text-gray-800">{googleUser.name}</div>
                    <div className="max-w-[180px] truncate text-[11px] text-gray-500">{googleUser.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleSignOut}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    title={copy.signOut}
                    aria-label={copy.signOut}
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              ) : showGoogleAuth ? (
                <div className="flex flex-col items-end gap-1">
                  <div ref={googleSignInRef} className="flex min-h-10 min-w-[220px] items-center justify-end" />
                  {googleAuthError && (
                    <div className="text-[11px] font-medium text-amber-600">{googleAuthError}</div>
                  )}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${
                  isEditing
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Edit3 size={16} />
                <span>{isEditing ? copy.closeEditor : copy.openEditor}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAutoSaveEnabled((current) => !current)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all shadow-sm border ${
                  isAutoSaveEnabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span>{copy.autoSave}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isAutoSaveEnabled ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {isAutoSaveEnabled ? copy.on : copy.off}
                </span>
              </button>

              <div ref={keyMenuRef} className="relative flex items-center bg-gray-100 rounded-lg p-1">
              <button 
                onClick={() => handleTranspose(-1)}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-600"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setIsKeyMenuOpen((open) => !open)}
                className="min-w-[92px] bg-transparent text-sm font-bold px-2 py-1.5 rounded-md hover:bg-white hover:shadow-sm transition-all text-gray-700"
              >
                <span className="flex items-center justify-between gap-1.5">
                  <span>{song.currentKey}</span>
                  <span className={`${song.currentKey === song.originalKey ? 'text-[10px] text-indigo-500' : 'text-xs text-gray-500'}`}>
                    {getKeyOptionMeta(song.currentKey)}
                  </span>
                </span>
              </button>
              <button 
                onClick={() => handleTranspose(1)}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-600"
              >
                <ChevronRight size={16} />
              </button>
                {isKeyMenuOpen && (
                  <div className="absolute top-full left-1/2 z-50 mt-2 w-[184px] -translate-x-1/2 rounded-[20px] border border-gray-200 bg-white p-2.5 shadow-xl">
                    <div className="mb-2 flex items-center justify-between px-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.key}</div>
                    <div className={`text-[10px] font-bold ${song.currentKey === song.originalKey ? 'text-indigo-500' : 'text-gray-500'}`}>
                      {getKeyOptionMeta(song.currentKey)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {KEY_MENU_LAYOUT.flatMap((row, rowIndex) =>
                      row.map((key, columnIndex) => {
                        if (!key) {
                          return <div key={`empty-${rowIndex}-${columnIndex}`} className="h-[42px]" />;
                        }

                        const isSelectedKey = song.currentKey === key;
                        const isOriginalKey = song.originalKey === key;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              handleKeyChange(key);
                              setIsKeyMenuOpen(false);
                            }}
                            className={`relative flex h-[42px] items-center justify-center rounded-[12px] border text-[14px] font-semibold tracking-tight transition-all ${
                              isSelectedKey
                                ? isOriginalKey
                                  ? 'border-indigo-400 bg-indigo-100 text-indigo-800 shadow-sm shadow-indigo-100'
                                  : 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100'
                                : isOriginalKey
                                  ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:border-fuchsia-300 hover:bg-fuchsia-100'
                                  : 'border-gray-200 bg-white text-gray-800 hover:border-indigo-200 hover:bg-gray-50'
                            }`}
                          >
                            {isOriginalKey && (
                              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                            )}
                            {key}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
              </div>

              <div ref={capoMenuRef} className="relative flex items-center rounded-lg bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setIsCapoMenuOpen((open) => !open)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-bold text-gray-700 transition-all hover:bg-white hover:shadow-sm"
                >
                  <span className={getCapoOptionTextClass(currentPlayKey)}>Capo {currentCapo}</span>
                  <span className={`text-sm font-semibold ${getCapoPlayKeyTextClass(currentPlayKey)}`}>
                    ({currentPlayKey})
                  </span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${isCapoMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isCapoMenuOpen && (
                  <div className="absolute top-full right-0 z-50 mt-2 w-[132px] overflow-hidden rounded-[20px] border border-gray-200 bg-white p-2 shadow-xl">
                    <div className="mb-2 px-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                      Capo
                    </div>
                    <div className="space-y-0.5">
                      {Array.from({ length: 12 }).map((_, i) => {
                        const playKey = getPlayKey(song.currentKey, i);
                        const isSelected = currentCapo === i;
                        const optionTextClass = getCapoOptionTextClass(playKey);
                        const optionPlayKeyClass = getCapoPlayKeyTextClass(playKey);

                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              handleSongChange({ ...song, capo: i });
                              setIsCapoMenuOpen(false);
                            }}
                            className={`flex w-full items-center rounded-xl px-2 py-1.5 text-left transition-colors ${
                              isSelected
                                ? playKey.includes('#') || playKey.includes('b')
                                  ? 'bg-slate-100'
                                  : ['C', 'D', 'E', 'G', 'A'].includes(playKey)
                                    ? 'bg-indigo-50'
                                    : 'bg-gray-100'
                                : 'hover:bg-gray-50'
                              }`}
                          >
                            <span className={`inline-flex min-w-[1.15em] justify-end text-[13px] font-bold ${isSelected && !(playKey.includes('#') || playKey.includes('b')) && ['C', 'D', 'E', 'G', 'A'].includes(playKey) ? 'text-indigo-700' : optionTextClass}`}>
                              {i}
                            </span>
                            <span className={`ml-1.5 text-[13px] font-semibold ${isSelected && !(playKey.includes('#') || playKey.includes('b')) && ['C', 'D', 'E', 'G', 'A'].includes(playKey) ? 'text-indigo-700' : optionPlayKeyClass}`}>
                              ({playKey})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                  song.showNashvilleNumbers 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <Hash size={14} />
                <span>123</span>
              </button>

              <button
                type="button"
                onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                  song.showAbsoluteJianpu
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <Music2 size={14} />
                <span>1=C</span>
              </button>

              <button
                type="button"
                onClick={handleSaveLibrary}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${
                  libraryIsDirty
                    ? 'bg-amber-500 text-white border border-amber-500 hover:bg-amber-400'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Save size={16} />
                <span>{libraryIsDirty ? copy.saveChanges : copy.saved}</span>
              </button>
              
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md shadow-gray-200 ${
                  isExportingPdf
                    ? 'bg-gray-400 text-white cursor-wait'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                <Save size={16} />
                <span>{isExportingPdf ? copy.preparingPdf : copy.exportPdf}</span>
              </button>
            </div>
            ) : (
            <div className="text-right">
              <div className="text-sm font-bold text-gray-700">
                {activeAppView === 'about'
                  ? (language === 'zh' ? '關於 ChordMaster' : 'About ChordMaster')
                  : (language === 'zh' ? '使用說明' : 'Help')}
              </div>
              <div className="text-[11px] font-medium text-gray-400">
                {copy.version} {APP_VERSION}
              </div>
            </div>
            )}
            <p className="text-[11px] font-medium text-gray-400">
              {isSheetView ? copy.previewHint : copy.infoHint}
            </p>
          </div>
        </header>

        {/* Content Area - Split View */}
        {isSheetView ? (
        <div data-content-area className="flex-1 flex overflow-hidden relative">
          {/* Editor Pane */}
          <AnimatePresence initial={false}>
            {isEditing && (
              <motion.div 
                data-editor-pane
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: '50%', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                className="relative border-r border-gray-200 bg-white overflow-hidden flex-shrink-0 shadow-xl z-10"
              >
                <div data-editor-scroll-root className="h-full overflow-y-auto">
                  <div className="p-6 md:p-8 pb-24 min-w-[450px]">
                    <SongEditor
                      key={song.id}
                      song={song}
                      language={language}
                      history={currentSongHistory}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      onChange={handleSongChange}
                      activeSectionId={activeSectionId}
                      onActiveSectionChange={setActiveSectionId}
                      activeBar={activeBar}
                      onActiveBarChange={setActiveBar}
                      focusRequest={editorFocusRequest}
                      onFocusRequestHandled={(requestId) => {
                        setEditorFocusRequest(current => current?.requestId === requestId ? null : current);
                      }}
                    />
                  </div>
                </div>
                <div className="absolute left-6 bottom-6 z-40 pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 px-2 py-2 shadow-lg backdrop-blur-sm">
                    <button
                      onClick={handleScrollEditorToTop}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                      title={copy.backToTop}
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button
                      onClick={handleUndo}
                      disabled={currentSongHistory.past.length === 0}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:border-gray-200 transition-all shadow-sm"
                      title={copy.undo}
                    >
                      <Undo2 size={18} />
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={currentSongHistory.future.length === 0}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:border-gray-200 transition-all shadow-sm"
                      title={copy.redo}
                    >
                      <Redo2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sheet Preview Pane */}
          <div className="relative flex-1 min-w-0 bg-[#F5F5F4]">
            <div
              ref={previewRef}
              data-print-preview-container
              onMouseDown={handlePreviewMouseDown}
              onClickCapture={handlePreviewClickCapture}
              className={`h-full overflow-auto p-4 md:p-12 ${isPreviewDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            >
              <div
                className="relative flex min-h-full min-w-full items-start justify-center"
                style={{
                  width: `${previewCanvasWidth}px`,
                  height: `${previewSheetHeight}px`
                }}
              >
                <div
                  ref={sheetRef}
                  data-print-preview
                  style={{ 
                    transform: `scale(${previewScale})`, 
                    transformOrigin: 'top center',
                    width: `${sheetMetrics.width}px`,
                    minWidth: `${sheetMetrics.width}px`,
                    willChange: 'transform',
                    transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                    marginLeft: 'auto',
                    marginRight: 'auto'
                  }}
                  className="select-none"
                >
                  {previewSheet}
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute right-4 top-4 z-40 md:right-6 md:top-6">
              <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-gray-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handleZoomOutPreview}
                  disabled={previewScale <= PREVIEW_MIN_SCALE + 0.001}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                  title={copy.zoomOutPreview}
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={handleResetPreviewZoom}
                  className="inline-flex min-w-[4.25rem] items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  title={copy.resetPreviewZoom}
                >
                  {previewScalePercent}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomInPreview}
                  disabled={previewScale >= PREVIEW_MAX_SCALE - 0.001}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                  title={copy.zoomInPreview}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : (
        <div data-content-area className="flex-1 overflow-y-auto bg-[#F5F5F4] px-5 py-6 md:px-8 md:py-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <section className="rounded-[28px] border border-gray-200 bg-white px-6 py-7 shadow-sm md:px-8 md:py-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-500">
                    {activeAppView === 'about' ? copy.about : copy.help}
                  </div>
                  <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-gray-900">
                    {activeAppView === 'about'
                      ? (language === 'zh' ? 'ChordMaster 關於頁' : 'ChordMaster About')
                      : (language === 'zh' ? 'ChordMaster 使用說明' : 'ChordMaster Help')}
                  </h1>
                  <p className="mt-3 text-sm leading-7 text-gray-600">
                    {activeAppView === 'about'
                      ? (language === 'zh'
                        ? '這裡集中放目前版本、產品定位與近期更新。之後每次加新功能，只要更新專案版本號，介面會同步顯示。'
                        : 'This page centralizes the current version, product framing, and recent changes. Future features only need a version bump to stay reflected in the UI.')
                      : (language === 'zh'
                        ? '這裡放目前最重要的操作方式，方便你快速回顧編輯流程、快速鍵與備份方法。'
                        : 'This page summarizes the most important operating flow so you can quickly review editing, shortcuts, and backup habits.')}
                  </p>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-right">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">{copy.currentVersion}</div>
                  <div className="mt-1 text-2xl font-bold text-indigo-900">v{APP_VERSION}</div>
                </div>
              </div>
            </section>

            {(activeAppView === 'about' ? aboutSections : helpSections).map((section) => (
              <section
                key={section.title}
                className="rounded-[24px] border border-gray-200 bg-white px-6 py-6 shadow-sm md:px-7"
              >
                <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900">{section.title}</h2>
                <p className="mt-2 text-sm leading-7 text-gray-600">{section.description}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-1">
                  {section.bullets.map((bullet) => (
                    <div
                      key={bullet}
                      className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm leading-7 text-gray-700"
                    >
                      {bullet}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {activeAppView === 'help' && (
              <section className="rounded-[24px] border border-gray-200 bg-white px-6 py-6 shadow-sm md:px-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="max-w-2xl">
                    <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900">{copy.github}</h2>
                    <p className="mt-2 text-sm leading-7 text-gray-600">
                      {language === 'zh'
                        ? '如果你想看原始碼、追蹤更新，或之後要整理 release note，這裡可以直接跳到 GitHub repository。'
                        : 'Use this link to inspect the source, track updates, or review release notes in the GitHub repository.'}
                    </p>
                  </div>
                  <a
                    href={APP_GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <span>{copy.openGithub}</span>
                    <ExternalLink size={16} />
                  </a>
                </div>
                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  {APP_GITHUB_URL}
                </div>
              </section>
            )}

            {activeAppView === 'about' && (
              <section className="rounded-[24px] border border-gray-200 bg-white px-6 py-6 shadow-sm md:px-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900">{copy.changelog}</h2>
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
                    {copy.bumpVersionHint}
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {changelogEntries.map((entry) => (
                    <div key={`${entry.version}-${entry.title}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-600 shadow-sm">
                          v{entry.version}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">{entry.date}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-bold text-gray-900">{entry.title}</h3>
                      <div className="mt-3 grid gap-3">
                        {entry.bullets.map((bullet) => (
                          <div key={bullet} className="rounded-xl bg-white px-4 py-3 text-sm leading-7 text-gray-700">
                            {bullet}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
