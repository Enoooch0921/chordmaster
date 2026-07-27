import { describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_LAST_NON_CHORD_MODE_STORAGE_KEY,
  loadPreviewLastNonChordMode,
  savePreviewLastNonChordMode
} from './previewNotationPreference';

describe('preview non-chord mode preference', () => {
  it('defaults missing and unsupported values to rhythm', () => {
    expect(loadPreviewLastNonChordMode({ getItem: () => null })).toBe('rhythm');
    expect(loadPreviewLastNonChordMode({ getItem: () => 'chords' })).toBe('rhythm');
  });

  it('round-trips the last rhythm or jianpu mode through the versioned key', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => values.set(key, value))
    };

    savePreviewLastNonChordMode('jianpu', storage);
    expect(storage.setItem).toHaveBeenCalledWith(PREVIEW_LAST_NON_CHORD_MODE_STORAGE_KEY, 'jianpu');
    expect(loadPreviewLastNonChordMode(storage)).toBe('jianpu');

    savePreviewLastNonChordMode('rhythm', storage);
    expect(loadPreviewLastNonChordMode(storage)).toBe('rhythm');
  });
});
