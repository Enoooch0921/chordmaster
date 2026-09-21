import { useEffect, useRef, useState } from 'react';
import type { WorkspaceRepository } from '../lib/repository';
import { reconcileJoinedWorkspace, type JoinedWorkspace } from '../lib/joinedWorkspaceRefresh';

const SUCCESS_REFRESH_MS = 5 * 60 * 1000;

interface Options extends JoinedWorkspace {
  repository: WorkspaceRepository | null;
  scope: string;
  enabled: boolean;
  paused: boolean;
  onUpdate: (workspace: JoinedWorkspace) => void;
}

export const useJoinedWorkspaceRefresh = (options: Options) => {
  const latest = useRef(options);
  latest.current = options;
  const [refreshFailed, setRefreshFailed] = useState(false);
  const { repository, scope, enabled } = options;

  useEffect(() => {
    setRefreshFailed(false);
    if (!repository || !enabled) return;
    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canRefresh = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const refresh = async () => {
      if (cancelled || inFlight || !canRefresh()) return;
      clearTimer();
      inFlight = true;
      const snapshot = latest.current;
      try {
        if (snapshot.paused) return;
        const remote = await repository.loadJoinedWorkspace();
        if (cancelled) return;
        failures = 0;
        setRefreshFailed(false);
        const current = latest.current;
        // Ignore a read that raced an optimistic Key/Capo/order edit or leaving
        // a shared collection. The next pass reloads after the mutation settles.
        if (current.paused || current.joinedSetlists !== snapshot.joinedSetlists
            || current.joinedProjects !== snapshot.joinedProjects) return;
        current.onUpdate(reconcileJoinedWorkspace(current, remote));
      } catch {
        if (!cancelled) { failures += 1; setRefreshFailed(true); }
      } finally {
        inFlight = false;
        if (!cancelled && canRefresh()) {
          const delay = failures > 0
            ? Math.min(30000, 5000 * 2 ** Math.min(failures, 3))
            : SUCCESS_REFRESH_MS;
          timer = setTimeout(() => void refresh(), delay);
        }
      }
    };
    const resume = () => { clearTimer(); if (canRefresh()) void refresh(); };
    const offline = () => { clearTimer(); setRefreshFailed(true); };
    void refresh();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [repository, scope, enabled]);

  return refreshFailed;
};
