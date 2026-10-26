import type { AppLanguage, SetlistSong, SetlistSourceBaseline, Song, StoredSong } from '../types';
import { normalizeSongBars } from './workspace';
import { supabase } from './supabase';

// Source content only. Performance keys, Capo and display preferences belong to
// the setlist/account. Keep this list aligned with setlist_source_score in SQL.
const SCORE_FIELDS = [
  'title', 'lyricist', 'composer', 'translator', 'groove', 'shuffle',
  'originalKey', 'originalKeyMode', 'originalKeyUnspecified',
  'tempo', 'timeSignature', 'timeSignatureUnspecified', 'jianpuInputAbsolute',
  'references', 'pickup', 'sections', 'lyricsDoc', 'chordTimingVersion'
] as const;

const canonical = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
    : value;

export const setlistSourceScoreSignature = (song: Song | undefined): string => {
  if (!song) return 'null';
  const normalized = normalizeSongBars(song);
  const score = Object.fromEntries(SCORE_FIELDS.map(field => [field, normalized[field]]));
  if (normalized.lyricsDoc) {
    const { displayLanguage, fontSize, lineHeight, ...content } = normalized.lyricsDoc;
    score.lyricsDoc = content;
  }
  return JSON.stringify(canonical(score));
};

export const hasSetlistSourceScoreChange = (before: Song | undefined, after: Song | undefined) => (
  Boolean(before && after) && setlistSourceScoreSignature(before) !== setlistSourceScoreSignature(after)
);

export type SetlistSourceStatus = 'aligned' | 'setlist-changed' | 'source-newer' | 'conflict' | 'unknown';
export type SetlistSourceDirection = 'to-library' | 'to-setlist';

export const classifySetlistSource = (source: Song, edited: Song, baseline?: SetlistSourceBaseline | null): SetlistSourceStatus => {
  if (!hasSetlistSourceScoreChange(source, edited)) return 'aligned';
  if (!baseline?.sourceContent || !baseline.entryContent) return 'unknown';
  const sourceChanged = hasSetlistSourceScoreChange(baseline.sourceContent, source);
  const entryChanged = hasSetlistSourceScoreChange(baseline.entryContent, edited);
  if (!sourceChanged && entryChanged) return 'setlist-changed';
  if (sourceChanged && !entryChanged) return 'source-newer';
  return 'conflict';
};

interface SourceRow {
  id: string; library_id: string; content_json: Song; updated_at: string;
  created_at: string; created_by: string; updated_by: string;
  archived_at: string | null; archived_by: string | null;
}
export interface SetlistSourceSyncPreview {
  libraryId: string;
  entryId: string;
  source: StoredSong;
  sourceRevision: string;
  sourceContent: Song;
  overrideJson: Record<string, unknown> & { songData: Song };
  setlistName: string;
  baseline: SetlistSourceBaseline | null;
  status: SetlistSourceStatus;
}

/** A new library identity, containing the edited score rather than the source. */
export const createSetlistSourceCopy = (preview: SetlistSourceSyncPreview, title: string, id: string, now = Date.now()): StoredSong => {
  if (!title.trim() || !id || id === preview.source.id) throw new Error('A new song needs its own name and identity.');
  return {
    ...normalizeSongBars(structuredClone(preview.overrideJson.songData)),
    id, title: title.trim(), createdAt: now, updatedAt: now,
    createdBy: undefined, updatedBy: undefined, archivedAt: null, archivedBy: null, teamSource: undefined
  };
};
const mapSource = (row: SourceRow): StoredSong => ({
  ...normalizeSongBars(structuredClone(row.content_json)), id: row.id,
  updatedAt: Date.parse(row.updated_at), createdAt: Date.parse(row.created_at),
  createdBy: row.created_by, updatedBy: row.updated_by,
  archivedAt: row.archived_at ? Date.parse(row.archived_at) : null, archivedBy: row.archived_by
});

export const previewSetlistSourceSync = async (libraryId: string, entryId: string): Promise<SetlistSourceSyncPreview> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('preview_setlist_source_sync', { p_library_id: libraryId, p_entry_id: entryId });
  if (error) throw error;
  const payload = data as { source: SourceRow; entry: { id: string; song_id: string; override_json: SetlistSourceSyncPreview['overrideJson']; source_baseline?: SetlistSourceBaseline | null }; setlistName: string; syncStatus?: SetlistSourceStatus };
  if (!payload?.source || payload.source.library_id !== libraryId || payload.source.archived_at
    || payload.entry?.id !== entryId || payload.entry.song_id !== payload.source.id || !payload.entry.override_json?.songData) {
    throw new Error('The setlist/source identity changed. Please preview again.');
  }
  return {
    libraryId, entryId, source: mapSource(payload.source), sourceRevision: payload.source.updated_at,
    sourceContent: structuredClone(payload.source.content_json),
    overrideJson: structuredClone(payload.entry.override_json), setlistName: payload.setlistName,
    baseline: structuredClone(payload.entry.source_baseline ?? null),
    status: payload.syncStatus ?? classifySetlistSource(payload.source.content_json, payload.entry.override_json.songData, payload.entry.source_baseline)
  };
};

export interface SetlistSourceReconciliation {
  source: StoredSong;
  entry: SetlistSong;
  setlistUpdatedAt: number;
  direction: SetlistSourceDirection;
}

export const reconcileSetlistSource = async (preview: SetlistSourceSyncPreview, direction: SetlistSourceDirection): Promise<SetlistSourceReconciliation> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (preview.status === 'source-newer' && direction === 'to-library') throw new Error('This is an unchanged old copy. Update the setlist instead.');
  const { data, error } = await supabase.rpc('reconcile_setlist_source', {
    p_library_id: preview.libraryId, p_entry_id: preview.entryId,
    p_expected_source_updated_at: preview.sourceRevision, p_expected_override_json: preview.overrideJson,
    p_expected_source_content: preview.sourceContent, p_expected_baseline: preview.baseline,
    p_direction: direction, p_resolve_conflict: preview.status === 'conflict' || preview.status === 'unknown'
  });
  if (error) throw error;
  const result = data as { source: SourceRow; entry: { id: string; setlist_id: string; song_id: string; order_index: number;
    override_json: SetlistSourceSyncPreview['overrideJson']; source_baseline: SetlistSourceBaseline | null }; setlistUpdatedAt: string };
  if (result?.source?.id !== preview.source.id || result.source.library_id !== preview.libraryId || result.source.archived_at
    || result.entry?.id !== preview.entryId || result.entry.song_id !== result.source.id) throw new Error('The setlist/source identity changed. Please reload.');
  return { source: mapSource(result.source), direction, setlistUpdatedAt: Date.parse(result.setlistUpdatedAt),
    entry: { id: result.entry.id, setlistId: result.entry.setlist_id, songId: result.entry.song_id, order: result.entry.order_index,
      overrideKey: result.entry.override_json.overrideKey as SetlistSong['overrideKey'],
      sectionOrder: result.entry.override_json.sectionOrder as string[], songData: normalizeSongBars(result.entry.override_json.songData),
      sourceBaseline: result.entry.source_baseline } };
};

export const syncSetlistSource = async (preview: SetlistSourceSyncPreview): Promise<StoredSong> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('sync_setlist_song_to_library', {
    p_library_id: preview.libraryId, p_entry_id: preview.entryId,
    p_expected_source_updated_at: preview.sourceRevision, p_expected_override_json: preview.overrideJson,
    p_expected_source_content: preview.sourceContent
  });
  if (error) throw error;
  const row = data as SourceRow;
  if (row?.id !== preview.source.id || row.library_id !== preview.libraryId || row.archived_at) {
    throw new Error('The source identity changed. Please reload.');
  }
  return mapSource(row);
};

export const describeSetlistSourceChanges = (source: Song, edited: Song, language: AppLanguage): string[] => {
  source = normalizeSongBars(structuredClone(source));
  edited = normalizeSongBars(structuredClone(edited));
  const zh = language === 'zh';
  const changes: string[] = [];
  const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const label = (field: string) => ({ title: '歌名', lyricist: '版本', composer: '作曲', translator: '翻譯',
    groove: '風格', shuffle: 'Shuffle', originalKey: '原調', originalKeyMode: '大小調', originalKeyUnspecified: '原調標記',
    tempo: '速度', timeSignature: '拍號', timeSignatureUnspecified: '拍號標記', jianpuInputAbsolute: '簡譜輸入模式',
    references: '參考影片', pickup: '弱起拍', lyricsDoc: '歌詞', chordTimingVersion: '和弦時點格式',
    chords: '和弦', riff: '簡譜', rhythm: '節奏', annotation: '備註', label: '標籤', riffLabel: '簡譜標籤',
    rhythmLabel: '節奏標籤', keyChangeTo: '轉調', bars: '小節', titleSection: '段落名稱'
  }[field] ?? '演奏記號／聲部');
  for (const field of SCORE_FIELDS.filter(field => field !== 'sections')) {
    if (field === 'lyricsDoc') {
      const clean = (doc: Song['lyricsDoc']) => doc && (({ displayLanguage, fontSize, lineHeight, ...rest }) => rest)(doc);
      if (!equal(clean(source.lyricsDoc), clean(edited.lyricsDoc))) changes.push(zh ? '歌詞內容' : 'Lyrics content');
    } else if (!equal(source[field], edited[field])) changes.push(zh ? label(field) : field);
  }
  const sourceIds = source.sections.map(s => s.id), editedIds = edited.sections.map(s => s.id);
  if (!equal(sourceIds, editedIds)) changes.push(zh ? '譜面段落新增、刪除或重排（不含歌單演出順序）' : 'Score sections added, removed or reordered (excluding setlist performance order)');
  for (const section of source.sections) {
    if (!edited.sections.some(s => s.id === section.id)) changes.push(`${section.title}：${zh ? '刪除段落' : 'Removed section'}`);
  }
  for (const section of edited.sections) {
    const previous = source.sections.find(s => s.id === section.id);
    if (!previous) { changes.push(`${section.title}：${zh ? '新增段落' : 'Added section'}`); continue; }
    if (section.title !== previous.title) changes.push(`${previous.title} → ${section.title}`);
    const fields = new Set([...Object.keys(section), ...Object.keys(previous)]);
    if ([...fields].some(key => !['id','title','bars'].includes(key) && !equal(section[key], previous[key]))) changes.push(`${section.title}：${zh ? '段落演奏設定' : 'Section performance markings'}`);
    if (!equal(previous.bars.map(b => b.id), section.bars.map(b => b.id))) changes.push(`${section.title}：${zh ? '小節新增、刪除或重排' : 'Bars added, removed or reordered'} (${previous.bars.length} → ${section.bars.length})`);
    section.bars.forEach((bar, index) => {
      const old = previous.bars.find(b => b.id === bar.id);
      if (!old) return;
      const changed = [...new Set([...Object.keys(old), ...Object.keys(bar)])].filter(key => key !== 'id' && !equal(old[key], bar[key]));
      if (changed.length) changes.push(`${section.title} · ${zh ? '第 ' + (index + 1) + ' 小節' : 'Bar ' + (index + 1)}：${changed.map(k => zh ? label(k) : k).join('、')}${changed.includes('chords') ? ` (${old.chords.join(' ')} → ${bar.chords.join(' ')})` : ''}`);
    });
  }
  return changes;
};
