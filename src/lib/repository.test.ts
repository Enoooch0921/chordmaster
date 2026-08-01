import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredSong, WorkspaceSnapshot } from '../types';

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
  ['select', 'eq', 'in', 'order', 'limit', 'delete', 'update'].forEach((method) => {
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

describe('cloud repository song creator integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
