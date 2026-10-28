import type { AuthenticatedUser, CloudLibrarySummary, WorkspaceSnapshot } from '../types';
import { loadActiveLibraryPreference } from './activeLibraryPreference';
import { readWorkspaceCache, writeWorkspaceCache } from './workspaceDatabase';

const POINTER_KEY = 'chordmaster.cloud-startup.v1';
const keyFor = (userId: string, libraryId: string) => `cloud-cache:${encodeURIComponent(userId)}:${encodeURIComponent(libraryId)}`;
let pointerEpoch = 0;
export interface CloudWorkspaceCache {
  version: 1;
  user: AuthenticatedUser;
  library: CloudLibrarySummary;
  libraries: CloudLibrarySummary[];
  workspace: WorkspaceSnapshot;
  cachedAt: number;
}
const parse = (raw: unknown, userId: string, libraryId: string): CloudWorkspaceCache | null => {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) as CloudWorkspaceCache : null;
    return value?.version === 1 && value.user?.id === userId && value.library?.id === libraryId
      && ['team', 'personal'].includes(value.library.kind) && Array.isArray(value.libraries)
      && value.libraries.some(library => library.id === libraryId)
      && Array.isArray(value.workspace?.songs) && value.workspace.songs.every(song => typeof song?.id === 'string'
        && typeof song.title === 'string' && Array.isArray(song.sections) && song.sections.every(section => Array.isArray(section?.bars)))
      && Array.isArray(value.workspace.setlists) && value.workspace.setlists.every(list => typeof list?.id === 'string' && Array.isArray(list.songs))
      && Array.isArray(value.workspace.projects) && Array.isArray(value.workspace.joinedSetlists)
      && Number.isFinite(value.cachedAt) ? value : null;
  } catch { return null; }
};

export const clearCloudStartupPointer = () => {
  pointerEpoch += 1;
  try { window.localStorage.removeItem(POINTER_KEY); } catch { /* Cache is optional. */ }
};

export const loadCloudWorkspaceCache = async (userId: string, libraryId: string) => {
  const key = keyFor(userId, libraryId);
  try {
    const value = parse(await readWorkspaceCache(key), userId, libraryId);
    if (value) return value;
  } catch { /* Fall back when IndexedDB is blocked. */ }
  try { return parse(window.localStorage.getItem(key), userId, libraryId); }
  catch { return null; }
};

export const loadCloudStartupCache = async (): Promise<CloudWorkspaceCache | null> => {
  try {
    const pointer = JSON.parse(window.localStorage.getItem(POINTER_KEY) ?? 'null');
    if (pointer?.version !== 1 || typeof pointer.userId !== 'string' || typeof pointer.libraryId !== 'string') return null;
    const requested = new URLSearchParams(window.location.search).get('team');
    const libraryId = requested || loadActiveLibraryPreference(pointer.userId) || pointer.libraryId;
    return await loadCloudWorkspaceCache(pointer.userId, libraryId);
  } catch { return null; }
};

let pendingWrite: Promise<unknown> = Promise.resolve();
export const saveCloudWorkspaceCache = (input: Omit<CloudWorkspaceCache, 'version' | 'cachedAt'>) => {
  const epoch = pointerEpoch;
  // Copy only identity/display information; never store sessions or credentials.
  const { id, email, name, picture } = input.user;
  const serialized = JSON.stringify({ ...input, user: { id, email, name, picture }, version: 1, cachedAt: Date.now() });
  const key = keyFor(id, input.library.id);
  const operation = pendingWrite.catch(() => undefined).then(async () => {
    try { await writeWorkspaceCache(key, serialized); }
    catch { window.localStorage.setItem(key, serialized); }
    try {
      if (epoch === pointerEpoch) window.localStorage.setItem(POINTER_KEY, JSON.stringify({ version: 1, userId: id, libraryId: input.library.id }));
    } catch { /* An existing scoped cache is still useful while signed in. */ }
  });
  pendingWrite = operation;
  return operation;
};
