import { useState } from 'react';

export const PREVIEW_KEYBOARD_SCALE_KEY = 'chordmaster.preview-keyboard-scale.v1';
export const MIN_KEYBOARD_SCALE = 70;
export const MAX_KEYBOARD_SCALE = 120;
export const KEYBOARD_SCALE_STEP = 10;
export type KeyboardSizeProfile = 'compact' | 'regular' | 'spacious';
const defaults = { compact: 70, regular: 80, spacious: 100 } as const;
type Preferences = Partial<Record<KeyboardSizeProfile, number>>;

export function getKeyboardSizeProfile(width: number, height: number): KeyboardSizeProfile {
  if (width < 1000 || height < 650) return 'compact';
  if (width < 1400 || height < 900) return 'regular';
  return 'spacious';
}

const normalize = (value: number) => Math.min(MAX_KEYBOARD_SCALE,
  Math.max(MIN_KEYBOARD_SCALE, Math.round(value / KEYBOARD_SCALE_STEP) * KEYBOARD_SCALE_STEP));

function loadPreferences(): Preferences {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(PREVIEW_KEYBOARD_SCALE_KEY) ?? '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.keys(defaults).flatMap(key => {
      const value = (saved as Record<string, unknown>)[key];
      return typeof value === 'number' && Number.isFinite(value) ? [[key, normalize(value)]] : [];
    }));
  } catch { return {}; }
}

/** Each window-size class keeps its own preference, outside song/history data. */
export function usePreviewKeyboardScale(width: number, height: number) {
  const profile = getKeyboardSizeProfile(width, height);
  const defaultPercent = defaults[profile];
  const [preferences, setPreferences] = useState(loadPreferences);
  const percent = preferences[profile] ?? defaultPercent;
  const save = (next: Preferences) => {
    setPreferences(next);
    try { window.localStorage.setItem(PREVIEW_KEYBOARD_SCALE_KEY, JSON.stringify(next)); } catch {
      // Restricted storage must not prevent adjusting the current keyboard.
    }
  };
  const setScale = (value: number) => save({ ...preferences, [profile]: Number.isFinite(value) ? normalize(value) : defaultPercent });
  const resetScale = () => {
    const next = { ...preferences };
    delete next[profile];
    save(next);
  };
  return { percent, defaultPercent, profile, setScale, resetScale };
}
