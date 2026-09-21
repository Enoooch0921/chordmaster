import { useEffect, useRef, useState } from 'react';
import type { WorkspaceRepository } from '../lib/repository';
import type { WorkspaceSnapshot } from '../types';

const SUCCESS_REFRESH_MS = 5 * 60 * 1000;

export type LibraryContent = Pick<WorkspaceSnapshot, 'songs' | 'setlists' | 'projects' | 'lastSavedAt'>;

interface Options {
  repository: WorkspaceRepository | null;
  scope: string;
  libraryId: string | null;
  enabled: boolean;
  paused: boolean;
  workspace: Pick<LibraryContent, 'songs' | 'setlists' | 'projects'>;
  // Check synchronous mutation/storage guards too, before React has rerendered.
  canApply: () => boolean;
  onUpdate: (content: LibraryContent) => void;
}

/** Same-account devices need the owned library, not the joined-share RPCs. */
export const useLibraryWorkspaceRefresh = (options: Options) => {
  const latest = useRef(options);
  latest.current = options;
  const [refreshFailed, setRefreshFailed] = useState(false);
  const { repository, scope, libraryId, enabled } = options;

  useEffect(() => {
    setRefreshFailed(false);
    if (!repository || !libraryId || !enabled) return;
    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const canRefresh = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const refresh = async () => {
      if (cancelled || inFlight || !canRefresh()) return;
      clearTimer();
      inFlight = true;
      const snapshot = latest.current;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        if (snapshot.paused || !snapshot.canApply()) return;
        controller = new AbortController();
        const requestController = controller;
        timeout = setTimeout(() => requestController.abort(), 15000);
        const remote = await repository.loadLibraryContent(libraryId, controller.signal);
        if (cancelled) return;
        failures = 0;
        setRefreshFailed(false);
        const current = latest.current;
        // Even a completed edit/save invalidates a response started before it.
        if (current.paused || !current.canApply()
            || current.workspace.songs !== snapshot.workspace.songs
            || current.workspace.setlists !== snapshot.workspace.setlists
            || current.workspace.projects !== snapshot.workspace.projects) return;
        current.onUpdate(remote);
      } catch {
        if (!cancelled) { failures += 1; setRefreshFailed(true); }
      } finally {
        clearTimeout(timeout);
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
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [repository, scope, libraryId, enabled]);

  return refreshFailed;
};
