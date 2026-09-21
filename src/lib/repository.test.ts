import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Setlist, StoredSong, WorkspaceSnapshot } from '../types';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn()
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc
  }
}));

import { createCloudRepository } from './repository';

const makeBuilder = (overrides: Record<string, unknown> = {}) => {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  ['select', 'eq', 'in', 'order', 'limit', 'delete', 'update', 'abortSignal'].forEach((method) => {
    builder[method] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.returns = vi.fn().mockResolvedValue({ data: [], error: null });
  builder.upsert = vi.fn().mockResolvedValue({ error: null });
  builder.insert = vi.fn().mockResolvedValue({ error: null });
  Object.assign(builder, overrides);
  return builder;
};

const makeSong = (overrides: Partial<StoredSong> = {}): StoredSong => ({
  id: 'song-1',
  title: 'Test Song',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [{ title: 'Verse', bars: [{ chords: ['C'] }] }],
  createdBy: 'copied-user',
  updatedAt: Date.UTC(2026, 7, 1),
  ...overrides
});

const emptyWorkspace = (songs: StoredSong[] = []): WorkspaceSnapshot => ({
  songs,
  setlists: [],
  joinedSetlists: [],
  projects: [],
  joinedProjects: [],
  lastSavedAt: null
});

const createRepository = () => createCloudRepository({
  userId: 'user-1',
  email: 'user@example.com',
  name: 'User One'
});

const installLocalStorageMock = () => {
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, String(value))),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear())
    }
  });
};

describe('cloud repository personal workspace imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorageMock();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('refreshes joined data without reloading or persisting the owned workspace', async () => {
    const repository = createRepository();
    expect(await repository.loadJoinedWorkspace()).toEqual({ joinedSetlists: [], joinedProjects: [] });
    expect(mocks.rpc).toHaveBeenCalledWith('get_joined_setlists');
    expect(mocks.rpc).toHaveBeenCalledWith('get_joined_projects');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects background refresh when shared projects fail instead of reporting an empty collection', async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'get_joined_projects'
      ? { data: null, error: new Error('Connection lost') }
      : { data: [], error: null }));
    await expect(createRepository().loadJoinedWorkspace()).rejects.toThrow('Connection lost');
  });

  it('loads only the current viewer’s Capo preferences for shared songs', async () => {
    const sharedSetlist = {
      id: 'shared-1', name: 'Shared', createdAt: 1, updatedAt: 1,
      songs: [{ id: 'entry-1', songId: 'song-1', songData: makeSong() }]
    };
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({ error: null, data:
      name === 'get_joined_setlists' ? [sharedSetlist] : [{ id: 'project-1', setlists: [sharedSetlist] }]
    }));
    const capoQuery = makeBuilder({ returns: vi.fn().mockResolvedValue({
      data: [{ setlist_song_id: 'entry-1', capo: 0 }], error: null
    }) });
    mocks.from.mockReturnValue(capoQuery);
    const result = await createRepository().loadJoinedWorkspace();
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('user_setlist_capo_overrides');
    expect(capoQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(capoQuery.in).toHaveBeenCalledWith('setlist_song_id', ['entry-1']);
    expect(result.joinedSetlists[0].songs[0].personalCapoOverride).toBe(0);
    expect(result.joinedProjects?.[0].setlists[0].songs[0].personalCapoOverride).toBe(0);
  });

  it('rejects a team destination before any per-record table is touched', async () => {
    const teamLibraryQuery = makeBuilder({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'team-1', kind: 'team' },
        error: null
      })
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'libraries') return teamLibraryQuery;
      throw new Error(`Unexpected table access: ${table}`);
    });

    const repository = createRepository();
    repository.setActiveLibrary('team-1');

    await expect(repository.importLocalWorkspace(emptyWorkspace())).rejects.toThrow(
      'Local workspace imports are only allowed in your personal library.'
    );
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith('libraries');
  });

  it('keeps every import write pinned to the validated personal library', async () => {
    let repository: ReturnType<typeof createRepository>;
    let libraryReadCount = 0;
    let songReadCount = 0;
    const songUpserts: Array<Record<string, unknown>> = [];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'libraries') {
        libraryReadCount += 1;
        if (libraryReadCount === 1) {
          return makeBuilder({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'personal-1', kind: 'personal' },
              error: null
            })
          });
        }
        return makeBuilder({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'personal-1',
              name: 'Personal',
              kind: 'personal',
              owner_user_id: 'user-1'
            },
            error: null
          })
        });
      }

      if (table === 'profiles' || table === 'library_members') {
        return makeBuilder();
      }

      if (table === 'songs') {
        songReadCount += 1;
        if (songReadCount === 1) {
          return makeBuilder({
            returns: vi.fn(() => {
              // Simulate navigation to a team while the personal import is in
              // flight. Subsequent writes must retain the preflight target.
              repository.setActiveLibrary('team-1');
              return Promise.resolve({ data: [], error: null });
            })
          });
        }
        if (songReadCount === 2) {
          return makeBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          });
        }
        if (songReadCount === 3) {
          return makeBuilder({
            upsert: vi.fn((payload: Record<string, unknown>) => {
              songUpserts.push(payload);
              return Promise.resolve({ error: null });
            })
          });
        }
        return makeBuilder();
      }

      if (table === 'setlists' || table === 'projects') {
        return makeBuilder();
      }

      throw new Error(`Unexpected table access: ${table}`);
    });

    repository = createRepository();
    repository.setActiveLibrary('personal-1');
    await repository.importLocalWorkspace(emptyWorkspace([makeSong()]));

    expect(songUpserts).toHaveLength(1);
    expect(songUpserts[0]).toMatchObject({
      library_id: 'personal-1',
      created_by: 'user-1',
      updated_by: 'user-1',
      client_legacy_id: 'song-1'
    });
    expect(songUpserts[0].content_json).toMatchObject({
      createdBy: 'user-1',
      updatedBy: 'user-1'
    });
  });
});

describe('cloud repository shared setlist updates', () => {
  const makeSetlist = (ids: string[]): Setlist => ({
    id: 'setlist-1', name: 'Shared', displayMode: 'chord-fixed-key', createdAt: 1, updatedAt: 2,
    songs: ids.map((id, order) => ({ id, order, setlistId: 'setlist-1', songId: 'song-1',
      overrideKey: 'D', sectionOrder: [], songData: makeSong() }))
  });

  beforeEach(() => { vi.clearAllMocks(); });

  it('upserts keys and additions before deleting only removed entries, preserving retained Capo foreign keys', async () => {
    const entries = makeBuilder();
    mocks.from.mockImplementation((table: string) => table === 'setlist_songs' ? entries : makeBuilder());
    const repository = createRepository();
    repository.setActiveLibrary('personal-1');
    await repository.saveSetlist(makeSetlist(['kept', 'added']), makeSetlist(['kept', 'removed']));
    expect(entries.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'kept', override_json: expect.objectContaining({ overrideKey: 'D' }) }),
      expect.objectContaining({ id: 'added' })
    ], { onConflict: 'id' });
    expect(entries.delete).toHaveBeenCalledTimes(1);
    expect(entries.eq).toHaveBeenCalledWith('setlist_id', 'setlist-1');
    expect(entries.in).toHaveBeenCalledExactlyOnceWith('id', ['removed']);
    expect(entries.upsert.mock.invocationCallOrder[0]).toBeLessThan(entries.delete.mock.invocationCallOrder[0]);
  });

  it('does not delete entries if writing their replacements fails', async () => {
    const entries = makeBuilder({ upsert: vi.fn().mockResolvedValue({ error: new Error('Write failed') }) });
    mocks.from.mockImplementation((table: string) => table === 'setlist_songs' ? entries : makeBuilder());
    const repository = createRepository();
    repository.setActiveLibrary('personal-1');
    await expect(repository.saveSetlist(makeSetlist(['added']), makeSetlist(['kept'])))
      .rejects.toThrow('Write failed');
    expect(entries.delete).not.toHaveBeenCalled();
  });

  it('reads existing IDs when no prior snapshot is supplied and preserves retained entries', async () => {
    const entries = makeBuilder({ returns: vi.fn().mockResolvedValue({
      data: [{ id: 'kept' }, { id: 'removed' }], error: null
    }) });
    mocks.from.mockImplementation((table: string) => table === 'setlist_songs' ? entries : makeBuilder());
    const repository = createRepository();
    repository.setActiveLibrary('personal-1');
    await repository.saveSetlist(makeSetlist(['kept']));
    expect(entries.select).toHaveBeenCalledWith('id');
    expect(entries.in).toHaveBeenCalledWith('id', ['removed']);
  });

  it('can remove all songs without issuing a broad delete', async () => {
    const entries = makeBuilder();
    mocks.from.mockImplementation((table: string) => table === 'setlist_songs' ? entries : makeBuilder());
    const repository = createRepository();
    repository.setActiveLibrary('personal-1');
    await repository.saveSetlist(makeSetlist([]), makeSetlist(['removed']));
    expect(entries.upsert).not.toHaveBeenCalled();
    expect(entries.in).toHaveBeenCalledExactlyOnceWith('id', ['removed']);
  });
});

describe('cloud repository song creator integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never writes bundled symbol test fixtures to a cloud library', async () => {
    const repository = createRepository();
    repository.setActiveLibrary('personal-1');

    await repository.saveSong(makeSong({
      id: 'symbol-test',
      title: '符號測試頁（2行）',
      sections: [
        { id: 'test-bars', title: 'Bars / Marks', bars: [] },
        { id: 'test-meter', title: 'Meter', bars: [] }
      ]
    }));

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uses the authenticated user for a newly created song', async () => {
    const songUpsert = vi.fn().mockResolvedValue({ error: null });
    let songQueryCount = 0;
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('songs');
      songQueryCount += 1;
      return songQueryCount === 1
        ? makeBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })
        : makeBuilder({ upsert: songUpsert });
    });

    const repository = createRepository();
    repository.setActiveLibrary('team-1');
    await repository.saveSong(makeSong());

    expect(songUpsert).toHaveBeenCalledWith(expect.objectContaining({
      created_by: 'user-1',
      updated_by: 'user-1',
      content_json: expect.objectContaining({ createdBy: 'user-1' })
    }), { onConflict: 'id' });
  });

  it('preserves the database creator when updating an existing song', async () => {
    const songUpsert = vi.fn().mockResolvedValue({ error: null });
    let songQueryCount = 0;
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('songs');
      songQueryCount += 1;
      return songQueryCount === 1
        ? makeBuilder({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'song-1', library_id: 'team-1', created_by: 'original-creator' },
            error: null
          })
        })
        : makeBuilder({ upsert: songUpsert });
    });

    const repository = createRepository();
    repository.setActiveLibrary('team-1');
    await repository.saveSong(makeSong({ createdBy: 'incorrect-copied-user' }));

    expect(songUpsert).toHaveBeenCalledWith(expect.objectContaining({
      created_by: 'original-creator',
      updated_by: 'user-1',
      content_json: expect.objectContaining({ createdBy: 'original-creator' })
    }), { onConflict: 'id' });
  });
});

describe('cloud repository background library reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads owned setlist keys and personal Capo with scoped, cancellable queries and no writes', async () => {
    const rows: Record<string, unknown[]> = {
      songs: [{ id: 'song-1', library_id: 'personal-1', title: 'Alpha', content_json: makeSong(),
        created_at: '2026-09-01', updated_at: '2026-09-09' }],
      projects: [], setlist_editor_assignments: [],
      setlists: [{ id: 'setlist-1', name: 'Sunday', library_id: 'personal-1',
        display_mode: 'chord-fixed-key', created_at: '2026-09-01', updated_at: '2026-09-09' }],
      setlist_songs: [{ id: 'entry-1', setlist_id: 'setlist-1', song_id: 'song-1', order_index: 0,
        override_json: { overrideKey: 'D', songData: makeSong() } }],
      user_setlist_capo_overrides: [{ setlist_song_id: 'entry-1', capo: 3 }]
    };
    const queries = new Map<string, ReturnType<typeof makeBuilder>>();
    mocks.from.mockImplementation((table: string) => {
      expect(table in rows).toBe(true);
      const query = makeBuilder({ returns: vi.fn().mockResolvedValue({ data: rows[table], error: null }) });
      queries.set(table, query);
      return query;
    });
    const signal = new AbortController().signal;
    const result = await createRepository().loadLibraryContent('personal-1', signal);
    expect(result.setlists[0].songs[0]).toMatchObject({ overrideKey: 'D', personalCapoOverride: 3 });
    for (const table of ['songs', 'setlists', 'projects']) {
      expect(queries.get(table)?.eq).toHaveBeenCalledWith('library_id', 'personal-1');
    }
    expect(queries.get('user_setlist_capo_overrides')?.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(queries.get('setlist_songs')?.in).toHaveBeenCalledWith('setlist_id', ['setlist-1']);
    for (const query of queries.values()) {
      expect(query.abortSignal).toHaveBeenCalledWith(signal);
      expect(query.upsert).not.toHaveBeenCalled();
      expect(query.delete).not.toHaveBeenCalled();
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects an incomplete background snapshot instead of clearing setlists on read failure', async () => {
    mocks.from.mockImplementation((table: string) => makeBuilder({ returns: vi.fn().mockResolvedValue({
      data: [], error: table === 'setlists' ? new Error('Connection lost') : null
    }) }));
    await expect(createRepository().loadLibraryContent('personal-1')).rejects.toThrow('Connection lost');
  });

  it('batches large personal Capo reads so PostgREST URLs stay below reverse-proxy limits', async () => {
    const setlistSongRows = Array.from({ length: 160 }, (_, index) => ({
      id: `entry-${index}`,
      setlist_id: 'setlist-1',
      song_id: 'song-1',
      order_index: index,
      override_json: null
    }));
    const capoBatches: string[][] = [];
    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_setlist_capo_overrides') {
        const query = makeBuilder();
        query.returns.mockImplementation(() => {
          const ids = query.in.mock.calls.at(-1)?.[1] as string[];
          capoBatches.push(ids);
          return Promise.resolve({
            data: [{ setlist_song_id: ids[0], capo: 2 }],
            error: null
          });
        });
        return query;
      }

      const rows: Record<string, unknown[]> = {
        songs: [{ id: 'song-1', library_id: 'personal-1', title: 'Alpha', content_json: makeSong(),
          created_at: '2026-09-01', updated_at: '2026-09-09' }],
        setlists: [{ id: 'setlist-1', name: 'Sunday', library_id: 'personal-1',
          display_mode: 'chord-fixed-key', created_at: '2026-09-01', updated_at: '2026-09-09' }],
        projects: [],
        setlist_songs: setlistSongRows,
        setlist_editor_assignments: []
      };
      return makeBuilder({ returns: vi.fn().mockResolvedValue({ data: rows[table], error: null }) });
    });

    const result = await createRepository().loadLibraryContent('personal-1');
    expect(capoBatches.map((batch) => batch.length)).toEqual([75, 75, 10]);
    expect(capoBatches.flat()).toEqual(setlistSongRows.map((row) => row.id));
    expect(result.setlists[0].songs.filter((song) => song.personalCapoOverride === 2)).toHaveLength(3);
  });

  it('does not redirect later writes when another library is only loaded for refresh', async () => {
    const songUpsert = vi.fn().mockResolvedValue({ error: null });
    let songQueryCount = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === 'songs') {
        songQueryCount += 1;
        if (songQueryCount === 1) return makeBuilder();
        if (songQueryCount === 2) {
          return makeBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
        }
        return makeBuilder({ upsert: songUpsert });
      }
      if (table === 'setlists' || table === 'projects') return makeBuilder();
      if (table === 'libraries') {
        return makeBuilder({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'personal-1', name: 'Personal', kind: 'personal', owner_user_id: 'user-1' },
            error: null
          })
        });
      }
      if (table === 'profiles' || table === 'library_members') return makeBuilder();
      throw new Error(`Unexpected table access: ${table}`);
    });

    const repository = createRepository();
    repository.setActiveLibrary('team-1');
    await repository.loadLibraryWorkspace('team-2');
    await repository.saveSong(makeSong());

    expect(songUpsert).toHaveBeenCalledWith(expect.objectContaining({
      library_id: 'team-1'
    }), { onConflict: 'id' });
  });
});

describe('cloud repository project deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses one project DELETE and lets the foreign key detach setlists', async () => {
    const projectQuery = makeBuilder({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'project-1' }, error: null })
    });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('projects');
      return projectQuery;
    });

    const repository = createRepository();
    repository.setActiveLibrary('team-1');
    await repository.deleteProject('project-1');

    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(projectQuery.delete).toHaveBeenCalledTimes(1);
    expect(projectQuery.update).not.toHaveBeenCalled();
    expect(projectQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'project-1');
    expect(projectQuery.eq).toHaveBeenNthCalledWith(2, 'library_id', 'team-1');
    expect(projectQuery.select).toHaveBeenCalledWith('id');
  });

  it('rejects a silent zero-row DELETE caused by RLS or a stale project id', async () => {
    const projectQuery = makeBuilder({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    });
    mocks.from.mockReturnValue(projectQuery);

    const repository = createRepository();
    repository.setActiveLibrary('team-1');

    await expect(repository.deleteProject('project-1')).rejects.toThrow(
      'Project deletion was not authorized, or the project no longer exists.'
    );
  });
});
