import type { WorkspaceData } from './workspaceMerge';

export interface TeamDraft {
  // v1 contains complete snapshots; v2 contains only changed records and their
  // baselines. Missing edited records represent deletions in both formats.
  version: 1 | 2;
  userId: string;
  libraryId: string;
  savedAt: number;
  workspace: WorkspaceData;
  baseline: WorkspaceData;
}

const draftKey = (userId: string, libraryId: string) =>
  `chordmaster.team-draft.v1.${encodeURIComponent(userId)}.${encodeURIComponent(libraryId)}`;
const DATABASE = 'chordmaster-team-drafts';
const STORE = 'drafts';
const collections = ['songs', 'setlists', 'projects'] as const;

// Only changed records need a local copy. The baseline is retained for conflict
// detection, including deletions; untouched cloud records need no backup.
const compactDraft = (draft: TeamDraft): TeamDraft => {
  const workspace: WorkspaceData = { songs: [], setlists: [], projects: [] };
  const baseline: WorkspaceData = { songs: [], setlists: [], projects: [] };
  for (const key of collections) {
    const before = new Map(draft.baseline[key].map((item) => [item.id, JSON.stringify(item)] as const));
    const after = new Map(draft.workspace[key].map((item) => [item.id, JSON.stringify(item)] as const));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(id) === after.get(id)) continue;
      if (before.has(id)) baseline[key].push(JSON.parse(before.get(id)!));
      if (after.has(id)) workspace[key].push(JSON.parse(after.get(id)!));
    }
  }
  return { ...draft, version: 2, workspace, baseline };
};

const isWorkspaceData = (value: unknown): value is WorkspaceData => {
  if (!value || typeof value !== 'object') return false;
  return (['songs', 'setlists', 'projects'] as const).every((key) => {
    const items = (value as WorkspaceData)[key];
    return Array.isArray(items) && items.every((item) => item && typeof item.id === 'string'
      && Number.isFinite(item.updatedAt))
      && new Set(items.map((item) => item.id)).size === items.length;
  }) && (value as WorkspaceData).songs.every((song) => typeof song.title === 'string' && Array.isArray(song.sections))
    && (value as WorkspaceData).setlists.every((setlist) => typeof setlist.name === 'string' && Array.isArray(setlist.songs))
    && (value as WorkspaceData).projects.every((project) => typeof project.name === 'string');
};

const validateDraft = (value: unknown, userId: string, libraryId: string): TeamDraft => {
  const draft = value as TeamDraft | null;
  if (!draft || (draft.version !== 1 && draft.version !== 2)
    || draft.userId !== userId || draft.libraryId !== libraryId
    || !Number.isFinite(draft.savedAt) || !isWorkspaceData(draft.workspace) || !isWorkspaceData(draft.baseline)) {
    throw new Error('無法讀取草稿，原始備份仍保留在本機');
  }
  return draft;
};

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = window.indexedDB.open(DATABASE, 1);
  // A blocked upgrade must not indefinitely prevent an available cloud save.
  let expired = false;
  const timeout = window.setTimeout(() => {
    expired = true;
    reject(new Error('本機草稿儲存暫時無法使用'));
  }, 3000);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  request.onerror = () => { clearTimeout(timeout); reject(request.error); };
  request.onsuccess = () => {
    clearTimeout(timeout);
    if (expired) { request.result.close(); return; }
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
});

// Serialize operations in this tab, including legacy migration. Conditional
// deletion also runs inside one transaction so other tabs cannot race it.
const operations = new Map<string, Promise<unknown>>();
const enqueue = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  const pending = (operations.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  operations.set(key, pending);
  const cleanup = () => { if (operations.get(key) === pending) operations.delete(key); };
  void pending.then(cleanup, cleanup);
  return pending;
};

const transact = async <T>(key: string, update: (value: unknown, store: IDBObjectStore) => T): Promise<T> => {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      let result: T;
      let failure: unknown;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('本機草稿寫入失敗'));
      const request = store.get(key);
      request.onsuccess = () => {
        try { result = update(request.result, store); }
        catch (cause) { failure = cause; transaction.abort(); }
      };
    });
  } finally { db.close(); }
};

const legacyRaw = (key: string) => {
  try { return window.localStorage.getItem(key); }
  catch { return null; } // IndexedDB can remain available when Web Storage is blocked.
};
const clearLegacy = (key: string, raw: string | null) => {
  try {
    if (raw !== null && window.localStorage.getItem(key) === raw) window.localStorage.removeItem(key);
  } catch { /* The IndexedDB transaction already committed. */ }
};

export const writeTeamDraft = async (userId: string, libraryId: string, workspace: WorkspaceData, baseline: WorkspaceData): Promise<TeamDraft> => {
  const key = draftKey(userId, libraryId);
  // Capture the edit at invocation time, before awaiting any queued operations.
  const draft = compactDraft({ version: 2, userId, libraryId, savedAt: Date.now(), workspace, baseline });
  return enqueue(key, async () => {
    const raw = legacyRaw(key);
    await transact(key, (_value, store) => { store.put(draft, key); });
    clearLegacy(key, raw);
    return draft;
  });
};

export const readTeamDraft = (userId: string, libraryId: string): Promise<TeamDraft | null> => {
  const key = draftKey(userId, libraryId);
  return enqueue(key, async () => {
    const raw = legacyRaw(key);
    const draft = await transact(key, (value, store) => {
      const current = value === undefined ? null : validateDraft(value, userId, libraryId);
      if (raw === null) return current;
      const legacy = validateDraft(JSON.parse(raw), userId, libraryId);
      // An older app tab may have written another legacy draft since migration.
      if (current && current.savedAt >= legacy.savedAt) return current;
      const migrated = compactDraft(legacy);
      store.put(migrated, key);
      return migrated;
    });
    // Never delete the only legacy backup before the migration commits.
    clearLegacy(key, raw);
    return draft;
  });
};

const matchesSavedWorkspace = (draft: TeamDraft, expected: WorkspaceData) => {
  const changes = draft.version === 1 ? compactDraft(draft) : draft;
  return collections.every((key) => {
    const saved = new Map(expected[key].map((item) => [item.id, JSON.stringify(item)] as const));
    const edited = new Map(changes.workspace[key].map((item) => [item.id, JSON.stringify(item)] as const));
    const changedIds = new Set([...changes.baseline[key].map((item) => item.id), ...edited.keys()]);
    return [...changedIds].every((id) => saved.get(id) === edited.get(id));
  });
};

export const removeTeamDraft = (userId: string, libraryId: string, expected?: WorkspaceData): Promise<void> => {
  const key = draftKey(userId, libraryId);
  return enqueue(key, async () => {
    const raw = legacyRaw(key);
    const removed = await transact(key, (value, store) => {
      if (expected) {
        const draft = value === undefined && raw !== null ? JSON.parse(raw) : value;
        if (!draft || !matchesSavedWorkspace(validateDraft(draft, userId, libraryId), expected)) return false;
      }
      store.delete(key);
      return true;
    });
    if (removed) clearLegacy(key, raw);
  });
};

// Apply only draft edits relative to its baseline. Remote-only items and remote
// edits to untouched records survive. Conflicts require an explicit UI choice.
export const restoreTeamDraft = (draft: TeamDraft, remote: WorkspaceData) => {
  let conflicts = 0;
  const merge = <T extends { id: string }>(local: T[], baseline: T[], current: T[]) => {
    const base = new Map(baseline.map((item) => [item.id, item]));
    const edited = new Map(local.map((item) => [item.id, item]));
    const result = new Map(current.map((item) => [item.id, item]));
    for (const id of new Set([...base.keys(), ...edited.keys()])) {
      const before = JSON.stringify(base.get(id));
      const after = JSON.stringify(edited.get(id));
      if (before === after) continue;
      const cloud = JSON.stringify(result.get(id));
      if (cloud !== before && cloud !== after) conflicts += 1;
      const value = edited.get(id);
      if (value) result.set(id, value);
      else result.delete(id);
    }
    return [...result.values()];
  };
  const workspace: WorkspaceData = {
    songs: merge(draft.workspace.songs, draft.baseline.songs, remote.songs),
    setlists: merge(draft.workspace.setlists, draft.baseline.setlists, remote.setlists),
    projects: merge(draft.workspace.projects, draft.baseline.projects, remote.projects)
  };
  return { workspace, conflicts };
};
