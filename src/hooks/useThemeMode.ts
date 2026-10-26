import { useCallback, useLayoutEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'chordmaster.theme-mode.v1';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'auto';

const readStoredMode = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'auto';
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(raw)) {
      return raw;
    }
  } catch {
    // localStorage may be blocked (private mode, quota); fall back to auto.
  }
  return 'auto';
};

const resolveDark = (mode: ThemeMode): boolean => {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
};

const applyDarkClass = (isDark: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
};

export const useThemeMode = () => {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [isDark, setIsDark] = useState<boolean>(() => resolveDark(readStoredMode()));

  useLayoutEffect(() => {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_MEDIA_QUERY) : null;
    const sync = () => {
      const dark = mode === 'dark' || (mode === 'auto' && Boolean(media?.matches));
      setIsDark(dark);
      applyDarkClass(dark);
    };
    sync();
    try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* Private browsing may block storage. */ }
    if (mode !== 'auto') return;
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    media?.addEventListener('change', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      media?.removeEventListener('change', sync);
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((current) => {
      if (current === 'light') return 'dark';
      if (current === 'dark') return 'auto';
      return 'light';
    });
  }, []);

  return { mode, isDark, setMode, cycleMode };
};
