import { useEffect, useRef, useState } from 'react';
import { readTeamDraft, removeTeamDraft, writeTeamDraft, type TeamDraft } from '../lib/teamDrafts';
import type { WorkspaceData } from '../lib/workspaceMerge';

export function useTeamWorkspaceDraft(options: {
  userId?: string; libraryId: string | null; enabled: boolean; loading: boolean;
  dirty: boolean; workspace: WorkspaceData; baseline: WorkspaceData;
}) {
  const { userId, libraryId, enabled, loading, dirty, workspace, baseline } = options;
  const scope = enabled && userId && libraryId ? `${userId}/${libraryId}` : null;
  const [pending, setPending] = useState<{ scope: string; draft: TeamDraft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedScope = useRef<string | null>(null);
  const blockedScope = useRef<string | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (loading) return;
    if (loadedScope.current === scope) return;
    loadedScope.current = scope;
    blockedScope.current = null;
    setPending(null);
    setError(null);
    if (!scope) return;
    try {
      const draft = readTeamDraft(userId!, libraryId!);
      if (draft) { blockedScope.current = scope; setPending({ scope, draft }); }
    } catch (cause) { blockedScope.current = scope; setError(String(cause)); }
  }, [scope, loading, userId, libraryId]);

  useEffect(() => {
    if (!scope || loading || !dirty || blockedScope.current === scope || error) return;
    // Check storage once more: scope loading and this effect can run in the
    // same commit, before pending state has updated.
    try {
      const existing = readTeamDraft(userId!, libraryId!);
      if (existing && loadedScope.current !== scope) return;
      writeTeamDraft(userId!, libraryId!, workspace, baseline);
    } catch (cause) { setError(String(cause)); }
  }, [scope, loading, dirty, workspace.songs, workspace.setlists, workspace.projects, baseline.songs, baseline.setlists, baseline.projects, pending, error]);

  useEffect(() => {
    const flush = () => {
      const current = latest.current;
      if (!current.enabled || current.loading || !current.dirty || !current.userId || !current.libraryId || blockedScope.current || error) return;
      try { writeTeamDraft(current.userId, current.libraryId, current.workspace, current.baseline); }
      catch (cause) { setError(String(cause)); }
    };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [pending, error]);

  return {
    pending: pending?.scope === scope ? pending.draft : null,
    error,
    dismiss: () => {
      if (!userId || !libraryId) return;
      try { removeTeamDraft(userId, libraryId); blockedScope.current = null; setPending(null); setError(null); }
      catch (cause) { setError(String(cause)); }
    },
    restored: () => { blockedScope.current = null; setPending(null); },
  };
}
