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

export function usePerformanceFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(fullscreenElement()));
  const ownedTarget = useRef<Element | null>(null);
  const wantsFullscreen = useRef(false);
  const mounted = useRef(true);
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
        if (mounted.current) setIsFullscreen(Boolean(fullscreenElement()));
      }).catch(() => {
        if (ownedTarget.current === target && fullscreenElement() !== target) ownedTarget.current = null;
        if (mounted.current) setIsFullscreen(Boolean(fullscreenElement()));
      });
    } catch {
      if (ownedTarget.current === target) ownedTarget.current = null;
      // Windowed performance mode remains usable if the browser rejects it.
    }
  }, [canRequestFullscreen]);

  useEffect(() => {
    mounted.current = true;
    const sync = () => {
      setIsFullscreen(Boolean(fullscreenElement()));
      if (!fullscreenElement()) ownedTarget.current = null;
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      mounted.current = false;
      exitFullscreen();
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [exitFullscreen]);

  return { isFullscreen, canRequestFullscreen, requestFullscreen, exitFullscreen };
}
