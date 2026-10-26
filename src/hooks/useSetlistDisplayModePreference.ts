import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SetlistDisplayMode } from '../types';

const PREFIX = 'chordmaster.personal-setlist-display-modes.v1';
const validModes = new Set<SetlistDisplayMode>(['nashville-number-system', 'chord-fixed-key', 'chord-movable-key']);
const readModes = (key: string): Record<string, SetlistDisplayMode> => {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, SetlistDisplayMode] => (
      Boolean(entry[0]) && validModes.has(entry[1] as SetlistDisplayMode)
    )));
  } catch { return {}; }
};

/** Reading preferences belong to this account/browser, never the shared setlist. */
export function useSetlistDisplayModePreference(userId: string | null | undefined) {
  const key = `${PREFIX}:${userId ? `user:${encodeURIComponent(userId)}` : 'local'}`;
  const [cache, setCache] = useState(() => ({ key, modes: readModes(key) }));
  // Account changes must not render another account's preference, even before effects run.
  const modes = useMemo(() => cache.key === key ? cache.modes : readModes(key), [cache, key]);
  useEffect(() => {
    setCache(current => current.key === key ? current : { key, modes: readModes(key) });
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setCache({ key, modes: readModes(key) });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);
  const setMode = useCallback((setlistId: string, mode: SetlistDisplayMode) => {
    setCache(current => {
      const next = { ...(current.key === key ? current.modes : readModes(key)), [setlistId]: mode };
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep the preference usable in memory. */ }
      return { key, modes: next };
    });
  }, [key]);
  return { modes, setMode };
}
