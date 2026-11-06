import { describe, expect, it } from 'vitest';
import { applyLibraryDelta, applyWorkspacePatch, LIBRARY_GROUPS } from './libraryDelta';

const hash = (n = 1) => n.toString(16).repeat(64);
const packet = () => ({ scope: 'user:library', unchanged: false,
  versions: { scope: 'user:library', ...Object.fromEntries(LIBRARY_GROUPS.map(group => [group, {}])) } as any,
  changes: Object.fromEntries(LIBRARY_GROUPS.map(group => [group, []])) as any
});
const initial = () => {
  const value = packet();
  value.versions.songs = { source: hash() };
  value.changes.songs = [{ id: 'source', content_json: { title: 'Song', sections: [{ title: 'Verse' }], obsolete: 1 } }];
  value.versions.entries = { entry: hash() };
  value.changes.entries = [{ id: 'entry', song_id: 'source', baseline_delta: { sourceId: 'source',
    metadata: { songId: 'source', sourceRevision: 'date', capturedAt: 'date' },
    sourcePatch: { d: ['obsolete'], s: { title: 'Original', nullValue: null } }, entryPatch: {} } }];
  return value;
};

describe('lossless library deltas', () => {
  it('reconstructs complete comparison baselines without mutating the source or patch', () => {
    const wire = initial(), before = structuredClone(wire);
    const cache = applyLibraryDelta(undefined, wire, wire.scope);
    expect(cache.rows.entries[0].source_baseline.sourceContent).toEqual({ title: 'Original', nullValue: null, sections: [{ title: 'Verse' }] });
    expect(cache.rows.entries[0].source_baseline.entryContent).toEqual(wire.changes.songs[0].content_json);
    expect(wire).toEqual(before);
    expect(cache.rows.entries[0]).not.toHaveProperty('baseline_delta');
  });

  it('keeps the historical baseline when only its source changes and removes deleted/revoked rows', () => {
    const wire = initial(), first = applyLibraryDelta(undefined, wire, wire.scope);
    const changed = packet();
    changed.versions.songs = { source: hash(2), added: hash() };
    changed.versions.entries = wire.versions.entries;
    changed.changes.songs = [{ id: 'source', content_json: { title: 'Changed' } }, { id: 'added', content_json: {} }];
    const next = applyLibraryDelta(first, changed, wire.scope);
    expect(next.rows.entries[0]).toBe(first.rows.entries[0]);
    expect(next.rows.entries[0].source_baseline.entryContent.title).toBe('Song');
    expect(next.rows.songs.map(row => row.id)).toEqual(['source', 'added']);
    const empty = applyLibraryDelta(next, packet(), wire.scope);
    expect(empty.rows.songs).toEqual([]);
    expect(empty.rows.entries).toEqual([]);
  });

  it('does not discard cached changes when the UI deferred applying them', () => {
    const first = applyLibraryDelta(undefined, initial(), 'user:library');
    const second = applyLibraryDelta(first, { scope: 'user:library', unchanged: true }, 'user:library');
    expect(second).toBe(first);
    expect(second.rows.songs).toHaveLength(1);
    expect(() => applyLibraryDelta(undefined, { scope: 'user:library', unchanged: true }, 'user:library')).toThrow('baseline');
  });

  it('rejects incomplete or cross-account responses without changing the last valid snapshot', () => {
    const first = applyLibraryDelta(undefined, initial(), 'user:library');
    const before = structuredClone(first);
    const missing = packet(); missing.versions.songs = { source: hash(3) };
    expect(() => applyLibraryDelta(first, missing, 'user:library')).toThrow('Missing changed');
    expect(() => applyLibraryDelta(first, initial(), 'other:library')).toThrow('scope');
    expect(first).toEqual(before);
  });

  it('handles nested object changes, array replacement, explicit null and prototype-named JSON keys', () => {
    const base = { nested: { a: 1, b: [1] }, gone: true };
    expect(applyWorkspacePatch(base, { p: { nested: { s: { a: null, b: [2, 3] } } }, d: ['gone'] }))
      .toEqual({ nested: { a: null, b: [2, 3] } });
    const result = applyWorkspacePatch({}, JSON.parse('{"s":{"__proto__":{"polluted":true}}}'));
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(({} as any).polluted).toBeUndefined();
    expect(base).toEqual({ nested: { a: 1, b: [1] }, gone: true });
  });
});
