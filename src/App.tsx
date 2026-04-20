/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { toPng, toCanvas, getFontEmbedCSS } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Song, Key, AppLanguage, JoinedSetlist, Setlist, SetlistSong, SetlistDisplayMode, StoredSong } from './types';
import { ALL_KEYS, getPlayKey, getTransposeOffset, transposeKey, transposeKeyPreferFlats } from './utils/musicUtils';
import { normalizeBarChords } from './utils/barUtils';
import { DEFAULT_CHORD_FONT_PRESET } from './constants/chordFonts';
import { DEFAULT_NASHVILLE_FONT_PRESET } from './constants/nashvilleFonts';
import { APP_NAME, APP_VERSION, APP_GITHUB_URL, getLocalizedAppMeta } from './constants/appMeta';
import { getUiCopy } from './constants/i18n';
import ChordSheet from './components/ChordSheet';
import LyricsEditor from './components/LyricsEditor';
import SongEditor from './components/SongEditor';
import KeyPicker from './components/KeyPicker';
import CapoPicker from './components/CapoPicker';
import SongMetadataPanel from './components/SongMetadataPanel';
import { applySetlistSongOverrides, getDefaultSectionOrder } from './utils/setlistUtils';
import { Edit3, ChevronRight, ChevronLeft, ChevronUp, Save, Hash, Music2, Plus, FileText, Trash2, Undo2, Redo2, Search, Copy, LogOut, Upload, Download, Info, BookOpen, ExternalLink, ListMusic, GripVertical, MoreHorizontal, Share2, Cloud, CloudOff, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSupabaseAuth } from './lib/auth';
import { createCloudRepository } from './lib/repository';
import { loadPendingSync, markMigrationCompleted, hasCompletedMigration, savePendingSync } from './lib/workspace';
import { syncWorkspaceDiff } from './lib/sync';
import { hasSupabaseConfig } from './lib/supabase';

const SONG_LIBRARY_STORAGE_KEY = 'chordmaster.song-library.v1';
const SETLIST_STORAGE_KEY = 'chordmaster.setlists.v1';
const SELECTED_SONG_STORAGE_KEY = 'chordmaster.selected-song-id.v1';
const SELECTED_SETLIST_STORAGE_KEY = 'chordmaster.selected-setlist-id.v1';
const SELECTED_SETLIST_SONG_STORAGE_KEY = 'chordmaster.selected-setlist-song-id.v1';
const WORKSPACE_MODE_STORAGE_KEY = 'chordmaster.workspace-mode.v1';
const LAST_SAVED_AT_STORAGE_KEY = 'chordmaster.last-saved-at.v1';
const AUTO_SAVE_STORAGE_KEY = 'chordmaster.auto-save.v1';
const GOOGLE_SESSION_STORAGE_KEY = 'chordmaster.google-session.v1';
const SIDEBAR_WIDTH_STORAGE_KEY = 'chordmaster.sidebar-width.v1';
const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services-script';
const COLLAPSED_SIDEBAR_WIDTH = 80;
const DEFAULT_EXPANDED_SIDEBAR_WIDTH = 420;
const MIN_EXPANDED_SIDEBAR_WIDTH = 360;
const MAX_EXPANDED_SIDEBAR_WIDTH = 640;
const PHONE_VIEWPORT_BREAKPOINT = 640;
const SIDEBAR_OVERLAY_BREAKPOINT = 1280;
const SPLIT_EDITOR_BREAKPOINT = 1360;
const PREVIEW_TARGET_WIDTH = 794;
const PREVIEW_MIN_SCALE = 0.35;
const PREVIEW_MAX_SCALE = 2.4;
const PREVIEW_ZOOM_STEP = 0.15;
const PREVIEW_SAFETY_MARGIN = 20;
const PREVIEW_PAGE_HEIGHT = 1123;
const PDF_EXPORT_PIXEL_RATIO = 5;
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
const VALID_SETLIST_DISPLAY_MODES = new Set([
  'nashville-number-system',
  'chord-fixed-key',
  'chord-movable-key'
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

type WorkspaceMode = 'songs' | 'setlists';
type MobileSetlistDrawerView = 'list' | 'detail' | 'addSongs';

interface PdfExportProgressState {
  totalPages: number;
  completedPages: number;
  currentPage: number;
  songIndex: number;
  totalSongs: number;
  songTitle: string;
  sectionIndex: number | null;
  sectionTitle: string | null;
  pageInSong: number;
  totalPagesInSong: number;
  cancelRequested: boolean;
}

interface ExportPageDescriptor {
  element: HTMLElement;
  songIndex: number;
  totalSongs: number;
  songTitle: string;
  sectionIndex: number | null;
  sectionTitle: string | null;
  pageInSong: number;
  totalPagesInSong: number;
}

class PdfExportCancelledError extends Error {
  constructor() {
    super('PDF export cancelled.');
    this.name = 'PdfExportCancelledError';
  }
}

const sanitizeFileNamePart = (value: string) => (
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
);

const buildPdfFileName = (song: Song) => {
  const title = sanitizeFileNamePart(song.title) || 'ChordMaster';
  const keyPart = `Key${song.currentKey}`;
  const capoValue = song.capo || 0;
  const chartType = song.showNashvilleNumbers ? 'NUM' : 'CH';
  const doModePart = song.showAbsoluteJianpu ? '固定調' : '首調';
  const nameParts = [
    title,
    keyPart,
    ...(capoValue > 0 ? [`Capo${capoValue}`] : []),
    chartType,
    doModePart,
    ...(song.showLyrics ? ['歌詞'] : [])
  ];

  return nameParts.join('_');
};

const getSetlistPdfDisplayModeLabel = (displayMode: SetlistDisplayMode) => {
  switch (displayMode) {
    case 'nashville-number-system':
      return '級數';
    case 'chord-fixed-key':
      return '固定調';
    case 'chord-movable-key':
    default:
      return '首調';
  }
};

const buildSetlistPdfFileName = (setlist: Setlist) => {
  const title = sanitizeFileNamePart(setlist.name) || 'Service Setlist';
  const displayModeLabel = getSetlistPdfDisplayModeLabel(setlist.displayMode);
  const nameParts = [
    title,
    displayModeLabel,
    ...(setlist.showLyrics ? ['歌詞'] : [])
  ];

  return nameParts.join('_');
};

const buildShareUrl = (token: string) => (
  new URL(`${import.meta.env.BASE_URL}share/${token}`.replace(/\/{2,}/g, '/'), window.location.origin).toString()
);

const isShareAuthErrorMessage = (message: string) => (
  /sign in again|unauthorized|jwt|auth/i.test(message)
);

const copyShareUrlToClipboard = async (shareUrl: string) => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(shareUrl);
    return true;
  } catch {
    return false;
  }
};

const waitForPaint = async () => {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

const parsePositiveIntegerAttribute = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.round(numericValue);
};

const getSongVersionSummary = (song: Song) => (
  Array.from(new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))).join(' / ')
);

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
  showLyrics: false,
  tempo: 74,
  timeSignature: "4/4",
  barNumberMode: 'none',
  nashvilleFontPreset: DEFAULT_NASHVILLE_FONT_PRESET,
  chordFontPreset: DEFAULT_CHORD_FONT_PRESET,
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

interface SongHistoryState {
  past: Song[];
  future: Song[];
}

type AppView = 'sheet' | 'about' | 'help';
type EditorFocusField = 'chords' | 'riff' | 'label' | 'annotation' | 'rhythm' | 'lyrics';

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

const cloneSong = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const createSongId = () => crypto.randomUUID();
const createSetlistId = () => crypto.randomUUID();
const createSetlistSongId = () => crypto.randomUUID();

const reindexSetlistSongs = (setlistSongs: SetlistSong[]) => setlistSongs.map((item, index) => ({
  ...item,
  order: index
}));

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

const createStoredSong = (song: Song, id = createSongId()): StoredSong => ({
  ...cloneSong(normalizeSongBars(song)),
  id,
  updatedAt: Date.now()
});

const createStoredSetlistSong = (songId: string, setlistId: string, baseSong?: Song): SetlistSong => ({
  id: createSetlistSongId(),
  setlistId,
  songId,
  order: 0,
  overrideKey: baseSong?.currentKey,
  capo: baseSong?.capo ?? 0,
  sectionOrder: baseSong ? getDefaultSectionOrder(baseSong) : []
});

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
  typeof value === 'string' && VALID_SETLIST_DISPLAY_MODES.has(value)
    ? value as SetlistDisplayMode
    : 'chord-movable-key'
);

const normalizeSetlistSong = (setlistId: string, setlistSong: Partial<SetlistSong> & Record<string, unknown>, songsById: Map<string, StoredSong>, index: number): SetlistSong => {
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
    id: typeof setlistSong.id === 'string' && setlistSong.id.trim() ? setlistSong.id : createSetlistSongId(),
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

const normalizeStoredSetlist = (setlist: Partial<Setlist> & Record<string, unknown>, songsById: Map<string, StoredSong>, index: number): Setlist => {
  const setlistId = typeof setlist.id === 'string' && setlist.id.trim() ? setlist.id : createSetlistId();
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
    showLyrics: false,
    tempo: 120,
    timeSignature: '4/4',
    barNumberMode: 'none',
    nashvilleFontPreset: DEFAULT_NASHVILLE_FONT_PRESET,
    chordFontPreset: DEFAULT_CHORD_FONT_PRESET,
    sections: [
      {
        id: 's1',
        title: 'Verse',
        bars: [{ chords: [] }, { chords: [] }, { chords: [] }, { chords: [] }]
      }
    ]
  });

const getDefaultLibrary = () => {
  const defaultSong = createStoredSong(INITIAL_SONG, createSongId());
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

const loadSetlists = (songs: StoredSong[]) => {
  if (typeof window === 'undefined') {
    return {
      setlists: [] as Setlist[],
      selectedSetlistId: null as string | null,
      selectedSetlistSongId: null as string | null
    };
  }

  try {
    const storedSetlists = window.localStorage.getItem(SETLIST_STORAGE_KEY);
    const storedSelectedSetlistId = window.localStorage.getItem(SELECTED_SETLIST_STORAGE_KEY);
    const storedSelectedSetlistSongId = window.localStorage.getItem(SELECTED_SETLIST_SONG_STORAGE_KEY);

    if (!storedSetlists) {
      return {
        setlists: [] as Setlist[],
        selectedSetlistId: null as string | null,
        selectedSetlistSongId: null as string | null
      };
    }

    const parsedSetlists = JSON.parse(storedSetlists) as Array<Partial<Setlist> & Record<string, unknown>>;
    if (!Array.isArray(parsedSetlists)) {
      return {
        setlists: [] as Setlist[],
        selectedSetlistId: null as string | null,
        selectedSetlistSongId: null as string | null
      };
    }

    const songsById = new Map(songs.map((song) => [song.id, song] as const));
    const setlists = parsedSetlists.map((setlist, index) => normalizeStoredSetlist(setlist, songsById, index));
    const selectedSetlist = setlists.find((setlist) => setlist.id === storedSelectedSetlistId) ?? setlists[0] ?? null;
    const selectedSetlistSongId = selectedSetlist?.songs.some((item) => item.id === storedSelectedSetlistSongId)
      ? storedSelectedSetlistSongId
      : selectedSetlist?.songs[0]?.id ?? null;

    return {
      setlists,
      selectedSetlistId: selectedSetlist?.id ?? null,
      selectedSetlistSongId
    };
  } catch {
    return {
      setlists: [] as Setlist[],
      selectedSetlistId: null as string | null,
      selectedSetlistSongId: null as string | null
    };
  }
};

const loadWorkspaceMode = (): WorkspaceMode => {
  if (typeof window === 'undefined') {
    return 'songs';
  }

  return window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY) === 'setlists' ? 'setlists' : 'songs';
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

const serializeSetlists = (setlists: Setlist[]) =>
  JSON.stringify(
    setlists.map((setlist) => ({
      ...setlist,
      songs: reindexSetlistSongs(setlist.songs)
    }))
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
  const {
    user: authenticatedUser,
    session,
    status: authStatus,
    isConfigured: isAuthConfigured,
    signInWithGoogle,
    signOut
  } = useSupabaseAuth();
  const [activeBar, setActiveBar] = useState<{ sIdx: number; bIdx: number } | null>(null);
  const [language, setLanguage] = useState<AppLanguage>('zh');
  const initialLibraryRef = useRef(loadSongLibrary());
  const initialSetlistsRef = useRef(loadSetlists(initialLibraryRef.current.songs));
  const [songs, setSongs] = useState<StoredSong[]>(initialLibraryRef.current.songs);
  const [savedSongs, setSavedSongs] = useState<StoredSong[]>(cloneSong(initialLibraryRef.current.songs));
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(loadWorkspaceMode);
  const [selectedSongId, setSelectedSongId] = useState(initialLibraryRef.current.selectedSongId);
  const [setlists, setSetlists] = useState<Setlist[]>(initialSetlistsRef.current.setlists);
  const [savedSetlists, setSavedSetlists] = useState<Setlist[]>(cloneSong(initialSetlistsRef.current.setlists));
  const [joinedSetlists, setJoinedSetlists] = useState<JoinedSetlist[]>([]);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(initialSetlistsRef.current.selectedSetlistId);
  const [selectedSetlistSongId, setSelectedSetlistSongId] = useState<string | null>(initialSetlistsRef.current.selectedSetlistSongId);
  const [songHistories, setSongHistories] = useState<Record<string, SongHistoryState>>({});
  const [setlistSongHistories, setSetlistSongHistories] = useState<Record<string, SongHistoryState>>({});
  const [selectedSongIdsForBulkDelete, setSelectedSongIdsForBulkDelete] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isLyricsMode, setIsLyricsMode] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportProgress, setPdfExportProgress] = useState<PdfExportProgressState | null>(null);
  const [isLibraryEditing, setIsLibraryEditing] = useState(false);
  const [activeAppView, setActiveAppView] = useState<AppView>('sheet');
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(loadAutoSavePreference);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(initialLibraryRef.current.lastSavedAt);
  const [highlightedSectionIds, setHighlightedSectionIds] = useState<string[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState<EditorFocusRequest | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? SPLIT_EDITOR_BREAKPOINT : window.innerWidth
  ));
  const [viewportHeight, setViewportHeight] = useState(() => (
    typeof window === 'undefined' ? 800 : window.innerHeight
  ));
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [performancePageIndex, setPerformancePageIndex] = useState(0);
  const [performanceTotalPages, setPerformanceTotalPages] = useState(1);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidthPreference);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [setlistSearchQuery, setSetlistSearchQuery] = useState('');
  const [setlistSongSearchQuery, setSetlistSongSearchQuery] = useState('');
  const [isSetlistAddSongsOpen, setIsSetlistAddSongsOpen] = useState(false);
  const [isSetlistActionsMenuOpen, setIsSetlistActionsMenuOpen] = useState(false);
  const [isToolbarOverflowMenuOpen, setIsToolbarOverflowMenuOpen] = useState(false);
  const [isGoogleAccountMenuOpen, setIsGoogleAccountMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobileActionsSheetOpen, setIsMobileActionsSheetOpen] = useState(false);
  const [isMobileMetadataOpen, setIsMobileMetadataOpen] = useState(false);
  const [mobileSetlistDrawerView, setMobileSetlistDrawerView] = useState<MobileSetlistDrawerView>('list');
  const [mobileSwipeOpenSetlistId, setMobileSwipeOpenSetlistId] = useState<string | null>(null);
  const [draggingSetlistSongId, setDraggingSetlistSongId] = useState<string | null>(null);
  const [dragOverSetlistSongId, setDragOverSetlistSongId] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUserSession | null>(loadGoogleSession);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [authUiError, setAuthUiError] = useState<string | null>(null);
  const [authUiMessage, setAuthUiMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'syncing' | 'offline' | 'failed'>('saved');
  const [isLoadingCloudWorkspace, setIsLoadingCloudWorkspace] = useState(false);
  const [isImportPromptOpen, setIsImportPromptOpen] = useState(false);
  const [isImportingLocalWorkspace, setIsImportingLocalWorkspace] = useState(false);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const setlistActionsMenuRef = useRef<HTMLDivElement>(null);
  const toolbarOverflowMenuRef = useRef<HTMLDivElement>(null);
  const googleAccountMenuRef = useRef<HTMLDivElement>(null);
  const importLibraryInputRef = useRef<HTMLInputElement>(null);
  const googleSignInRef = useRef<HTMLDivElement>(null);
  const googleIdentityInitializedRef = useRef(false);
  const mobileSetlistSwipeRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const mobileSetlistSwipeHandledRef = useRef(false);
  const mobileLongPressRef = useRef<{ kind: 'song' | 'setlist'; id: string; x: number; y: number } | null>(null);
  const mobileLongPressTimerRef = useRef<number | null>(null);
  const mobileLongPressTriggeredRef = useRef(false);
  const editorFocusTimeoutRef = useRef<number | null>(null);
  const editorFocusRequestIdRef = useRef(0);
  const previewDragStateRef = useRef<PreviewDragState | null>(null);
  const previewSuppressClickTimeoutRef = useRef<number | null>(null);
  const pdfExportCancelRequestedRef = useRef(false);
  const suppressPreviewClickRef = useRef(false);
  const performanceSheetRef = useRef<HTMLDivElement>(null);
  const performanceTranslatorRef = useRef<HTMLDivElement>(null);
  const performancePageIndexRef = useRef(0);
  const performancePageOffsetsRef = useRef<number[]>([]);
  const performanceTouchRef = useRef<{ x: number; y: number } | null>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const cloudRepositoryRef = useRef<ReturnType<typeof createCloudRepository> | null>(null);
  const [previewBaseScale, setPreviewBaseScale] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewViewportWidth, setPreviewViewportWidth] = useState(PREVIEW_TARGET_WIDTH);
  const [previewViewportHeight, setPreviewViewportHeight] = useState(1123);
  const [previewPageHeight, setPreviewPageHeight] = useState(PREVIEW_PAGE_HEIGHT);
  const [sheetMetrics, setSheetMetrics] = useState({ width: PREVIEW_TARGET_WIDTH, height: 1123 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const logoSrc = `${import.meta.env.BASE_URL}logo.svg`;
  const copy = getUiCopy(language);
  const { aboutSections, helpSections, changelogEntries } = getLocalizedAppMeta(language);
  const googleClientId = '';
  const showGoogleAuth = false;
  const isAuthenticated = Boolean(session && authenticatedUser);
  const isCloudMode = isAuthenticated && Boolean(cloudRepositoryRef.current || authenticatedUser);
  const song = songs.find((item) => item.id === selectedSongId) ?? songs[0];
  const libraryIsDirty = serializeSongLibrary(songs) !== serializeSongLibrary(savedSongs);
  const setlistIsDirty = serializeSetlists(setlists) !== serializeSetlists(savedSetlists);
  const workspaceIsDirty = libraryIsDirty || setlistIsDirty;
  const isSheetView = activeAppView === 'sheet';
  const isSetlistMode = workspaceMode === 'setlists';
  const performanceScale = Math.min(
    viewportWidth / PREVIEW_TARGET_WIDTH,
    viewportHeight / PREVIEW_PAGE_HEIGHT
  );
  const isPhoneViewport = viewportWidth < PHONE_VIEWPORT_BREAKPOINT;
  const isSidebarExpanded = isPhoneViewport ? isMobileNavOpen : (isSidebarPinned || isSidebarHovered);
  const usesOverlaySidebar = viewportWidth < SIDEBAR_OVERLAY_BREAKPOINT;
  const collapsedSidebarWidth = isPhoneViewport ? 0 : COLLAPSED_SIDEBAR_WIDTH;
  const phoneSidebarMaxWidth = Math.max(240, viewportWidth - 12);
  const phoneSidebarMinWidth = Math.min(320, phoneSidebarMaxWidth);
  const phoneSidebarPreferredWidth = Math.max(
    phoneSidebarMinWidth,
    Math.min(phoneSidebarMaxWidth, Math.floor(viewportWidth * 0.92))
  );
  const responsiveSidebarMinWidth = isPhoneViewport
    ? phoneSidebarPreferredWidth
    : usesOverlaySidebar
      ? Math.max(collapsedSidebarWidth + 216, 288)
      : MIN_EXPANDED_SIDEBAR_WIDTH;
  const responsiveSidebarMaxWidth = isPhoneViewport
    ? phoneSidebarPreferredWidth
    : usesOverlaySidebar
      ? Math.min(Math.max(Math.floor(viewportWidth * 0.86), responsiveSidebarMinWidth), 420)
      : MAX_EXPANDED_SIDEBAR_WIDTH;
  const resolvedSidebarWidth = Math.max(
    responsiveSidebarMinWidth,
    Math.min(responsiveSidebarMaxWidth, sidebarWidth)
  );
  const currentSidebarWidth = isSidebarExpanded ? resolvedSidebarWidth : collapsedSidebarWidth;
  const phoneSidebarShellWidth = isMobileNavOpen ? resolvedSidebarWidth : 0;
  const phoneSidebarHiddenOffset = resolvedSidebarWidth + 24;
  const sidebarShellWidth = usesOverlaySidebar ? collapsedSidebarWidth : currentSidebarWidth;
  const isPhoneSetlistDrawer = isPhoneViewport && isSetlistMode;
  const mainViewportWidth = Math.max(0, viewportWidth - sidebarShellWidth);
  const shouldUseSplitEditor = mainViewportWidth >= 1360;
  const splitEditorWidth = Math.max(680, Math.min(860, Math.round(mainViewportWidth * 0.5)));
  const overlayEditorWidth = Math.min(
    isPhoneViewport ? mainViewportWidth : Math.max(560, Math.round(mainViewportWidth * 0.52)),
    Math.max(0, mainViewportWidth - (isPhoneViewport ? 0 : 32))
  );
  const usesDenseDesktopHeader = isSheetView && mainViewportWidth >= 1200;
  const usesTabletHeader = isSheetView && !isPhoneViewport && !usesDenseDesktopHeader;
  const isToolbarSecondaryCollapsed = mainViewportWidth < 1240;
  const toolbarPrimaryGridClassName = mainViewportWidth < 1040
    ? 'grid-cols-4'
    : mainViewportWidth < 1380
      ? 'grid-cols-4'
      : 'grid-cols-7';
  const currentSongHistory = songHistories[song?.id || ''] ?? { past: [], future: [] };
  const selectedSetlist = setlists.find((item) => item.id === selectedSetlistId) ?? joinedSetlists.find((item) => item.id === selectedSetlistId) ?? setlists[0] ?? null;
  const isJoinedSetlist = selectedSetlist !== null && (selectedSetlist as JoinedSetlist).isJoined === true;
  const selectedSetlistSong = selectedSetlist?.songs.find((item) => item.id === selectedSetlistSongId) ?? selectedSetlist?.songs[0] ?? null;
  const selectedSetlistSourceSong = selectedSetlistSong
    ? songs.find((item) => item.id === selectedSetlistSong.songId)
      ?? (selectedSetlistSong.songData ? { ...selectedSetlistSong.songData, id: selectedSetlistSong.songId, updatedAt: 0 } as StoredSong : null)
    : null;
  const currentSetlistSongHistory = setlistSongHistories[selectedSetlistSong?.id || ''] ?? { past: [], future: [] };
  const activeSetlistEditableSong = selectedSetlistSong
    ? normalizeSongBars(cloneSong(selectedSetlistSong.songData ?? selectedSetlistSourceSong ?? INITIAL_SONG))
    : null;
  const activeSetlistPreviewSong = selectedSetlistSong && selectedSetlistSourceSong
    ? applySetlistSongOverrides(activeSetlistEditableSong ?? selectedSetlistSourceSong, selectedSetlist, selectedSetlistSong)
    : null;
  const activeEditorSong = isSetlistMode
    ? (activeSetlistEditableSong ?? selectedSetlistSourceSong ?? null)
    : song;
  const activeNavigationPreviewSong = isSetlistMode
    ? (activeSetlistPreviewSong ?? activeEditorSong)
    : song;
  const activeAppViewLabel = activeAppView === 'about'
    ? copy.about
    : activeAppView === 'help'
      ? copy.help
      : isSetlistMode
        ? selectedSetlist?.name || copy.untitledSetlist
        : song.title || copy.untitledSong;
  const mobileDrawerContextLabel = isSetlistMode ? copy.serviceSetlist : copy.songLibrary;
  const mobileDrawerContextValue = isSetlistMode
    ? (mobileSetlistDrawerView === 'detail' ? '' : (selectedSetlist?.name || copy.untitledSetlist))
    : activeAppViewLabel;
  const workspaceModeBadge = isSetlistMode ? copy.setlistModeBadge : copy.songModeBadge;
  const syncStatusLabel = syncStatus === 'saved'
    ? copy.cloudSyncSaved
    : syncStatus === 'syncing'
      ? copy.cloudSyncSyncing
      : syncStatus === 'offline'
        ? copy.cloudSyncOffline
        : copy.cloudSyncFailed;
  const importSummaryLabel = copy.importLocalStats
    .replace('{songs}', String(songs.length))
    .replace('{setlists}', String(setlists.length));
  const toolbarPrimaryActionClassName = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50';
  const toolbarPrimaryEmphasisActionClassName = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-gray-800';
  const toolbarSecondaryToggleClassName = (active: boolean) => `inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition-all ${
    active
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
      : 'border border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:text-indigo-600'
  }`;
  const desktopToolbarActionClassName = 'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50';
  const desktopToolbarPrimaryActionClassName = 'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-800';
  const desktopToolbarToggleClassName = (active: boolean, tone: 'neutral' | 'accent' = 'neutral') => `inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-semibold shadow-sm transition-colors ${
    active
      ? tone === 'accent'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-indigo-200 bg-indigo-50 text-indigo-700'
      : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50'
  }`;
  const denseHeaderShowsContextLabel = mainViewportWidth >= 1500;
  const denseToolbarShowsLabels = mainViewportWidth >= 1680;
  const denseToolbarActionClassName = denseToolbarShowsLabels
    ? desktopToolbarActionClassName
    : 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50';
  const denseToolbarPrimaryActionClassName = denseToolbarShowsLabels
    ? desktopToolbarPrimaryActionClassName
    : 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white shadow-sm transition-colors hover:bg-gray-800';
  const denseToolbarToggleClassName = (active: boolean, tone: 'neutral' | 'accent' = 'neutral') => (
    denseToolbarShowsLabels
      ? desktopToolbarToggleClassName(active, tone)
      : `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm transition-colors ${
          active
            ? tone === 'accent'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50'
        }`
  );
  const denseToolbarMenuButtonClassName = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50';
  const compactEditorToggleLabel = language === 'zh' ? '編輯' : 'Editor';
  const compactLyricsToggleLabel = language === 'zh' ? '歌詞' : 'Lyrics';
  const compactAutoSaveLabel = language === 'zh' ? '自存' : 'Auto';
  const compactSaveLabel = language === 'zh' ? '儲存' : 'Save';
  const compactPdfLabel = language === 'zh' ? 'PDF' : 'PDF';
  const mobileTopbarActionBaseClassName = 'flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold shadow-sm transition-colors';
  const mobileTopbarToggleChipClassName = (active: boolean, tone: 'neutral' | 'accent' = 'neutral') => {
    if (active) {
      return `${mobileTopbarActionBaseClassName} ${
        tone === 'accent'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-indigo-200 bg-indigo-50 text-indigo-700'
      }`;
    }

    return `${mobileTopbarActionBaseClassName} border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50`;
  };
  const getMobileTopbarActionClassName = (tone: 'default' | 'primary' | 'accent' = 'default') => {
    if (tone === 'primary') {
      return `${mobileTopbarActionBaseClassName} border-gray-900 bg-gray-900 text-white hover:bg-gray-800`;
    }

    if (tone === 'accent') {
      return `${mobileTopbarActionBaseClassName} border-amber-500 bg-amber-500 text-white hover:bg-amber-400`;
    }

    return `${mobileTopbarActionBaseClassName} border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50`;
  };
  const inlineModeBadgeClassName = (active: boolean) => `inline-flex min-w-[28px] items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-black leading-none ${
    active
      ? 'border-indigo-200 bg-white/70 text-current'
      : 'border-gray-200 bg-gray-50 text-gray-600'
  }`;
  const toolbarOverflowPanel = isToolbarOverflowMenuOpen ? (
    <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
      <button
        type="button"
        onClick={() => {
          setIsAutoSaveEnabled((current) => !current);
          setIsToolbarOverflowMenuOpen(false);
        }}
        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
          isAutoSaveEnabled
            ? 'bg-emerald-50 text-emerald-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <span>{copy.autoSave}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
          isAutoSaveEnabled ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          {isAutoSaveEnabled ? copy.on : copy.off}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          handleSaveLibrary();
          setIsToolbarOverflowMenuOpen(false);
        }}
        className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
          workspaceIsDirty
            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <Save size={14} />
        <span>{workspaceIsDirty ? copy.saveChanges : copy.saved}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          handleExportPdf();
          setIsToolbarOverflowMenuOpen(false);
        }}
        disabled={isExportingPdf}
        className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
          isExportingPdf
            ? 'cursor-wait bg-gray-100 text-gray-400'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <Save size={14} />
        <span>{isExportingPdf ? copy.preparingPdf : isSetlistMode ? copy.exportSetlistPdf : copy.exportPdf}</span>
      </button>

      {isAuthenticated ? (
        <>
          <div className={`mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
            syncStatus === 'failed'
              ? 'bg-rose-50 text-rose-700'
              : syncStatus === 'offline'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700'
          }`}>
            {syncStatus === 'offline' ? <CloudOff size={14} /> : <Cloud size={14} />}
            <span>{syncStatusLabel}</span>
          </div>

          {activeAppView === 'sheet' && !isSetlistMode && (
            <button
              type="button"
              onClick={() => {
                void handleCreateShareLink('song');
                setIsToolbarOverflowMenuOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Share2 size={14} />
              <span>{copy.shareCurrentSong}</span>
            </button>
          )}

          {activeAppView === 'sheet' && isSetlistMode && selectedSetlist && (
            <button
              type="button"
              onClick={() => {
                void handleCreateShareLink('setlist');
                setIsToolbarOverflowMenuOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Share2 size={14} />
              <span>{copy.shareCurrentSetlist}</span>
            </button>
          )}
        </>
      ) : !showGoogleAuth ? (
        <button
          type="button"
          onClick={() => {
            void handleGoogleSignIn();
            setIsToolbarOverflowMenuOpen(false);
          }}
          disabled={!isAuthConfigured}
          className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ExternalLink size={14} />
          <span>{copy.continueWithGoogle}</span>
        </button>
      ) : null}

      <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => {
            setLanguage('zh');
            setIsToolbarOverflowMenuOpen(false);
          }}
          className={`rounded-lg px-2.5 py-2 text-xs font-bold transition-colors ${
            language === 'zh' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-white'
          }`}
        >
          中文
        </button>
        <button
          type="button"
          onClick={() => {
            setLanguage('en');
            setIsToolbarOverflowMenuOpen(false);
          }}
          className={`rounded-lg px-2.5 py-2 text-xs font-bold transition-colors ${
            language === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-white'
          }`}
        >
          EN
        </button>
      </div>
    </div>
  ) : null;
  const normalizedLibrarySearchQuery = librarySearchQuery.trim().toLowerCase();
  const normalizedSetlistSearchQuery = setlistSearchQuery.trim().toLowerCase();
  const normalizedSetlistSongSearchQuery = setlistSongSearchQuery.trim().toLowerCase();
  const currentCapo = song.capo || 0;
  const currentPlayKey = getPlayKey(song.currentKey, currentCapo);
  const currentSetlistKey = activeSetlistPreviewSong?.currentKey ?? selectedSetlistSourceSong?.currentKey ?? 'C';
  const currentSetlistCapo = typeof selectedSetlistSong?.capo === 'number'
    ? selectedSetlistSong.capo
    : (selectedSetlistSourceSong?.capo ?? 0);
  const currentSetlistPlayKey = getPlayKey(currentSetlistKey, currentSetlistCapo);
  const exportProgressPercent = pdfExportProgress && pdfExportProgress.totalPages > 0
    ? Math.max(0, Math.min(100, (pdfExportProgress.completedPages / pdfExportProgress.totalPages) * 100))
    : 0;
  const exportSectionLabel = pdfExportProgress?.sectionTitle?.trim()
    ? pdfExportProgress.sectionTitle
    : pdfExportProgress?.sectionIndex
      ? `${copy.exportingPdfSectionLabel} ${pdfExportProgress.sectionIndex}`
      : '—';
  const mobileMetadataTitle = isSetlistMode ? copy.setlistEditor.instanceSettings : copy.editor.editSong;
  const mobileMetadataSong = activeEditorSong;
  const mobileMetadataKey = isSetlistMode ? currentSetlistKey : song.currentKey;
  const mobileMetadataCapo = isSetlistMode ? currentSetlistCapo : currentCapo;
  const mobileMetadataTempo = typeof mobileMetadataSong?.tempo === 'number' ? `${mobileMetadataSong.tempo}` : '—';
  const mobileMetadataTime = mobileMetadataSong?.timeSignature?.trim() || '—';
  const mobileMetadataVersion = mobileMetadataSong ? getSongVersionSummary(mobileMetadataSong) : '';
  const mobileMetadataTranslator = mobileMetadataSong?.translator?.trim() || '';
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
  const setlistSongsWithSource = (selectedSetlist?.songs ?? []).map((item) => {
    const libSong = songs.find((songItem) => songItem.id === item.songId);
    const sourceSong: StoredSong | null = libSong
      ?? (item.songData ? { ...item.songData, id: item.songId, updatedAt: 0 } as StoredSong : null);
    return { item, sourceSong };
  }).filter((entry): entry is { item: SetlistSong; sourceSong: StoredSong } => entry.sourceSong !== null);
  const filteredSetlists = setlists.filter((item) => {
    if (!normalizedSetlistSearchQuery) {
      return true;
    }

    const searchText = [
      item.name,
      ...item.songs.map((setlistSong) => songs.find((songItem) => songItem.id === setlistSong.songId)?.title ?? '')
    ].join(' ').toLowerCase();

    return searchText.includes(normalizedSetlistSearchQuery);
  });
  const filteredSongsForSetlist = filteredSongs.filter((item) => {
    if (!normalizedSetlistSongSearchQuery) {
      return true;
    }

    const searchText = [
      item.title,
      item.currentKey,
      item.originalKey,
      ...item.sections.map((section) => section.title)
    ].join(' ').toLowerCase();

    return searchText.includes(normalizedSetlistSongSearchQuery);
  });

  useEffect(() => {
    if (!selectedSetlist) {
      setIsSetlistAddSongsOpen(false);
      setSetlistSongSearchQuery('');
      return;
    }

    if (!isPhoneViewport && selectedSetlist.songs.length === 0) {
      setIsSetlistAddSongsOpen(true);
    }
  }, [isPhoneViewport, selectedSetlist?.id, selectedSetlist?.songs.length]);

  useEffect(() => {
    if (!isPhoneSetlistDrawer) {
      setMobileSetlistDrawerView('list');
      return;
    }

    if (!selectedSetlist) {
      setMobileSetlistDrawerView('list');
      return;
    }

    if (!isMobileNavOpen) {
      setMobileSetlistDrawerView('detail');
      setIsSetlistAddSongsOpen(false);
      setSetlistSongSearchQuery('');
    }
  }, [isMobileNavOpen, isPhoneSetlistDrawer, selectedSetlist?.id]);

  useEffect(() => {
    if (!isPhoneSetlistDrawer || mobileSetlistDrawerView !== 'list') {
      setMobileSwipeOpenSetlistId(null);
      return;
    }

    if (mobileSwipeOpenSetlistId && !setlists.some((item) => item.id === mobileSwipeOpenSetlistId)) {
      setMobileSwipeOpenSetlistId(null);
    }
  }, [isPhoneSetlistDrawer, mobileSetlistDrawerView, mobileSwipeOpenSetlistId, setlists]);

  useEffect(() => () => {
    clearMobileLongPressTimer();
  }, []);

  const createNewSongTitle = (index: number) => language === 'zh' ? `新歌 ${index}` : `New Song ${index}`;
  const createDefaultSong = (index = 1) => createEmptySong(createNewSongTitle(index));

  useEffect(() => {
    if (!activeEditorSong) {
      setActiveSectionId(null);
      setActiveBar(null);
      return;
    }

    if (activeSectionId && activeEditorSong.sections.some((section) => section.id === activeSectionId)) {
      if (activeBar) {
        const targetSection = activeEditorSong.sections[activeBar.sIdx];
        if (!targetSection?.bars[activeBar.bIdx]) {
          setActiveBar(null);
        }
      }
      return;
    }

    setActiveSectionId(activeEditorSong.sections[0]?.id ?? null);
    setActiveBar(null);
  }, [activeBar, activeEditorSong, activeSectionId]);

  useEffect(() => {
    setIsLyricsMode(song?.showLyrics ?? false);
  }, [song?.id, song?.showLyrics]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
        responsiveSidebarMinWidth,
        Math.min(responsiveSidebarMaxWidth, event.clientX)
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
  }, [isSidebarResizing, responsiveSidebarMaxWidth, responsiveSidebarMinWidth]);

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

  const persistWorkspace = async (nextSongs: StoredSong[], nextSetlists: Setlist[]) => {
    const savedAt = Date.now();

    try {
      window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(nextSongs));
      window.localStorage.setItem(SETLIST_STORAGE_KEY, JSON.stringify(nextSetlists));
      window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(savedAt));
    } catch {
      // Ignore local cache failures and keep the app usable.
    }

    if (!authenticatedUser || !cloudRepositoryRef.current) {
      setSavedSongs(cloneSong(nextSongs));
      setSavedSetlists(cloneSong(nextSetlists));
      setLastSavedAt(savedAt);
      setSyncStatus('saved');
      return;
    }

    if (!navigator.onLine) {
      savePendingSync({
        songs: cloneSong(nextSongs),
        setlists: cloneSong(nextSetlists),
        savedAt
      });
      setSyncStatus('offline');
      return;
    }

    try {
      setSyncStatus('syncing');
      await syncWorkspaceDiff({
        repository: cloudRepositoryRef.current,
        songs: nextSongs,
        setlists: nextSetlists,
        savedSongs,
        savedSetlists
      });
      savePendingSync(null);
      setSavedSongs(cloneSong(nextSongs));
      setSavedSetlists(cloneSong(nextSetlists));
      setLastSavedAt(savedAt);
      setSyncStatus('saved');
    } catch {
      savePendingSync({
        songs: cloneSong(nextSongs),
        setlists: cloneSong(nextSetlists),
        savedAt
      });
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      throw new Error('Unable to sync workspace.');
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

  const replaceSetlist = (setlistId: string, updater: (currentSetlist: Setlist) => Setlist) => {
    setSetlists((currentSetlists) =>
      currentSetlists.map((item) => {
        if (item.id !== setlistId) {
          return item;
        }

        const nextSetlist = updater(item);
        return {
          ...nextSetlist,
          songs: reindexSetlistSongs(nextSetlist.songs),
          updatedAt: Date.now()
        };
      })
    );
  };

  const pushSetlistSongHistory = (setlistSongId: string, previousSong: Song) => {
    setSetlistSongHistories((currentHistory) => {
      const entry = currentHistory[setlistSongId] ?? { past: [], future: [] };
      return {
        ...currentHistory,
        [setlistSongId]: {
          past: [...entry.past.slice(-29), cloneSong(previousSong)],
          future: []
        }
      };
    });
  };

  const syncSetlistSectionOrder = (currentOrder: string[], previousSong: Song, nextSong: Song) => {
    const normalizedCurrentOrder = sanitizeSetlistSectionOrder(currentOrder, previousSong);
    const previousDefaultOrder = getDefaultSectionOrder(previousSong);
    const isFollowingSongSectionOrder = normalizedCurrentOrder.length === previousDefaultOrder.length
      && normalizedCurrentOrder.every((sectionId, index) => sectionId === previousDefaultOrder[index]);

    if (isFollowingSongSectionOrder) {
      return getDefaultSectionOrder(nextSong);
    }

    return sanitizeSetlistSectionOrder(normalizedCurrentOrder, nextSong);
  };

  const handleSetlistSongContentChange = (nextSong: Song) => {
    if (!selectedSetlist || !selectedSetlistSong || !activeSetlistEditableSong) {
      return;
    }

    pushSetlistSongHistory(selectedSetlistSong.id, activeSetlistEditableSong);
    handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
      ...currentSetlistSong,
      overrideKey: nextSong.currentKey,
      capo: nextSong.capo ?? 0,
      sectionOrder: syncSetlistSectionOrder(currentSetlistSong.sectionOrder, activeSetlistEditableSong, nextSong),
      songData: cloneSong(normalizeSongBars(nextSong))
    }));
  };

  const restoreSavedWorkspace = () => {
    const restoredSongs = cloneSong(savedSongs);
    const restoredSetlists = cloneSong(savedSetlists);
    setSongs(restoredSongs);
    setSetlists(restoredSetlists);

    const nextSelectedSongId = restoredSongs.some((item) => item.id === selectedSongId)
      ? selectedSongId
      : restoredSongs[0]?.id ?? '';
    setSelectedSongId(nextSelectedSongId);

    const nextSetlist = restoredSetlists.find((item) => item.id === selectedSetlistId) ?? restoredSetlists[0] ?? null;
    setSelectedSetlistId(nextSetlist?.id ?? null);
    setSelectedSetlistSongId(nextSetlist?.songs.find((item) => item.id === selectedSetlistSongId)?.id ?? nextSetlist?.songs[0]?.id ?? null);
  };

  const runSelectionChange = async (applySelection: () => void) => {
    setActiveAppView('sheet');

    if (isAutoSaveEnabled && workspaceIsDirty) {
      await persistWorkspace(songs, setlists);
      applySelection();
      return;
    }

    if (!workspaceIsDirty) {
      applySelection();
      return;
    }

    const shouldSave = window.confirm(copy.confirmSaveBeforeSwitch);
    if (shouldSave) {
      await persistWorkspace(songs, setlists);
      applySelection();
      return;
    }

    restoreSavedWorkspace();
    applySelection();
  };

  const handleSaveLibrary = async () => {
    try {
      await persistWorkspace(songs, setlists);
    } catch {
      window.alert(copy.cloudSyncFailed);
    }
  };

  const handleAppViewChange = (nextView: AppView) => {
    setActiveAppView((currentView) => currentView === nextView ? 'sheet' : nextView);
  };

  const handleSelectSong = (nextSongId: string) => {
    if (nextSongId === selectedSongId && workspaceMode === 'songs') {
      return;
    }

    void runSelectionChange(() => {
      setWorkspaceMode('songs');
      setSelectedSongId(nextSongId);
    });
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

  const handleToggleLyricsMode = () => {
    if (isSetlistMode) {
      const nextLyricsMode = !isLyricsMode;
      setIsLyricsMode(nextLyricsMode);

      if (nextLyricsMode) {
        setIsEditing(true);
      }
      return;
    }

    if (!song) {
      return;
    }

    const nextLyricsMode = !isLyricsMode;
    setIsLyricsMode(nextLyricsMode);

    if (nextLyricsMode) {
      setIsEditing(true);
    }

    handleSongChange({
      ...song,
      showLyrics: nextLyricsMode
    });
  };

  React.useEffect(() => {
    const updateScale = () => {
      if (!previewRef.current) {
        return;
      }

      const previewRootWidth = previewRef.current.offsetWidth;
      const previewRootHeight = previewRef.current.offsetHeight;
      const horizontalPadding = previewRootWidth < 640 ? 24 : previewRootWidth < 960 ? 48 : 96;
      const verticalPadding = previewRootWidth < 640 ? 24 : previewRootWidth < 960 ? 40 : 96;
      const containerWidth = Math.max(220, previewRootWidth - horizontalPadding - PREVIEW_SAFETY_MARGIN);
      const containerHeight = Math.max(220, previewRootHeight - verticalPadding - PREVIEW_SAFETY_MARGIN);
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

  const handleSetlistKeyChange = (newKey: Key) => {
    if (!selectedSetlistSong) {
      return;
    }

    handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
      ...currentSetlistSong,
      overrideKey: newKey
    }));
  };

  const getKeyOptionMeta = (key: Key) => {
    const rawOffset = getTransposeOffset(song.originalKey, key);
    const normalizedOffset = rawOffset > 6 ? rawOffset - 12 : rawOffset < -6 ? rawOffset + 12 : rawOffset;

    if (normalizedOffset === 0) {
      return copy.original;
    }

    return normalizedOffset > 0 ? `+${normalizedOffset}` : `${normalizedOffset}`;
  };

  const handleTranspose = (steps: number) => {
    handleSongChange({ ...song, currentKey: transposeKeyPreferFlats(song.currentKey, steps) });
  };

  const handleSetlistTranspose = (steps: number) => {
    if (!selectedSetlistSong || !activeSetlistPreviewSong) {
      return;
    }

    handleSetlistKeyChange(transposeKeyPreferFlats(activeSetlistPreviewSong.currentKey, steps));
  };

  const handleCreateSong = () => {
    const newSong = createDefaultSong(songs.length + 1);
    const nextSongs = [newSong, ...songs];
    setSongs(nextSongs);
    setSelectedSongId(newSong.id);
    setActiveAppView('sheet');
    setIsEditing(true);
    setWorkspaceMode('songs');
  };

  const handleCreateSetlist = () => {
    const now = Date.now();
    const newSetlist: Setlist = {
      id: createSetlistId(),
      name: language === 'zh' ? `服事歌單 ${setlists.length + 1}` : `Service Setlist ${setlists.length + 1}`,
      displayMode: 'chord-movable-key',
      showLyrics: false,
      createdAt: now,
      updatedAt: now,
      songs: []
    };

    setSetlists((current) => [newSetlist, ...current]);
    setSelectedSetlistId(newSetlist.id);
    setSelectedSetlistSongId(null);
    setWorkspaceMode('setlists');
    setActiveAppView('sheet');
    setIsEditing(true);
    if (isPhoneViewport) {
      setMobileSetlistDrawerView('detail');
      setIsSetlistAddSongsOpen(false);
      setSetlistSongSearchQuery('');
    }
  };

  const handleSelectSetlist = (nextSetlistId: string) => {
    setMobileSwipeOpenSetlistId(null);

    if (isPhoneViewport) {
      setMobileSetlistDrawerView('detail');
      setIsSetlistAddSongsOpen(false);
      setSetlistSongSearchQuery('');
    }

    if (selectedSetlistId === nextSetlistId && workspaceMode === 'setlists') {
      return;
    }

    void runSelectionChange(() => {
      setIsSetlistActionsMenuOpen(false);
      const nextSetlist = setlists.find((item) => item.id === nextSetlistId) ?? null;
      setWorkspaceMode('setlists');
      setSelectedSetlistId(nextSetlistId);
      setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
    });
  };

  const handleSelectJoinedSetlist = (nextSetlistId: string) => {
    setMobileSwipeOpenSetlistId(null);
    if (isPhoneViewport) {
      setMobileSetlistDrawerView('detail');
      setIsSetlistAddSongsOpen(false);
      setSetlistSongSearchQuery('');
    }
    if (selectedSetlistId === nextSetlistId && workspaceMode === 'setlists') return;
    void runSelectionChange(() => {
      setIsSetlistActionsMenuOpen(false);
      const nextSetlist = joinedSetlists.find((item) => item.id === nextSetlistId) ?? null;
      setWorkspaceMode('setlists');
      setSelectedSetlistId(nextSetlistId);
      setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
    });
  };

  const handleJoinedSetlistCapoChange = (setlistSongId: string, capo: number) => {
    setJoinedSetlists((current) => current.map((sl) =>
      sl.id !== selectedSetlistId ? sl : {
        ...sl,
        songs: sl.songs.map((s) => s.id === setlistSongId ? { ...s, capo } : s)
      }
    ));
    if (cloudRepositoryRef.current) {
      void cloudRepositoryRef.current.saveCapoOverride(setlistSongId, capo);
    }
  };

  const handleLeaveSharedSetlist = async (setlistId: string) => {
    if (!cloudRepositoryRef.current) return;
    try {
      await cloudRepositoryRef.current.leaveSharedSetlist(setlistId);
      setJoinedSetlists((current) => current.filter((sl) => sl.id !== setlistId));
      if (selectedSetlistId === setlistId) {
        setSelectedSetlistId(setlists[0]?.id ?? null);
        setSelectedSetlistSongId(setlists[0]?.songs[0]?.id ?? null);
      }
    } catch {
      // Silently ignore leave errors
    }
  };

  const handleSetlistNameChange = (setlistId: string, name: string) => {
    replaceSetlist(setlistId, (currentSetlist) => ({
      ...currentSetlist,
      name
    }));
  };

  const handleSetlistDisplaySettingsChange = (setlistId: string, updates: Partial<Pick<Setlist, 'displayMode' | 'showLyrics'>>) => {
    replaceSetlist(setlistId, (currentSetlist) => ({
      ...currentSetlist,
      ...updates
    }));
  };

  const handleDeleteSetlist = (setlistId: string) => {
    const confirmed = window.confirm(copy.confirmDeleteSetlist);
    if (!confirmed) {
      return;
    }

    setIsSetlistActionsMenuOpen(false);
    setMobileSwipeOpenSetlistId(null);

    const remainingSetlists = setlists.filter((item) => item.id !== setlistId);
    const nextSetlist = remainingSetlists[0] ?? null;
    setSetlists(remainingSetlists);
    setSelectedSetlistId(nextSetlist?.id ?? null);
    setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
    if (isPhoneViewport) {
      setMobileSetlistDrawerView(nextSetlist ? 'detail' : 'list');
      setIsSetlistAddSongsOpen(false);
      setSetlistSongSearchQuery('');
    }
    if (remainingSetlists.length === 0) {
      setWorkspaceMode('songs');
    }

    void persistWorkspace(songs, remainingSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
  };

  const clearMobileLongPressTimer = () => {
    if (mobileLongPressTimerRef.current !== null) {
      window.clearTimeout(mobileLongPressTimerRef.current);
      mobileLongPressTimerRef.current = null;
    }
  };

  const handleMobileSongLongPress = (songId: string) => {
    setIsLibraryEditing(true);
    setSelectedSongIdsForBulkDelete([songId]);
  };

  const handleMobileSetlistLongPress = (setlistId: string) => {
    setMobileSwipeOpenSetlistId(setlistId);
  };

  const handleMobileLongPressStart = (
    kind: 'song' | 'setlist',
    id: string,
    event: React.TouchEvent<HTMLElement>
  ) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    clearMobileLongPressTimer();
    mobileLongPressTriggeredRef.current = false;
    mobileLongPressRef.current = {
      kind,
      id,
      x: touch.clientX,
      y: touch.clientY
    };
    mobileLongPressTimerRef.current = window.setTimeout(() => {
      mobileLongPressTriggeredRef.current = true;
      if (kind === 'song') {
        handleMobileSongLongPress(id);
      } else {
        handleMobileSetlistLongPress(id);
      }
    }, 450);
  };

  const handleMobileLongPressMove = (event: React.TouchEvent<HTMLElement>) => {
    const start = mobileLongPressRef.current;
    const touch = event.touches[0];
    if (!start || !touch) {
      return;
    }

    if (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10) {
      clearMobileLongPressTimer();
    }
  };

  const handleMobileLongPressEnd = () => {
    clearMobileLongPressTimer();
    mobileLongPressRef.current = null;
  };

  const handleMobileSetlistTouchStart = (setlistId: string, event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    mobileSetlistSwipeRef.current = {
      id: setlistId,
      x: touch.clientX,
      y: touch.clientY
    };
    mobileSetlistSwipeHandledRef.current = false;
  };

  const handleMobileSetlistTouchEnd = (setlistId: string, event: React.TouchEvent<HTMLDivElement>) => {
    const start = mobileSetlistSwipeRef.current;
    mobileSetlistSwipeRef.current = null;

    if (!start || start.id !== setlistId) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaY) > Math.abs(deltaX) || Math.abs(deltaX) < 44) {
      mobileSetlistSwipeHandledRef.current = false;
      return;
    }

    if (deltaX < 0) {
      setMobileSwipeOpenSetlistId(setlistId);
      mobileSetlistSwipeHandledRef.current = true;
      event.preventDefault();
      return;
    }

    if (mobileSwipeOpenSetlistId === setlistId) {
      setMobileSwipeOpenSetlistId(null);
      mobileSetlistSwipeHandledRef.current = true;
      event.preventDefault();
    }
  };

  const handleAddSongToSetlist = (songId: string) => {
    if (!selectedSetlist) {
      return;
    }

    const sourceSong = songs.find((item) => item.id === songId);
    if (!sourceSong) {
      return;
    }

    const nextSetlistSong = createStoredSetlistSong(songId, selectedSetlist.id, sourceSong);
    replaceSetlist(selectedSetlist.id, (currentSetlist) => ({
      ...currentSetlist,
      songs: reindexSetlistSongs([...currentSetlist.songs, { ...nextSetlistSong, order: currentSetlist.songs.length }])
    }));
    setSelectedSetlistSongId(nextSetlistSong.id);
    setWorkspaceMode('setlists');
    if (isPhoneViewport) {
      setMobileSetlistDrawerView('detail');
      setIsSetlistAddSongsOpen(false);
      setSetlistSongSearchQuery('');
    } else {
      setIsSetlistAddSongsOpen(true);
    }
  };

  const handleSelectSetlistSong = (setlistSongId: string) => {
    if (!selectedSetlist) {
      return;
    }

    void runSelectionChange(() => {
      setWorkspaceMode('setlists');
      setSelectedSetlistId(selectedSetlist.id);
      setSelectedSetlistSongId(setlistSongId);
    });
  };

  const handleUpdateSetlistSong = (setlistSongId: string, updater: (currentSong: SetlistSong) => SetlistSong) => {
    if (!selectedSetlist) {
      return;
    }

    replaceSetlist(selectedSetlist.id, (currentSetlist) => ({
      ...currentSetlist,
      songs: currentSetlist.songs.map((item) => item.id === setlistSongId ? updater(item) : item)
    }));
  };

  const handleRemoveSetlistSong = (setlistSongId: string) => {
    if (!selectedSetlist) {
      return;
    }

    replaceSetlist(selectedSetlist.id, (currentSetlist) => ({
      ...currentSetlist,
      songs: currentSetlist.songs.filter((item) => item.id !== setlistSongId)
    }));

    const remainingSongs = selectedSetlist.songs.filter((item) => item.id !== setlistSongId);
    setSelectedSetlistSongId(remainingSongs[0]?.id ?? null);
  };

  const moveSetlistSong = (sourceId: string, targetId: string) => {
    if (!selectedSetlist || sourceId === targetId) {
      return;
    }

    replaceSetlist(selectedSetlist.id, (currentSetlist) => {
      const nextSongs = [...currentSetlist.songs];
      const sourceIndex = nextSongs.findIndex((item) => item.id === sourceId);
      const targetIndex = nextSongs.findIndex((item) => item.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) {
        return currentSetlist;
      }

      const [moved] = nextSongs.splice(sourceIndex, 1);
      nextSongs.splice(targetIndex, 0, moved);

      return {
        ...currentSetlist,
        songs: reindexSetlistSongs(nextSongs)
      };
    });
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
      persistWorkspace(nextSongs, setlists);
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
    const remainingSetlists = setlists.map((setlist) => ({
      ...setlist,
      songs: reindexSetlistSongs(setlist.songs.filter((item) => item.songId !== songId)),
      updatedAt: Date.now()
    }));

    if (remainingSongs.length === 0) {
      const replacementSong = createDefaultSong(1);
      setSongs([replacementSong]);
      setSetlists([]);
      setSavedSongs([cloneSong(replacementSong)]);
      setSavedSetlists([]);
      setSelectedSetlistId(null);
      setSelectedSetlistSongId(null);
      setSelectedSongId(replacementSong.id);
      setSongHistories({});
      setSelectedSongIdsForBulkDelete([]);
      setIsEditing(true);
      void persistWorkspace([replacementSong], []).catch(() => {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      });
      return;
    }

    setSongs(remainingSongs);
    setSetlists(remainingSetlists);
    setSongHistories((currentHistory) =>
      Object.fromEntries(Object.entries(currentHistory).filter(([id]) => id !== songId))
    );
    setSelectedSongIdsForBulkDelete((currentIds) => currentIds.filter((id) => id !== songId));

    if (selectedSongId === songId) {
      setSelectedSongId(remainingSongs[0].id);
    }

    void persistWorkspace(remainingSongs, remainingSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
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
    const remainingSetlists = setlists.map((setlist) => ({
      ...setlist,
      songs: reindexSetlistSongs(setlist.songs.filter((item) => !selectedIdSet.has(item.songId))),
      updatedAt: Date.now()
    }));

    if (remainingSongs.length === 0) {
      const replacementSong = createDefaultSong(1);
      setSongs([replacementSong]);
      setSetlists([]);
      setSavedSongs([cloneSong(replacementSong)]);
      setSavedSetlists([]);
      setSelectedSetlistId(null);
      setSelectedSetlistSongId(null);
      setSelectedSongId(replacementSong.id);
      setSongHistories({});
      setSelectedSongIdsForBulkDelete([]);
      setIsEditing(true);
      void persistWorkspace([replacementSong], []).catch(() => {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      });
      return;
    }

    setSongs(remainingSongs);
    setSetlists(remainingSetlists);
    setSongHistories((currentHistory) =>
      Object.fromEntries(Object.entries(currentHistory).filter(([id]) => !selectedIdSet.has(id)))
    );
    setSelectedSongIdsForBulkDelete([]);

    if (selectedIdSet.has(selectedSongId)) {
      setSelectedSongId(remainingSongs[0].id);
    }

    void persistWorkspace(remainingSongs, remainingSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
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

  const handleSetlistUndo = () => {
    if (!selectedSetlistSong || currentSetlistSongHistory.past.length === 0) {
      return;
    }

    const previousSong = currentSetlistSongHistory.past[currentSetlistSongHistory.past.length - 1];
    const newPast = currentSetlistSongHistory.past.slice(0, currentSetlistSongHistory.past.length - 1);

    setSetlistSongHistories((currentHistory) => ({
      ...currentHistory,
      [selectedSetlistSong.id]: {
        past: newPast,
        future: [cloneSong(activeSetlistEditableSong ?? previousSong), ...currentSetlistSongHistory.future]
      }
    }));

    handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
      ...currentSetlistSong,
      overrideKey: previousSong.currentKey,
      capo: previousSong.capo ?? 0,
      sectionOrder: syncSetlistSectionOrder(currentSetlistSong.sectionOrder, activeSetlistEditableSong ?? previousSong, previousSong),
      songData: cloneSong(normalizeSongBars(previousSong))
    }));
  };

  const handleSetlistRedo = () => {
    if (!selectedSetlistSong || currentSetlistSongHistory.future.length === 0) {
      return;
    }

    const nextSong = currentSetlistSongHistory.future[0];
    const newFuture = currentSetlistSongHistory.future.slice(1);

    setSetlistSongHistories((currentHistory) => ({
      ...currentHistory,
      [selectedSetlistSong.id]: {
        past: [...currentSetlistSongHistory.past, cloneSong(activeSetlistEditableSong ?? nextSong)],
        future: newFuture
      }
    }));

    handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
      ...currentSetlistSong,
      overrideKey: nextSong.currentKey,
      capo: nextSong.capo ?? 0,
      sectionOrder: syncSetlistSectionOrder(currentSetlistSong.sectionOrder, activeSetlistEditableSong ?? nextSong, nextSong),
      songData: cloneSong(normalizeSongBars(nextSong))
    }));
  };

  const handleScrollEditorToTop = () => {
    const editorScrollRoot = document.querySelector<HTMLElement>('[data-editor-scroll-root]');
    if (!editorScrollRoot) return;
    editorScrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const collectExportPages = React.useCallback((captureHost: HTMLElement): ExportPageDescriptor[] => {
    const pages = Array.from(captureHost.querySelectorAll('[data-print-page]')) as HTMLElement[];

    return pages.map((page) => {
      const songContainer = page.closest<HTMLElement>('[data-export-song-container]');
      const songIndex = parsePositiveIntegerAttribute(songContainer?.dataset.exportSongIndex ?? null) ?? 1;
      const totalSongs = parsePositiveIntegerAttribute(songContainer?.dataset.exportTotalSongs ?? null) ?? 1;
      const pageInSong = parsePositiveIntegerAttribute(page.dataset.exportPageIndex ?? null) ?? 1;
      const totalPagesInSong = parsePositiveIntegerAttribute(page.dataset.exportPageTotal ?? null) ?? 1;
      const sectionIndex = parsePositiveIntegerAttribute(page.dataset.exportSectionIndex ?? null);
      const songTitle = songContainer?.dataset.exportSongTitle?.trim() || page.dataset.exportSongTitle?.trim() || APP_NAME;
      const sectionTitle = page.dataset.exportSectionTitle?.trim() || null;

      return {
        element: page,
        songIndex,
        totalSongs,
        songTitle,
        sectionIndex,
        sectionTitle,
        pageInSong,
        totalPagesInSong
      };
    });
  }, []);

  const exportCaptureHostToPdf = async (captureHost: HTMLElement, fileName: string) => {
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

    const pages = collectExportPages(captureHost);
    if (pages.length === 0) {
      throw new Error('No preview pages found for PDF export.');
    }

    let fontEmbedCSS: string | undefined;
    try {
      fontEmbedCSS = await getFontEmbedCSS(captureHost);
    } catch {
      // Fall back to per-page font embedding if pre-fetch fails.
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const renderOptions = {
      backgroundColor: '#ffffff',
      cacheBust: false,
      pixelRatio: PDF_EXPORT_PIXEL_RATIO,
      skipAutoScale: true,
      fontEmbedCSS,
    };

    // Group pages by their [data-export-song-container] so we can render each
    // song's pages in a single toCanvas() call instead of one per page.
    // DOM serialisation (clone + style-inline + SVG generation) is the main
    // mobile bottleneck — doing it once per song instead of once per page gives
    // an N-fold reduction for multi-page songs.
    const songContainerGroups: { container: HTMLElement; pageIndices: number[] }[] = [];
    for (let i = 0; i < pages.length; i += 1) {
      const container =
        pages[i].element.closest<HTMLElement>('[data-export-song-container]') ??
        captureHost;
      const group = songContainerGroups.find((g) => g.container === container);
      if (group) {
        group.pageIndices.push(i);
      } else {
        songContainerGroups.push({ container, pageIndices: [i] });
      }
    }

    let globalPageCount = 0;
    for (const { container, pageIndices } of songContainerGroups) {
      if (pdfExportCancelRequestedRef.current) {
        throw new PdfExportCancelledError();
      }

      // Render the entire song container once; fall back to per-page if the
      // canvas would exceed device limits (toCanvas throws on OOM).
      let songCanvas: HTMLCanvasElement | null = null;
      try {
        songCanvas = await toCanvas(container, {
          ...renderOptions,
          width: container.scrollWidth,
          height: container.scrollHeight,
        });
      } catch {
        songCanvas = null;
      }

      for (const pageIndex of pageIndices) {
        if (pdfExportCancelRequestedRef.current) {
          throw new PdfExportCancelledError();
        }

        const page = pages[pageIndex];
        flushSync(() => {
          setPdfExportProgress({
            totalPages: pages.length,
            completedPages: globalPageCount,
            currentPage: pageIndex + 1,
            songIndex: page.songIndex,
            totalSongs: page.totalSongs,
            songTitle: page.songTitle,
            sectionIndex: page.sectionIndex,
            sectionTitle: page.sectionTitle,
            pageInSong: page.pageInSong,
            totalPagesInSong: page.totalPagesInSong,
            cancelRequested: pdfExportCancelRequestedRef.current,
          });
        });
        await waitForPaint();

        if (pdfExportCancelRequestedRef.current) {
          throw new PdfExportCancelledError();
        }

        let imageData: string;
        if (songCanvas) {
          // Slice this page out of the full-song canvas.
          // getBoundingClientRect() differences give the correct in-container
          // offset even for off-screen fixed elements.
          const containerRect = container.getBoundingClientRect();
          const pageRect = page.element.getBoundingClientRect();
          const offsetY = Math.round((pageRect.top - containerRect.top) * PDF_EXPORT_PIXEL_RATIO);
          const sliceW = Math.round(page.element.scrollWidth * PDF_EXPORT_PIXEL_RATIO);
          const sliceH = Math.round(page.element.scrollHeight * PDF_EXPORT_PIXEL_RATIO);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = sliceW;
          sliceCanvas.height = sliceH;
          sliceCanvas.getContext('2d')!.drawImage(songCanvas, 0, offsetY, sliceW, sliceH, 0, 0, sliceW, sliceH);
          imageData = sliceCanvas.toDataURL('image/jpeg', 0.92);
        } else {
          // Fallback: render this page individually (original approach).
          imageData = await toPng(page.element, {
            ...renderOptions,
            width: page.element.scrollWidth,
            height: page.element.scrollHeight,
          });
        }

        if (pdfExportCancelRequestedRef.current) {
          throw new PdfExportCancelledError();
        }

        if (globalPageCount > 0) {
          pdf.addPage();
        }
        pdf.addImage(imageData, songCanvas ? 'JPEG' : 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        globalPageCount += 1;

        flushSync(() => {
          setPdfExportProgress((current) =>
            current ? { ...current, completedPages: globalPageCount } : current
          );
        });
      }
    }

    if (pdfExportCancelRequestedRef.current) {
      throw new PdfExportCancelledError();
    }

    pdf.save(`${fileName}.pdf`);
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) {
      return;
    }

    pdfExportCancelRequestedRef.current = false;
    setIsExportingPdf(true);
    setPdfExportProgress(null);
    const captureHost = document.createElement('div');
    let exportRoot: ReturnType<typeof createRoot> | null = null;

    try {
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
      document.body.appendChild(captureHost);

      if (isSetlistMode) {
        if (!selectedSetlist || setlistSongsWithSource.length === 0) {
          window.alert(copy.setlistExportEmptyError);
          return;
        }

        exportRoot = createRoot(captureHost);
        flushSync(() => {
          exportRoot?.render(
            <div data-print-preview style={{ width: '794px', minWidth: '794px', maxWidth: '794px' }}>
              {setlistSongsWithSource.map(({ item, sourceSong }, songIndex) => {
                const derivedSong = applySetlistSongOverrides(sourceSong, selectedSetlist, item);
                return (
                  <div
                    key={item.id}
                    data-export-song-container
                    data-export-song-index={songIndex + 1}
                    data-export-total-songs={setlistSongsWithSource.length}
                    data-export-song-title={derivedSong.title}
                  >
                    <ChordSheet
                      song={derivedSong}
                      language={language}
                      currentKey={derivedSong.currentKey}
                    />
                  </div>
                );
              })}
            </div>
          );
        });
        await exportCaptureHostToPdf(captureHost, buildSetlistPdfFileName(selectedSetlist));
      } else {
        if (!song || !sheetRef.current) {
          return;
        }

        const previewClone = sheetRef.current.cloneNode(true) as HTMLDivElement;
        previewClone.style.transform = 'none';
        previewClone.style.transformOrigin = 'top center';
        previewClone.style.width = '794px';
        previewClone.style.minWidth = '794px';
        previewClone.style.maxWidth = '794px';
        previewClone.style.margin = '0';

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

        const exportSongWrapper = document.createElement('div');
        exportSongWrapper.dataset.exportSongContainer = 'true';
        exportSongWrapper.dataset.exportSongIndex = '1';
        exportSongWrapper.dataset.exportTotalSongs = '1';
        exportSongWrapper.dataset.exportSongTitle = song.title;
        exportSongWrapper.appendChild(previewClone);

        captureHost.appendChild(exportSongWrapper);
        await exportCaptureHostToPdf(captureHost, buildPdfFileName(song));
      }
    } catch (error) {
      if (error instanceof PdfExportCancelledError) {
        return;
      }

      console.error('PDF export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      window.alert(`${copy.pdfExportError} ${errorMessage}`);
    } finally {
      exportRoot?.unmount();
      captureHost.remove();
      pdfExportCancelRequestedRef.current = false;
      setPdfExportProgress(null);
      setIsExportingPdf(false);
    }
  };

  // Apply the page translation directly to the DOM, bypassing React re-renders for smoothness.
  // Uses DOM-measured offsetTop values so inter-page gaps are handled correctly.
  const applyPerformanceTranslation = (index: number, scale: number) => {
    if (!performanceTranslatorRef.current) return;
    const offset = performancePageOffsetsRef.current[index] ?? index * PREVIEW_PAGE_HEIGHT;
    performanceTranslatorRef.current.style.transform =
      `scale(${scale}) translateY(-${offset}px)`;
  };

  const handleEnterPerformanceMode = () => {
    performancePageIndexRef.current = 0;
    setPerformancePageIndex(0);
    setIsPerformanceMode(true);
  };

  const handleExitPerformanceMode = () => {
    setIsPerformanceMode(false);
  };

  const handlePerformanceNextPage = () => {
    const current = performancePageIndexRef.current;
    if (current < performanceTotalPages - 1) {
      const next = current + 1;
      performancePageIndexRef.current = next;
      applyPerformanceTranslation(next, performanceScale);
      setPerformancePageIndex(next); // update indicator only
      return;
    }
    if (isSetlistMode) {
      const items = setlistSongsWithSource.map(({ item }) => item);
      const idx = items.findIndex((s) => s.id === selectedSetlistSongId);
      const nextSong = items[idx + 1];
      if (nextSong) {
        performancePageIndexRef.current = 0;
        setSelectedSetlistSongId(nextSong.id);
        setPerformancePageIndex(0);
      }
    }
  };

  const handlePerformancePrevPage = () => {
    const current = performancePageIndexRef.current;
    if (current > 0) {
      const prev = current - 1;
      performancePageIndexRef.current = prev;
      applyPerformanceTranslation(prev, performanceScale);
      setPerformancePageIndex(prev); // update indicator only
      return;
    }
    if (isSetlistMode) {
      const items = setlistSongsWithSource.map(({ item }) => item);
      const idx = items.findIndex((s) => s.id === selectedSetlistSongId);
      const prevSong = items[idx - 1];
      if (prevSong) {
        performancePageIndexRef.current = Infinity;
        setSelectedSetlistSongId(prevSong.id);
        setPerformancePageIndex(Infinity); // clamped after render
      }
    }
  };

  const handlePerformanceTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (!t) return;
    performanceTouchRef.current = { x: t.clientX, y: t.clientY };
  };

  const handlePerformanceTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = performanceTouchRef.current;
    performanceTouchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 44 || Math.abs(dy) >= Math.abs(dx)) return;
    if (dx < 0) handlePerformanceNextPage();
    else handlePerformancePrevPage();
  };

  useEffect(() => {
    if (song && song.id !== selectedSongId) {
      setSelectedSongId(song.id);
    }
  }, [selectedSongId, song]);

  useEffect(() => {
    if (!isExportingPdf) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      pdfExportCancelRequestedRef.current = true;
      setPdfExportProgress((current) => current ? { ...current, cancelRequested: true } : current);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportingPdf]);

  // Sync performanceTotalPages and clamp page index after song/mode changes.
  // Uses RAF to wait for ChordSheet to render, then reads page count from DOM.
  useEffect(() => {
    if (!isPerformanceMode) return;
    const rAF = window.requestAnimationFrame(() => {
      const container = performanceSheetRef.current;
      const pageEls: HTMLElement[] = container
        ? Array.from(container.querySelectorAll('[data-print-page]'))
        : [];
      const total = Math.max(1, pageEls.length);
      setPerformanceTotalPages(total);
      // Store the layout offsetTop of each page (relative to the clip container, pre-transform).
      // This accounts for any inter-page gap in the ChordSheet flex wrapper.
      performancePageOffsetsRef.current = pageEls.map((el) => el.offsetTop);
      const clampedIndex = Math.min(performancePageIndexRef.current, total - 1);
      performancePageIndexRef.current = clampedIndex;
      setPerformancePageIndex(clampedIndex);
      applyPerformanceTranslation(clampedIndex, performanceScale);
    });
    return () => window.cancelAnimationFrame(rAF);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPerformanceMode, selectedSetlistSongId, selectedSongId]);

  // Keep refs to latest handlers so the keyboard effect never has stale closures.
  const handlePerformanceNextPageRef = useRef(handlePerformanceNextPage);
  const handlePerformancePrevPageRef = useRef(handlePerformancePrevPage);
  handlePerformanceNextPageRef.current = handlePerformanceNextPage;
  handlePerformancePrevPageRef.current = handlePerformancePrevPage;

  // Keyboard navigation in performance mode
  useEffect(() => {
    if (!isPerformanceMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); handlePerformanceNextPageRef.current(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); handlePerformancePrevPageRef.current(); }
      else if (e.key === 'Escape') { e.preventDefault(); handleExitPerformanceMode(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPerformanceMode]);

  // Prevent background scroll on iOS when performance mode is active
  useEffect(() => {
    if (!isPerformanceMode) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isPerformanceMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_SAVE_STORAGE_KEY, String(isAutoSaveEnabled));
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [isAutoSaveEnabled]);

  useEffect(() => {
    if (!authenticatedUser) {
      cloudRepositoryRef.current = null;
      setIsLoadingCloudWorkspace(false);
      setIsImportPromptOpen(false);
      setSyncStatus('saved');
      return;
    }

    cloudRepositoryRef.current = createCloudRepository({
      userId: authenticatedUser.id,
      email: authenticatedUser.email,
      name: authenticatedUser.name,
      picture: authenticatedUser.picture
    });
  }, [authenticatedUser]);

  useEffect(() => {
    if (!authenticatedUser || !cloudRepositoryRef.current) {
      return;
    }

    let isCancelled = false;

    const loadCloudWorkspace = async () => {
      try {
        setIsLoadingCloudWorkspace(true);
        const cloudWorkspace = await cloudRepositoryRef.current!.loadWorkspace();
        if (isCancelled) {
          return;
        }

        const hasLocalData = initialLibraryRef.current.songs.length > 0 || initialSetlistsRef.current.setlists.length > 0;
        const migrationCompleted = hasCompletedMigration(authenticatedUser.id);
        const shouldUseCloudWorkspace = cloudWorkspace.songs.length > 0 || cloudWorkspace.setlists.length > 0 || migrationCompleted || !hasLocalData;

        if (shouldUseCloudWorkspace) {
          const nextSongs = cloudWorkspace.songs.length > 0 ? cloudWorkspace.songs : initialLibraryRef.current.songs;
          const nextSetlists = cloudWorkspace.setlists;
          const nextJoinedSetlists = cloudWorkspace.joinedSetlists;
          setSongs(nextSongs);
          setSavedSongs(cloneSong(nextSongs));
          setSetlists(nextSetlists);
          setSavedSetlists(cloneSong(nextSetlists));
          setJoinedSetlists(nextJoinedSetlists);
          setLastSavedAt(cloudWorkspace.lastSavedAt);
          setSelectedSongId((currentId) => nextSongs.some((item) => item.id === currentId) ? currentId : nextSongs[0]?.id ?? '');
          setSelectedSetlistId((currentId) => {
            if (nextSetlists.some((item) => item.id === currentId)) return currentId;
            if (nextJoinedSetlists.some((item) => item.id === currentId)) return currentId;
            return nextSetlists[0]?.id ?? null;
          });
        }

        if (hasLocalData && !migrationCompleted) {
          setIsImportPromptOpen(true);
        } else {
          setIsImportPromptOpen(false);
        }

        setSyncStatus('saved');
      } catch (error) {
        if (!isCancelled) {
          setAuthUiError(error instanceof Error ? error.message : 'Unable to load cloud workspace.');
          setSyncStatus(navigator.onLine ? 'failed' : 'offline');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingCloudWorkspace(false);
        }
      }
    };

    void loadCloudWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [authenticatedUser]);

  useEffect(() => {
    if (!authenticatedUser || !cloudRepositoryRef.current) {
      return;
    }

    const flushPending = async () => {
      const pending = loadPendingSync();
      if (!pending || !navigator.onLine) {
        return;
      }

      try {
        setSyncStatus('syncing');
        await persistWorkspace(pending.songs, pending.setlists);
        savePendingSync(null);
      } catch {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      }
    };

    const handleOnline = () => {
      void flushPending();
    };

    void flushPending();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [authenticatedUser, savedSetlists, savedSongs]);

  useEffect(() => {
    if (!isAutoSaveEnabled || !workspaceIsDirty) {
      return;
    }

    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      void persistWorkspace(songs, setlists).catch(() => {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      });
      autoSaveTimeoutRef.current = null;
    }, 1000);

    return () => {
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [isAutoSaveEnabled, setlists, songs, workspaceIsDirty]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SELECTED_SONG_STORAGE_KEY, selectedSongId);
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [selectedSongId]);

  useEffect(() => {
    try {
      if (selectedSetlistId) {
        window.localStorage.setItem(SELECTED_SETLIST_STORAGE_KEY, selectedSetlistId);
      } else {
        window.localStorage.removeItem(SELECTED_SETLIST_STORAGE_KEY);
      }

      if (selectedSetlistSongId) {
        window.localStorage.setItem(SELECTED_SETLIST_SONG_STORAGE_KEY, selectedSetlistSongId);
      } else {
        window.localStorage.removeItem(SELECTED_SETLIST_SONG_STORAGE_KEY);
      }

      window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, workspaceMode);
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [selectedSetlistId, selectedSetlistSongId, workspaceMode]);

  useEffect(() => {
    setSelectedSongIdsForBulkDelete((currentIds) =>
      currentIds.filter((id) => songs.some((item) => item.id === id))
    );
  }, [songs]);

  useEffect(() => {
    setSelectedSetlistId((currentId) => {
      if (!currentId) {
        return setlists[0]?.id ?? null;
      }

      return setlists.some((item) => item.id === currentId) ? currentId : setlists[0]?.id ?? null;
    });
  }, [setlists]);

  useEffect(() => {
    const activeSetlist = setlists.find((item) => item.id === selectedSetlistId) ?? null;
    if (!activeSetlist) {
      setSelectedSetlistSongId(null);
      return;
    }

    setSelectedSetlistSongId((currentId) => (
      currentId && activeSetlist.songs.some((item) => item.id === currentId)
        ? currentId
        : activeSetlist.songs[0]?.id ?? null
    ));
  }, [selectedSetlistId, setlists]);

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
      if (setlistActionsMenuRef.current && !setlistActionsMenuRef.current.contains(event.target as Node)) {
        setIsSetlistActionsMenuOpen(false);
      }

      if (toolbarOverflowMenuRef.current && !toolbarOverflowMenuRef.current.contains(event.target as Node)) {
        setIsToolbarOverflowMenuOpen(false);
      }

      if (googleAccountMenuRef.current && !googleAccountMenuRef.current.contains(event.target as Node)) {
        setIsGoogleAccountMenuOpen(false);
      }
    };

    const handleEscapeKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      setIsSetlistActionsMenuOpen(false);
      setIsToolbarOverflowMenuOpen(false);
      setIsGoogleAccountMenuOpen(false);
      setIsMobileActionsSheetOpen(false);
      setIsMobileMetadataOpen(false);
      setIsMobileNavOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscapeKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscapeKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isSheetView || isSetlistMode || !isToolbarSecondaryCollapsed) {
      setIsToolbarOverflowMenuOpen(false);
    }
  }, [isSetlistMode, isSheetView, isToolbarSecondaryCollapsed]);

  useEffect(() => {
    if (!usesDenseDesktopHeader) {
      setIsGoogleAccountMenuOpen(false);
    }
  }, [usesDenseDesktopHeader]);

  useEffect(() => {
    if (isPhoneViewport) {
      setIsToolbarOverflowMenuOpen(false);
      setIsGoogleAccountMenuOpen(false);
      return;
    }

    setIsMobileNavOpen(false);
    setIsMobileActionsSheetOpen(false);
    setIsMobileMetadataOpen(false);
  }, [isPhoneViewport]);

  useEffect(() => {
    if (!isEditing) {
      setIsMobileMetadataOpen(false);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isSheetView) {
      setIsMobileActionsSheetOpen(false);
      setIsMobileMetadataOpen(false);
    }
  }, [isSheetView]);

  useEffect(() => {
    if (!isPhoneViewport) {
      return;
    }

    if (activeAppView === 'sheet') {
      return;
    }

    setIsMobileNavOpen(false);
  }, [activeAppView, isPhoneViewport, selectedSongId, workspaceMode]);

  useEffect(() => {
    return () => {
      if (editorFocusTimeoutRef.current !== null) {
        window.clearTimeout(editorFocusTimeoutRef.current);
      }
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
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
  }, [copy.googleCredentialError, copy.googleLoadError, googleClientId, googleUser, isMobileActionsSheetOpen, isPhoneViewport, showGoogleAuth]);

  const focusEditorField = React.useCallback((sIdx: number, bIdx: number, field: EditorFocusField) => {
    setEditorFocusRequest({
      sIdx,
      bIdx,
      field,
      requestId: editorFocusRequestIdRef.current += 1
    });
  }, []);

  const handleElementClick = React.useCallback((sIdx: number, bIdx: number, field: EditorFocusField) => {
    if (!activeEditorSong || !activeNavigationPreviewSong) {
      return;
    }

    const previewSection = activeNavigationPreviewSong.sections[sIdx] ?? null;
    const nextSectionId = previewSection?.id ?? null;
    const mappedSectionIndex = nextSectionId
      ? activeEditorSong.sections.findIndex((section) => section.id === nextSectionId)
      : sIdx;
    const nextSectionIndex = mappedSectionIndex >= 0 ? mappedSectionIndex : sIdx;

    setActiveSectionId(nextSectionId ?? activeEditorSong.sections[nextSectionIndex]?.id ?? null);
    setActiveBar({ sIdx: nextSectionIndex, bIdx });

    if (editorFocusTimeoutRef.current !== null) {
      window.clearTimeout(editorFocusTimeoutRef.current);
      editorFocusTimeoutRef.current = null;
    }

    if (!isEditing) {
      setIsEditing(true);
      editorFocusTimeoutRef.current = window.setTimeout(() => {
        focusEditorField(nextSectionIndex, bIdx, field);
        editorFocusTimeoutRef.current = null;
      }, 500);
    } else {
      focusEditorField(nextSectionIndex, bIdx, field);
    }
  }, [activeEditorSong, activeNavigationPreviewSong, focusEditorField, isEditing]);

  const previewSheet = React.useMemo(() => (
    <ChordSheet 
      song={song} 
      language={language}
      currentKey={song.currentKey} 
      onElementClick={handleElementClick}
      highlightedSectionIds={highlightedSectionIds}
      activeSectionId={isEditing ? activeSectionId : null}
      activeBar={isEditing ? activeBar : null}
      previewIdentity={song.id}
    />
  ), [activeBar, activeSectionId, handleElementClick, highlightedSectionIds, isEditing, language, song]);

  const setlistPreviewSheet = React.useMemo(() => {
    if (!activeSetlistPreviewSong) {
      return null;
    }

    return (
      <ChordSheet
        song={activeSetlistPreviewSong}
        language={language}
        currentKey={activeSetlistPreviewSong.currentKey}
        onElementClick={handleElementClick}
        highlightedSectionIds={highlightedSectionIds}
        activeSectionId={isEditing ? activeSectionId : null}
        activeBar={isEditing ? activeBar : null}
        previewIdentity={selectedSetlistSong?.id ?? null}
      />
    );
  }, [activeBar, activeSectionId, activeSetlistPreviewSong, handleElementClick, highlightedSectionIds, isEditing, language, selectedSetlistSong?.id]);
  const activePreviewSheet = isSetlistMode ? setlistPreviewSheet : previewSheet;
  const currentPreviewIdentity = isSetlistMode
    ? (selectedSetlistSong?.id ?? null)
    : (song?.id ?? null);

  useEffect(() => {
    setHighlightedSectionIds([]);
    setActiveBar(null);
    setActiveSectionId(activeEditorSong?.sections[0]?.id ?? null);
  }, [currentPreviewIdentity]);

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
    if (isPhoneViewport) {
      return;
    }

    if (isSidebarPinned || isSidebarHovered) {
      return;
    }

    const sidebarRect = event.currentTarget.getBoundingClientRect();
    const pointerY = event.clientY - sidebarRect.top;

    if (pointerY <= sidebarRect.height / 3) {
      setIsSidebarHovered(true);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      setIsGoogleAccountMenuOpen(false);
      setAuthUiError(null);
      setAuthUiMessage(null);
      await signOut();
      cloudRepositoryRef.current = null;
      setGoogleUser(null);
      setSyncStatus('saved');
      window.location.assign(import.meta.env.BASE_URL);
    } catch (error) {
      setAuthUiError(error instanceof Error ? error.message : copy.cloudSyncFailed);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthUiError(null);
      await signInWithGoogle();
    } catch (error) {
      setAuthUiError(error instanceof Error ? error.message : copy.authUnavailable);
    }
  };

  const handleCreateShareLink = async (resourceType: 'song' | 'setlist') => {
    if (!cloudRepositoryRef.current) {
      window.alert(copy.authUnavailable);
      return;
    }

    const resourceId = resourceType === 'song' ? song?.id : selectedSetlist?.id;
    if (!resourceId) {
      return;
    }

    try {
      const token = await cloudRepositoryRef.current.createShareLink(resourceType, resourceId);
      const shareUrl = buildShareUrl(token);
      const didCopy = await copyShareUrlToClipboard(shareUrl);

      if (didCopy) {
        window.alert(copy.shareCopied);
        return;
      }

      window.prompt(copy.shareManualCopyPrompt, shareUrl);
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      if (!reason) {
        window.alert(copy.shareFailed);
        return;
      }

      const localizedReason = isShareAuthErrorMessage(reason)
        ? copy.shareAuthRequired
        : reason;

      window.alert(copy.shareFailedWithReason.replace('{reason}', localizedReason));
    }
  };

  const handleImportLocalWorkspaceToCloud = async () => {
    if (!authenticatedUser || !cloudRepositoryRef.current) {
      return;
    }

    try {
      setIsImportingLocalWorkspace(true);
      const nextWorkspace = await cloudRepositoryRef.current.importLocalWorkspace({
        songs,
        setlists,
        joinedSetlists: [],
        lastSavedAt
      });
      setSongs(nextWorkspace.songs);
      setSavedSongs(cloneSong(nextWorkspace.songs));
      setSetlists(nextWorkspace.setlists);
      setSavedSetlists(cloneSong(nextWorkspace.setlists));
      setJoinedSetlists(nextWorkspace.joinedSetlists);
      setLastSavedAt(nextWorkspace.lastSavedAt);
      markMigrationCompleted(authenticatedUser.id);
      setIsImportPromptOpen(false);
      setSyncStatus('saved');
    } catch (error) {
      setAuthUiError(error instanceof Error ? error.message : copy.cloudSyncFailed);
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    } finally {
      setIsImportingLocalWorkspace(false);
    }
  };

  const handleDismissImportPrompt = () => {
    if (authenticatedUser) {
      markMigrationCompleted(authenticatedUser.id);
    }
    setIsImportPromptOpen(false);
  };

  const handleSidebarResizeStart = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsSidebarPinned(true);
    setIsSidebarHovered(true);
    setIsSidebarResizing(true);
  };

  const metadataPanelContent = isSetlistMode
    ? (selectedSetlist && selectedSetlistSong && selectedSetlistSourceSong ? (
        <SongMetadataPanel
          song={activeSetlistEditableSong ?? selectedSetlistSourceSong}
          language={language}
          title={copy.setlistEditor.instanceSettings}
          onChange={handleSetlistSongContentChange}
          keyValue={currentSetlistKey}
          capoValue={currentSetlistCapo}
          onKeyChange={handleSetlistKeyChange}
          onCapoChange={(capo) => handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
            ...currentSetlistSong,
            capo
          }))}
          displayMode={selectedSetlist.displayMode}
          showLyrics={selectedSetlist.showLyrics}
          onDisplayModeChange={(mode) => handleSetlistDisplaySettingsChange(selectedSetlist.id, { displayMode: mode })}
          onShowLyricsChange={(nextShowLyrics) => handleSetlistDisplaySettingsChange(selectedSetlist.id, { showLyrics: nextShowLyrics })}
        />
      ) : null)
    : (
        <SongMetadataPanel
          song={song}
          language={language}
          title={language === 'zh' ? '編輯歌曲' : 'Edit Song'}
          onChange={handleSongChange}
          displayMode={
            song.showNashvilleNumbers
              ? 'nashville-number-system'
              : song.showAbsoluteJianpu
                ? 'chord-fixed-key'
                : 'chord-movable-key'
          }
          showLyrics={song.showLyrics ?? false}
          onDisplayModeChange={(mode) => handleSongChange({
            ...song,
            showNashvilleNumbers: mode === 'nashville-number-system',
            showAbsoluteJianpu: mode === 'chord-fixed-key'
          })}
          onShowLyricsChange={(nextShowLyrics) => handleSongChange({
            ...song,
            showLyrics: nextShowLyrics
          })}
        />
      );

  const mobileMetadataSummaryCard = isPhoneViewport && isEditing && isSheetView && mobileMetadataSong && metadataPanelContent ? (
    <button
      type="button"
      onClick={() => {
        setIsMobileMetadataOpen(true);
        setIsMobileActionsSheetOpen(false);
      }}
      className="w-full rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">{mobileMetadataTitle}</div>
          <div className="mt-1 truncate text-base font-bold text-gray-900">
            {mobileMetadataSong.title || copy.untitledSong}
          </div>
          {(mobileMetadataVersion || mobileMetadataTranslator) ? (
            <div className="mt-1 truncate text-xs font-medium text-gray-500">
              {[mobileMetadataVersion, mobileMetadataTranslator].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
          {language === 'zh' ? '編輯' : 'Edit'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {[
          { label: copy.key, value: mobileMetadataKey },
          { label: 'Capo', value: String(mobileMetadataCapo) },
          { label: copy.editor.tempo, value: mobileMetadataTempo },
          { label: copy.editor.timeSignature, value: mobileMetadataTime }
        ].map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-2 py-2">
            <div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400">{item.label}</div>
            <div className="mt-1 truncate text-sm font-semibold text-gray-800">{item.value}</div>
          </div>
        ))}
      </div>
    </button>
  ) : null;

  return (
    <div
      data-app-root
      className="relative flex h-[100dvh] min-h-[100dvh] min-w-0 overflow-hidden bg-[#F5F5F4] font-sans text-[#1C1917] selection:bg-indigo-100 selection:text-indigo-900"
    >
      {usesOverlaySidebar && isSidebarExpanded && (
        <button
          type="button"
          onClick={() => {
            if (isPhoneViewport) {
              setIsMobileNavOpen(false);
            } else {
              setIsSidebarPinned(false);
              setIsSidebarHovered(false);
            }
          }}
          className="absolute inset-0 z-40 bg-stone-950/10 backdrop-blur-[1px]"
          aria-label={copy.collapseSongList}
        />
      )}

      {/* Navigation Rail / Sidebar */}
      <motion.aside
        data-sidebar
        initial={false}
        animate={isPhoneViewport ? { width: phoneSidebarShellWidth } : { width: sidebarShellWidth }}
        transition={isSidebarResizing ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.32 }}
        className={isPhoneViewport ? 'absolute inset-y-0 left-0 z-50 overflow-hidden' : 'relative z-50 flex-shrink-0 overflow-visible'}
        style={isPhoneViewport ? { pointerEvents: isMobileNavOpen ? 'auto' : 'none' } : undefined}
      >
        <motion.div
          initial={false}
          animate={isPhoneViewport
            ? { x: isMobileNavOpen ? 0 : -phoneSidebarHiddenOffset, opacity: isMobileNavOpen ? 1 : 0.96 }
            : { width: currentSidebarWidth }}
          transition={isSidebarResizing
            ? { duration: 0 }
            : isPhoneViewport
              ? { type: 'spring', bounce: 0, duration: 0.28 }
              : { type: 'spring', bounce: 0, duration: 0.32 }}
          onMouseEnter={handleSidebarHoverTrigger}
          onMouseMove={handleSidebarHoverTrigger}
          onMouseLeave={() => {
            if (!isSidebarPinned) {
              setIsSidebarHovered(false);
            }
          }}
          className={`absolute inset-y-0 left-0 flex overflow-hidden border-r border-gray-200 bg-white ${
            isPhoneViewport
              ? 'rounded-r-[28px] shadow-[0_24px_60px_rgba(15,23,42,0.18)]'
              : usesOverlaySidebar && isSidebarExpanded
              ? 'rounded-r-[28px] shadow-[0_24px_60px_rgba(15,23,42,0.18)]'
              : ''
          }`}
          style={isPhoneViewport ? { width: `${resolvedSidebarWidth}px` } : undefined}
        >
          {isSidebarExpanded && !usesOverlaySidebar && !isPhoneViewport && (
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
          {!isPhoneViewport && (
            <div
              className="flex h-full shrink-0 flex-col items-center gap-3 border-r border-gray-200 bg-white py-4 sm:py-5"
              style={{ width: `${collapsedSidebarWidth}px` }}
            >
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

              <div className="flex w-full flex-col items-center gap-2 px-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode('songs')}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                    !isSetlistMode ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={copy.songs}
                >
                  <FileText size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode('setlists')}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                    isSetlistMode ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={copy.setlists}
                >
                  <ListMusic size={18} />
                </button>
                <button
                  type="button"
                  onClick={isSetlistMode ? handleCreateSetlist : handleCreateSong}
                  className="w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100"
                  title={isSetlistMode ? copy.newSetlist : copy.newSong}
                >
                  <Plus size={18} />
                </button>
              </div>

              <div className="mt-auto flex w-full flex-col items-center gap-3 px-2">
                <div className="flex flex-col items-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                  <span>{isSetlistMode ? copy.setlists : copy.songs}</span>
                  <div className="min-w-10 rounded-full bg-gray-100 px-2 py-1 text-center text-xs text-gray-700">
                    {isSetlistMode ? setlists.length : songs.length}
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
          )}

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
            {isPhoneViewport && (
              <div className="border-b border-gray-200 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <img src={logoSrc} alt="ChordMaster" className="h-10 w-10 rounded-xl shadow-sm ring-1 ring-indigo-100" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-gray-900">{APP_NAME}</div>
                      <div className="mt-0.5 truncate text-xs font-medium text-gray-500">
                        {mobileDrawerContextLabel}
                        {mobileDrawerContextValue ? ` · ${mobileDrawerContextValue}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(false)}
                    className="rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
                  >
                    {copy.done}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMode('songs');
                      setActiveAppView('sheet');
                    }}
                    className={`min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      !isSetlistMode && isSheetView
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {copy.songs}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMode('setlists');
                      setActiveAppView('sheet');
                    }}
                    className={`min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      isSetlistMode && isSheetView
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {copy.setlists}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleAppViewChange('about');
                      setIsMobileNavOpen(false);
                    }}
                    className={`min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      activeAppView === 'about'
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {copy.about}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleAppViewChange('help');
                      setIsMobileNavOpen(false);
                    }}
                    className={`min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      activeAppView === 'help'
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {copy.help}
                  </button>
                </div>
              </div>
            )}

            {isSetlistMode ? (
              isPhoneViewport ? (
                <>
                  {mobileSetlistDrawerView === 'detail' && selectedSetlist ? (
                    <>
                      <div className="border-b border-gray-200 px-4 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setIsSetlistActionsMenuOpen(false);
                              setIsSetlistAddSongsOpen(false);
                              setSetlistSongSearchQuery('');
                              setMobileSetlistDrawerView('list');
                            }}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                            title={copy.backToPreview}
                            aria-label={copy.backToPreview}
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <div className="min-w-0 flex-1">
                            {isJoinedSetlist ? (
                              <div className="text-base font-bold text-gray-900 truncate">{selectedSetlist.name}</div>
                            ) : (
                              <input
                                value={selectedSetlist.name}
                                onChange={(event) => handleSetlistNameChange(selectedSetlist.id, event.target.value)}
                                className="w-full rounded-lg bg-transparent text-base font-bold text-gray-900 outline-none placeholder:text-gray-400 focus:bg-indigo-50/50"
                                placeholder={copy.untitledSetlist}
                              />
                            )}
                            <div className="mt-0.5 text-xs font-medium text-gray-500">{setlistSongsWithSource.length} {copy.setlistItems}</div>
                          </div>
                          {isJoinedSetlist ? (
                            <button
                              type="button"
                              onClick={() => void handleLeaveSharedSetlist(selectedSetlist.id)}
                              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                            >
                              {copy.leaveSetlist}
                            </button>
                          ) : (
                          <div ref={setlistActionsMenuRef} className="relative">
                            <button
                              type="button"
                              onClick={() => setIsSetlistActionsMenuOpen((current) => !current)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                              title={language === 'zh' ? '歌單操作' : 'Setlist Actions'}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {isSetlistActionsMenuOpen && (
                              <div className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSetlist(selectedSetlist.id)}
                                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                                >
                                  {copy.delete}
                                </button>
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-3">
                        <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{copy.setlistItems}</div>
                        {setlistSongsWithSource.length === 0 ? (
                          <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                            {copy.noSetlistSongs}
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {setlistSongsWithSource.map(({ item, sourceSong }) => {
                              const isActive = item.id === selectedSetlistSong?.id;
                              const effectiveKey = item.overrideKey ?? sourceSong.currentKey;
                              const effectiveCapo = typeof item.capo === 'number' ? item.capo : (sourceSong.capo ?? 0);
                              const displaySong = item.songData ?? sourceSong;
                              const versionSummary = getSongVersionSummary(displaySong);
                              const isDropTarget = dragOverSetlistSongId === item.id;

                              return (
                                <div
                                  key={item.id}
                                  {...(!isJoinedSetlist && {
                                    draggable: true,
                                    onDragStart: () => setDraggingSetlistSongId(item.id),
                                    onDragOver: (event: React.DragEvent) => {
                                      event.preventDefault();
                                      if (dragOverSetlistSongId !== item.id) setDragOverSetlistSongId(item.id);
                                    },
                                    onDragLeave: () => { if (dragOverSetlistSongId === item.id) setDragOverSetlistSongId(null); },
                                    onDrop: (event: React.DragEvent) => {
                                      event.preventDefault();
                                      if (draggingSetlistSongId) moveSetlistSong(draggingSetlistSongId, item.id);
                                      setDraggingSetlistSongId(null);
                                      setDragOverSetlistSongId(null);
                                    },
                                    onDragEnd: () => { setDraggingSetlistSongId(null); setDragOverSetlistSongId(null); }
                                  })}
                                  className={`group rounded-xl border px-2.5 py-2 transition-all ${
                                    isActive
                                      ? 'border-indigo-200 bg-indigo-50/80 shadow-sm shadow-indigo-100/60'
                                      : isDropTarget
                                        ? 'border-indigo-200 bg-indigo-50/70'
                                        : 'border-gray-200 bg-white hover:bg-gray-50/70'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                      <div className="flex min-w-0 items-center gap-2">
                                        {!isJoinedSetlist && (
                                          <div className="cursor-grab rounded-lg border border-gray-200 bg-white p-2 text-gray-400 transition-colors group-hover:border-indigo-200 group-hover:text-indigo-500 active:cursor-grabbing">
                                            <GripVertical size={14} />
                                          </div>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleSelectSetlistSong(item.id)}
                                          className="min-w-0 flex-1 text-left"
                                        >
                                          <div className="truncate text-sm font-bold text-gray-900">{sourceSong.title || copy.untitledSong}</div>
                                          {!isJoinedSetlist && (
                                            <div className="mt-0.5 truncate text-[11px] font-medium text-gray-400">
                                              {typeof displaySong.tempo === 'number' ? `${displaySong.tempo} BPM` : 'BPM --'}
                                              {versionSummary ? ` · ${versionSummary}` : ''}
                                            </div>
                                          )}
                                        </button>
                                        {!isJoinedSetlist && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveSetlistSong(item.id)}
                                            className="rounded-full p-1.5 text-gray-300 opacity-70 transition-all group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                                            title={copy.removeFromSetlist}
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                      <div className={`flex min-w-0 items-center gap-1 ${!isJoinedSetlist ? 'pl-10' : ''}`}>
                                        {!isJoinedSetlist && (
                                          <div className="w-[56px] shrink-0">
                                            <KeyPicker
                                              value={effectiveKey}
                                              onChange={(key) => key && handleUpdateSetlistSong(item.id, (currentSetlistSong) => ({
                                                ...currentSetlistSong,
                                                overrideKey: key
                                              }))}
                                              label={copy.key}
                                              originalKey={sourceSong.currentKey}
                                              align="left"
                                              buttonClassName="!h-5 !w-[56px] !min-w-0 !gap-1 !rounded-md !border-gray-200 !bg-gray-50 !px-1.5"
                                              valueTextClassName="!text-[10px] !leading-none"
                                              triggerIconSize={10}
                                            />
                                          </div>
                                        )}
                                        <div className="w-[56px] shrink-0">
                                          <CapoPicker
                                            value={effectiveCapo}
                                            currentKey={effectiveKey}
                                            onChange={isJoinedSetlist
                                              ? (capo) => handleJoinedSetlistCapoChange(item.id, capo)
                                              : (capo) => handleUpdateSetlistSong(item.id, (currentSetlistSong) => ({ ...currentSetlistSong, capo }))}
                                            label="Capo"
                                            align="right"
                                            buttonClassName="!h-5 !w-[56px] !min-w-0 !gap-1 !rounded-md !border-gray-200 !bg-gray-50 !px-1.5"
                                            valueTextClassName="!text-[10px] !leading-none"
                                            showPlayKey={false}
                                            triggerIconSize={10}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : mobileSetlistDrawerView === 'addSongs' && selectedSetlist ? (
                    <>
                      <div className="border-b border-gray-200 px-4 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setIsSetlistActionsMenuOpen(false);
                              setIsSetlistAddSongsOpen(false);
                              setSetlistSongSearchQuery('');
                              setMobileSetlistDrawerView('detail');
                            }}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                            title={copy.backToPreview}
                            aria-label={copy.backToPreview}
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-base font-bold text-gray-900">{copy.addToSetlist}</div>
                            <div className="mt-0.5 truncate text-xs font-medium text-gray-500">{selectedSetlist.name || copy.untitledSetlist}</div>
                          </div>
                        </div>

                        <label className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                          <Search size={14} className="text-gray-400" />
                          <input
                            type="text"
                            value={setlistSongSearchQuery}
                            onChange={(event) => setSetlistSongSearchQuery(event.target.value)}
                            placeholder={copy.searchSongsToAdd}
                            className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                          />
                        </label>
                      </div>

                      <div className="flex-1 overflow-y-auto p-3">
                        <div className="space-y-2">
                          {filteredSongsForSetlist.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                              {copy.noSongsMatch}
                            </div>
                          ) : (
                            filteredSongsForSetlist.map((librarySong) => {
                              const libraryMeta = getSongLibraryMeta(librarySong, copy.editor.shuffle);
                              return (
                                <div
                                  key={`setlist-add-${librarySong.id}`}
                                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-bold text-gray-900">
                                      {librarySong.title || copy.untitledSong}
                                    </div>
                                    <div className="mt-0.5 truncate text-[11px] text-gray-500" title={libraryMeta.tooltip}>
                                      {libraryMeta.primary}
                                    </div>
                                    {libraryMeta.secondary && (
                                      <div className="truncate text-[11px] text-gray-400" title={libraryMeta.tooltip}>
                                        {libraryMeta.secondary}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddSongToSetlist(librarySong.id)}
                                    className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
                                  >
                                    {copy.addToSetlist}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="px-5 py-6 border-b border-gray-200">
                        <div className={isPhoneViewport ? '' : 'min-w-0'}>
                          {!isPhoneViewport && (
                            <>
                              <div className="flex items-center gap-2">
                                <img src={logoSrc} alt="ChordMaster" className="h-7 w-7 rounded-lg shadow-sm ring-1 ring-indigo-100" />
                                <div className="text-lg font-bold tracking-tight">ChordMaster</div>
                              </div>
                              <div className="text-xs font-medium text-gray-500">{copy.serviceSetlist}</div>
                            </>
                          )}
                        </div>
                        <div className={isPhoneViewport ? '' : 'mt-4'}>
                          <button
                            type="button"
                            onClick={handleCreateSetlist}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                          >
                            <Plus size={16} />
                            <span>{copy.newSetlist}</span>
                          </button>
                        </div>
                        <label className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                          <Search size={15} className="text-gray-400" />
                          <input
                            type="text"
                            value={setlistSearchQuery}
                            onChange={(event) => setSetlistSearchQuery(event.target.value)}
                            placeholder={copy.searchSetlists}
                            className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                          />
                        </label>
                      </div>

                      <div className="px-3 py-3 border-b border-gray-100">
                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                          <span>{copy.setlists}</span>
                          <span>{normalizedSetlistSearchQuery ? `${filteredSetlists.length}/${setlists.length}` : setlists.length}</span>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-3">
                        <div className="space-y-2">
                          {filteredSetlists.length === 0 && (
                            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                              {copy.noSetlists}
                            </div>
                          )}
                          {filteredSetlists.map((item) => {
                            const isActive = item.id === selectedSetlist?.id;
                            const isSwipeOpen = mobileSwipeOpenSetlistId === item.id;
                            return (
                              <div key={item.id} className="relative overflow-hidden rounded-2xl">
                                <div className="absolute inset-y-0 right-0 flex items-stretch">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleDeleteSetlist(item.id);
                                    }}
                                    className="flex w-20 items-center justify-center bg-rose-500 px-3 text-sm font-bold text-white"
                                    aria-label={`${copy.delete} ${item.name || copy.untitledSetlist}`}
                                    title={copy.delete}
                                  >
                                    {copy.delete}
                                  </button>
                                </div>
                                <div
                                  onTouchStart={(event) => {
                                    handleMobileSetlistTouchStart(item.id, event);
                                    handleMobileLongPressStart('setlist', item.id, event);
                                  }}
                                  onTouchMove={(event) => handleMobileLongPressMove(event)}
                                  onTouchEnd={(event) => {
                                    if (mobileLongPressTriggeredRef.current) {
                                      mobileLongPressTriggeredRef.current = false;
                                      mobileSetlistSwipeHandledRef.current = true;
                                      handleMobileLongPressEnd();
                                      event.preventDefault();
                                      return;
                                    }

                                    handleMobileLongPressEnd();
                                    handleMobileSetlistTouchEnd(item.id, event);
                                  }}
                                  onTouchCancel={() => {
                                    mobileSetlistSwipeRef.current = null;
                                    handleMobileLongPressEnd();
                                    mobileSetlistSwipeHandledRef.current = false;
                                  }}
                                  className={`relative rounded-2xl border p-3 transition-transform duration-200 ease-out [touch-action:pan-y] ${
                                    isActive ? 'border-indigo-200 bg-indigo-50 shadow-sm shadow-indigo-100' : 'border-gray-200 bg-white'
                                  } ${isSwipeOpen ? '-translate-x-20' : 'translate-x-0'}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (mobileSetlistSwipeHandledRef.current) {
                                        mobileSetlistSwipeHandledRef.current = false;
                                        return;
                                      }

                                      if (isSwipeOpen) {
                                        setMobileSwipeOpenSetlistId(null);
                                        return;
                                      }

                                      handleSelectSetlist(item.id);
                                    }}
                                    className="w-full text-left"
                                  >
                                    <div className="text-sm font-bold text-gray-900">{item.name || copy.untitledSetlist}</div>
                                    <div className="mt-1 text-xs text-gray-500">{item.songs.length} {copy.setlistItems}</div>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {joinedSetlists.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{copy.sharedWithMe}</div>
                            {joinedSetlists.map((joinedItem) => {
                              const isJoinedActive = joinedItem.id === selectedSetlist?.id;
                              return (
                                <div
                                  key={joinedItem.id}
                                  className={`rounded-2xl border p-3 transition-all ${
                                    isJoinedActive ? 'border-indigo-200 bg-indigo-50 shadow-sm shadow-indigo-100' : 'border-gray-200 bg-white'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleSelectJoinedSetlist(joinedItem.id)}
                                    className="w-full text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{joinedItem.name || copy.untitledSetlist}</div>
                                      <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{copy.joinedSetlistBadge}</span>
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500">{joinedItem.songs.length} {copy.setlistItems}</div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {mobileSetlistDrawerView === 'detail' && selectedSetlist && !isJoinedSetlist && (
                    <div className="border-t border-gray-200 bg-white px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSetlistActionsMenuOpen(false);
                          setIsSetlistAddSongsOpen(true);
                          setMobileSetlistDrawerView('addSongs');
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                      >
                        <Plus size={16} />
                        <span>{copy.addToSetlist}</span>
                      </button>
                    </div>
                  )}

                  <div className="border-t border-gray-200 px-5 py-4">
                    <div className={`text-xs font-medium ${workspaceIsDirty ? 'text-amber-600' : 'text-gray-500'}`}>
                      {workspaceIsDirty ? copy.unsavedChanges : formatSavedAt(lastSavedAt, language)}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {isAutoSaveEnabled ? copy.autoSavedHint : copy.manualSaveHint}
                    </div>
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                      v{APP_VERSION}
                    </div>
                  </div>
                </>
              ) : (
                <>
                <div className="px-5 py-6 border-b border-gray-200">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <img src={logoSrc} alt="ChordMaster" className="h-7 w-7 rounded-lg shadow-sm ring-1 ring-indigo-100" />
                      <div className="text-lg font-bold tracking-tight">ChordMaster</div>
                    </div>
                    <div className="text-xs font-medium text-gray-500">{copy.serviceSetlist}</div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleCreateSetlist}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                    >
                      <Plus size={16} />
                      <span>{copy.newSetlist}</span>
                    </button>
                  </div>
                  <label className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                    <Search size={15} className="text-gray-400" />
                    <input
                      type="text"
                      value={setlistSearchQuery}
                      onChange={(event) => setSetlistSearchQuery(event.target.value)}
                      placeholder={copy.searchSetlists}
                      className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                    />
                  </label>
                </div>

                <div className="px-3 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                    <span>{copy.setlists}</span>
                    <span>{normalizedSetlistSearchQuery ? `${filteredSetlists.length}/${setlists.length}` : setlists.length}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  <div className="space-y-2">
                    {filteredSetlists.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        {copy.noSetlists}
                      </div>
                    )}
                    {filteredSetlists.map((item) => {
                      const isActive = item.id === selectedSetlist?.id;
                      return (
                        <div
                          key={item.id}
                          className={`rounded-2xl border p-3 transition-all ${
                            isActive ? 'border-indigo-200 bg-indigo-50 shadow-sm shadow-indigo-100' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectSetlist(item.id)}
                            className="w-full text-left"
                          >
                            <div className="text-sm font-bold text-gray-900">{item.name || copy.untitledSetlist}</div>
                            <div className="mt-1 text-xs text-gray-500">{item.songs.length} {copy.setlistItems}</div>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {joinedSetlists.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{copy.sharedWithMe}</div>
                      {joinedSetlists.map((item) => {
                        const isActive = item.id === selectedSetlist?.id;
                        return (
                          <div
                            key={item.id}
                            className={`rounded-2xl border p-3 transition-all ${
                              isActive ? 'border-indigo-200 bg-indigo-50 shadow-sm shadow-indigo-100' : 'border-gray-200 bg-white'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectJoinedSetlist(item.id)}
                              className="w-full text-left"
                            >
                              <div className="flex items-center gap-2">
                                <div className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{item.name || copy.untitledSetlist}</div>
                                <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{copy.joinedSetlistBadge}</span>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">{item.songs.length} {copy.setlistItems}</div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedSetlist && (
                    <div className="mt-5 space-y-4 border-t border-gray-200 pt-4">
                      {isJoinedSetlist ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{copy.joinedSetlistBadge}</span>
                            <div className="mt-1 truncate text-sm font-bold text-gray-900">{selectedSetlist.name}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleLeaveSharedSetlist(selectedSetlist.id)}
                            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                          >
                            {copy.leaveSetlist}
                          </button>
                        </div>
                      ) : (
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{copy.setlistName}</div>
                        <div className="flex items-center gap-2">
                          <input
                            value={selectedSetlist.name}
                            onChange={(event) => handleSetlistNameChange(selectedSetlist.id, event.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-indigo-300"
                            placeholder={copy.untitledSetlist}
                          />
                          <div ref={setlistActionsMenuRef} className="relative">
                            <button
                              type="button"
                              onClick={() => setIsSetlistActionsMenuOpen((current) => !current)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                              title={language === 'zh' ? '歌單操作' : 'Setlist Actions'}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {isSetlistActionsMenuOpen && (
                              <div className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSetlist(selectedSetlist.id)}
                                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                                >
                                  {copy.delete}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      )}

                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{copy.setlistItems}</div>
                        {setlistSongsWithSource.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                            {copy.noSetlistSongs}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {setlistSongsWithSource.map(({ item, sourceSong }) => {
                              const isActive = item.id === selectedSetlistSong?.id;
                              const effectiveKey = item.overrideKey ?? sourceSong.currentKey;
                              const effectiveCapo = typeof item.capo === 'number' ? item.capo : (sourceSong.capo ?? 0);
                              const displaySong = item.songData ?? sourceSong;
                              const versionSummary = getSongVersionSummary(displaySong);
                              const isDropTarget = dragOverSetlistSongId === item.id;

                              return (
                                <div
                                  key={item.id}
                                  {...(!isJoinedSetlist && {
                                    draggable: true,
                                    onDragStart: () => setDraggingSetlistSongId(item.id),
                                    onDragOver: (event: React.DragEvent) => {
                                      event.preventDefault();
                                      if (dragOverSetlistSongId !== item.id) setDragOverSetlistSongId(item.id);
                                    },
                                    onDragLeave: () => { if (dragOverSetlistSongId === item.id) setDragOverSetlistSongId(null); },
                                    onDrop: (event: React.DragEvent) => {
                                      event.preventDefault();
                                      if (draggingSetlistSongId) moveSetlistSong(draggingSetlistSongId, item.id);
                                      setDraggingSetlistSongId(null);
                                      setDragOverSetlistSongId(null);
                                    },
                                    onDragEnd: () => { setDraggingSetlistSongId(null); setDragOverSetlistSongId(null); }
                                  })}
                                  className={`group rounded-xl border px-2.5 py-2 transition-all ${
                                    isActive
                                      ? 'border-indigo-200 bg-indigo-50/80 shadow-sm shadow-indigo-100/60'
                                      : isDropTarget
                                        ? 'border-indigo-200 bg-indigo-50/70'
                                        : 'border-gray-200 bg-white hover:bg-gray-50/70'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                      <div className="flex min-w-0 items-center gap-2">
                                        {!isJoinedSetlist && (
                                          <div className="cursor-grab rounded-lg border border-gray-200 bg-white p-2 text-gray-400 transition-colors group-hover:border-indigo-200 group-hover:text-indigo-500 active:cursor-grabbing">
                                            <GripVertical size={14} />
                                          </div>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleSelectSetlistSong(item.id)}
                                          className="min-w-0 flex-1 text-left"
                                        >
                                          <div className="truncate text-sm font-bold text-gray-900">{sourceSong.title || copy.untitledSong}</div>
                                          {!isJoinedSetlist && (
                                            <div className="mt-0.5 truncate text-[11px] font-medium text-gray-400">
                                              {typeof displaySong.tempo === 'number' ? `${displaySong.tempo} BPM` : 'BPM --'}
                                              {versionSummary ? ` · ${versionSummary}` : ''}
                                            </div>
                                          )}
                                        </button>
                                        {!isJoinedSetlist && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveSetlistSong(item.id)}
                                            className="rounded-full p-1.5 text-gray-300 opacity-70 transition-all group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                                            title={copy.removeFromSetlist}
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                      <div className={`flex min-w-0 items-center gap-1 ${!isJoinedSetlist ? 'pl-10' : ''}`}>
                                        {!isJoinedSetlist && (
                                          <div className="w-[56px] shrink-0">
                                            <KeyPicker
                                              value={effectiveKey}
                                              onChange={(key) => key && handleUpdateSetlistSong(item.id, (currentSetlistSong) => ({
                                                ...currentSetlistSong,
                                                overrideKey: key
                                              }))}
                                              label={copy.key}
                                              originalKey={sourceSong.currentKey}
                                              align="left"
                                              buttonClassName="!h-5 !w-[56px] !min-w-0 !gap-1 !rounded-md !border-gray-200 !bg-gray-50 !px-1.5"
                                              valueTextClassName="!text-[10px] !leading-none"
                                              triggerIconSize={10}
                                            />
                                          </div>
                                        )}
                                        <div className="w-[56px] shrink-0">
                                          <CapoPicker
                                            value={effectiveCapo}
                                            currentKey={effectiveKey}
                                            onChange={isJoinedSetlist
                                              ? (capo) => handleJoinedSetlistCapoChange(item.id, capo)
                                              : (capo) => handleUpdateSetlistSong(item.id, (currentSetlistSong) => ({ ...currentSetlistSong, capo }))}
                                            label="Capo"
                                            align="right"
                                            buttonClassName="!h-5 !w-[56px] !min-w-0 !gap-1 !rounded-md !border-gray-200 !bg-gray-50 !px-1.5"
                                            valueTextClassName="!text-[10px] !leading-none"
                                            showPlayKey={false}
                                            triggerIconSize={10}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {!isJoinedSetlist && isSetlistAddSongsOpen && (
                        <div className="space-y-3 border-t border-gray-200 pt-4">
                          <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{copy.addToSetlist}</div>
                          <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                            <Search size={14} className="text-gray-400" />
                            <input
                              type="text"
                              value={setlistSongSearchQuery}
                              onChange={(event) => setSetlistSongSearchQuery(event.target.value)}
                              placeholder={copy.searchSongsToAdd}
                              className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                            />
                          </label>

                          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {filteredSongsForSetlist.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                                {copy.noSongsMatch}
                              </div>
                            ) : (
                              filteredSongsForSetlist.map((librarySong) => {
                                const libraryMeta = getSongLibraryMeta(librarySong, copy.editor.shuffle);
                                return (
                                  <div
                                    key={`setlist-add-${librarySong.id}`}
                                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-bold text-gray-900">
                                        {librarySong.title || copy.untitledSong}
                                      </div>
                                      <div className="mt-0.5 truncate text-[11px] text-gray-500" title={libraryMeta.tooltip}>
                                        {libraryMeta.primary}
                                      </div>
                                      {libraryMeta.secondary && (
                                        <div className="truncate text-[11px] text-gray-400" title={libraryMeta.tooltip}>
                                          {libraryMeta.secondary}
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleAddSongToSetlist(librarySong.id)}
                                      className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
                                    >
                                      {copy.addToSetlist}
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>

                {selectedSetlist && !isJoinedSetlist && (
                  <div className="border-t border-gray-200 bg-white px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setIsSetlistAddSongsOpen((current) => !current)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                    >
                      <Plus size={16} />
                      <span>{isSetlistAddSongsOpen ? copy.done : copy.addToSetlist}</span>
                    </button>
                  </div>
                )}

                <div className="border-t border-gray-200 px-5 py-4">
                  <div className={`text-xs font-medium ${workspaceIsDirty ? 'text-amber-600' : 'text-gray-500'}`}>
                    {workspaceIsDirty ? copy.unsavedChanges : formatSavedAt(lastSavedAt, language)}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {isAutoSaveEnabled ? copy.autoSavedHint : copy.manualSaveHint}
                  </div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    v{APP_VERSION}
                  </div>
                </div>
              </>
              )
            ) : (
              <>
                <div className="px-5 py-6 border-b border-gray-200">
                  {!isPhoneViewport && (
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <img src={logoSrc} alt="ChordMaster" className="h-7 w-7 rounded-lg shadow-sm ring-1 ring-indigo-100" />
                        <div className="text-lg font-bold tracking-tight">ChordMaster</div>
                      </div>
                      <div className="text-xs font-medium text-gray-500">{copy.songLibrary}</div>
                    </div>
                  )}
                  {isPhoneViewport ? (
                    <div className="flex items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                        <Search size={15} className="shrink-0 text-gray-400" />
                        <input
                          type="text"
                          value={librarySearchQuery}
                          onChange={(event) => setLibrarySearchQuery(event.target.value)}
                          placeholder={copy.searchSongs}
                          className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleCreateSong}
                        aria-label={copy.newSong}
                        title={copy.newSong}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                      >
                        <Plus size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsLibraryEditing(!isLibraryEditing)}
                        aria-label={isLibraryEditing ? copy.done : copy.manage}
                        title={isLibraryEditing ? copy.done : copy.manage}
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isLibraryEditing ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Edit3 size={18} />
                      </button>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
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
                              if (mobileLongPressTriggeredRef.current) {
                                mobileLongPressTriggeredRef.current = false;
                                return;
                              }

                              handleSelectSong(item.id);
                            }}
                            onTouchStart={(event) => handleMobileLongPressStart('song', item.id, event)}
                            onTouchMove={(event) => handleMobileLongPressMove(event)}
                            onTouchEnd={(event) => {
                              if (mobileLongPressTriggeredRef.current) {
                                event.preventDefault();
                              }
                              handleMobileLongPressEnd();
                            }}
                            onTouchCancel={() => handleMobileLongPressEnd()}
                            className="w-full px-3 py-3 pr-14 text-left [touch-action:pan-y]"
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
                  <div className={`text-xs font-medium ${workspaceIsDirty ? 'text-amber-600' : 'text-gray-500'}`}>
                    {workspaceIsDirty ? copy.unsavedChanges : formatSavedAt(lastSavedAt, language)}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {isAutoSaveEnabled ? copy.autoSavedHint : copy.manualSaveHint}
                  </div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    v{APP_VERSION}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      </motion.aside>

      {/* Main Content */}
      <main data-main-panel className="flex min-w-0 flex-1 flex-col">
        <div className={`flex-shrink-0 border-b border-amber-200 bg-amber-50 ${
          isPhoneViewport ? 'px-3 py-1.5' : 'px-4 py-2.5 sm:px-6 xl:px-8'
        }`}>
          <p
            className={`font-medium text-amber-800 ${
              isPhoneViewport ? 'truncate text-xs leading-5' : 'text-sm'
            }`}
            title={copy.testVersionWarning}
          >
            {copy.testVersionWarning}
          </p>
        </div>

        {(!isAuthenticated || authUiError || authUiMessage || isLoadingCloudWorkspace) && (
          <div className={`flex-shrink-0 border-b ${
            authUiError
              ? 'border-rose-200 bg-rose-50'
              : isAuthenticated
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-sky-200 bg-sky-50'
          } ${isPhoneViewport ? 'px-3 py-1.5' : 'px-4 py-2 sm:px-6 xl:px-8'}`}>
            <p
              className={`font-medium ${
                authUiError
                  ? 'text-rose-700'
                  : isAuthenticated
                    ? 'text-emerald-700'
                    : 'text-sky-800'
              } ${isPhoneViewport ? 'text-xs leading-5' : 'text-sm'}`}
            >
              {authUiError
                ?? authUiMessage
                ?? (isLoadingCloudWorkspace
                  ? copy.cloudSyncSyncing
                  : (!isAuthenticated ? copy.localModeWarning : syncStatusLabel))}
            </p>
          </div>
        )}

        {/* Top Control Bar */}
        <header data-topbar className={`z-40 flex-shrink-0 border-b border-gray-200 bg-white/80 backdrop-blur-md ${
          isPhoneViewport
            ? 'px-3 py-2.5'
            : usesDenseDesktopHeader
              ? 'px-4 py-2.5 sm:px-5 xl:px-6'
              : 'px-4 py-3 sm:px-6 sm:py-4 xl:px-8'
        }`}>
          {isPhoneViewport ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileNavOpen((current) => !current);
                    setIsMobileActionsSheetOpen(false);
                    setIsMobileMetadataOpen(false);
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  aria-label={isMobileNavOpen ? copy.collapseSongList : copy.pinSongList}
                  title={isMobileNavOpen ? copy.collapseSongList : copy.pinSongList}
                >
                  <ChevronRight size={18} className={`transition-transform ${isMobileNavOpen ? 'rotate-180' : ''}`} />
                </button>

                <img src={logoSrc} alt="ChordMaster" className="h-9 w-9 rounded-xl shadow-sm ring-1 ring-indigo-100" />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold tracking-tight text-gray-900">{APP_NAME}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    {isSheetView ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${
                        isSetlistMode
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                          : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
                      }`}>
                        {workspaceModeBadge}
                      </span>
                    ) : null}
                    <span className="truncate text-[11px] font-medium text-gray-500">{activeAppViewLabel}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileActionsSheetOpen(true);
                    setIsMobileNavOpen(false);
                    setIsMobileMetadataOpen(false);
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  aria-label={copy.editor.more}
                  title={copy.editor.more}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>

              {isSheetView ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className={`${getMobileTopbarActionClassName(isEditing ? 'primary' : 'default')} shrink-0`}
                    title={isEditing ? copy.closeEditor : copy.openEditor}
                    aria-label={isEditing ? copy.closeEditor : copy.openEditor}
                  >
                    <Edit3 size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleLyricsMode}
                    className={`${getMobileTopbarActionClassName(isLyricsMode ? 'accent' : 'default')} shrink-0`}
                    title={copy.lyricsMode}
                    aria-label={copy.lyricsMode}
                  >
                    <FileText size={16} />
                  </button>

                  <KeyPicker
                    value={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(key) => {
                      if (!key) {
                        return;
                      }

                      if (isSetlistMode) {
                        handleSetlistKeyChange(key);
                      } else {
                        handleKeyChange(key);
                      }
                    }}
                    label={copy.key}
                    originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                    panelMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                    triggerDensity="compact"
                    buttonClassName="h-10 min-w-[58px] shrink-0 rounded-xl px-2.5"
                    metaTextClassName="hidden"
                    triggerIconSize={14}
                  />

                  <CapoPicker
                    value={isSetlistMode ? currentSetlistCapo : currentCapo}
                    currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(capo) => {
                      if (isSetlistMode && selectedSetlistSong) {
                        handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
                          ...currentSetlistSong,
                          capo
                        }));
                      } else {
                        handleSongChange({ ...song, capo });
                      }
                    }}
                    label="Capo"
                    triggerDensity="compact"
                    buttonClassName="h-10 min-w-[58px] shrink-0 rounded-xl px-2.5"
                    showPlayKey={false}
                    triggerIconSize={14}
                  />

                  {!isSetlistMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                        className={`${mobileTopbarToggleChipClassName(song.showNashvilleNumbers)} shrink-0`}
                        title={copy.nashvilleModeLabel}
                        aria-label={copy.nashvilleModeLabel}
                      >
                        <span className={inlineModeBadgeClassName(song.showNashvilleNumbers)}>123</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                        className={`${mobileTopbarToggleChipClassName(song.showAbsoluteJianpu)} shrink-0`}
                        title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                        aria-label={copy.fixedDoModeLabel}
                      >
                        <span className={inlineModeBadgeClassName(song.showAbsoluteJianpu)}>1=C</span>
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : usesDenseDesktopHeader ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <img src={logoSrc} alt="ChordMaster" className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-indigo-100" />
                  <h2 className="truncate font-display text-lg font-bold tracking-tight text-gray-900">{APP_NAME}</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">
                    v{APP_VERSION}
                  </span>
                </div>

                <div className="h-4 w-px shrink-0 bg-gray-200" />

                <div className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold tracking-[0.08em] ${
                    isSetlistMode
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                      : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
                  }`}>
                    {workspaceModeBadge}
                  </span>
                  {denseHeaderShowsContextLabel ? (
                    <span className="max-w-[24rem] truncate text-sm font-medium text-gray-500">
                      {activeAppViewLabel}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 items-center justify-end gap-2">
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    title={isEditing ? copy.closeEditor : copy.openEditor}
                    aria-label={isEditing ? copy.closeEditor : copy.openEditor}
                    className={isEditing ? denseToolbarPrimaryActionClassName : denseToolbarActionClassName}
                  >
                    <Edit3 size={14} />
                    {denseToolbarShowsLabels ? <span>{compactEditorToggleLabel}</span> : null}
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleLyricsMode}
                    title={copy.lyricsMode}
                    aria-label={copy.lyricsMode}
                    className={denseToolbarToggleClassName(isLyricsMode, 'accent')}
                  >
                    <FileText size={14} />
                    {denseToolbarShowsLabels ? <span>{compactLyricsToggleLabel}</span> : null}
                  </button>

                  <KeyPicker
                    value={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(key) => {
                      if (!key) {
                        return;
                      }

                      if (isSetlistMode) {
                        handleSetlistKeyChange(key);
                      } else {
                        handleKeyChange(key);
                      }
                    }}
                    label={copy.key}
                    originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                    panelMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                    triggerDensity="compact"
                    buttonClassName={`${denseToolbarShowsLabels ? 'min-w-[60px]' : 'min-w-[56px]'} h-9 shrink-0 whitespace-nowrap rounded-lg px-2.5`}
                    metaTextClassName="hidden"
                    triggerIconSize={14}
                  />

                  <CapoPicker
                    value={isSetlistMode ? currentSetlistCapo : currentCapo}
                    currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(capo) => {
                      if (isSetlistMode && selectedSetlistSong) {
                        handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
                          ...currentSetlistSong,
                          capo
                        }));
                      } else {
                        handleSongChange({ ...song, capo });
                      }
                    }}
                    label="Capo"
                    triggerDensity="compact"
                    buttonClassName={`${denseToolbarShowsLabels ? 'min-w-[70px]' : 'min-w-[58px]'} h-9 shrink-0 whitespace-nowrap rounded-lg px-2.5`}
                    showPlayKey={denseToolbarShowsLabels && mainViewportWidth >= 1820}
                    triggerIconSize={14}
                  />

                  {!isSetlistMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                        title={copy.nashvilleModeLabel}
                        aria-label={copy.nashvilleModeLabel}
                        className={denseToolbarToggleClassName(song.showNashvilleNumbers)}
                      >
                        <span className={`inline-flex min-w-[24px] items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-black leading-none ${
                          song.showNashvilleNumbers
                            ? 'border-indigo-200 bg-white/70 text-current'
                            : 'border-gray-200 bg-gray-50 text-gray-600'
                        }`}>
                          123
                        </span>
                        {denseToolbarShowsLabels ? <span>{copy.nashvilleModeLabel}</span> : null}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                        title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                        aria-label={copy.fixedDoModeLabel}
                        className={denseToolbarToggleClassName(song.showAbsoluteJianpu)}
                      >
                        <span className={`inline-flex min-w-[28px] items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-black leading-none ${
                          song.showAbsoluteJianpu
                            ? 'border-indigo-200 bg-white/70 text-current'
                            : 'border-gray-200 bg-gray-50 text-gray-600'
                        }`}>
                          1=C
                        </span>
                        {denseToolbarShowsLabels ? <span>{copy.fixedDoModeLabel}</span> : null}
                      </button>
                    </>
                  )}
                </div>

                <div ref={toolbarOverflowMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsToolbarOverflowMenuOpen((current) => !current)}
                    className={denseToolbarMenuButtonClassName}
                    aria-haspopup="menu"
                    aria-expanded={isToolbarOverflowMenuOpen}
                    aria-label={copy.editor.more}
                    title={copy.editor.more}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {toolbarOverflowPanel}
                </div>

                {isAuthenticated ? (
                  <div ref={googleAccountMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsGoogleAccountMenuOpen((current) => !current)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm transition-colors ${
                        isGoogleAccountMenuOpen
                          ? 'border-indigo-300 ring-2 ring-indigo-100'
                          : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                      }`}
                      aria-haspopup="menu"
                      aria-expanded={isGoogleAccountMenuOpen}
                      aria-label={authenticatedUser.name}
                      title={authenticatedUser.name}
                    >
                      {authenticatedUser.picture ? (
                        <img
                          src={authenticatedUser.picture}
                          alt={authenticatedUser.name}
                          className="h-7 w-7 rounded-full border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                          {authenticatedUser.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </button>

                    {isGoogleAccountMenuOpen && (
                      <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <div className="truncate text-sm font-semibold text-gray-800">{authenticatedUser.name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-gray-500">{authenticatedUser.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGoogleSignOut}
                          className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                        >
                          <LogOut size={14} />
                          <span>{copy.signOut}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  showGoogleAuth && googleUser ? (
                    <div ref={googleAccountMenuRef} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsGoogleAccountMenuOpen((current) => !current)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm transition-colors ${
                          isGoogleAccountMenuOpen
                            ? 'border-indigo-300 ring-2 ring-indigo-100'
                            : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                        }`}
                        aria-haspopup="menu"
                        aria-expanded={isGoogleAccountMenuOpen}
                        aria-label={googleUser.name}
                        title={googleUser.name}
                      >
                        {googleUser.picture ? (
                          <img
                            src={googleUser.picture}
                            alt={googleUser.name}
                            className="h-7 w-7 rounded-full border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                            {googleUser.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </button>

                      {isGoogleAccountMenuOpen && (
                        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <div className="truncate text-sm font-semibold text-gray-800">{googleUser.name}</div>
                            <div className="mt-0.5 truncate text-[11px] text-gray-500">{googleUser.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={handleGoogleSignOut}
                            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                          >
                            <LogOut size={14} />
                            <span>{copy.signOut}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : showGoogleAuth ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <div ref={googleSignInRef} className="flex min-h-9 min-w-0 items-center justify-end" />
                      {googleAuthError ? (
                        <span className="text-[10px] font-medium text-amber-600" title={googleAuthError}>!</span>
                      ) : null}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          ) : usesTabletHeader ? (
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <img src={logoSrc} alt="ChordMaster" className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-indigo-100" />
                <div className="min-w-0">
                  <div className="truncate font-display text-lg font-bold tracking-tight text-gray-900">{APP_NAME}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${
                      isSetlistMode
                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
                    }`}>
                      {workspaceModeBadge}
                    </span>
                    {mainViewportWidth >= 840 ? (
                      <span className="truncate text-[12px] font-medium text-gray-500">{activeAppViewLabel}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 items-center justify-end">
                <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    title={isEditing ? copy.closeEditor : copy.openEditor}
                    aria-label={isEditing ? copy.closeEditor : copy.openEditor}
                    className={isEditing ? denseToolbarPrimaryActionClassName : denseToolbarActionClassName}
                  >
                    <Edit3 size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleLyricsMode}
                    title={copy.lyricsMode}
                    aria-label={copy.lyricsMode}
                    className={denseToolbarToggleClassName(isLyricsMode, 'accent')}
                  >
                    <FileText size={14} />
                  </button>

                  <KeyPicker
                    value={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(key) => {
                      if (!key) {
                        return;
                      }

                      if (isSetlistMode) {
                        handleSetlistKeyChange(key);
                      } else {
                        handleKeyChange(key);
                      }
                    }}
                    label={copy.key}
                    originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                    panelMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                    triggerDensity="compact"
                    buttonClassName="h-9 min-w-[60px] shrink-0 rounded-lg px-2.5"
                    metaTextClassName="hidden"
                    triggerIconSize={14}
                  />

                  <CapoPicker
                    value={isSetlistMode ? currentSetlistCapo : currentCapo}
                    currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(capo) => {
                      if (isSetlistMode && selectedSetlistSong) {
                        handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
                          ...currentSetlistSong,
                          capo
                        }));
                      } else {
                        handleSongChange({ ...song, capo });
                      }
                    }}
                    label="Capo"
                    triggerDensity="compact"
                    buttonClassName="h-9 min-w-[62px] shrink-0 rounded-lg px-2.5"
                    showPlayKey={mainViewportWidth >= 1080}
                    triggerIconSize={14}
                  />

                  {!isSetlistMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                        title={copy.nashvilleModeLabel}
                        aria-label={copy.nashvilleModeLabel}
                        className={denseToolbarToggleClassName(song.showNashvilleNumbers)}
                      >
                        <span className={inlineModeBadgeClassName(song.showNashvilleNumbers)}>123</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                        title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                        aria-label={copy.fixedDoModeLabel}
                        className={denseToolbarToggleClassName(song.showAbsoluteJianpu)}
                      >
                        <span className={inlineModeBadgeClassName(song.showAbsoluteJianpu)}>1=C</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div ref={toolbarOverflowMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsToolbarOverflowMenuOpen((current) => !current)}
                    className={denseToolbarMenuButtonClassName}
                    aria-haspopup="menu"
                    aria-expanded={isToolbarOverflowMenuOpen}
                    aria-label={copy.editor.more}
                    title={copy.editor.more}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {toolbarOverflowPanel}
                </div>

                {isAuthenticated ? (
                  <div ref={googleAccountMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsGoogleAccountMenuOpen((current) => !current)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm transition-colors ${
                        isGoogleAccountMenuOpen
                          ? 'border-indigo-300 ring-2 ring-indigo-100'
                          : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                      }`}
                      aria-haspopup="menu"
                      aria-expanded={isGoogleAccountMenuOpen}
                      aria-label={authenticatedUser.name}
                      title={authenticatedUser.name}
                    >
                      {authenticatedUser.picture ? (
                        <img
                          src={authenticatedUser.picture}
                          alt={authenticatedUser.name}
                          className="h-7 w-7 rounded-full border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                          {authenticatedUser.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </button>

                    {isGoogleAccountMenuOpen && (
                      <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <div className="truncate text-sm font-semibold text-gray-800">{authenticatedUser.name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-gray-500">{authenticatedUser.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGoogleSignOut}
                          className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                        >
                          <LogOut size={14} />
                          <span>{copy.signOut}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  showGoogleAuth && googleUser ? (
                    <div ref={googleAccountMenuRef} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsGoogleAccountMenuOpen((current) => !current)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm transition-colors ${
                          isGoogleAccountMenuOpen
                            ? 'border-indigo-300 ring-2 ring-indigo-100'
                            : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                        }`}
                        aria-haspopup="menu"
                        aria-expanded={isGoogleAccountMenuOpen}
                        aria-label={googleUser.name}
                        title={googleUser.name}
                      >
                        {googleUser.picture ? (
                          <img
                            src={googleUser.picture}
                            alt={googleUser.name}
                            className="h-7 w-7 rounded-full border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                            {googleUser.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </button>

                      {isGoogleAccountMenuOpen && (
                        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <div className="truncate text-sm font-semibold text-gray-800">{googleUser.name}</div>
                            <div className="mt-0.5 truncate text-[11px] text-gray-500">{googleUser.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={handleGoogleSignOut}
                            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                          >
                            <LogOut size={14} />
                            <span>{copy.signOut}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : showGoogleAuth ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <div ref={googleSignInRef} className="flex min-h-9 min-w-0 items-center justify-end" />
                      {googleAuthError ? (
                        <span className="text-[10px] font-medium text-amber-600" title={googleAuthError}>!</span>
                      ) : null}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <img src={logoSrc} alt="ChordMaster" className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-indigo-100" />
                    <h2 className="truncate font-display text-lg font-bold tracking-tight">{APP_NAME}</h2>
                    <span className="hidden rounded-full bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-500 sm:inline-flex">
                      v{APP_VERSION}
                    </span>
                  </div>
                  <div className="hidden h-4 w-px bg-gray-200 sm:block" />
                  <div className="flex min-w-0 items-center gap-2">
                    {activeAppView === 'sheet' && (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] ${
                        isSetlistMode
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                          : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
                      }`}>
                        {workspaceModeBadge}
                      </span>
                    )}
                    <span className="max-w-[min(40vw,18rem)] truncate text-sm font-medium text-gray-500 sm:max-w-[22rem]">
                      {activeAppViewLabel}
                    </span>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 self-stretch sm:self-auto">
                  {isAuthenticated ? (
                    <>
                      <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm ${
                        syncStatus === 'failed'
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                          : syncStatus === 'offline'
                            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      }`}>
                        {syncStatus === 'offline' ? <CloudOff size={15} /> : <Cloud size={15} />}
                        <span>{syncStatusLabel}</span>
                      </div>
                      {activeAppView === 'sheet' && !isSetlistMode && (
                        <button
                          type="button"
                          onClick={() => void handleCreateShareLink('song')}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50"
                        >
                          <Share2 size={15} />
                          <span>{copy.shareCurrentSong}</span>
                        </button>
                      )}
                      {activeAppView === 'sheet' && isSetlistMode && selectedSetlist && (
                        <button
                          type="button"
                          onClick={() => void handleCreateShareLink('setlist')}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50"
                        >
                          <Share2 size={15} />
                          <span>{copy.shareCurrentSetlist}</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleGoogleSignIn()}
                        disabled={!isAuthConfigured}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ExternalLink size={15} />
                        <span>{copy.continueWithGoogle}</span>
                      </button>
                    </div>
                  )}

                  {showGoogleAuth && googleUser ? (
                    <div className="flex max-w-full min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
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
                    <div className="flex w-full min-w-0 max-w-full flex-col gap-1 sm:w-auto">
                      <div ref={googleSignInRef} className="flex min-h-10 min-w-0 items-center justify-end sm:min-w-[220px]" />
                      {googleAuthError && (
                        <div className="text-right text-[11px] font-medium text-amber-600">{googleAuthError}</div>
                      )}
                    </div>
                  ) : null}

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
              </div>

              {isSheetView ? (
              <div className="flex min-w-0 flex-col gap-2.5">
                <div className="flex min-w-0 flex-col gap-2.5">
                  <div className={`grid min-w-0 gap-2 ${toolbarPrimaryGridClassName}`}>
                    <button
                      type="button"
                      onClick={() => setIsEditing(!isEditing)}
                      className={isEditing ? toolbarPrimaryEmphasisActionClassName : toolbarPrimaryActionClassName}
                    >
                      <Edit3 size={16} />
                      <span>{isEditing ? copy.closeEditor : copy.openEditor}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleLyricsMode}
                      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold shadow-sm transition-all ${
                        isLyricsMode
                          ? 'bg-amber-500 text-white shadow-amber-100'
                          : 'border border-gray-200 bg-white text-gray-700 hover:border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      <FileText size={16} />
                      <span>{copy.lyricsMode}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAutoSaveEnabled((current) => !current)}
                      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold shadow-sm transition-all ${
                        isAutoSaveEnabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span>{copy.autoSave}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        isAutoSaveEnabled ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {isAutoSaveEnabled ? copy.on : copy.off}
                      </span>
                    </button>

                    <KeyPicker
                      value={isSetlistMode ? currentSetlistKey : song.currentKey}
                      onChange={(key) => {
                        if (!key) {
                          return;
                        }

                        if (isSetlistMode) {
                          handleSetlistKeyChange(key);
                        } else {
                          handleKeyChange(key);
                        }
                      }}
                      label={copy.key}
                      originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                      triggerMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                      panelMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                      buttonClassName="h-11 w-full min-w-0"
                    />

                    <CapoPicker
                      value={isSetlistMode ? currentSetlistCapo : currentCapo}
                      currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                      onChange={(capo) => {
                        if (isSetlistMode && selectedSetlistSong) {
                          handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
                            ...currentSetlistSong,
                            capo
                          }));
                        } else {
                          handleSongChange({ ...song, capo });
                        }
                      }}
                      label="Capo"
                      buttonClassName="h-11 w-full min-w-0"
                    />

                    <button
                      type="button"
                      onClick={handleSaveLibrary}
                      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold shadow-sm transition-all ${
                        workspaceIsDirty
                          ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-400'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Save size={16} />
                      <span>{workspaceIsDirty ? copy.saveChanges : copy.saved}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportPdf}
                      disabled={isExportingPdf}
                      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold shadow-sm transition-all ${
                        isExportingPdf
                          ? 'cursor-wait bg-gray-400 text-white'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      <Save size={16} />
                      <span>{isExportingPdf ? copy.preparingPdf : isSetlistMode ? copy.exportSetlistPdf : copy.exportPdf}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleEnterPerformanceMode}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600"
                    >
                      <Play size={16} />
                      <span>{copy.performanceMode}</span>
                    </button>
                  </div>

                  {!isSetlistMode && (
                    <div className="flex min-w-0 items-center justify-end gap-2">
                      {isToolbarSecondaryCollapsed ? (
                        <div ref={toolbarOverflowMenuRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setIsToolbarOverflowMenuOpen((current) => !current)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600"
                            aria-haspopup="menu"
                            aria-expanded={isToolbarOverflowMenuOpen}
                          >
                            <MoreHorizontal size={16} />
                            <span>{language === 'zh' ? '更多' : 'More'}</span>
                          </button>
                          {isToolbarOverflowMenuOpen && (
                            <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-48 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers });
                                  setIsToolbarOverflowMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                                  song.showNashvilleNumbers
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-indigo-600'
                                }`}
                                role="menuitemcheckbox"
                                aria-checked={song.showNashvilleNumbers}
                              >
                                <span className="flex items-center gap-2">
                                  <Hash size={14} />
                                  <span>{copy.nashvilleModeLabel}</span>
                                </span>
                                <span className="text-[11px] font-bold">{song.showNashvilleNumbers ? copy.on : copy.off}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu });
                                  setIsToolbarOverflowMenuOpen(false);
                                }}
                                className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                                  song.showAbsoluteJianpu
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-indigo-600'
                                }`}
                                role="menuitemcheckbox"
                                aria-checked={song.showAbsoluteJianpu}
                              >
                                <span className="flex items-center gap-2">
                                  <Music2 size={14} />
                                  <span>{copy.fixedDoModeLabel}</span>
                                </span>
                                <span className="text-[11px] font-bold">{song.showAbsoluteJianpu ? copy.on : copy.off}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                            className={toolbarSecondaryToggleClassName(song.showNashvilleNumbers)}
                          >
                            <Hash size={14} />
                            <span>{copy.nashvilleModeLabel}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                            title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                            className={toolbarSecondaryToggleClassName(song.showAbsoluteJianpu)}
                          >
                            <Music2 size={14} />
                            <span>{copy.fixedDoModeLabel}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <p className="hidden text-[11px] font-medium text-gray-400 min-[860px]:block min-[1240px]:text-gray-300">
                  {isSheetView ? (isSetlistMode ? copy.previewSetlistHint : copy.previewHint) : copy.infoHint}
                </p>
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
            </div>
          )}
        </header>

        {/* Content Area - Split View */}
        {isSheetView ? (
        <div data-content-area className="relative flex min-h-0 flex-1 overflow-hidden">
          {!shouldUseSplitEditor && isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 z-20 bg-stone-950/10 backdrop-blur-[1px]"
              aria-label={copy.closeEditor}
            />
          )}

          {/* Editor Pane */}
          <AnimatePresence initial={false}>
            {isEditing && (
              <motion.div 
                data-editor-pane
                initial={shouldUseSplitEditor ? { width: 0, opacity: 0 } : { x: -32, opacity: 0 }}
                animate={shouldUseSplitEditor ? { width: splitEditorWidth, opacity: 1 } : { x: 0, opacity: 1 }}
                exit={shouldUseSplitEditor ? { width: 0, opacity: 0 } : { x: -32, opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                className={`overflow-hidden border-r border-gray-200 bg-white shadow-xl ${
                  shouldUseSplitEditor
                    ? 'relative z-10 flex-shrink-0'
                    : isPhoneViewport
                      ? 'absolute inset-0 z-30 max-w-full shadow-none'
                      : 'absolute inset-y-0 left-0 z-30 max-w-full rounded-r-[28px] shadow-[0_24px_60px_rgba(15,23,42,0.18)]'
                }`}
                style={shouldUseSplitEditor ? undefined : { width: overlayEditorWidth > 0 ? `${overlayEditorWidth}px` : '100%' }}
              >
                <div data-editor-scroll-root className="h-full overflow-y-auto">
                  <div className="min-w-0 p-4 pb-24 sm:p-6 lg:p-8">
                    {isSetlistMode && selectedSetlist && selectedSetlistSong && selectedSetlistSourceSong ? (
                      <div className="space-y-5">
                        {isPhoneViewport ? mobileMetadataSummaryCard : <div>{metadataPanelContent}</div>}
                        {isLyricsMode ? (
                          <LyricsEditor
                            key={`${selectedSetlistSong.id}-lyrics`}
                            song={activeSetlistEditableSong ?? selectedSetlistSourceSong}
                            language={language}
                            onUndo={handleSetlistUndo}
                            onRedo={handleSetlistRedo}
                            onChange={handleSetlistSongContentChange}
                            activeSectionId={activeSectionId}
                            onActiveSectionChange={setActiveSectionId}
                            activeBar={activeBar}
                            onActiveBarChange={setActiveBar}
                            focusRequest={editorFocusRequest}
                            onFocusRequestHandled={(requestId) => {
                              setEditorFocusRequest(current => current?.requestId === requestId ? null : current);
                            }}
                          />
                        ) : (
                          <SongEditor
                            key={`${selectedSetlistSong.id}-song`}
                            song={activeSetlistEditableSong ?? selectedSetlistSourceSong}
                            language={language}
                            isPhoneViewport={isPhoneViewport}
                            history={currentSetlistSongHistory}
                            onUndo={handleSetlistUndo}
                            onRedo={handleSetlistRedo}
                            onChange={handleSetlistSongContentChange}
                            metadataMode="setlist"
                            hideMetadataPanel
                            hideBarNumberControls
                            hideBottomAddSectionButton
                            showInlineAddSectionButton
                            activeSectionId={activeSectionId}
                            onActiveSectionChange={setActiveSectionId}
                            activeBar={activeBar}
                            onActiveBarChange={setActiveBar}
                            focusRequest={editorFocusRequest}
                            onFocusRequestHandled={(requestId) => {
                              setEditorFocusRequest(current => current?.requestId === requestId ? null : current);
                            }}
                          />
                        )}
                      </div>
                    ) : isSetlistMode ? (
                      <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-sm text-gray-500">
                        {selectedSetlist ? copy.selectSetlistSong : copy.noSetlists}
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {isPhoneViewport ? mobileMetadataSummaryCard : metadataPanelContent}
                        {isLyricsMode ? (
                          <LyricsEditor
                            key={`${song.id}-lyrics`}
                            song={song}
                            language={language}
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
                        ) : (
                          <SongEditor
                            key={song.id}
                            song={song}
                            language={language}
                            isPhoneViewport={isPhoneViewport}
                            history={currentSongHistory}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            onChange={handleSongChange}
                            hideMetadataPanel
                            activeSectionId={activeSectionId}
                            onActiveSectionChange={setActiveSectionId}
                            activeBar={activeBar}
                            onActiveBarChange={setActiveBar}
                            focusRequest={editorFocusRequest}
                            onFocusRequestHandled={(requestId) => {
                              setEditorFocusRequest(current => current?.requestId === requestId ? null : current);
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className={`absolute z-40 pointer-events-none ${isPhoneViewport ? 'bottom-4 left-4' : 'left-6 bottom-6'}`}>
                  <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 px-2 py-2 shadow-lg backdrop-blur-sm">
                    <button
                      onClick={handleScrollEditorToTop}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                      title={copy.backToTop}
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button
                      onClick={isSetlistMode ? handleSetlistUndo : handleUndo}
                      disabled={isSetlistMode ? currentSetlistSongHistory.past.length === 0 : currentSongHistory.past.length === 0}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:border-gray-200 transition-all shadow-sm"
                      title={copy.undo}
                    >
                      <Undo2 size={18} />
                    </button>
                    <button
                      onClick={isSetlistMode ? handleSetlistRedo : handleRedo}
                      disabled={isSetlistMode ? currentSetlistSongHistory.future.length === 0 : currentSongHistory.future.length === 0}
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
              className={`h-full overflow-auto p-3 sm:p-4 lg:p-8 xl:p-12 [scrollbar-gutter:stable_both-edges] ${isPreviewDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
                  {activePreviewSheet}
                </div>
              </div>
            </div>
            {!(isPhoneViewport && isEditing) && (
              <div className={`pointer-events-none absolute z-40 ${
                isPhoneViewport ? 'bottom-3 right-3' : 'bottom-2 right-2 sm:bottom-4 sm:right-4 lg:bottom-6 lg:right-6'
              }`}>
                <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-gray-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={handleZoomOutPreview}
                    disabled={previewScale <= PREVIEW_MIN_SCALE + 0.001}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
                    title={copy.zoomOutPreview}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPreviewZoom}
                    className="inline-flex min-w-[4rem] items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 sm:min-w-[4.25rem]"
                    title={copy.resetPreviewZoom}
                  >
                    {previewScalePercent}%
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomInPreview}
                    disabled={previewScale >= PREVIEW_MAX_SCALE - 0.001}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
                    title={copy.zoomInPreview}
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        ) : (
        <div data-content-area className="flex-1 overflow-y-auto bg-[#F5F5F4] px-4 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
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

      {isPhoneViewport && (
        <>
          <AnimatePresence initial={false}>
            {isMobileActionsSheetOpen && (
              <>
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMobileActionsSheetOpen(false)}
                  className="absolute inset-0 z-[70] bg-stone-950/30 backdrop-blur-[1px]"
                  aria-label={copy.editor.more}
                />
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                  className="absolute inset-x-0 bottom-0 z-[80] max-h-[82dvh] overflow-hidden rounded-t-[28px] border-t border-gray-200 bg-white shadow-[0_-24px_60px_rgba(15,23,42,0.18)]"
                >
                  <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-200" />
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <div className="text-sm font-bold text-gray-900">{copy.editor.more}</div>
                    <button
                      type="button"
                      onClick={() => setIsMobileActionsSheetOpen(false)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
                    >
                      {copy.done}
                    </button>
                  </div>

                  <div className="max-h-[calc(82dvh-4.5rem)] space-y-4 overflow-y-auto px-4 py-4">
                    {isSheetView ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setIsAutoSaveEnabled((current) => !current)}
                            className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                              isAutoSaveEnabled
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 bg-white text-gray-700'
                            }`}
                          >
                            <div className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">{copy.autoSave}</div>
                            <div className="mt-1 text-sm font-bold">{isAutoSaveEnabled ? copy.on : copy.off}</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleExportPdf();
                              setIsMobileActionsSheetOpen(false);
                            }}
                            disabled={isExportingPdf}
                            className={`rounded-2xl px-3 py-3 text-left transition-colors ${
                              isExportingPdf
                                ? 'bg-gray-400 text-white'
                                : 'bg-gray-900 text-white'
                            }`}
                          >
                            <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">PDF</div>
                            <div className="mt-1 text-sm font-bold">
                              {isExportingPdf ? copy.preparingPdf : (isSetlistMode ? copy.exportSetlistPdf : copy.exportPdf)}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileActionsSheetOpen(false);
                              handleEnterPerformanceMode();
                            }}
                            className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50"
                          >
                            <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-gray-400"><Play size={11} /><span>Live</span></div>
                            <div className="mt-1 text-sm font-bold text-gray-900">{copy.performanceMode}</div>
                          </button>
                        </div>

                        {!isSetlistMode && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                              className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                                song.showNashvilleNumbers
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  : 'border-gray-200 bg-white text-gray-700'
                              }`}
                            >
                              <div className="text-xs font-bold tracking-[0.14em] text-gray-400">{copy.nashvilleModeLabel}</div>
                              <div className="mt-1 text-sm font-bold">{song.showNashvilleNumbers ? copy.on : copy.off}</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                              className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                                song.showAbsoluteJianpu
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  : 'border-gray-200 bg-white text-gray-700'
                              }`}
                            >
                              <div className="text-xs font-bold tracking-[0.14em] text-gray-400">{copy.fixedDoModeLabel}</div>
                              <div className="mt-1 text-sm font-bold">{song.showAbsoluteJianpu ? copy.on : copy.off}</div>
                            </button>
                          </div>
                        )}
                      </>
                    ) : null}

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">{language === 'zh' ? '語言' : 'Language'}</div>
                      <div className="mt-3 inline-flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setLanguage('zh')}
                          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                            language === 'zh' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          中文
                        </button>
                        <button
                          type="button"
                          onClick={() => setLanguage('en')}
                          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                            language === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          EN
                        </button>
                      </div>
                    </div>

                    {isAuthenticated ? (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                          syncStatus === 'failed'
                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                            : syncStatus === 'offline'
                              ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                              : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        }`}>
                          {syncStatus === 'offline' ? <CloudOff size={14} /> : <Cloud size={14} />}
                          <span>{syncStatusLabel}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          {authenticatedUser?.picture ? (
                            <img
                              src={authenticatedUser.picture}
                              alt={authenticatedUser.name}
                              className="h-10 w-10 rounded-full border border-gray-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                              {authenticatedUser?.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-gray-900">{authenticatedUser?.name}</div>
                            <div className="truncate text-xs text-gray-500">{authenticatedUser?.email}</div>
                          </div>
                        </div>
                        {activeAppView === 'sheet' && !isSetlistMode && (
                          <button
                            type="button"
                            onClick={() => void handleCreateShareLink('song')}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100"
                          >
                            <Share2 size={14} />
                            <span>{copy.shareCurrentSong}</span>
                          </button>
                        )}
                        {activeAppView === 'sheet' && isSetlistMode && selectedSetlist && (
                          <button
                            type="button"
                            onClick={() => void handleCreateShareLink('setlist')}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100"
                          >
                            <Share2 size={14} />
                            <span>{copy.shareCurrentSetlist}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            handleGoogleSignOut();
                            setIsMobileActionsSheetOpen(false);
                          }}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
                        >
                          <LogOut size={14} />
                          <span>{copy.signOut}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        <button
                          type="button"
                          onClick={() => void handleGoogleSignIn()}
                          disabled={!isAuthConfigured}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ExternalLink size={14} />
                          <span>{copy.continueWithGoogle}</span>
                        </button>
                      </div>
                    )}

                    {showGoogleAuth && googleUser ? (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          {googleUser.picture ? (
                            <img
                              src={googleUser.picture}
                              alt={googleUser.name}
                              className="h-10 w-10 rounded-full border border-gray-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                              {googleUser.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-gray-900">{googleUser.name}</div>
                            <div className="truncate text-xs text-gray-500">{googleUser.email}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleGoogleSignOut();
                            setIsMobileActionsSheetOpen(false);
                          }}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
                        >
                          <LogOut size={14} />
                          <span>{copy.signOut}</span>
                        </button>
                      </div>
                    ) : showGoogleAuth ? (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Google</div>
                        <div ref={googleSignInRef} className="mt-3 flex min-h-10 min-w-0 items-center justify-start" />
                        {googleAuthError ? (
                          <div className="mt-2 text-xs font-medium text-amber-600">{googleAuthError}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {isMobileMetadataOpen && metadataPanelContent && (
              <>
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMobileMetadataOpen(false)}
                  className="absolute inset-0 z-[70] bg-stone-950/30 backdrop-blur-[1px]"
                  aria-label={mobileMetadataTitle}
                />
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                  className="absolute inset-x-0 bottom-0 z-[80] max-h-[86dvh] overflow-hidden rounded-t-[28px] border-t border-gray-200 bg-[#F5F5F4] shadow-[0_-24px_60px_rgba(15,23,42,0.18)]"
                >
                  <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-300" />
                  <div className="flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur-sm">
                    <div className="text-sm font-bold text-gray-900">{mobileMetadataTitle}</div>
                    <button
                      type="button"
                      onClick={() => setIsMobileMetadataOpen(false)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
                    >
                      {copy.done}
                    </button>
                  </div>

                  <div className="max-h-[calc(86dvh-4.5rem)] overflow-y-auto px-4 py-4">
                    {metadataPanelContent}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}

      <AnimatePresence initial={false}>
        {isImportPromptOpen && authenticatedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-lg rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">{APP_NAME}</div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{copy.importLocalTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">{copy.importLocalDescription}</p>
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
                {importSummaryLabel}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleDismissImportPrompt}
                  disabled={isImportingLocalWorkspace}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copy.importLater}
                </button>
                <button
                  type="button"
                  onClick={() => void handleImportLocalWorkspaceToCloud()}
                  disabled={isImportingLocalWorkspace}
                  className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImportingLocalWorkspace ? copy.cloudSyncSyncing : copy.importNow}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isExportingPdf && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-[120] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
            aria-live="polite"
            aria-busy="true"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-sm rounded-[28px] border border-gray-200 bg-white/95 px-6 py-6 text-center shadow-[0_24px_60px_rgba(15,23,42,0.22)] backdrop-blur-sm"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
                <div className="h-7 w-7 rounded-full border-[3px] border-indigo-200 border-t-indigo-600 animate-spin" />
              </div>
              <div className="mt-4 text-lg font-bold text-gray-900">{copy.exportingPdfTitle}</div>
              <div className="mt-2 text-sm leading-6 text-gray-500">
                {pdfExportProgress?.cancelRequested ? copy.exportingPdfCancelling : copy.exportingPdfHint}
              </div>

              {pdfExportProgress ? (
                <div className="mt-5 text-left">
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-200 ${
                        pdfExportProgress.cancelRequested ? 'bg-amber-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${exportProgressPercent}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs font-semibold text-gray-500">
                    <span>{copy.exportingPdfPageLabel}</span>
                    <span>{pdfExportProgress.completedPages} / {pdfExportProgress.totalPages}</span>
                  </div>

                  <div className="mt-3 grid gap-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-gray-500">{copy.exportingPdfSongLabel}</span>
                      <div className="min-w-0 text-right">
                        <div className="font-bold text-gray-900">
                          {pdfExportProgress.songIndex} / {pdfExportProgress.totalSongs}
                        </div>
                        <div className="truncate text-xs text-gray-500">{pdfExportProgress.songTitle}</div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-gray-500">{copy.exportingPdfSectionLabel}</span>
                      <div className="min-w-0 text-right">
                        <div className="font-bold text-gray-900">{exportSectionLabel}</div>
                        <div className="text-xs text-gray-500">
                          {copy.exportingPdfPageLabel} {pdfExportProgress.pageInSong} / {pdfExportProgress.totalPagesInSong}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4">
                {pdfExportProgress?.cancelRequested ? (
                  <div className="text-xs font-semibold tracking-[0.08em] text-gray-400">{copy.exportingPdfCancelling}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      pdfExportCancelRequestedRef.current = true;
                      setPdfExportProgress((current) => current ? { ...current, cancelRequested: true } : current);
                    }}
                    className="rounded-full bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200 active:bg-gray-300"
                  >
                    {copy.exportingPdfCancelButton}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isPerformanceMode && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-950 select-none"
          onTouchStart={handlePerformanceTouchStart}
          onTouchEnd={handlePerformanceTouchEnd}
        >
          {/* Clip container: shows exactly one A4 page at performanceScale */}
          <div style={{
            width: PREVIEW_TARGET_WIDTH * performanceScale,
            height: PREVIEW_PAGE_HEIGHT * performanceScale,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div
              ref={performanceTranslatorRef}
              style={{
                transform: `scale(${performanceScale}) translateY(-${(performancePageOffsetsRef.current[performancePageIndexRef.current] ?? performancePageIndexRef.current * PREVIEW_PAGE_HEIGHT)}px)`,
                transformOrigin: 'top left',
                width: PREVIEW_TARGET_WIDTH,
                willChange: 'transform',
              }}
            >
              <div ref={performanceSheetRef}>
                {isSetlistMode ? (
                  activeSetlistPreviewSong && (
                    <ChordSheet
                      song={activeSetlistPreviewSong}
                      language={language}
                      currentKey={activeSetlistPreviewSong.currentKey}
                      previewIdentity={selectedSetlistSong?.id ?? null}
                    />
                  )
                ) : (
                  <ChordSheet
                    song={song}
                    language={language}
                    currentKey={song.currentKey}
                    previewIdentity={song.id}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Exit button — top right */}
          <button
            type="button"
            onClick={handleExitPerformanceMode}
            className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            {copy.exitPerformanceMode}
          </button>

          {/* Page / song indicator — bottom center, above safe-area */}
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none" style={{ bottom: 'max(20px, env(safe-area-inset-bottom, 0px))' }}>
            {isSetlistMode && activeSetlistPreviewSong && (
              <div className="max-w-[80vw] truncate text-center text-xs font-semibold text-white/60">
                {copy.performanceModeSongIndicator}{' '}
                {setlistSongsWithSource.findIndex(({ item }) => item.id === selectedSetlistSongId) + 1}
                {' / '}
                {setlistSongsWithSource.length}
                {'  ·  '}
                {activeSetlistPreviewSong.title}
              </div>
            )}
            <div className="text-sm font-bold text-white/80">
              {copy.performanceModePageIndicator}{' '}{performancePageIndex + 1} / {performanceTotalPages}
            </div>
          </div>

          {/* Left tap area */}
          <button
            type="button"
            onClick={handlePerformancePrevPage}
            className="absolute left-0 top-0 bottom-0 w-16 flex items-center justify-start pl-3 text-white/25 transition-colors hover:text-white/60"
            aria-label="Previous page"
          >
            <ChevronLeft size={32} />
          </button>

          {/* Right tap area */}
          <button
            type="button"
            onClick={handlePerformanceNextPage}
            className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-end pr-3 text-white/25 transition-colors hover:text-white/60"
            aria-label="Next page"
          >
            <ChevronRight size={32} />
          </button>
        </div>
      )}
    </div>
  );
}
