import type { AppLanguage, Project, Setlist, Song, StoredSong } from '../types';
import { scoreSignature, stableJson } from './chartRevision';

type Workspace = { songs: StoredSong[]; setlists: Setlist[]; projects: Project[] };
export interface WorkspaceChange { location: string; name: string; detail: string }
const bookkeeping = new Set(['updatedAt', 'lastEditedAt', 'sourceBaseline', 'personalCapoOverride', 'sourceArchivedAt', 'assignedToCurrentUser']);
const signature = (value: unknown): string => stableJson(JSON.parse(JSON.stringify(value, (key, item) => bookkeeping.has(key) ? undefined : item) ?? 'null'));
// Keep routine dirty checks cheap; build the detailed, canonical item list only
// when a save decision is actually shown.
export const hasUnsavedWorkspaceChanges = (current: Workspace, saved: Workspace): boolean => {
  const serialize = (value: Workspace) => JSON.stringify(value, (key, item) => bookkeeping.has(key) ? undefined : item);
  return serialize(current) !== serialize(saved);
};

export const describeScoreChanges = (before: Song | undefined, after: Song, language: AppLanguage): string => {
  const zh = language === 'zh';
  if (!before) return zh ? '新增' : 'Added';
  const labels: string[] = [];
  const changed = (a: unknown, b: unknown) => stableJson(a) !== stableJson(b);
  if (changed(before.title, after.title)) labels.push(zh ? '歌名' : 'Title');
  if (changed([before.originalKey, before.currentKey, before.originalKeyMode, before.currentKeyMode], [after.originalKey, after.currentKey, after.originalKeyMode, after.currentKeyMode])) labels.push(zh ? '調性' : 'Key');
  if (changed(before.tempo, after.tempo)) labels.push(zh ? '速度' : 'Tempo');
  const bars = (song: Song) => song.sections.flatMap(section => section.bars);
  if (changed(bars(before).map(bar => bar.chords), bars(after).map(bar => bar.chords))) labels.push(zh ? '和弦' : 'Chords');
  if (changed(bars(before).map(bar => [bar.rhythm, bar.rhythmVoices]), bars(after).map(bar => [bar.rhythm, bar.rhythmVoices]))) labels.push(zh ? '節奏' : 'Rhythm');
  if (changed(bars(before).map(bar => [bar.riff, bar.riffVoices]), bars(after).map(bar => [bar.riff, bar.riffVoices]))) labels.push(zh ? '簡譜' : 'Notation');
  if (changed(before.lyricsDoc, after.lyricsDoc)) labels.push(zh ? '歌詞' : 'Lyrics');
  if (changed(before.sections.map(section => [section.id, section.title, section.bars.map(bar => bar.id)]), after.sections.map(section => [section.id, section.title, section.bars.map(bar => bar.id)]))) labels.push(zh ? '段落' : 'Sections');
  return labels.slice(0,3).join(zh ? '、' : ', ') || (zh ? '譜面' : 'Score');
};

export const getWorkspaceChanges = (current: Workspace, saved: Workspace, language: AppLanguage): WorkspaceChange[] => {
  const zh = language === 'zh';
  const changes: WorkspaceChange[] = [];
  const title = (name?: string) => name?.trim() || (zh ? '未命名' : 'Untitled');
  const removed = zh ? '刪除' : 'Deleted';
  const sources = new Map([...saved.songs, ...current.songs].map(song => [song.id, song]));
  const visit = <T extends { id: string }>(next: T[], previous: T[], fn: (item: T, before?: T, deleted?: boolean) => void) => {
    const beforeById = new Map(previous.map(item => [item.id, item]));
    const nextIds = new Set(next.map(item => item.id));
    for (const item of next) { const before = beforeById.get(item.id); if (!before || signature(item) !== signature(before)) fn(item, before); }
    for (const item of previous) if (!nextIds.has(item.id)) fn(item, item, true);
  };
  visit(current.songs, saved.songs, (song, before, deleted) => changes.push({ location: zh ? '歌曲庫' : 'Song library', name: title(song.title), detail: deleted ? removed : describeScoreChanges(before, song, language) }));
  visit(current.setlists, saved.setlists, (list, before, deleted) => {
    const location = zh ? `歌單「${title(list.name)}」` : `Setlist “${title(list.name)}”`;
    if (deleted || !before) { changes.push({ location: zh ? '歌單' : 'Setlists', name: title(list.name), detail: deleted ? removed : (zh ? '新增' : 'Added') }); return; }
    visit(list.songs, before.songs, (entry, oldEntry, entryDeleted) => {
      const source = sources.get(entry.songId);
      const song = entry.songData ?? source;
      if (oldEntry && !entryDeleted && scoreSignature(song) === scoreSignature(oldEntry.songData ?? source)
        && signature({ ...entry, order: 0 }) === signature({ ...oldEntry, order: 0 })) return;
      changes.push({ location, name: title(song?.title), detail: entryDeleted ? removed : !oldEntry ? (zh ? '加入歌曲' : 'Added song')
        : scoreSignature(song) !== scoreSignature(oldEntry.songData ?? source) && song ? describeScoreChanges(oldEntry.songData ?? source, song, language)
        : entry.overrideKey !== oldEntry.overrideKey ? (zh ? '調性' : 'Key') : (zh ? '編排' : 'Arrangement') });
    });
    const metadata = (item: Setlist) => ({ ...item, songs: [] });
    if (signature(metadata(list)) !== signature(metadata(before)) || (signature(list.songs.map(item => item.id)) !== signature(before.songs.map(item => item.id)) && list.songs.length === before.songs.length && list.songs.every(item => before.songs.some(old => old.id === item.id))))
      changes.push({ location: zh ? '歌單' : 'Setlists', name: title(list.name), detail: list.name !== before.name ? (zh ? '名稱' : 'Name') : (zh ? '編排' : 'Arrangement') });
  });
  visit(current.projects, saved.projects, (project, before, deleted) => changes.push({ location: zh ? '專案' : 'Project', name: title(project.name), detail: deleted ? removed : !before ? (zh ? '新增' : 'Added') : (zh ? '設定' : 'Settings') }));
  if (!changes.length && signature(current.songs.map(song => song.id)) !== signature(saved.songs.map(song => song.id))) changes.push({ location: zh ? '歌曲庫' : 'Song library', name: zh ? '歌曲排序' : 'Song order', detail: zh ? '排序' : 'Order' });
  return changes;
};
