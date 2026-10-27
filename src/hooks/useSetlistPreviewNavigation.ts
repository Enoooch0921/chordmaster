import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface Options {
  previewRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  trackScroll: boolean;
  selectedSongId: string | null;
  songCount: number;
  skipNextAutoScrollRef: RefObject<boolean>;
  preserveSelectionUntilRef: RefObject<number>;
  gestureActiveRef?: RefObject<boolean>;
  onSelectSong: (id: string) => void;
}

export function useSetlistPreviewNavigation({
  previewRef, enabled, trackScroll, selectedSongId, songCount,
  skipNextAutoScrollRef, preserveSelectionUntilRef, gestureActiveRef, onSelectSong
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
    const scrollRoot = previewRef.current;
    let frameId: number;
    const finish = () => {
      navigatingRef.current = false;
      window.clearTimeout(idleTimer);
      scrollRoot?.removeEventListener('scroll', onScroll);
      scrollRoot?.removeEventListener('scrollend', finish);
      scrollRoot?.removeEventListener('touchstart', interrupt);
      scrollRoot?.removeEventListener('wheel', interrupt);
      scrollRoot?.removeEventListener('pointerdown', interrupt);
    };
    const onScroll = () => {
      // Fallback for browsers without scrollend. Count from the last movement,
      // not from the click, so intermediate songs never become selected.
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(finish, 180);
    };

    const interrupt = (event: Event) => {
      if (event.type === 'touchstart' && (event as TouchEvent).touches.length !== 1) return;
      window.cancelAnimationFrame(frameId);
      if (navigatingRef.current && scrollRoot) {
        scrollRoot.scrollTo({ top: scrollRoot.scrollTop, left: scrollRoot.scrollLeft, behavior: 'instant' });
      }
      preserveSelectionUntilRef.current = 0;
      finish();
    };
    scrollRoot?.addEventListener('touchstart', interrupt, { passive: true });
    scrollRoot?.addEventListener('wheel', interrupt, { passive: true });
    scrollRoot?.addEventListener('pointerdown', interrupt, { passive: true });

    frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        if (gestureActiveRef?.current) { finish(); return; }
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
        // Some WebKit scroll requests do not emit a movement or scrollend.
        onScroll();
        scrollRoot.scrollTo({ top: desiredTop, behavior: 'smooth' });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      finish();
    };
  }, [enabled, selectedSongId, songCount, previewRef, skipNextAutoScrollRef, preserveSelectionUntilRef, gestureActiveRef]);

  useEffect(() => {
    // Editor reflows must not change the song being edited.
    if (!enabled || !trackScroll || songCount === 0) return;
    const scrollRoot = previewRef.current;
    if (!scrollRoot) return;
    let frameId: number | null = null;
    const updateFromScroll = () => {
      frameId = null;
      if (gestureActiveRef?.current || navigatingRef.current || preserveSelectionUntilRef.current > performance.now()) return;
      const rootRect = scrollRoot.getBoundingClientRect();
      const cards = scrollRoot.querySelectorAll<HTMLElement>('[data-setlist-preview-song-id]');
      let nextId: string | null = null;
      let largestVisibleHeight = 0;
      let smallestDistance = Number.POSITIVE_INFINITY;
      const centerY = (rootRect.top + rootRect.bottom) / 2;
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top));
        const distance = Math.min(Math.abs(rect.top - centerY), Math.abs(rect.bottom - centerY));
        const id = card.dataset.setlistPreviewSongId ?? null;
        if (visibleHeight > largestVisibleHeight || (visibleHeight === largestVisibleHeight &&
          (visibleHeight > 0 ? id === selectedSongId : distance < smallestDistance))) {
          largestVisibleHeight = visibleHeight;
          smallestDistance = distance;
          nextId = id;
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
      if (gestureActiveRef?.current || navigatingRef.current || frameId !== null) return;
      frameId = window.requestAnimationFrame(updateFromScroll);
    };
    const resumeManualTracking = (event: Event) => {
      if (event.type === 'touchstart' && (event as TouchEvent).touches.length !== 1) return;
      if (!gestureActiveRef?.current) preserveSelectionUntilRef.current = 0;
    };
    requestUpdate();
    scrollRoot.addEventListener('touchstart', resumeManualTracking, { passive: true });
    scrollRoot.addEventListener('wheel', resumeManualTracking, { passive: true });
    scrollRoot.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      scrollRoot.removeEventListener('scroll', requestUpdate);
      scrollRoot.removeEventListener('touchstart', resumeManualTracking);
      scrollRoot.removeEventListener('wheel', resumeManualTracking);
      window.removeEventListener('resize', requestUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [enabled, trackScroll, selectedSongId, songCount, previewRef, skipNextAutoScrollRef, preserveSelectionUntilRef, gestureActiveRef, onSelectSong]);
}
