import type { ChordInputMode } from './songEditing';

const KEY = 'chordmaster.chord-input-mode.v1';

export function loadChordInputPreference(): ChordInputMode | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'letters' || value === 'nashville' ? value : null;
  } catch { return null; }
}

export function saveChordInputPreference(mode: ChordInputMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* Keep the in-memory choice when storage is unavailable. */ }
}
