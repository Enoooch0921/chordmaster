import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyLibraryPreferenceChanges, canSyncLibraryPreferences, mergeLibraryPreferenceChanges, mergeLibraryPreferenceSnapshots, syncLibraryPreferences, type LibraryPreferenceChange, type LibraryPreferenceSnapshot } from '../lib/songLibraryPreferenceSync';

type Preferences = LibraryPreferenceSnapshot & { pending: LibraryPreferenceChange[] };
type OutboxEntry = { key: string; patch: LibraryPreferenceChange };
const empty = (): Preferences => ({ favorites: [], recent: [], pending: [], clock: 0 });
export const songLibraryPreferencesKey = (userId?: string | null, libraryId?: string | null) =>
  `chordmaster.song-library-preferences.v1:${JSON.stringify([userId ?? 'local', libraryId ?? 'local'])}`;
function outbox(key: string): OutboxEntry[] {
  try {
    return Object.keys(localStorage).filter(item => item.startsWith(`${key}:outbox:`)).flatMap(item => {
      try {
        const entry = JSON.parse(localStorage.getItem(item) ?? 'null');
        if (!entry || typeof entry.id !== 'string' || !entry.id) return [];
        const patch: LibraryPreferenceChange = { id: entry.id };
        if (typeof entry.favorite === 'boolean' && Number.isSafeInteger(entry.favoriteAt) && entry.favoriteAt >= 0) { patch.favorite = entry.favorite; patch.favoriteAt = entry.favoriteAt; }
        if (Number.isSafeInteger(entry.usedAt) && entry.usedAt >= 0) patch.usedAt = entry.usedAt;
        return patch.favoriteAt === undefined && patch.usedAt === undefined ? [] : [{ key: item, patch }];
      } catch { return []; }
    });
  } catch { return []; }
}
function read(key: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null'), ids = new Set<string>();
    const pending = mergeLibraryPreferenceChanges(outbox(key).map(entry => entry.patch));
    const snapshot: LibraryPreferenceSnapshot = {
      clock: Number.isSafeInteger(value?.clock) && value.clock >= 0 ? value.clock : 0,
      favoriteStates: Array.isArray(value?.favoriteStates) ? value.favoriteStates.filter((entry: unknown) => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'boolean' && Number.isSafeInteger(entry[2]) && entry[2] >= 0) : undefined,
      recentStates: Array.isArray(value?.recentStates) ? value.recentStates.filter((entry: { id?: unknown; at?: unknown } | null) => entry && typeof entry.id === 'string' && typeof entry.at === 'number' && Number.isFinite(entry.at) && entry.at >= 0) : undefined,
      favorites: Array.isArray(value?.favorites) ? [...new Set<string>(value.favorites.filter((id: unknown) => typeof id === 'string' && id.length > 0))] : [],
      recent: Array.isArray(value?.recent) ? value.recent.filter((entry: { id?: unknown; at?: unknown } | null) => {
        if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.at !== 'number' || !Number.isFinite(entry.at) || entry.at < 0 || ids.has(entry.id)) return false;
        ids.add(entry.id); return true;
      }).sort((a: { at: number }, b: { at: number }) => b.at - a.at).slice(0, 100) : []
    };
    return { ...applyLibraryPreferenceChanges(snapshot, pending), pending };
  } catch { return empty(); }
}

/** Snapshot cache + one immutable storage key per operation, so tabs never overwrite another outbox. */
export function useSongLibraryPreferences(userId?: string | null, libraryId?: string | null) {
  const key = songLibraryPreferencesKey(userId, libraryId);
  const [cache, setCache] = useState(() => ({ key, value: read(key) }));
  const current = useMemo(() => cache.key === key ? cache : { key, value: read(key) }, [cache, key]);
  const latest = useRef(current); latest.current = current;
  // Only operations that could not be written to device storage need a memory fallback.
  const memoryOutbox = useRef(new Map<string, LibraryPreferenceChange>());
  const operationClock = useRef(0);
  const syncEnabled = Boolean(userId && libraryId && canSyncLibraryPreferences);
  const [syncState, setSyncState] = useState<{ key: string; status: 'syncing' | 'saved' | 'error' }>({ key, status: 'syncing' });
  const schedule = useRef<() => void>(() => {});
  const entries = useCallback(() => [...outbox(key), ...[...memoryOutbox.current].filter(([name]) => name.startsWith(`${key}:outbox:`)).map(([name, patch]) => ({ key: name, patch }))], [key]);
  const remove = useCallback((entry: OutboxEntry) => {
    try { localStorage.removeItem(entry.key); } catch { /* A later retry is idempotent. */ }
    memoryOutbox.current.delete(entry.key);
  }, []);
  const persist = useCallback((value: Preferences) => {
    const next = { key, value }; latest.current = next;
    // pending is diagnostic only; immutable outbox keys are the source of queued work.
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Session remains usable. */ }
    setCache(next);
  }, [key]);
  useEffect(() => {
    if (!syncEnabled || !userId || !libraryId) { schedule.current = () => {}; return; }
    let cancelled = false, running = false, requested = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deferred = new Set<string>();
    const run = async () => {
      if (cancelled) return;
      if (running) { requested = true; return; }
      if (navigator.onLine === false) { setSyncState({ key, status: 'error' }); return; }
      running = true; requested = false;
      setSyncState({ key, status: 'syncing' });
      try {
        const sentEntries = entries().filter(entry => !deferred.has(entry.patch.id));
        const sent = mergeLibraryPreferenceChanges(sentEntries.map(entry => entry.patch)).slice(0, 100);
        const remote = await syncLibraryPreferences(userId, libraryId, sent);
        if (cancelled || latest.current.key !== key) return;
        const applied = new Set(remote.applied), acknowledged = sent.filter(patch => applied.has(patch.id));
        for (const entry of sentEntries) {
          const accepted = acknowledged.find(patch => patch.id === entry.patch.id);
          // Older operations superseded by a sent field are also safe to discard.
          if (accepted && (entry.patch.favoriteAt === undefined || entry.patch.favoriteAt <= (accepted.favoriteAt ?? -1))
            && (entry.patch.usedAt === undefined || entry.patch.usedAt <= (accepted.usedAt ?? -1))) remove(entry);
        }
        for (const patch of sent) if (!applied.has(patch.id)) deferred.add(patch.id);
        const pending = mergeLibraryPreferenceChanges(entries().map(entry => entry.patch));
        const committed = mergeLibraryPreferenceSnapshots(read(key), latest.current.value);
        // Confirmed server times replace the optimistic overlay, including clock-skew clamping.
        const server = { ...remote, recentStates: remote.recent };
        persist({ ...applyLibraryPreferenceChanges(mergeLibraryPreferenceSnapshots(committed, server), pending), pending });
        requested ||= pending.some(patch => !deferred.has(patch.id));
        setSyncState({ key, status: pending.length ? (requested ? 'syncing' : 'error') : 'saved' });
      } catch {
        if (!cancelled) setSyncState({ key, status: 'error' });
      } finally {
        running = false;
        if (!cancelled && requested) { clearTimeout(timer); timer = setTimeout(run, 300); }
      }
    };
    const refresh = () => { deferred.clear(); clearTimeout(timer); timer = setTimeout(run, 300); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    schedule.current = refresh; void run();
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', visible);
    // No background polling. Refresh on entry/return, writes, scope selection and source saves.
    return () => { cancelled = true; clearTimeout(timer); schedule.current = () => {};
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [key, userId, libraryId, syncEnabled, persist, entries, remove]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === key || event.key === null || event.key.startsWith(`${key}:outbox:`)) {
        const value = read(key), pending = mergeLibraryPreferenceChanges(entries().map(entry => entry.patch));
        const snapshot = latest.current.key === key ? mergeLibraryPreferenceSnapshots(latest.current.value, value) : value;
        const next = { key, value: { ...applyLibraryPreferenceChanges(snapshot, pending), pending } };
        latest.current = next; setCache(next);
        // Cache/ack notifications must not cause a cross-tab request loop.
        if (event.key?.startsWith(`${key}:outbox:`) && event.newValue !== null) schedule.current();
      }
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, [key, entries]);
  const change = useCallback((id: string, field: 'favorite' | 'used') => {
    const value = latest.current.key === key ? latest.current.value : read(key);
    const pendingBefore = mergeLibraryPreferenceChanges(entries().map(entry => entry.patch));
    const at = Math.max(Date.now(), operationClock.current + 1, (value.clock ?? 0) + 1, ...pendingBefore.map(patch => Math.max(patch.favoriteAt ?? 0, patch.usedAt ?? 0) + 1));
    operationClock.current = at;
    const visible = applyLibraryPreferenceChanges(value, pendingBefore);
    const patch: LibraryPreferenceChange = field === 'favorite' ? { id, favorite: !visible.favorites.includes(id), favoriteAt: at } : { id, usedAt: at };
    if (syncEnabled) {
      const operationKey = `${key}:outbox:${crypto.randomUUID()}`;
      try { localStorage.setItem(operationKey, JSON.stringify(patch)); } catch { memoryOutbox.current.set(operationKey, patch); }
    }
    const pending = syncEnabled ? mergeLibraryPreferenceChanges(entries().map(entry => entry.patch)) : [];
    persist({ ...applyLibraryPreferenceChanges(visible, [patch]), pending });
    if (syncEnabled) { setSyncState({ key, status: 'syncing' }); schedule.current(); }
  }, [key, persist, syncEnabled, entries]);
  const toggleFavorite = useCallback((id: string) => change(id, 'favorite'), [change]);
  const recordUsed = useCallback((id: string) => change(id, 'used'), [change]);
  const refresh = useCallback(() => schedule.current(), []);
  const retryPending = useCallback(() => { if (entries().length) schedule.current(); }, [entries]);
  const forgetSongs = useCallback((deletedIds: Set<string>) => {
    const obsolete = entries().filter(entry => deletedIds.has(entry.patch.id));
    if (!obsolete.length) return;
    obsolete.forEach(remove);
    const value = latest.current.value, pending = mergeLibraryPreferenceChanges(entries().map(entry => entry.patch));
    persist({ ...value, favorites: value.favorites.filter(id => !deletedIds.has(id)), favoriteStates: value.favoriteStates?.filter(entry => !deletedIds.has(entry[0])), recent: value.recent.filter(entry => !deletedIds.has(entry.id)), recentStates: value.recentStates?.filter(entry => !deletedIds.has(entry.id)), pending });
    schedule.current();
  }, [entries, remove, persist]);
  const favoriteIds = useMemo(() => new Set(current.value.favorites), [current.value.favorites]);
  const recentOrder = useMemo(() => new Map(current.value.recent.map((entry, index) => [entry.id, index])), [current.value.recent]);
  return { favoriteIds, recentOrder, toggleFavorite, recordUsed, refresh, retryPending, forgetSongs,
    syncStatus: syncEnabled ? (syncState.key === key ? syncState.status : 'syncing') : 'local' as const };
}
