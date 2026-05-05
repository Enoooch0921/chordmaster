import { useCallback, useEffect, useState } from 'react';

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
};

export const useThemeMode = () => {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [isDark, setIsDark] = useState<boolean>(() => resolveDark(readStoredMode()));

  useEffect(() => {
    const dark = resolveDark(mode);
    setIsDark(dark);
    applyDarkClass(dark);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore quota / privacy errors — runtime state still applies for the session.
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'auto' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const handler = (event: MediaQueryListEvent) => {
      setIsDark(event.matches);
      applyDarkClass(event.matches);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
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
