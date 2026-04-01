/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Key = 'C' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'Gb' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';
export type NashvilleFontPreset =
  | 'ibm-plex-serif'
  | 'source-serif-4'
  | 'atkinson-hyperlegible-next'
  | 'source-sans-3';

export interface Bar {
  id?: string; // Unique ID for bar animations and drag operations
  chords: string[]; // e.g., ["E", "C#m"]
  timeSignature?: string; // Per-bar override, e.g., "2/4"
  riff?: string;    // e.g., "3 - 4 - 5 - 7 1"
  rhythm?: string;  // e.g., "q e e qr"
  riffLabel?: string; // e.g., "Riff", "Pno", "EG"
  rhythmLabel?: string; // e.g., "Dr", "Rhythm", "Clap"
  annotation?: string; // e.g., "Kick In", "8 beat build"
  repeatStart?: boolean; // |:
  repeatEnd?: boolean;   // :|
  finalBar?: boolean;    // ending double barline
  ending?: 1 | 2 | 3 | 4;        // 1. to 4. bracket
}

export interface Section {
  id?: string; // Unique ID for reordering
  title: string; // e.g., "Intro", "Verse 1"
  bars: Bar[];
}

export interface Song {
  title: string;
  lyricist?: string;
  composer?: string;
  translator?: string;
  groove?: string;
  shuffle?: boolean;
  originalKey: Key;
  currentKey: Key;
  tempo: number;
  timeSignature: string; // e.g., "4/4"
  useSectionColors?: boolean;
  showNashvilleNumbers?: boolean;
  nashvilleFontPreset?: NashvilleFontPreset;
  capo?: number;
  sections: Section[];
}
