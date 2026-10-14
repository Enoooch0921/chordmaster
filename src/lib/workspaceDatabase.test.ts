import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Key, Setlist, StoredSong } from '../types';
import {
  consumeLocalWorkspaceRecoveryNotice, loadPersistentWorkspaceSnapshot,
  persistLocalWorkspaceSnapshot, persistPersistentWorkspaceSnapshot, WORKSPACE_SNAPSHOT_STORAGE_KEY
} from './workspace';
import { readWorkspaceDatabase, writeWorkspaceDatabase } from './workspaceDatabase';

const song = (): StoredSong => ({
  id: 'song', title: 'Song', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ title: 'Verse', bars: [{ chords: ['C'] }] }], updatedAt: 1
});
const setlist = (overrideKey: Key, songId = 'song'): Setlist => ({
  id: 'setlist', name: 'Sunday', displayMode: 'chord-fixed-key', createdAt: 1, updatedAt: Date.now(),
  songs: [{ id: 'item', setlistId: 'setlist', songId, order: 0, sectionOrder: ['Verse'], overrideKey }]
});

describe('durable personal workspace snapshots', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    consumeLocalWorkspaceRecoveryNotice();
  });

  it('repeatedly changes setlist keys with a large library and exhausted Web Storage', async () => {
    const songs = Array.from({ length: 1200 }, (_, index) => ({
      ...song(), id: `song-${index}`, title: `Song ${index} ${'lyrics '.repeat(700)}`
    }));
    expect(JSON.stringify(songs).length).toBeGreaterThan(5 * 1024 * 1024);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    for (const key of ['D', 'E', 'F'] as Key[]) {
      await persistPersistentWorkspaceSnapshot(songs, [setlist(key, 'song-0')]);
      const restored = await loadPersistentWorkspaceSnapshot();
      expect(restored.setlists[0].songs[0].overrideKey).toBe(key);
      expect(restored.songs).toHaveLength(songs.length);
    }
    expect(setItem).not.toHaveBeenCalled();
  });

  it('reads legacy data and retains it until and after a durable save commits', async () => {
    persistLocalWorkspaceSnapshot([song()], [setlist('D')]);
    const legacy = localStorage.getItem(WORKSPACE_SNAPSHOT_STORAGE_KEY);
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('D');
    await persistPersistentWorkspaceSnapshot([song()], [setlist('E')]);
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('E');
    expect(localStorage.getItem(WORKSPACE_SNAPSHOT_STORAGE_KEY)).toBe(legacy);
  });

  it('captures rapid edits at invocation and commits them in order', async () => {
    const songs = [song()];
    const lists = [setlist('D')];
    const first = persistPersistentWorkspaceSnapshot(songs, lists);
    lists[0].songs[0].overrideKey = 'E';
    const second = persistPersistentWorkspaceSnapshot(songs, lists);
    lists[0].songs[0].overrideKey = 'F';
    await Promise.all([first, second]);
    const records = await readWorkspaceDatabase();
    expect(JSON.parse(records.previous as string).setlists[0].songs[0].overrideKey).toBe('D');
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('E');
  });

  it('rolls back both snapshot rotation and replacement if the transaction aborts', async () => {
    await persistPersistentWorkspaceSnapshot([song()], [setlist('D')]);
    await persistPersistentWorkspaceSnapshot([song()], [setlist('E')]);
    const before = await readWorkspaceDatabase();
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
      if (key === 'current') throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return put.call(this, value, key);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await expect(persistPersistentWorkspaceSnapshot([song()], [setlist('F')])).rejects.toThrow('Unable to save');
    expect(await readWorkspaceDatabase()).toEqual(before);
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('E');
  });

  it('recovers the prior durable snapshot without deleting a corrupt current value', async () => {
    await persistPersistentWorkspaceSnapshot([song()], [setlist('D')]);
    await writeWorkspaceDatabase('broken-json', () => true, null);
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('D');
    expect(consumeLocalWorkspaceRecoveryNotice()).toBe('recovered-backup');
    expect((await readWorkspaceDatabase()).current).toBe('broken-json');
  });

  it('uses a newer synchronous exit snapshot when reopening', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    await persistPersistentWorkspaceSnapshot([song()], [setlist('D')]);
    vi.mocked(Date.now).mockReturnValue(200);
    persistLocalWorkspaceSnapshot([song()], [setlist('E')]);
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('E');
  });

  it('prefers a newer exit snapshot over an older recovery backup', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    await persistPersistentWorkspaceSnapshot([song()], [setlist('D')]);
    await writeWorkspaceDatabase('broken-json', () => true, null);
    vi.mocked(Date.now).mockReturnValue(200);
    persistLocalWorkspaceSnapshot([song()], [setlist('E')]);
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('E');
    expect(consumeLocalWorkspaceRecoveryNotice()).toBe('recovered-legacy');
  });

  it('still saves and loads when access to Web Storage is blocked entirely', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });
    await persistPersistentWorkspaceSnapshot([song()], [setlist('F')]);
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('F');
  });

  it('falls back to verified Web Storage when IndexedDB is blocked', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await persistPersistentWorkspaceSnapshot([song()], [setlist('D')]);
    expect((await loadPersistentWorkspaceSnapshot()).setlists[0].songs[0].overrideKey).toBe('D');
  });
});
