import { describe, expect, it, vi } from 'vitest';
import type { Setlist, StoredSong } from '../types';
import type { WorkspaceRepository } from './repository';
import { applySongLibraryImport, getSongLibraryImportMode, resolveImportedSongIdentity } from './songLibraryImport';
import { syncWorkspaceDiff } from './sync';

const makeSong = (id: string): StoredSong => ({
  id,
  title: id,
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [],
  updatedAt: 1
});

const makeSetlist = (): Setlist => ({
  id: 'setlist-1',
  name: 'Sunday',
  displayMode: 'chord-movable-key',
  createdAt: 1,
  updatedAt: 1,
  songs: [
    {
      id: 'setlist-song-1',
      setlistId: 'setlist-1',
      songId: 'existing-1',
      order: 0,
      sectionOrder: []
    }
  ]
});

describe('song library import mode', () => {
  it('treats exactly one song as an additive import', () => {
    expect(getSongLibraryImportMode(1)).toBe('append-single');
    expect(getSongLibraryImportMode(2)).toBe('replace-library');
  });

  it('always gives a single-song import a fresh id so it cannot overwrite a song', () => {
    const result = resolveImportedSongIdentity({
      sourceId: 'existing-1',
      existingSongIds: new Set(['existing-1']),
      mode: 'append-single',
      isCloudMode: true,
      createId: () => 'fresh-copy-id',
      fallbackId: 'fallback-id'
    });

    expect(result).toEqual({ id: 'fresh-copy-id', importedAsCopy: true });
  });

  it('adds a single song without removing songs or changing setlists', () => {
    const currentSongs = [makeSong('existing-1'), makeSong('existing-2')];
    const currentSetlists = [makeSetlist()];
    const importedSong = makeSong('imported-copy');

    const result = applySongLibraryImport({
      currentSongs,
      currentSetlists,
      importedSongs: [importedSong],
      mode: 'append-single'
    });

    expect(result.songs.map((song) => song.id)).toEqual([
      'imported-copy',
      'existing-1',
      'existing-2'
    ]);
    expect(result.setlists).toBe(currentSetlists);
    expect(result.setlists[0].songs).toHaveLength(1);
  });

  it('does not issue any cloud deletes when synchronizing a single-song import', async () => {
    const currentSongs = [makeSong('existing-1'), makeSong('existing-2')];
    const currentSetlists = [makeSetlist()];
    const importedSong = makeSong('imported-copy');
    const importedWorkspace = applySongLibraryImport({
      currentSongs,
      currentSetlists,
      importedSongs: [importedSong],
      mode: 'append-single'
    });
    const repository = {
      saveSong: vi.fn().mockResolvedValue(undefined),
      saveSetlist: vi.fn().mockResolvedValue(undefined),
      saveProject: vi.fn().mockResolvedValue(undefined),
      deleteSong: vi.fn().mockResolvedValue(undefined),
      deleteSetlist: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockResolvedValue(undefined)
    } as unknown as WorkspaceRepository;

    await syncWorkspaceDiff({
      repository,
      songs: importedWorkspace.songs,
      setlists: importedWorkspace.setlists,
      projects: [],
      savedSongs: currentSongs,
      savedSetlists: currentSetlists,
      savedProjects: []
    });

    expect(repository.saveSong).toHaveBeenCalledOnce();
    expect(repository.saveSong).toHaveBeenCalledWith(importedSong);
    expect(repository.deleteSong).not.toHaveBeenCalled();
    expect(repository.deleteSetlist).not.toHaveBeenCalled();
    expect(repository.saveSetlist).not.toHaveBeenCalled();
  });

  it('retains the explicit replace behavior for multi-song library restores', () => {
    const currentSetlists = [makeSetlist()];
    const result = applySongLibraryImport({
      currentSongs: [makeSong('existing-1')],
      currentSetlists,
      importedSongs: [makeSong('replacement-1'), makeSong('replacement-2')],
      mode: 'replace-library',
      updatedAt: 42
    });

    expect(result.songs.map((song) => song.id)).toEqual(['replacement-1', 'replacement-2']);
    expect(result.setlists[0].songs).toEqual([]);
    expect(result.setlists[0].updatedAt).toBe(42);
  });
});
