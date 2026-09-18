import type { Song } from '../types';

export const CURRENT_CHORD_TIMING_VERSION = 2 as const;

/** Run after structural normalization, at data ingestion (never on each edit).
 * Swap only chord suffixes to preserve the arrows drawn by legacy clients.
 * The song-level version survives backups, setlist copies and cloud storage.
 */
export const migrateChordTimingArrows = <T extends Song>(song: T): T => {
  if (song.chordTimingVersion === CURRENT_CHORD_TIMING_VERSION) return song;
  return {
    ...song,
    chordTimingVersion: CURRENT_CHORD_TIMING_VERSION,
    sections: song.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => ({
        ...bar,
        chords: bar.chords.map((chord) => chord.replace(/[<>^~]+$/, (suffix) => (
          suffix.replace(/[<>]/g, (marker) => marker === '<' ? '>' : '<')
        )))
      }))
    }))
  };
};
