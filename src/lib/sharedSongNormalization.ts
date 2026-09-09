import type { SharedResourcePayload, SharedSetlistPayload } from '../types';
import { normalizeSongBars } from './workspace';

// Public links bypass the workspace loader, including nested project setlists.
export const normalizeSharedSongs = (payload: SharedResourcePayload): SharedResourcePayload => {
  const normalizeSetlist = (setlist: SharedSetlistPayload): SharedSetlistPayload => ({
    ...setlist,
    songs: setlist.songs.map((item) => ({ ...item, song: normalizeSongBars(item.song) }))
  });
  return {
    ...payload,
    song: payload.song ? { ...payload.song, song: normalizeSongBars(payload.song.song) } : undefined,
    songBundle: payload.songBundle ? {
      ...payload.songBundle,
      songs: payload.songBundle.songs.map((item) => ({ ...item, song: normalizeSongBars(item.song) }))
    } : undefined,
    setlist: payload.setlist ? normalizeSetlist(payload.setlist) : undefined,
    project: payload.project ? {
      ...payload.project,
      setlists: payload.project.setlists.map(normalizeSetlist)
    } : undefined
  };
};
