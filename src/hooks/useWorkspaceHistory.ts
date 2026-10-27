import { useEffect, useRef, useState } from 'react';
import { appendWorkspaceHistory, EMPTY_WORKSPACE_HISTORY, type WorkspaceHistoryEntry, type WorkspaceHistoryState } from '../lib/workspaceHistory';

// Separate from workspace autosave: undo never replaces an account or library snapshot.
function historyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chordmaster-workspace-history', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('histories');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readHistory(key: string): Promise<WorkspaceHistoryState> {
  const db = await historyDatabase();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('histories').objectStore('histories').get(key);
    request.onsuccess = () => {
      const stored = request.result;
      const valid = stored?.version === 1 && Array.isArray(stored.state?.past) && Array.isArray(stored.state?.future)
        && [...stored.state.past, ...stored.state.future].every(entry => typeof entry?.id === 'string' && entry.label && Array.isArray(entry.changes));
      resolve(valid ? { past: stored.state.past.slice(-50), future: stored.state.future.slice(0,50) } : EMPTY_WORKSPACE_HISTORY);
    };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
async function writeHistory(key: string, state: WorkspaceHistoryState) {
  const db = await historyDatabase();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('histories', 'readwrite');
    transaction.objectStore('histories').put({ version: 1, state }, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}

interface Options {
  scope: string;
  enabled: boolean;
  apply: (entry: WorkspaceHistoryEntry, direction: 'undo' | 'redo') => Promise<WorkspaceHistoryEntry>;
  onError: (error: unknown) => void;
  onComplete: (entry: WorkspaceHistoryEntry, direction: 'undo' | 'redo') => void;
}
export function useWorkspaceHistory(options: Options) {
  const latest = useRef(options); latest.current = options;
  const context = useRef({ scope: options.scope, state: EMPTY_WORKSPACE_HISTORY, pending: [] as WorkspaceHistoryEntry[], ready: false, busy: false, epoch: 0, loading:Promise.resolve() });
  const [, render] = useState(0);
  const writes = useRef(Promise.resolve());
  const publish = () => render(value => value + 1);
  const save = (scope: string, state: WorkspaceHistoryState) => {
    writes.current = writes.current.catch(() => undefined).then(() => writeHistory(scope, state)).catch(error => latest.current.onError(error));
  };
  useEffect(() => {
    const next = { scope: options.scope, state: EMPTY_WORKSPACE_HISTORY, pending: [] as WorkspaceHistoryEntry[], ready: false, busy: false, epoch: context.current.epoch + 1,loading:Promise.resolve() };
    context.current = next; publish();
    let cancelled = false;
    next.loading = readHistory(next.scope).then(state => {
      const merged=next.pending.reduce(appendWorkspaceHistory,state);
      if(next.pending.length)save(next.scope,merged);
      if (cancelled || context.current !== next) return;
      next.state = merged; next.ready = true;
      next.pending = []; publish();
    }).catch(error => {
      if (cancelled || context.current !== next) return;
      next.state = next.pending.reduce(appendWorkspaceHistory, EMPTY_WORKSPACE_HISTORY); next.pending = [];
      next.ready = true; publish(); latest.current.onError(error);
    });
    return () => { cancelled = true; };
  }, [options.scope]);
  const record = (entry: WorkspaceHistoryEntry | null) => {
    const current = context.current;
    if (!entry || !latest.current.enabled || current.busy || current.scope !== latest.current.scope) return;
    if (!current.ready) { current.pending.push(entry); return; }
    current.state = appendWorkspaceHistory(current.state, entry);
    save(current.scope, current.state); publish();
  };
  const run = async (direction: 'undo' | 'redo', expectedId?: string) => {
    const current = context.current;
    if (!latest.current.enabled || current.busy || current.scope !== latest.current.scope) return;
    current.busy = true; publish();
    try {
      if(!current.ready)await current.loading;
      if(context.current!==current||current.scope!==latest.current.scope||!latest.current.enabled)return;
      const entry = direction === 'undo' ? current.state.past.at(-1) : current.state.future[0];
      if (!entry || (expectedId && entry.id !== expectedId)) return;
      const applied = await latest.current.apply(structuredClone(entry), direction);
      if (context.current !== current || latest.current.scope !== current.scope) return;
      current.state = direction === 'undo'
        ? { past: current.state.past.slice(0,-1), future: [applied, ...current.state.future] }
        : { past: [...current.state.past, applied], future: current.state.future.slice(1) };
      save(current.scope, current.state); latest.current.onComplete(applied, direction);
    } catch (error) { latest.current.onError(error); }
    finally { current.busy = false; if (context.current === current) publish(); }
  };
  const clear = async () => {
    const current = context.current;
    await current.loading;
    if (context.current !== current || current.scope !== latest.current.scope) return;
    current.state = EMPTY_WORKSPACE_HISTORY;
    current.pending = [];
    save(current.scope, current.state);
    publish();
  };
  const current = context.current;
  const ready = current.ready && current.scope === options.scope;
  return { record, clear, undo: (expectedId?:string) => run('undo',expectedId), redo: () => run('redo'), ready, busy: current.scope===options.scope && current.busy,
    getUndoEntry: () => context.current.state.past.at(-1),
    canUndo: ready && !current.busy && options.enabled && current.state.past.length > 0,
    canRedo: ready && !current.busy && options.enabled && current.state.future.length > 0,
    undoEntry: ready ? current.state.past.at(-1) : undefined,
    redoEntry: ready ? current.state.future[0] : undefined };
}
