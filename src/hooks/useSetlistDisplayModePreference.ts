import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SetlistDisplayMode } from '../types';

const PREFIX = 'chordmaster.personal-setlist-display-modes.v1';
const validModes = new Set<SetlistDisplayMode>(['nashville-number-system', 'chord-fixed-key', 'chord-movable-key']);
const readModes = <T extends string | number>(key: string, valid: ReadonlySet<T>): Record<string, T> => {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, T] => (
      Boolean(entry[0]) && valid.has(entry[1] as T)
    )));
  } catch { return {}; }
};

/** Reading preferences belong to this account/browser, never the shared setlist. */
function useSetlistPreference<T extends string | number>(userId: string | null | undefined, prefix: string, valid: ReadonlySet<T>) {
  const key = `${prefix}:${userId ? `user:${encodeURIComponent(userId)}` : 'local'}`;
  const read = () => readModes(key, valid);
  const [cache, setCache] = useState(() => ({ key, modes: read() }));
  // Account changes must not render another account's preference, even before effects run.
  const modes = useMemo(() => cache.key === key ? cache.modes : read(), [cache, key, valid]);
  useEffect(() => {
    setCache(current => current.key === key ? current : { key, modes: read() });
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setCache({ key, modes: read() });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, valid]);
  const setMode = useCallback((setlistId: string, mode: T) => {
    setCache(current => {
      const next = { ...(current.key === key ? current.modes : read()), [setlistId]: mode };
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep the preference usable in memory. */ }
      return { key, modes: next };
    });
  }, [key, valid]);
  return { modes, setMode };
}

export function useSetlistDisplayModePreference(userId: string | null | undefined) {
  return useSetlistPreference(userId, PREFIX, validModes);
}

const validRows = new Set<1 | 2 | 3>([1, 2, 3]);
export function useSetlistBarRowPreference(userId: string | null | undefined) {
  const { modes, setMode } = useSetlistPreference(userId, 'chordmaster.personal-setlist-bar-rows.v1', validRows);
  return { rowCounts: modes, setRowCount: setMode };
}
