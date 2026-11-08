import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import type { LyricsBookSettings } from '../utils/lyricsBook';

export const DEFAULT_LYRICS_READING_SETTINGS: LyricsBookSettings = {
  font: 'sans',
  fontSize: 24,
  lineHeight: 1.42,
  language: 'chinese',
};
const STORAGE_PREFIX = 'chordmaster.lyrics-reading.v1';

/** Only reading preferences cross this boundary; print layout and song data never do. */
function validateSettings(value: unknown): LyricsBookSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { font, fontSize, lineHeight, language } = value as Record<string, unknown>;
  if (font !== 'sans' && font !== 'kaiti') return null;
  if (typeof fontSize !== 'number' || !Number.isFinite(fontSize) || fontSize < 18 || fontSize > 40 || fontSize % 2 !== 0) return null;
  if (lineHeight !== 1.42 && lineHeight !== 1.5 && lineHeight !== 1.7 && lineHeight !== 2) return null;
  if (language !== 'chinese' && language !== 'english' && language !== 'bilingual' && language !== 'mixed') return null;
  // Legacy 18px preferences were previously fitted above a 20px floor. Keep
  // that floor once the stored value becomes the exact, fixed reading size.
  return { font, fontSize: Math.max(20, fontSize), lineHeight, language };
}

function readSettings(key: string): LyricsBookSettings {
  try {
    if (typeof window !== 'undefined') {
      const settings = validateSettings(JSON.parse(window.localStorage.getItem(key) ?? 'null'));
      if (settings) return settings;
    }
  } catch { /* Private browsing and malformed values use the same safe defaults. */ }
  // Choose phone and touch-tablet defaults once; an explicit preference stays exact,
  // including through rotation, focus mode and subsequent songs.
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches;
  const tablet = typeof window !== 'undefined' && window.matchMedia?.('(any-pointer: coarse)').matches;
  return { ...DEFAULT_LYRICS_READING_SETTINGS, fontSize: phone ? 22 : tablet ? 28 : DEFAULT_LYRICS_READING_SETTINGS.fontSize };
}

/** Device-local reader settings, scoped to the active account or an explicit local identity. */
export function useLyricsReadingPreferences(identity = 'local'): [LyricsBookSettings, Dispatch<SetStateAction<LyricsBookSettings>>] {
  const key = `${STORAGE_PREFIX}:${encodeURIComponent(identity)}`;
  const [cache, setCache] = useState(() => ({ key, settings: readSettings(key) }));
  // Render the new identity's values immediately, before its passive effect can run.
  const settings = useMemo(() => cache.key === key ? cache.settings : readSettings(key), [cache, key]);

  useEffect(() => {
    setCache(current => current.key === key ? current : { key, settings: readSettings(key) });
    if (typeof window === 'undefined') return;
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setCache({ key, settings: readSettings(key) });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);

  const setSettings = useCallback<Dispatch<SetStateAction<LyricsBookSettings>>>(update => {
    setCache(current => {
      const previous = current.key === key ? current.settings : readSettings(key);
      const next = validateSettings(typeof update === 'function' ? update(previous) : update);
      if (!next) return current.key === key ? current : { key, settings: previous };
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));
      } catch { /* Keep controls usable in memory when storage is unavailable or full. */ }
      return { key, settings: next };
    });
  }, [key]);

  return [settings, setSettings];
}

const unsavedSizes = new Map<string, number>();
const SONG_SIZE_EVENT = 'chordmaster-song-reading-size';

/** Per-source-song override. The existing account preference is the default
 * for songs without an override. One write changes only the selected song. */
export function useSongReadingSize(identity: string, songId: string | undefined, defaultSize: number) {
  const key = songId && `chordmaster.lyrics-song-size.v1:${encodeURIComponent(identity)}:${encodeURIComponent(songId)}`;
  const read = useCallback(() => {
    if (!key) return defaultSize;
    let size = unsavedSizes.get(key);
    if (size === undefined) {
      try { size = Number(localStorage.getItem(key)); } catch { return defaultSize; }
    }
    return size >= 20 && size <= 40 && size % 2 === 0 ? size : defaultSize;
  }, [defaultSize, key]);
  const subscribe = useCallback((notify: () => void) => {
    const stored = (event: StorageEvent) => { if (event.key === key || event.key === null) notify(); };
    const changed = (event: Event) => { if ((event as CustomEvent).detail === key) notify(); };
    window.addEventListener('storage', stored); window.addEventListener(SONG_SIZE_EVENT, changed);
    return () => { window.removeEventListener('storage', stored); window.removeEventListener(SONG_SIZE_EVENT, changed); };
  }, [key]);
  const value = useSyncExternalStore(subscribe, read, () => defaultSize);
  const set = useCallback((size: number) => {
    if (!key || !(size >= 20 && size <= 40 && size % 2 === 0)) return;
    try { localStorage.setItem(key, String(size)); unsavedSizes.delete(key); }
    catch { unsavedSizes.set(key, size); }
    window.dispatchEvent(new CustomEvent(SONG_SIZE_EVENT, { detail: key }));
  }, [key]);
  return [value, set] as const;
}
