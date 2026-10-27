import { useCallback, useEffect, useMemo, useState } from 'react';

const PREFIX = 'chordmaster.project-pins.v1';
export const getProjectPinsStorageKey = (userId: string | null | undefined, libraryId: string | null | undefined) => (
  userId ? `${PREFIX}:user:${encodeURIComponent(userId)}:library:${encodeURIComponent(libraryId ?? 'default')}` : `${PREFIX}:local`
);
const readPins = (key: string): string[] => {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))] : [];
  } catch { return []; }
};

/** Folder pins are a personal account/library/browser preference, not a shared project edit. */
export function useProjectPins(userId: string | null | undefined, libraryId: string | null | undefined) {
  const key = getProjectPinsStorageKey(userId, libraryId);
  const [cache, setCache] = useState(() => ({ key, ids: readPins(key) }));
  const pinnedIds = useMemo(() => new Set(cache.key === key ? cache.ids : readPins(key)), [cache, key]);
  useEffect(() => {
    setCache(current => current.key === key ? current : { key, ids: readPins(key) });
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setCache({ key, ids: readPins(key) });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);
  const togglePin = useCallback((projectId: string) => {
    setCache(current => {
      const ids = current.key === key ? current.ids : readPins(key);
      const next = ids.includes(projectId) ? ids.filter(id => id !== projectId) : [...ids, projectId];
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep pins usable in memory. */ }
      return { key, ids: next };
    });
  }, [key]);
  return { pinnedIds, togglePin };
}

/** Stable partition: pinning changes the group, preserving each group's existing order. */
export function sortProjectsByPin<T extends { id: string }>(projects: T[], pinnedIds: ReadonlySet<string>): T[] {
  return [...projects.filter(project => pinnedIds.has(project.id)), ...projects.filter(project => !pinnedIds.has(project.id))];
}
