/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Song, Key } from './types';
import { ALL_KEYS, getPlayKey, getTransposeOffset, transposeKey } from './utils/musicUtils';
import ChordSheet from './components/ChordSheet';
import SongEditor from './components/SongEditor';
import { Music, Edit3, ChevronRight, ChevronLeft, ChevronUp, Save, Anchor, Hash, Plus, FileText, Trash2, Undo2, Redo2, Search, Copy, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const SONG_LIBRARY_STORAGE_KEY = 'chordmaster.song-library.v1';
const SELECTED_SONG_STORAGE_KEY = 'chordmaster.selected-song-id.v1';
const LAST_SAVED_AT_STORAGE_KEY = 'chordmaster.last-saved-at.v1';
const AUTO_SAVE_STORAGE_KEY = 'chordmaster.auto-save.v1';
const GOOGLE_SESSION_STORAGE_KEY = 'chordmaster.google-session.v1';
const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services-script';

interface GoogleUserSession {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

const buildPdfFileName = (title: string) => {
  const normalized = title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ');
  return normalized || 'ChordMaster';
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

const getSongLibraryMeta = (song: Song) => {
  const creditParts = formatSongLibraryCredits(song);
  const primary = `${song.currentKey} · ${song.tempo} BPM · ${song.timeSignature}`;
  const isShuffle = song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle';

  if (creditParts.length > 0 || isShuffle) {
    return {
      primary,
      secondary: [isShuffle ? 'Shuffle' : '', ...creditParts].filter(Boolean).join(' · '),
      tooltip: [primary, isShuffle ? 'Shuffle' : '', ...creditParts].filter(Boolean).join('\n'),
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
  tempo: 74,
  timeSignature: "4/4",
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
        { chords: ["E"], ending: 1, riff: "3 - 4 -", riffLabel: "Riff" },
        { chords: ["E"], ending: 1, riff: "5 - 7 i", riffLabel: "Riff", repeatEnd: true }
      ]
    },
    {
      id: "s4",
      title: "Breakdown",
      bars: [
        { chords: ["E"], ending: 2 },
        { chords: ["E"], ending: 2 }
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
        { chords: ["E"], ending: 1 },
        { chords: ["E"], ending: 1, repeatEnd: true }
      ]
    },
    {
      id: "s10",
      title: "Breakdown",
      bars: [
        { chords: ["E"], ending: 2 },
        { chords: ["E"], ending: 2 }
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

const cloneSong = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const createSongId = () => `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createStoredSong = (song: Song, id = createSongId()): StoredSong => ({
  ...cloneSong(song),
  id,
  updatedAt: Date.now()
});

const buildDuplicateSongTitle = (existingSongs: StoredSong[], originalTitle: string) => {
  const baseTitle = originalTitle.trim() || 'Untitled Song';
  const existingTitles = new Set(existingSongs.map((song) => song.title.trim().toLowerCase()));

  let copyIndex = 1;
  let nextTitle = `${baseTitle} Copy`;

  while (existingTitles.has(nextTitle.trim().toLowerCase())) {
    copyIndex += 1;
    nextTitle = `${baseTitle} Copy ${copyIndex}`;
  }

  return nextTitle;
};

const createEmptySong = (title = 'Untitled Song'): StoredSong =>
  createStoredSong({
    title,
    shuffle: false,
    originalKey: 'C',
    currentKey: 'C',
    tempo: 72,
    timeSignature: '4/4',
    sections: [
      {
        id: 's1',
        title: 'Verse',
        bars: [{ chords: [''] }, { chords: [''] }, { chords: [''] }, { chords: [''] }]
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

    const songs = parsedSongs.map((song, index) => ({
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

const formatSavedAt = (timestamp: number | null) => {
  if (!timestamp) {
    return 'Not saved yet';
  }

  return `Saved ${new Date(timestamp).toLocaleTimeString([], {
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
  const initialLibraryRef = useRef(loadSongLibrary());
  const [songs, setSongs] = useState<StoredSong[]>(initialLibraryRef.current.songs);
  const [savedSongs, setSavedSongs] = useState<StoredSong[]>(cloneSong(initialLibraryRef.current.songs));
  const [selectedSongId, setSelectedSongId] = useState(initialLibraryRef.current.selectedSongId);
  const [songHistories, setSongHistories] = useState<Record<string, SongHistoryState>>({});
  const [selectedSongIdsForBulkDelete, setSelectedSongIdsForBulkDelete] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isLibraryEditing, setIsLibraryEditing] = useState(false);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(loadAutoSavePreference);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(initialLibraryRef.current.lastSavedAt);
  const [highlightedSectionIds, setHighlightedSectionIds] = useState<string[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [googleUser, setGoogleUser] = useState<GoogleUserSession | null>(loadGoogleSession);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const keyMenuRef = useRef<HTMLDivElement>(null);
  const googleSignInRef = useRef<HTMLDivElement>(null);
  const googleIdentityInitializedRef = useRef(false);
  const [isKeyMenuOpen, setIsKeyMenuOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
  const song = songs.find((item) => item.id === selectedSongId) ?? songs[0];
  const libraryIsDirty = serializeSongLibrary(songs) !== serializeSongLibrary(savedSongs);
  const isSidebarExpanded = isSidebarPinned || isSidebarHovered;
  const currentSongHistory = songHistories[song?.id || ''] ?? { past: [], future: [] };
  const normalizedLibrarySearchQuery = librarySearchQuery.trim().toLowerCase();
  const filteredSongs = songs.filter((item) => {
    if (!normalizedLibrarySearchQuery) {
      return true;
    }

    const librarySearchText = [
      item.title,
      item.originalKey,
      item.currentKey,
      item.timeSignature,
      String(item.tempo),
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

  const handleSelectSong = (nextSongId: string) => {
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

    const shouldSave = window.confirm(
      `Save changes before switching songs?\n\nPress OK to save. Press Cancel to discard unsaved changes.`
    );

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
      if (previewRef.current) {
        // Use offsetWidth to avoid jitter caused by scrollbar appearance/disappearance
        // p-4 (16px) or md:p-12 (48px) on both sides
        const isMobile = window.innerWidth < 768;
        const padding = isMobile ? 32 : 96; 
        const containerWidth = previewRef.current.offsetWidth - padding - 20; // Extra 20px safety margin
        const targetWidth = 794;
        
        if (containerWidth < targetWidth) {
          const newScale = Math.max(0.3, containerWidth / targetWidth);
          setScale(newScale);
        } else {
          setScale(1);
        }
      }
    };

    const observer = new ResizeObserver(() => {
      // Use requestAnimationFrame to debounce and smooth out updates
      window.requestAnimationFrame(updateScale);
    });
    if (previewRef.current) observer.observe(previewRef.current);
    updateScale();
    return () => observer.disconnect();
  }, [isEditing]);

  const handleKeyChange = (newKey: Key) => {
    handleSongChange({ ...song, currentKey: newKey });
  };

  const getKeyOptionMeta = (key: Key) => {
    const rawOffset = getTransposeOffset(song.originalKey, key);
    const normalizedOffset = rawOffset > 6 ? rawOffset - 12 : rawOffset < -6 ? rawOffset + 12 : rawOffset;

    if (normalizedOffset === 0) {
      return 'Original';
    }

    return normalizedOffset > 0 ? `+${normalizedOffset}` : `${normalizedOffset}`;
  };

  const handleTranspose = (steps: number) => {
    handleSongChange({ ...song, currentKey: transposeKey(song.currentKey, steps) });
  };

  const handleCreateSong = () => {
    const newSong = createEmptySong(`New Song ${songs.length + 1}`);
    const nextSongs = [newSong, ...songs];
    setSongs(nextSongs);
    setSelectedSongId(newSong.id);
    setIsEditing(true);
  };

  const handleDuplicateSong = (songId: string) => {
    const targetSong = songs.find((item) => item.id === songId);
    if (!targetSong) {
      return;
    }

    const duplicatedSong = createStoredSong({
      ...cloneSong(targetSong),
      title: buildDuplicateSongTitle(songs, targetSong.title)
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

    const confirmed = window.confirm(`Delete "${targetSong.title || 'Untitled Song'}"?`);
    if (!confirmed) {
      return;
    }

    const remainingSongs = songs.filter((item) => item.id !== songId);

    if (remainingSongs.length === 0) {
      const replacementSong = createEmptySong('New Song 1');
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

    const confirmed = window.confirm(`Delete ${selectedSongIdsForBulkDelete.length} selected songs?`);
    if (!confirmed) {
      return;
    }

    const selectedIdSet = new Set(selectedSongIdsForBulkDelete);
    const remainingSongs = songs.filter((item) => !selectedIdSet.has(item.id));

    if (remainingSongs.length === 0) {
      const replacementSong = createEmptySong('New Song 1');
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
          pixelRatio: 2,
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
      window.alert(`Unable to export PDF. ${errorMessage}`);
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
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!googleClientId) {
      setGoogleAuthError('Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in.');
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
                setGoogleAuthError('Unable to read the Google account response.');
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
          setGoogleAuthError('Failed to load Google sign-in.');
        }
      }
    };

    setupGoogleIdentity();

    return () => {
      isCancelled = true;
    };
  }, [googleClientId, googleUser]);

  const handleElementClick = (sIdx: number, bIdx: number, field: 'chords' | 'riff' | 'riffLabel' | 'rhythmLabel' | 'annotation' | 'rhythm') => {
    if (!song) {
      return;
    }

    setActiveSectionId(song.sections[sIdx]?.id ?? null);
    setActiveBar({ sIdx, bIdx });

    if (!isEditing) {
      setIsEditing(true);
      // Wait for animation and render
      setTimeout(() => {
        const id = `editor-s${sIdx}-b${bIdx}-${field}`;
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = el as HTMLInputElement;
          input.focus();
          const len = input.value.length;
          input.setSelectionRange(len, len);
        }
      }, 500);
    } else {
      const id = `editor-s${sIdx}-b${bIdx}-${field}`;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = el as HTMLInputElement;
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
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

  return (
    <div
      data-app-root
      className="h-screen flex bg-[#F5F5F4] text-[#1C1917] font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden"
    >
      {/* Navigation Rail / Sidebar */}
      <motion.aside
        data-sidebar
        initial={false}
        animate={{ width: isSidebarExpanded ? 360 : 80 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
        onMouseEnter={handleSidebarHoverTrigger}
        onMouseMove={handleSidebarHoverTrigger}
        onMouseLeave={() => {
          if (!isSidebarPinned) {
            setIsSidebarHovered(false);
          }
        }}
        className="flex-shrink-0 bg-white border-r border-gray-200 z-50 overflow-hidden"
      >
        <div className="h-full flex">
          <div className="w-20 shrink-0 border-r border-gray-200 flex flex-col items-center py-5 gap-3 bg-white">
            <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Music size={24} />
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
              title={isSidebarPinned ? 'Collapse Song List' : 'Pin Song List'}
            >
              {isSidebarExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>

            <button
              type="button"
              onClick={handleCreateSong}
              className="w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100"
              title="New Song"
            >
              <Plus size={18} />
            </button>

            <div className="mt-auto flex flex-col items-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">
              <span>Songs</span>
              <div className="min-w-10 rounded-full bg-gray-100 px-2 py-1 text-center text-xs text-gray-700">
                {songs.length}
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
                <div className="text-lg font-bold tracking-tight">ChordMaster</div>
                <div className="text-xs font-medium text-gray-500">Song Library</div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateSong}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                >
                  <Plus size={16} />
                  <span>New Song</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsLibraryEditing(!isLibraryEditing)}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                    isLibraryEditing ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
                  <Edit3 size={16} />
                  <span>{isLibraryEditing ? 'Done' : 'Manage'}</span>
                </button>
              </div>
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                <Search size={15} className="text-gray-400" />
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(event) => setLibrarySearchQuery(event.target.value)}
                  placeholder="Search songs"
                  className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                />
              </label>
              {isLibraryEditing && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedSongs}
                  disabled={selectedSongIdsForBulkDelete.length === 0}
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={16} />
                  <span>Delete Selected ({selectedSongIdsForBulkDelete.length})</span>
                </button>
              )}
            </div>

            <div className="px-3 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                <span>Songs</span>
                <span>{normalizedLibrarySearchQuery ? `${filteredSongs.length}/${songs.length}` : songs.length}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredSongs.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  No songs match your search.
                </div>
              )}
              {filteredSongs.map((item) => {
                const isActive = item.id === song.id;
                const libraryMeta = getSongLibraryMeta(item);

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
                      <div className="px-3 py-3 pr-12">
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
                              placeholder="Untitled Song"
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
                        className="w-full px-3 py-3 pr-12 text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 rounded-lg p-2 ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <FileText size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-bold leading-snug whitespace-normal break-words ${isActive ? 'text-indigo-900' : 'text-gray-800'}`}>
                              {item.title || 'Untitled Song'}
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
                    <div className="absolute right-3 top-3 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDuplicateSong(item.id);
                          setIsKeyMenuOpen(false);
                        }}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white hover:text-indigo-600"
                        aria-label={`Duplicate ${item.title || 'Untitled Song'}`}
                        title={`Duplicate ${item.title || 'Untitled Song'}`}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectSong(item.id);
                          setIsEditing(true);
                          setIsKeyMenuOpen(false);
                        }}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white hover:text-indigo-600"
                        aria-label={`Edit ${item.title || 'Untitled Song'}`}
                        title={`Edit ${item.title || 'Untitled Song'}`}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteSong(item.id);
                        }}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white hover:text-rose-600"
                        aria-label={`Delete ${item.title || 'Untitled Song'}`}
                        title={`Delete ${item.title || 'Untitled Song'}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-200 px-5 py-4">
              <div className={`text-xs font-medium ${libraryIsDirty ? 'text-amber-600' : 'text-gray-500'}`}>
                {libraryIsDirty ? 'Unsaved changes' : formatSavedAt(lastSavedAt)}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {isAutoSaveEnabled
                  ? 'Changes are saved automatically in this browser.'
                  : 'Press Save to keep changes in this browser.'}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main data-main-panel className="flex-1 flex flex-col min-w-0">
        {/* Top Control Bar */}
        <header data-topbar className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-8 py-4 flex justify-between items-center z-40 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold tracking-tight">ChordMaster</h2>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-sm font-medium text-gray-500 truncate">{song.title || 'Untitled Song'}</span>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {googleUser ? (
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
                    title="Sign out"
                    aria-label="Sign out"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <div ref={googleSignInRef} className="flex min-h-10 min-w-[220px] items-center justify-end" />
                  {googleAuthError && (
                    <div className="text-[11px] font-medium text-amber-600">{googleAuthError}</div>
                  )}
                </div>
              )}

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
                <span>{isEditing ? 'Close Editor' : 'Open Editor'}</span>
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
                <span>Auto Save</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isAutoSaveEnabled ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {isAutoSaveEnabled ? 'On' : 'Off'}
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
                  <span className={`text-gray-500 ${getKeyOptionMeta(song.currentKey) === 'Original' ? 'text-[10px]' : 'text-xs'}`}>
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
                <div className="absolute top-full left-8 mt-2 w-[128px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl z-50">
                  <div className="max-h-80 overflow-y-auto py-1">
                    {ALL_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          handleKeyChange(key);
                          setIsKeyMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-sm transition-colors ${
                          song.currentKey === key ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-1.5 font-mono">
                          <span className="w-6 text-left">{key}</span>
                          <span className={`w-10 text-right ${getKeyOptionMeta(key) === 'Original' ? 'text-[10px]' : ''}`}>
                            {getKeyOptionMeta(key)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              </div>

              <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <div className="flex items-center px-2 text-gray-400">
                <Anchor size={14} />
              </div>
              <select 
                value={song.capo || 0}
                onChange={(e) => handleSongChange({ ...song, capo: parseInt(e.target.value) })}
                className="bg-transparent text-sm font-bold px-2 py-1.5 focus:outline-none appearance-none cursor-pointer"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={i}>
                    Capo {i} {i > 0 ? `(Play: ${getPlayKey(song.currentKey, i)})` : ''}
                  </option>
                ))}
              </select>
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
                onClick={handleSaveLibrary}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${
                  libraryIsDirty
                    ? 'bg-amber-500 text-white border border-amber-500 hover:bg-amber-400'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Save size={16} />
                <span>{libraryIsDirty ? 'Save Changes' : 'Saved'}</span>
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
                <span>{isExportingPdf ? 'Preparing PDF...' : 'Export PDF'}</span>
              </button>
            </div>
            <p className="text-[11px] font-medium text-gray-400">
              Exports The Preview Directly To A PDF File.
            </p>
          </div>
        </header>

        {/* Content Area - Split View */}
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
                      history={currentSongHistory}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      onChange={handleSongChange}
                      activeSectionId={activeSectionId}
                      onActiveSectionChange={setActiveSectionId}
                      activeBar={activeBar}
                      onActiveBarChange={setActiveBar}
                    />
                  </div>
                </div>
                <div className="absolute left-6 bottom-6 z-40 pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 px-2 py-2 shadow-lg backdrop-blur-sm">
                    <button
                      onClick={handleScrollEditorToTop}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                      title="Back to Top"
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button
                      onClick={handleUndo}
                      disabled={currentSongHistory.past.length === 0}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:border-gray-200 transition-all shadow-sm"
                      title="Undo (Cmd/Ctrl+Z)"
                    >
                      <Undo2 size={18} />
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={currentSongHistory.future.length === 0}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:border-gray-200 transition-all shadow-sm"
                      title="Redo (Shift+Cmd/Ctrl+Z)"
                    >
                      <Redo2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sheet Preview Pane */}
          <div
            ref={previewRef}
            data-print-preview-container
            className="flex-1 overflow-auto p-4 md:p-12 bg-[#F5F5F4] flex justify-center"
          >
            <motion.div 
              ref={sheetRef}
              data-print-preview
              layout 
              style={{ 
                transform: `scale(${scale})`, 
                transformOrigin: 'top center',
                width: '794px',
                minWidth: '794px'
              }}
              className="mx-auto transition-all duration-300"
            >
              <ChordSheet 
                song={song} 
                currentKey={song.currentKey} 
                onElementClick={handleElementClick}
                highlightedSectionIds={highlightedSectionIds}
                activeSectionId={isEditing ? activeSectionId : null}
                activeBar={isEditing ? activeBar : null}
              />
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
