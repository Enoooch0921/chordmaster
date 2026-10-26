import type { Setlist, SetlistSong } from '../types';

/** A copy may be saved before its unsaved source because workspace writes run in parallel. */
export const resolveSetlistCopySourceId = (entry: SetlistSong, savedSetlists: Setlist[]): string | undefined => {
  for (const candidate of [entry.id, entry.copySourceId]) {
    if (candidate && savedSetlists.some((setlist) => setlist.songs.some((saved) => (
      saved.id === candidate && saved.songId === entry.songId
    )))) return candidate;
  }
  // Fresh library additions have no custom arrangement to preserve. The server
  // creates their copy from the canonical library score instead.
  return undefined;
};
