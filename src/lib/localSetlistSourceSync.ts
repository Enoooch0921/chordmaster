import type { SetlistSong, Song, StoredSong, WorkspaceSnapshot } from '../types';
import { mutatePersistentWorkspaceSnapshot, normalizeSongBars } from './workspace';
import { classifySetlistSource, hasSetlistSourceScoreChange, mergeSetlistSourceScore,
  type SetlistSourceDirection, type SetlistSourceReconciliation, type SetlistSourceSyncPreview } from './setlistSourceSync';

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined)
    .sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,canonical(v)])) : value;
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const revision = (song: StoredSong) => new Date(song.updatedAt).toISOString();
const baseline = (source: StoredSong, entry: Song, now: number) => ({ songId: source.id,
  sourceContent: structuredClone(source), entryContent: structuredClone(entry), sourceRevision: revision(source), capturedAt: new Date(now).toISOString() });

/** Establish provenance only from a known, unchanged local origin. Legacy edits stay unknown. */
export function captureLocalSetlistSourceEdit(source: StoredSong, before: SetlistSong, after: SetlistSong, now = Date.now()): SetlistSong {
  if (!after.songData || before.songId !== after.songId) return after;
  const origin = before.songData ?? source;
  const changed = hasSetlistSourceScoreChange(origin, after.songData);
  return { ...after,
    sourceBaseline: before.sourceBaseline ?? (!hasSetlistSourceScoreChange(source, origin) ? baseline(source, origin, now) : undefined),
    scoreUpdatedAt: changed ? now : before.scoreUpdatedAt
  };
}

interface LocalPreview extends SetlistSourceSyncPreview {
  local: { setlistId: string; entry: SetlistSong };
}
const locate = (workspace: WorkspaceSnapshot, entryId: string) => {
  const setlist = workspace.setlists.find(list => !list.archived && list.songs.some(entry => entry.id === entryId));
  const entry = setlist?.songs.find(item => item.id === entryId);
  const source = entry && workspace.songs.find(song => song.id === entry.songId && !song.archivedAt);
  if (!setlist || !entry || !source || entry.sourceArchivedAt) throw new Error('歌單或來源歌曲已移除、封存，請重新開啟。');
  return { setlist, entry, source };
};

export function previewLocalSetlistSource(workspace: WorkspaceSnapshot, entryId: string): LocalPreview {
  const { setlist, entry, source } = locate(workspace, entryId);
  const songData = structuredClone(entry.songData ?? source);
  return { libraryId: 'local', entryId, source: structuredClone(source), sourceRevision: revision(source),
    sourceContent: structuredClone(source), setlistName: setlist.name,
    setlistScoreUpdatedAt: entry.scoreUpdatedAt ? new Date(entry.scoreUpdatedAt).toISOString() : null,
    overrideJson: { songData, overrideKey: entry.overrideKey, sectionOrder: structuredClone(entry.sectionOrder) },
    baseline: structuredClone(entry.sourceBaseline ?? null), status: classifySetlistSource(source, songData, entry.sourceBaseline),
    local: { setlistId: setlist.id, entry: structuredClone(entry) } };
}

export function applyLocalSetlistSource(workspace: WorkspaceSnapshot, preview: SetlistSourceSyncPreview, direction: SetlistSourceDirection, now = Date.now()) {
  const { setlist, entry, source } = assertLocalSetlistSourcePreview(workspace, preview);
  const status = classifySetlistSource(source, entry.songData ?? source, entry.sourceBaseline);
  if (status === 'source-newer' && direction === 'to-library') throw new Error('這份歌單是舊副本，請從歌曲庫更新。');
  if (status === 'setlist-changed' && direction === 'to-setlist') throw new Error('歌單有尚未同步的修改，請先保留修改。');
  if (direction !== 'to-library' && direction !== 'to-setlist') throw new Error('請選擇更新方向。');
  const score = direction === 'to-library' ? entry.songData ?? source : source;
  if (!score.title?.trim() || !Array.isArray(score.sections)) throw new Error('譜面缺少歌名或段落。');
  const nextSource = direction === 'to-library' && status !== 'aligned'
    ? { ...mergeSetlistSourceScore(source, score), updatedAt: now } : source;
  let nextEntry = structuredClone(entry);
  if (direction === 'to-setlist' && status !== 'aligned') {
    const oldDefault = (entry.songData ?? source).sections.map(section => section.id!);
    const nextDefault = source.sections.map(section => section.id!);
    const order = entry.sectionOrder;
    const retained = order.filter(id => nextDefault.includes(id));
    nextEntry = { ...nextEntry, songData: normalizeSongBars(mergeSetlistSourceScore(entry.songData ?? source, source)),
      sectionOrder: !order.length || equal(order, oldDefault) || !retained.length ? nextDefault : retained, scoreUpdatedAt: now };
  }
  nextEntry.sourceBaseline = baseline(nextSource, nextEntry.songData ?? nextSource, now);
  const nextSetlist = { ...setlist, updatedAt: now, songs: setlist.songs.map(item => item.id === entry.id ? nextEntry : item) };
  const nextWorkspace = { ...workspace, songs: workspace.songs.map(song => song.id === source.id ? nextSource : song),
    setlists: workspace.setlists.map(list => list.id === setlist.id ? nextSetlist : list) };
  const result: SetlistSourceReconciliation = { source: nextSource, entry: nextEntry, direction, setlistUpdatedAt: now };
  return { workspace: nextWorkspace, result, backup: { direction, source: structuredClone(source), entry: structuredClone(entry),
    setlistId: setlist.id, capturedAt: new Date(now).toISOString() } };
}

export function assertLocalSetlistSourcePreview(workspace: WorkspaceSnapshot, preview: SetlistSourceSyncPreview) {
  const local = (preview as LocalPreview).local;
  const { setlist, entry, source } = locate(workspace, preview.entryId);
  if (preview.libraryId !== 'local' || !local || local.setlistId !== setlist.id || source.id !== preview.source.id
    || revision(source) !== preview.sourceRevision || !equal(source, preview.sourceContent) || !equal(entry, local.entry)) {
    throw new Error('譜面或來源版本已更新，請重新比對差異。');
  }
  return { setlist, entry, source };
}

export async function reconcileLocalSetlistSource(preview: SetlistSourceSyncPreview, direction: SetlistSourceDirection, live: WorkspaceSnapshot) {
  // The in-memory draft and latest durable copy must both still match the preview.
  applyLocalSetlistSource(live, preview, direction);
  let result: SetlistSourceReconciliation;
  const workspace = await mutatePersistentWorkspaceSnapshot(current => {
    const applied = applyLocalSetlistSource(current, preview, direction);
    result = applied.result;
    return applied;
  });
  return { result: result!, workspace };
}
