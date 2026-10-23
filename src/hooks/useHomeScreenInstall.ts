import { useCallback, useEffect, useState } from 'react';

export const HOME_SCREEN_ADDED_KEY = 'chordmaster.home-screen-added.v1';
const STANDALONE_QUERY = '(display-mode: standalone), (display-mode: minimal-ui)';

const readAddedPreference = () => {
  try { return localStorage.getItem(HOME_SCREEN_ADDED_KEY) === 'true'; }
  catch { return false; }
};
const rememberAdded = () => {
  try { localStorage.setItem(HOME_SCREEN_ADDED_KEY, 'true'); }
  catch { /* The current session can still suppress the guide. */ }
};
const isHomeScreenDisplay = () => Boolean(
  (navigator as Navigator & { standalone?: boolean }).standalone
  || window.matchMedia?.(STANDALONE_QUERY).matches
);

export function useHomeScreenInstall(isNative = false) {
  const [isStandalone, setIsStandalone] = useState(isHomeScreenDisplay);
  const [hasAdded, setHasAdded] = useState(readAddedPreference);
  const markAsAdded = useCallback(() => {
    rememberAdded();
    setHasAdded(true);
  }, []);

  useEffect(() => {
    const displayMode = window.matchMedia?.(STANDALONE_QUERY);
    const syncDisplay = () => {
      const standalone = isHomeScreenDisplay();
      setIsStandalone(standalone);
      if (standalone) markAsAdded();
    };
    const syncPreference = (event: StorageEvent) => {
      if (event.key === HOME_SCREEN_ADDED_KEY || event.key === null) setHasAdded(readAddedPreference());
    };
    syncDisplay();
    displayMode?.addEventListener?.('change', syncDisplay);
    window.addEventListener('pageshow', syncDisplay);
    window.addEventListener('appinstalled', markAsAdded);
    window.addEventListener('storage', syncPreference);
    return () => {
      displayMode?.removeEventListener?.('change', syncDisplay);
      window.removeEventListener('pageshow', syncDisplay);
      window.removeEventListener('appinstalled', markAsAdded);
      window.removeEventListener('storage', syncPreference);
    };
  }, [markAsAdded]);

  return {
    isStandalone: isNative || isStandalone,
    shouldShowInstallGuide: !isNative && !isStandalone && !hasAdded,
    markAsAdded,
  };
}
