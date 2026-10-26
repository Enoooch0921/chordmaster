import { useEffect, useRef, useState } from 'react';
import type { WorkspaceRepository } from '../lib/repository';
import type { WorkspaceSnapshot } from '../types';
import { retainUnchangedRows } from '../lib/remoteReconciliation';

const SUCCESS_REFRESH_MS = 5 * 60 * 1000;
const COLLECTION_REFRESH_MS = 15000;
const CHANGE_DEBOUNCE_MS = 250;

export type LibraryContent = Pick<WorkspaceSnapshot, 'songs' | 'setlists' | 'projects' | 'lastSavedAt'>;

interface Options {
  repository: WorkspaceRepository | null;
  scope: string;
  libraryId: string | null;
  enabled: boolean;
  paused: boolean;
  // Team setlist copies need frequent reads even when Realtime publication is
  // unavailable, without repeatedly downloading the entire song catalogue.
  refreshCollections?: boolean;
  refreshVersion?: number;
  songRefreshVersion?: number;
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
  const requestRefreshRef = useRef<((full?: boolean) => void) | null>(null);
  const triggerRef = useRef({ paused: options.paused, version: options.refreshVersion, songs: options.songRefreshVersion });
  const { repository, scope, libraryId, enabled, refreshCollections = false } = options;

  useEffect(() => {
    setRefreshFailed(false);
    if (!repository || !libraryId || !enabled) return;
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    let fullRefreshRequested = false;
    let failures = 0;
    let lastFullRefreshAt: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const canRefresh = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const refresh = async (forceFull = false) => {
      fullRefreshRequested ||= forceFull;
      if (cancelled || !canRefresh()) return;
      if (inFlight) { queued = true; return; }
      clearTimer();
      inFlight = true;
      queued = false;
      const snapshot = latest.current;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        if (snapshot.paused || !snapshot.canApply()) return;
        controller = new AbortController();
        const requestController = controller;
        timeout = setTimeout(() => requestController.abort(), 15000);
        let fullRead = fullRefreshRequested || !refreshCollections || lastFullRefreshAt === null
          || Date.now() - lastFullRefreshAt >= SUCCESS_REFRESH_MS;
        fullRefreshRequested = false;
        // Realtime can be interrupted on mobile or self-hosted installations.
        // Compare only ids/timestamps every 15s; download scores only on change.
        if (!fullRead) {
          const versions = await repository.loadLibrarySongVersions(libraryId, controller.signal);
          const known = new Map(snapshot.workspace.songs.map((song) => [song.id, song.updatedAt ?? 0]));
          fullRead = versions.length !== known.size || versions.some((song) => known.get(song.id) !== song.updatedAt);
        }
        const remote = fullRead
          ? await repository.loadLibraryContent(libraryId, controller.signal)
          : await repository.loadLibraryCollections(libraryId, snapshot.workspace.songs, controller.signal);
        if (cancelled) return;
        failures = 0;
        setRefreshFailed(false);
        const current = latest.current;
        // Even a completed edit/save invalidates a response started before it.
        if (current.paused || !current.canApply()
            || current.workspace.songs !== snapshot.workspace.songs
            || current.workspace.setlists !== snapshot.workspace.setlists
            || current.workspace.projects !== snapshot.workspace.projects) {
          fullRefreshRequested ||= fullRead;
          return;
        }
        if (fullRead) lastFullRefreshAt = Date.now();
        current.onUpdate({ ...remote,
          songs: retainUnchangedRows(current.workspace.songs, remote.songs),
          setlists: retainUnchangedRows(current.workspace.setlists, remote.setlists),
          projects: retainUnchangedRows(current.workspace.projects, remote.projects)
        });
      } catch {
        if (!cancelled) { failures += 1; setRefreshFailed(true); }
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!cancelled && canRefresh()) {
          const delay = failures > 0
            ? Math.min(30000, 5000 * 2 ** Math.min(failures, 3))
            : queued && !latest.current.paused && latest.current.canApply()
              ? CHANGE_DEBOUNCE_MS
              : refreshCollections ? COLLECTION_REFRESH_MS : SUCCESS_REFRESH_MS;
          timer = setTimeout(() => void refresh(), delay);
        }
      }
    };
    const requestRefresh = (full = false) => {
      fullRefreshRequested ||= full;
      if (cancelled || !canRefresh()) return;
      if (inFlight) { queued = true; return; }
      clearTimer();
      timer = setTimeout(() => void refresh(), CHANGE_DEBOUNCE_MS);
    };
    requestRefreshRef.current = requestRefresh;
    const resume = () => { clearTimer(); if (canRefresh()) void refresh(true); };
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
      if (requestRefreshRef.current === requestRefresh) requestRefreshRef.current = null;
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [repository, scope, libraryId, enabled, refreshCollections]);

  useEffect(() => {
    const previous = triggerRef.current;
    triggerRef.current = { paused: options.paused, version: options.refreshVersion, songs: options.songRefreshVersion };
    const songsChanged = previous.songs !== options.songRefreshVersion;
    if ((previous.paused && !options.paused) || previous.version !== options.refreshVersion || songsChanged) {
      requestRefreshRef.current?.(songsChanged);
    }
  }, [options.paused, options.refreshVersion, options.songRefreshVersion]);

  return refreshFailed;
};
