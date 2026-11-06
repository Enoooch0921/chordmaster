import { supabase } from './supabase';

export type LibraryPreferenceSnapshot = { favorites: string[]; recent: Array<{ id: string; at: number }>; recentStates?: Array<{ id: string; at: number }>; clock?: number; favoriteStates?: Array<[string, boolean, number]> };
export type LibraryPreferenceSyncResult = LibraryPreferenceSnapshot & { applied: string[] };
export type LibraryPreferenceChange = { id: string; favorite?: boolean; favoriteAt?: number; usedAt?: number };
export const canSyncLibraryPreferences = Boolean(supabase);

/** Account identity is checked by the RPC as well as RLS, including auth switches in flight. */
export async function syncLibraryPreferences(userId: string, libraryId: string, changes: LibraryPreferenceChange[]): Promise<LibraryPreferenceSyncResult> {
  if (!supabase) throw new Error('Sync unavailable');
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const { data, error } = await supabase.rpc('sync_song_library_preferences', {
      p_user_id: userId, p_library_id: libraryId, p_changes: changes
    }).abortSignal(controller.signal);
    if (error) throw error;
    return data as LibraryPreferenceSyncResult;
  } finally { clearTimeout(timeout); }
}

export function applyLibraryPreferenceChanges(value: LibraryPreferenceSnapshot, changes: LibraryPreferenceChange[]): LibraryPreferenceSnapshot {
  const favorites = new Set(value.favorites), recent = new Map(value.recent.map(item => [item.id, item.at]));
  for (const change of changes) {
    if (change.favorite !== undefined) { if (change.favorite) favorites.add(change.id); else favorites.delete(change.id); }
    if (change.usedAt !== undefined) recent.set(change.id, Math.max(recent.get(change.id) ?? 0, change.usedAt));
  }
  return { favorites: [...favorites], recent: [...recent].map(([id, at]) => ({ id, at })).sort((a, b) => b.at - a.at).slice(0, 100), recentStates: value.recentStates ?? value.recent, clock: value.clock ?? 0, favoriteStates: value.favoriteStates };
}

/** Per-song versions merge even equal-clock or reordered responses from different tabs. */
export function mergeLibraryPreferenceSnapshots(current: LibraryPreferenceSnapshot, incoming: LibraryPreferenceSnapshot): LibraryPreferenceSnapshot {
  const states = new Map<string, [string, boolean, number]>();
  for (const entry of [...current.favoriteStates ?? [], ...incoming.favoriteStates ?? []]) {
    if (entry[2] >= (states.get(entry[0])?.[2] ?? -1)) states.set(entry[0], entry);
  }
  const recent = new Map((current.recentStates ?? current.recent).map(entry => [entry.id, entry.at]));
  for (const entry of incoming.recentStates ?? incoming.recent) recent.set(entry.id, Math.max(recent.get(entry.id) ?? 0, entry.at));
  const versioned = current.favoriteStates !== undefined || incoming.favoriteStates !== undefined;
  const recentStates = [...recent].map(([id, at]) => ({ id, at })).sort((a, b) => b.at - a.at).slice(0, 100);
  return { favorites: versioned ? [...states.values()].filter(entry => entry[1]).map(entry => entry[0]) : incoming.favorites,
    favoriteStates: versioned ? [...states.values()] : undefined,
    recent: recentStates, recentStates,
    clock: Math.max(current.clock ?? 0, incoming.clock ?? 0) };
}

export function mergeLibraryPreferenceChanges(changes: LibraryPreferenceChange[]): LibraryPreferenceChange[] {
  const merged = new Map<string, LibraryPreferenceChange>();
  for (const patch of changes) {
    const next = { ...merged.get(patch.id), id: patch.id };
    if (patch.favoriteAt !== undefined && patch.favoriteAt >= (next.favoriteAt ?? -1)) { next.favorite = patch.favorite; next.favoriteAt = patch.favoriteAt; }
    if (patch.usedAt !== undefined) next.usedAt = Math.max(next.usedAt ?? 0, patch.usedAt);
    merged.set(patch.id, next);
  }
  return [...merged.values()];
}
