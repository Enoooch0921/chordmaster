import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_GROUPS } from './libraryDelta';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: mocks }));
import { createCloudRepository } from './repository';
const hash = (n = 1) => n.toString(16).repeat(64);
const repo = () => createCloudRepository({ userId: 'user', email: 'test@example.invalid', name: 'Test' });
const packet = (library = 'lib') => ({ scope: `user:${library}`, unchanged: false,
  versions: { scope: `user:${library}`, ...Object.fromEntries(LIBRARY_GROUPS.map(g => [g, {}])) } as any,
  changes: Object.fromEntries(LIBRARY_GROUPS.map(g => [g, []])) as any
});
const initial = () => {
  const value = packet();
  value.versions.songs = { source: hash() };
  const content = { title: 'Song', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [] };
  value.changes.songs = [{ id: 'source', title: 'Song', content_json: content, updated_at: '2026-11-06T01:00:00Z', created_at: '2026-11-06T01:00:00Z' }];
  value.versions.setlists = { list: hash() };
  value.changes.setlists = [{ id: 'list', name: 'Sunday', display_mode: 'chord-fixed-key', created_at: '2026-11-06T01:00:00Z', updated_at: '2026-11-06T01:00:00Z' }];
  value.versions.entries = { entry: hash() };
  value.changes.entries = [{ id: 'entry', setlist_id: 'list', song_id: 'source', order_index: 0,
    override_json: { overrideKey: 'D', songData: content }, baseline_delta: { sourceId: 'source', sourcePatch: {}, entryPatch: {},
      metadata: { songId: 'source', sourceRevision: 'date', capturedAt: 'date' } } }];
  return value;
};
const result = (data: unknown, error: unknown = null) => {
  const promise = Promise.resolve({ data, error }) as Promise<any> & { abortSignal: ReturnType<typeof vi.fn> };
  promise.abortSignal = vi.fn(() => promise);
  return promise;
};
beforeEach(() => mocks.rpc.mockReset());

describe('library snapshot transport', () => {
  it('reconstructs exact provenance and reuses complete snapshots after unchanged replies', async () => {
    const first = initial();
    mocks.rpc.mockReturnValueOnce(result(first)).mockReturnValue(result({ scope: first.scope, unchanged: true }));
    const repository = repo();
    const loaded = await repository.loadLibraryDelta!('lib', new AbortController().signal);
    expect(loaded?.setlists[0].songs[0].sourceBaseline?.sourceContent.title).toBe('Song');
    expect(loaded?.setlists[0].songs[0].overrideKey).toBe('D');
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_library_workspace_delta', { p_library_id: 'lib', p_known_versions: null });
    expect(await repository.loadLibraryDelta!('lib')).toBe(loaded);
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_library_workspace_delta', { p_library_id: 'lib', p_known_versions: first.versions });
  });

  it('merges changed scores without timestamps changing and preserves the old source baseline', async () => {
    const first = initial(), next = packet();
    next.versions = structuredClone(first.versions);
    next.versions.songs.source = hash(2);
    next.changes.songs = [{ ...first.changes.songs[0], content_json: { ...first.changes.songs[0].content_json, title: 'New title' } }];
    mocks.rpc.mockReturnValueOnce(result(first)).mockReturnValue(result(next));
    const repository = repo();
    await repository.loadLibraryDelta!('lib');
    const loaded = await repository.loadLibraryDelta!('lib');
    expect(loaded?.songs[0].title).toBe('New title');
    expect(loaded?.setlists[0].songs[0].sourceBaseline?.sourceContent.title).toBe('Song');
  });

  it('removes revoked rows and never mixes library or account caches', async () => {
    mocks.rpc.mockReturnValueOnce(result(initial())).mockReturnValueOnce(result(packet()))
      .mockReturnValue(result(packet('other')));
    const repository = repo();
    await repository.loadLibraryDelta!('lib');
    expect((await repository.loadLibraryDelta!('lib'))?.songs).toEqual([]);
    await repository.loadLibraryDelta!('other');
    expect(mocks.rpc.mock.calls.at(-1)?.[1].p_known_versions).toBeNull();
    mocks.rpc.mockReturnValue(result({ ...packet(), scope: 'someone-else:lib' }));
    await expect(repo().loadLibraryDelta!('lib')).rejects.toThrow('scope');
  });

  it('keeps the last valid baseline after network errors or incomplete replies', async () => {
    const first = initial(), incomplete = packet(); incomplete.versions.songs = { source: hash(4) };
    mocks.rpc.mockReturnValueOnce(result(first)).mockReturnValueOnce(result(null, { message: 'Offline' }))
      .mockReturnValueOnce(result(incomplete)).mockReturnValue(result({ scope: first.scope, unchanged: true }));
    const repository = repo(); const loaded = await repository.loadLibraryDelta!('lib');
    await expect(repository.loadLibraryDelta!('lib')).rejects.toMatchObject({ message: 'Offline' });
    await expect(repository.loadLibraryDelta!('lib')).rejects.toThrow('Missing changed');
    expect(await repository.loadLibraryDelta!('lib')).toBe(loaded);
    expect(mocks.rpc.mock.calls.at(-1)?.[1].p_known_versions).toEqual(first.versions);
  });

  it('falls back only for an unsupported RPC and respects cancellation', async () => {
    mocks.rpc.mockReturnValue(result(null, { code: 'PGRST202' }));
    const repository = repo();
    expect(await repository.loadLibraryDelta!('lib')).toBeNull();
    expect(await repository.loadLibraryDelta!('lib')).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const controller = new AbortController(); controller.abort();
    await expect(repo().loadLibraryDelta!('lib', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
