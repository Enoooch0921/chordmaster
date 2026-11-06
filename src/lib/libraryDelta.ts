export const LIBRARY_GROUPS = ['songs', 'setlists', 'projects', 'entries', 'assignments', 'capos'] as const;
type Group = typeof LIBRARY_GROUPS[number];
type Row = Record<string, any>;
export type LibraryVersions = { scope: string } & Record<Group, Record<string, string>>;
export interface LibraryDeltaCache {
  versions: LibraryVersions;
  rows: Record<Group, Row[]>;
}
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const rowId = (group: Group, row: Row): string => group === 'capos' ? row.setlist_song_id
  : group === 'assignments' ? row.setlist_id : row.id;

/** Lossless JSON patch: arrays are atomic, and explicit null differs from deletion. */
export const applyWorkspacePatch = (base: unknown, patch: unknown): any => {
  if (!record(patch)) throw new Error('Invalid baseline patch.');
  if (own(patch, 'v')) return structuredClone(patch.v);
  if (!Object.keys(patch).length) return structuredClone(base);
  if (!record(base)) throw new Error('Missing baseline reference.');
  const result = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, structuredClone(value)]));
  const put = (key: string, value: unknown) => Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
  if (patch.d !== undefined) {
    if (!Array.isArray(patch.d) || patch.d.some(key => typeof key !== 'string')) throw new Error('Invalid baseline deletion.');
    for (const key of patch.d) delete result[key];
  }
  for (const kind of ['s', 'p']) {
    if (patch[kind] === undefined) continue;
    if (!record(patch[kind])) throw new Error('Invalid baseline changes.');
    for (const [key, value] of Object.entries(patch[kind])) {
      if (kind === 'p' && !own(result, key)) throw new Error('Missing baseline field.');
      put(key, kind === 'p' ? applyWorkspacePatch(result[key], value) : structuredClone(value));
    }
  }
  return result;
};

/** Commit only complete, authorized snapshots; missing IDs remove revoked/deleted rows. */
export const applyLibraryDelta = (previous: LibraryDeltaCache | undefined, packet: unknown, scope: string): LibraryDeltaCache => {
  if (!record(packet) || packet.scope !== scope) throw new Error('Workspace scope changed.');
  if (packet.unchanged === true) {
    if (!previous || previous.versions.scope !== scope) throw new Error('Missing workspace baseline.');
    return previous;
  }
  if (packet.unchanged !== false || !record(packet.versions) || packet.versions.scope !== scope || !record(packet.changes)) {
    throw new Error('Invalid workspace update.');
  }
  const versions = packet.versions as LibraryVersions;
  const rows = {} as Record<Group, Row[]>;
  const changedEntries = new Set<string>();
  for (const group of LIBRARY_GROUPS) {
    if (!record(versions[group]) || !Array.isArray(packet.changes[group])) throw new Error('Incomplete workspace update.');
    const old = new Map((previous?.rows[group] ?? []).map(row => [rowId(group, row), row]));
    const changed = new Map<string, Row>();
    for (const row of packet.changes[group]) {
      if (!record(row)) throw new Error('Invalid workspace row.');
      const id = rowId(group, row);
      if (typeof id !== 'string' || !own(versions[group], id) || changed.has(id)) throw new Error('Invalid workspace identity.');
      changed.set(id, row);
      if (group === 'entries') changedEntries.add(id);
    }
    rows[group] = Object.entries(versions[group]).map(([id, version]) => {
      if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) throw new Error('Invalid row version.');
      if (changed.has(id)) return changed.get(id)!;
      if (previous?.versions.scope !== scope || previous.versions[group][id] !== version || !old.has(id)) {
        throw new Error('Missing changed workspace row.');
      }
      return old.get(id)!;
    });
  }
  const sources = new Map(rows.songs.map(song => [song.id, song.content_json]));
  rows.entries = rows.entries.map(row => {
    if (!changedEntries.has(row.id) || !own(row, 'baseline_delta')) return row;
    const delta = row.baseline_delta;
    if (!record(delta) || delta.sourceId !== row.song_id || !sources.has(delta.sourceId) || !record(delta.metadata)) {
      throw new Error('Missing baseline source.');
    }
    const { baseline_delta: _delta, ...entry } = row;
    return { ...entry, source_baseline: {
      ...delta.metadata,
      sourceContent: applyWorkspacePatch(sources.get(delta.sourceId), delta.sourcePatch),
      entryContent: applyWorkspacePatch(sources.get(delta.sourceId), delta.entryPatch)
    } };
  });
  return { versions, rows };
};
