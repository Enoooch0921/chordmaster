import type { Setlist, Song, StoredSong } from '../types';

const recordFields = new Set(['id', 'updatedAt', 'lastEditedAt', 'createdAt', 'createdBy', 'updatedBy', 'archivedAt', 'archivedBy', 'teamSource']);
export const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item
));
export const scoreSignature = (song: Song | undefined): string => stableJson(song
  ? Object.fromEntries(Object.entries(song).filter(([key]) => !recordFields.has(key)))
  : null);

export const getChartEditedAt = (song?: Song): number | null => {
  const legacy = (song as Partial<StoredSong> | undefined)?.updatedAt;
  const times = [song?.lastEditedAt, legacy].filter((time): time is number => typeof time === 'number' && Number.isFinite(time) && time > 0);
  return times.length ? Math.max(...times) : null;
};

export const getSetlistChartEditedAt = (setlist: Setlist | undefined, entryId: string, sources: StoredSong[]): number | null => {
  const entry = setlist?.songs.find(item => item.id === entryId);
  if (!entry) return null;
  const recorded = getChartEditedAt(entry.songData);
  if (recorded) return recorded;
  const source = sources.find(song => song.id === entry.songId);
  // An old independent arrangement has no reliable date. Never borrow a later
  // source edit or another song's/setlist's timestamp for that arrangement.
  return !entry.songData || scoreSignature(entry.songData) === scoreSignature(source)
    ? getChartEditedAt(source) : null;
};

type Charts = { songs: StoredSong[]; setlists: Setlist[] };
const retainEditTime = <T extends Song>(song: T, previous?: Song): T => previous?.lastEditedAt !== undefined && previous.lastEditedAt !== song.lastEditedAt
  ? { ...song, lastEditedAt: previous.lastEditedAt } : song;
export const stampChartEdits = (next: Charts, saved: Charts, now: number): Charts => ({
  songs: next.songs.map(song => {
    const previous = saved.songs.find(item => item.id === song.id);
    return scoreSignature(song) === scoreSignature(previous) ? retainEditTime(song, previous) : { ...song, lastEditedAt: now };
  }),
  setlists: next.setlists.map(list => {
    const previous = saved.setlists.find(item => item.id === list.id);
    return { ...list, songs: list.songs.map(entry => {
      if (!entry.songData) return entry;
      const base = previous?.songs.find(item => item.id === entry.id)?.songData
        ?? saved.songs.find(song => song.id === entry.songId);
      const songData = scoreSignature(entry.songData) === scoreSignature(base) ? retainEditTime(entry.songData, base)
        : { ...entry.songData, lastEditedAt: now };
      return songData === entry.songData ? entry : { ...entry, songData };
    }) };
  })
});

/** Merge only saved timestamps; never replace edits made during an async save. */
export const adoptChartEditTimes = (current: Charts, input: Charts, saved: Charts): Charts => ({
  songs: current.songs.map(song => {
    const before = input.songs.find(item => item.id === song.id);
    const after = saved.songs.find(item => item.id === song.id);
    return after && after.lastEditedAt !== song.lastEditedAt && stableJson(song) === stableJson(before) ? { ...song, lastEditedAt: after.lastEditedAt } : song;
  }),
  setlists: current.setlists.map(list => ({ ...list, songs: list.songs.map(entry => {
    const before = input.setlists.find(item => item.id === list.id)?.songs.find(item => item.id === entry.id);
    const after = saved.setlists.find(item => item.id === list.id)?.songs.find(item => item.id === entry.id);
    return entry.songData && after?.songData && after.songData.lastEditedAt !== entry.songData.lastEditedAt && stableJson(entry) === stableJson(before)
      ? { ...entry, songData: { ...entry.songData, lastEditedAt: after.songData.lastEditedAt } } : entry;
  }) }))
});
