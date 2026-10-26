import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredSong } from '../types';

const mocks = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: mocks }));
import { createCloudRepository } from './repository';
import { syncWorkspaceDiff } from './sync';

const song: StoredSong = {
  id: 'song', title: 'Alpha', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ title: 'Verse', bars: [{ chords: ['C'] }] }], updatedAt: 1
};
const makeRepository = () => createCloudRepository({ userId: 'user', email: 'user@example.com', name: 'User' });
const makeQuery = (data: unknown[]) => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  ['select', 'eq', 'in', 'limit', 'abortSignal'].forEach((method) => { query[method] = vi.fn(() => query); });
  query.returns = vi.fn().mockResolvedValue({ data, error: null });
  return query;
};

beforeEach(() => vi.clearAllMocks());

describe('team collection refresh', () => {
  it('reads changed setlist copies and projects without refetching the known song catalogue', async () => {
    const knownSongs = [song];
    const rows: Record<string, unknown[]> = {
      setlists: [{ id: 'setlist', library_id: 'team', name: 'Sunday', project_id: 'project',
        display_mode: 'chord-fixed-key', created_at: '2026-10-01', updated_at: '2026-10-26' }],
      projects: [{ id: 'project', library_id: 'team', name: 'Worship', created_at: '2026-10-01', updated_at: '2026-10-26' }],
      setlist_songs: [{ id: 'entry', setlist_id: 'setlist', song_id: 'song', order_index: 0,
        override_json: { overrideKey: 'D', songData: { ...song, title: 'Sunday version' } } }],
      setlist_editor_assignments: [],
      user_setlist_capo_overrides: [{ setlist_song_id: 'entry', capo: 2 }]
    };
    const queries = new Map<string, ReturnType<typeof makeQuery>>();
    mocks.from.mockImplementation((table: string) => {
      expect(table in rows).toBe(true);
      const query = makeQuery(rows[table]);
      queries.set(table, query);
      return query;
    });
    const signal = new AbortController().signal;
    const remote = await makeRepository().loadLibraryCollections('team', knownSongs, signal);
    expect(remote.songs).toBe(knownSongs);
    expect(remote.projects[0].name).toBe('Worship');
    expect(remote.setlists[0].songs[0]).toMatchObject({ overrideKey: 'D', personalCapoOverride: 2,
      songData: { title: 'Sunday version' } });
    expect(mocks.from).not.toHaveBeenCalledWith('songs');
    expect(queries.get('setlists')?.eq).toHaveBeenCalledWith('library_id', 'team');
    expect(queries.get('projects')?.eq).toHaveBeenCalledWith('library_id', 'team');
    expect(queries.get('user_setlist_capo_overrides')?.eq).toHaveBeenCalledWith('user_id', 'user');
    for (const query of queries.values()) expect(query.abortSignal).toHaveBeenCalledWith(signal);
  });

  it.each([false, true])('loads a complete library for an unknown source, with embedded score: %s', async (embedded) => {
    const rows: Record<string, unknown[]> = {
      songs: [{ id: 'song', title: song.title, content_json: song, created_at: '2026-10-01', updated_at: '2026-10-26' }],
      setlists: [{ id: 'setlist', library_id: 'team', name: 'Sunday', display_mode: 'chord-fixed-key',
        created_at: '2026-10-01', updated_at: '2026-10-26' }],
      projects: [], setlist_editor_assignments: [], user_setlist_capo_overrides: [],
      setlist_songs: [{ id: 'entry', setlist_id: 'setlist', song_id: 'song', order_index: 0,
        override_json: embedded ? { songData: song } : {} }]
    };
    mocks.from.mockImplementation((table: string) => makeQuery(rows[table]));
    const remote = await makeRepository().loadLibraryCollections('team', []);
    expect(mocks.from).toHaveBeenCalledWith('songs');
    expect(remote.songs).toHaveLength(1);
    expect(remote.setlists[0].songs).toHaveLength(1);
    expect(remote.songs.find((item) => item.id === remote.setlists[0].songs[0].songId)?.title).toBe('Alpha');
    const repository = makeRepository();
    const saveSong = vi.spyOn(repository, 'saveSong').mockResolvedValue();
    const saveSetlist = vi.spyOn(repository, 'saveSetlist').mockResolvedValue();
    const nextSetlists = remote.setlists.map((setlist) => ({ ...setlist,
      songs: setlist.songs.map((entry) => ({ ...entry, overrideKey: 'D' as const })) }));
    await syncWorkspaceDiff({ repository, ...remote, setlists: nextSetlists, savedSongs: remote.songs,
      savedSetlists: remote.setlists, savedProjects: remote.projects });
    expect(saveSetlist).toHaveBeenCalledOnce();
    expect(saveSong).not.toHaveBeenCalled();
  });

  it('forwards project and setlist entry events, including updates from the same account', () => {
    const callbacks = new Map<string, (payload: unknown) => void>();
    const bindingGroups: string[][] = [];
    mocks.channel.mockImplementation(() => {
      const tables: string[] = [];
      bindingGroups.push(tables);
      const channel = {
        on: vi.fn((_event, filter, callback) => {
          tables.push(filter.table); callbacks.set(filter.table, callback); return channel;
        }),
        subscribe: vi.fn(() => channel)
      };
      return channel;
    });
    const onChange = vi.fn();
    const unsubscribe = makeRepository().subscribeToLibraryChanges('team', onChange);
    callbacks.get('setlists')?.({ new: { library_id: 'team', updated_by: 'user' } });
    callbacks.get('projects')?.({ new: { library_id: 'team', updated_by: 'user' } });
    callbacks.get('setlist_songs')?.({ new: { setlist_id: 'setlist' } });
    expect(onChange.mock.calls).toEqual([['setlists'], ['projects'], ['setlists']]);
    expect(bindingGroups).toEqual([
      ['songs', 'setlist_editor_assignments', 'library_members'],
      ['setlists', 'projects', 'setlist_songs']
    ]);
    unsubscribe();
    unsubscribe();
    callbacks.get('setlist_songs')?.({ old: { id: 'entry' } });
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(mocks.removeChannel).toHaveBeenCalledTimes(2);
    for (const result of mocks.channel.mock.results) expect(mocks.removeChannel).toHaveBeenCalledWith(result.value);
  });
});
