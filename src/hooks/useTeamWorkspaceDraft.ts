import { useEffect, useRef, useState } from 'react';
import { readTeamDraft, removeTeamDraft, writeTeamDraft, type TeamDraft } from '../lib/teamDrafts';
import type { WorkspaceData } from '../lib/workspaceMerge';

type Options = {
  userId?: string; libraryId: string | null; enabled: boolean; loading: boolean;
  dirty: boolean; workspace: WorkspaceData; baseline: WorkspaceData;
};
const scopeOf = (options: Options) => options.enabled && options.userId && options.libraryId
  ? `${options.userId}/${options.libraryId}` : null;

export function useTeamWorkspaceDraft(options: Options) {
  const { userId, libraryId, loading, dirty, workspace, baseline } = options;
  const scope = scopeOf(options);
  const [state, setState] = useState<{
    scope: string | null; ready: boolean; pending: TeamDraft | null; error: string | null;
  }>({ scope: null, ready: false, pending: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const generation = useRef(0);
  const writeVersion = useRef(0);
  const writableScope = useRef<string | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const ready = !loading && state.scope === scope && state.ready;
  const pending = state.scope === scope ? state.pending : null;
  const error = state.scope === scope ? state.error : null;

  useEffect(() => {
    const token = ++generation.current;
    writableScope.current = null;
    setState({ scope, ready: false, pending: null, error: null });
    if (!scope || loading) return;
    void readTeamDraft(userId!, libraryId!).then((draft) => {
      if (generation.current !== token || scopeOf(latest.current) !== scope) return;
      writableScope.current = draft ? null : scope;
      setState({ scope, ready: true, pending: draft, error: null });
    }).catch(() => {
      if (generation.current !== token || scopeOf(latest.current) !== scope) return;
      setState({ scope, ready: false, pending: null, error: '暫時無法讀取本機草稿，系統會自動重試。' });
    });
    return () => { generation.current += 1; writableScope.current = null; };
  }, [scope, loading, userId, libraryId, loadAttempt]);

  const save = (snapshot: Options) => {
    const target = scopeOf(snapshot);
    if (!target || snapshot.loading || !snapshot.dirty || writableScope.current !== target) return;
    const token = generation.current;
    const version = ++writeVersion.current;
    void writeTeamDraft(snapshot.userId!, snapshot.libraryId!, snapshot.workspace, snapshot.baseline).then(() => {
      if (generation.current !== token || version !== writeVersion.current || scopeOf(latest.current) !== target) return;
      setState((current) => current.error ? { ...current, error: null } : current);
    }).catch(() => {
      if (generation.current !== token || version !== writeVersion.current || scopeOf(latest.current) !== target || !latest.current.dirty) return;
      setState((current) => ({ ...current, error: '暫時無法備份至此裝置，系統會自動重試；連線時仍可儲存至雲端。' }));
    });
  };
  const saveLatest = useRef(save);
  saveLatest.current = save;

  useEffect(() => {
    if (!ready || pending || writableScope.current !== scope) return;
    if (!dirty) {
      // A successful cloud save makes a previous local-write warning obsolete.
      setState((current) => current.error ? { ...current, error: null } : current);
      return;
    }
    saveLatest.current(latest.current);
  }, [scope, ready, pending, dirty, workspace.songs, workspace.setlists, workspace.projects,
    baseline.songs, baseline.setlists, baseline.projects, attempt]);

  useEffect(() => {
    if (!error || loading) return;
    const timeout = window.setTimeout(() => {
      if (!ready) setLoadAttempt((value) => value + 1);
      else if (!pending) setAttempt((value) => value + 1);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [error, loading, ready, pending, attempt, loadAttempt]);

  const retryLatest = useRef(() => {});
  retryLatest.current = () => {
    if (!ready) setLoadAttempt((value) => value + 1);
    else setAttempt((value) => value + 1);
  };

  useEffect(() => {
    // Edits are persisted as they happen; pagehide is only a best-effort extra
    // flush because browsers need not finish asynchronous work during shutdown.
    const flush = () => saveLatest.current(latest.current);
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    const online = () => retryLatest.current();
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  return {
    ready,
    pending,
    error,
    dismiss: async () => {
      if (!userId || !libraryId) return;
      const token = generation.current;
      try {
        await removeTeamDraft(userId, libraryId);
        if (generation.current !== token || scopeOf(latest.current) !== scope) return;
        writableScope.current = scope;
        setState({ scope, ready: true, pending: null, error: null });
      } catch {
        if (generation.current !== token || scopeOf(latest.current) !== scope) return;
        setState((current) => ({ ...current, error: '暫時無法移除本機草稿，請稍後重試。' }));
      }
    },
    restored: () => {
      writableScope.current = scope;
      setState({ scope, ready: true, pending: null, error: null });
    },
  };
}
