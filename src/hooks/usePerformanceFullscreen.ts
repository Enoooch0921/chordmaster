import { useCallback, useEffect, useRef, useState } from 'react';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

const fullscreenElement = () => {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
};

function leaveFullscreen() {
  const doc = document as FullscreenDocument;
  try {
    const result = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
    void Promise.resolve(result).catch(() => {});
  } catch { /* The browser may already be leaving fullscreen. */ }
}

export function usePerformanceFullscreen(onExited?: () => void) {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(fullscreenElement()));
  const wasFullscreen = useRef(Boolean(fullscreenElement()));
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  const ownedTarget = useRef<Element | null>(null);
  const wantsFullscreen = useRef(false);
  const mounted = useRef(true);
  const syncFullscreen = useCallback(() => {
    const active = Boolean(fullscreenElement());
    const exited = wasFullscreen.current && !active;
    wasFullscreen.current = active;
    setIsFullscreen(active);
    if (!active) ownedTarget.current = null;
    // Only a real transition closes the presentation. Unsupported or denied
    // fullscreen requests must keep windowed performance mode available.
    if (exited) onExitedRef.current?.();
  }, []);
  const root = document.documentElement as FullscreenElement;
  const doc = document as FullscreenDocument;
  const canRequestFullscreen = Boolean(
    (root.requestFullscreen && doc.fullscreenEnabled !== false)
    || (root.webkitRequestFullscreen && doc.webkitFullscreenEnabled !== false)
  );

  const exitFullscreen = useCallback((explicit = false) => {
    wantsFullscreen.current = false;
    if (fullscreenElement() && (explicit || fullscreenElement() === ownedTarget.current)) leaveFullscreen();
    // Keep the target until a pending request settles, so a quick exit cannot
    // leave the browser fullscreen after performance mode has closed.
  }, []);

  const requestFullscreen = useCallback(() => {
    wantsFullscreen.current = true;
    if (fullscreenElement() || !canRequestFullscreen) return;
    const target = document.documentElement as FullscreenElement;
    ownedTarget.current = target;
    try {
      // Call during the entry button's click, before any await or React effect:
      // Safari requires transient user activation for this API.
      const result = target.requestFullscreen && (document as FullscreenDocument).fullscreenEnabled !== false
        ? target.requestFullscreen({ navigationUI: 'hide' })
        : target.webkitRequestFullscreen?.();
      void Promise.resolve(result).then(() => {
        if (!wantsFullscreen.current && fullscreenElement() === target) leaveFullscreen();
        if (mounted.current) syncFullscreen();
      }).catch(() => {
        if (ownedTarget.current === target && fullscreenElement() !== target) ownedTarget.current = null;
        if (mounted.current) syncFullscreen();
      });
    } catch {
      if (ownedTarget.current === target) ownedTarget.current = null;
      // Windowed performance mode remains usable if the browser rejects it.
    }
  }, [canRequestFullscreen, syncFullscreen]);

  useEffect(() => {
    mounted.current = true;
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      mounted.current = false;
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      exitFullscreen();
    };
  }, [exitFullscreen, syncFullscreen]);

  return { isFullscreen, canRequestFullscreen, requestFullscreen, exitFullscreen };
}
