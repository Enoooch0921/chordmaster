import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredSong } from '../types';
import {
  consumeLocalWorkspaceRecoveryNotice,
  loadLocalWorkspaceSnapshot,
  persistLocalWorkspaceSnapshot,
  SONG_LIBRARY_STORAGE_KEY,
  WORKSPACE_CORRUPT_SNAPSHOT_STORAGE_KEY,
  WORKSPACE_SNAPSHOT_BACKUP_STORAGE_KEY,
  WORKSPACE_SNAPSHOT_STORAGE_KEY
} from './workspace';

const makeSong = (id: string, title: string): StoredSong => ({
  id,
  title,
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [{ title: 'Verse', bars: [{ chords: ['C'] }] }],
  updatedAt: Date.UTC(2026, 7, 30)
});

describe('local workspace snapshots', () => {
  beforeEach(() => {
    window.localStorage.clear();
    consumeLocalWorkspaceRecoveryNotice();
    vi.restoreAllMocks();
  });

  it('round-trips a verified versioned snapshot', () => {
    const song = makeSong('song-1', 'First');

    const savedAt = persistLocalWorkspaceSnapshot([song], [], []);
    const storedEnvelope = JSON.parse(window.localStorage.getItem(WORKSPACE_SNAPSHOT_STORAGE_KEY) ?? '{}');
    const restored = loadLocalWorkspaceSnapshot();

    expect(storedEnvelope.version).toBe(2);
    expect(storedEnvelope.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(restored.songs).toHaveLength(1);
    expect(restored.songs[0].title).toBe('First');
    expect(restored.lastSavedAt).toBe(savedAt);
  });

  it('keeps the previous verified snapshot and restores it when the primary is corrupt', () => {
    persistLocalWorkspaceSnapshot([makeSong('song-1', 'Previous')], [], []);
    persistLocalWorkspaceSnapshot([makeSong('song-1', 'Current')], [], []);
    expect(window.localStorage.getItem(WORKSPACE_SNAPSHOT_BACKUP_STORAGE_KEY)).not.toBeNull();

    window.localStorage.setItem(WORKSPACE_SNAPSHOT_STORAGE_KEY, '{"broken":');
    const restored = loadLocalWorkspaceSnapshot();

    expect(restored.songs[0].title).toBe('Previous');
    expect(consumeLocalWorkspaceRecoveryNotice()).toBe('recovered-backup');
    expect(window.localStorage.getItem(WORKSPACE_CORRUPT_SNAPSHOT_STORAGE_KEY)).toContain('{\\"broken\\":');
  });

  it('throws instead of reporting success when the primary write fails', () => {
    persistLocalWorkspaceSnapshot([makeSong('song-1', 'Safe')], [], []);
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === WORKSPACE_SNAPSHOT_STORAGE_KEY) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    expect(() => persistLocalWorkspaceSnapshot([makeSong('song-1', 'Lost')], [], [])).toThrow(
      'Unable to save the local workspace.'
    );

    vi.restoreAllMocks();
    expect(loadLocalWorkspaceSnapshot().songs[0].title).toBe('Safe');
  });

  it('falls back to valid legacy data without deleting a corrupt primary', () => {
    window.localStorage.setItem(WORKSPACE_SNAPSHOT_STORAGE_KEY, 'not-json');
    window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify([makeSong('legacy-song', 'Legacy')]));

    const restored = loadLocalWorkspaceSnapshot();

    expect(restored.songs[0].title).toBe('Legacy');
    expect(consumeLocalWorkspaceRecoveryNotice()).toBe('recovered-legacy');
    expect(window.localStorage.getItem(WORKSPACE_CORRUPT_SNAPSHOT_STORAGE_KEY)).toContain('not-json');
  });

  it('retains corrupt legacy content and surfaces an unrecoverable notice', () => {
    window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, '[invalid');

    const restored = loadLocalWorkspaceSnapshot();

    expect(restored.songs).toEqual([]);
    expect(window.localStorage.getItem(SONG_LIBRARY_STORAGE_KEY)).toBe('[invalid');
    expect(window.localStorage.getItem(WORKSPACE_CORRUPT_SNAPSHOT_STORAGE_KEY)).toContain('[invalid');
    expect(consumeLocalWorkspaceRecoveryNotice()).toBe('corrupt-unrecoverable');
  });
});
