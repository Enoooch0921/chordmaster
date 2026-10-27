import type { Song } from '../types';

export const getSongVersionText = (song: Pick<Song, 'lyricist' | 'composer'>) => (
  Array.from(new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))).join(' / ')
);

/** The combined input is a view of legacy credit fields, not a reason to migrate them. */
export function applySongVersionText<T extends Song>(song: T, value: string, original: Pick<Song, 'lyricist' | 'composer'> = song): T {
  let lyricist = original.lyricist, composer = original.composer;
  if (value.trim() !== getSongVersionText(original)) {
    const writer = original.lyricist?.trim(), music = original.composer?.trim();
    const parts = value.split(' / ');
    if (!writer && music) {
      composer = value || undefined;
    } else if (writer && music && writer === music) {
      lyricist = composer = value || undefined;
    } else if (writer && music && parts.length === 2) {
      lyricist = parts[0].trim() === writer ? original.lyricist : parts[0] || undefined;
      composer = parts[1].trim() === music ? original.composer : parts[1] || undefined;
    } else {
      lyricist = value || undefined;
      composer = undefined;
    }
  }
  return lyricist === song.lyricist && composer === song.composer ? song : { ...song, lyricist, composer };
}
