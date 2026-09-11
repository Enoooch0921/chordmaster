import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface Options {
  previewRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  trackScroll: boolean;
  selectedSongId: string | null;
  songCount: number;
  skipNextAutoScrollRef: RefObject<boolean>;
  preserveSelectionUntilRef: RefObject<number>;
  onSelectSong: (id: string) => void;
}

export function useSetlistPreviewNavigation({
  previewRef, enabled, trackScroll, selectedSongId, songCount,
  skipNextAutoScrollRef, preserveSelectionUntilRef, onSelectSong
}: Options) {
  const navigatingRef = useRef(false);

  useLayoutEffect(() => {
    if (!enabled || !selectedSongId || songCount === 0) return;
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }

    // Lock before the browser can deliver a scroll event from the old view.
    // A fixed deadline can expire before a long smooth scroll has finished.
    navigatingRef.current = true;
    let idleTimer: number | undefined;
    let scrollRoot: HTMLDivElement | null = null;
    let frameId: number;
    const finish = () => {
      navigatingRef.current = false;
      window.clearTimeout(idleTimer);
      scrollRoot?.removeEventListener('scroll', onScroll);
      scrollRoot?.removeEventListener('scrollend', finish);
    };
    const onScroll = () => {
      // Fallback for browsers without scrollend. Count from the last movement,
      // not from the click, so intermediate songs never become selected.
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(finish, 180);
    };

    frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        scrollRoot = previewRef.current;
        const target = scrollRoot?.querySelector<HTMLElement>(`[data-setlist-preview-song-id="${selectedSongId}"]`);
        if (!scrollRoot || !target) {
          finish();
          return;
        }
        const rootRect = scrollRoot.getBoundingClientRect();
        const offsetTop = target.getBoundingClientRect().top - rootRect.top + scrollRoot.scrollTop;
        const desiredTop = Math.min(
          Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight),
          Math.max(0, offsetTop - Math.min(120, rootRect.height * 0.16))
        );
        if (Math.abs(scrollRoot.scrollTop - desiredTop) < 12) {
          finish();
          return;
        }
        scrollRoot.addEventListener('scroll', onScroll, { passive: true });
        scrollRoot.addEventListener('scrollend', finish);
        scrollRoot.scrollTo({ top: desiredTop, behavior: 'smooth' });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      finish();
    };
  }, [enabled, selectedSongId, songCount, previewRef, skipNextAutoScrollRef]);

  useEffect(() => {
    // Editor reflows must not change the song being edited.
    if (!enabled || !trackScroll || songCount === 0) return;
    const scrollRoot = previewRef.current;
    if (!scrollRoot) return;
    let frameId: number | null = null;
    const updateFromScroll = () => {
      frameId = null;
      if (navigatingRef.current || preserveSelectionUntilRef.current > performance.now()) return;
      const rootRect = scrollRoot.getBoundingClientRect();
      const activationY = rootRect.top + Math.min(180, Math.max(72, rootRect.height * 0.28));
      const cards = scrollRoot.querySelectorAll<HTMLElement>('[data-setlist-preview-song-id]');
      let nextId: string | null = null;
      let smallestDistance = Number.POSITIVE_INFINITY;
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const distance = rect.top <= activationY && rect.bottom >= activationY
          ? 0
          : Math.min(Math.abs(rect.top - activationY), Math.abs(rect.bottom - activationY));
        if (distance < smallestDistance) {
          smallestDistance = distance;
          nextId = card.dataset.setlistPreviewSongId ?? null;
        }
      }
      if (nextId && nextId !== selectedSongId) {
        skipNextAutoScrollRef.current = true;
        onSelectSong(nextId);
      }
    };
    const requestUpdate = () => {
      // Ignore the event itself, too: its RAF can run after scrollend releases
      // the lock, when the activation line still intersects the previous song.
      if (navigatingRef.current || frameId !== null) return;
      frameId = window.requestAnimationFrame(updateFromScroll);
    };
    requestUpdate();
    scrollRoot.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      scrollRoot.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [enabled, trackScroll, selectedSongId, songCount, previewRef, skipNextAutoScrollRef, preserveSelectionUntilRef, onSelectSong]);
}
