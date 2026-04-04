/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Key = 'C' | 'C#' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'Gb' | 'G' | 'G#' | 'Ab' | 'A' | 'Bb' | 'B';
export type AppLanguage = 'en' | 'zh';
export type BarNumberMode = 'none' | 'line-start' | 'all';
export type NavigationMarker = 'segno' | 'coda' | 'ds' | 'dc' | 'fine' | 'ds-al-coda' | 'ds-al-fine';
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
  label?: string; // Shared lane label, e.g. "Pno", "Dr", "EG"
  riffLabel?: string; // e.g., "Riff", "Pno", "EG"
  rhythmLabel?: string; // e.g., "Dr", "Rhythm", "Clap"
  annotation?: string; // e.g., "Kick In", "8 beat build"
  leftMarker?: NavigationMarker; // e.g., segno at bar start
  rightMarker?: NavigationMarker; // e.g., coda, D.S., D.C., Fine, or D.S. al Coda at bar end
  leftText?: string; // e.g., "Vocal only"
  rightText?: string; // e.g., "D.S. al Coda"
  repeatStart?: boolean; // |:
  repeatEnd?: boolean;   // :|
  finalBar?: boolean;    // ending double barline
  ending?: string; // e.g. "1", "2", or "1,2"
}

export interface Section {
  id?: string; // Unique ID for reordering
  title: string; // e.g., "Intro", "Verse 1"
  keyChangeTo?: Key;
  bars: Bar[];
}

export interface PickupMeasure {
  id?: string;
  riff?: string;
  rhythm?: string;
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
  tempo?: number;
  timeSignature: string; // e.g., "4/4"
  useSectionColors?: boolean;
  showNashvilleNumbers?: boolean;
  showAbsoluteJianpu?: boolean;
  barNumberMode?: BarNumberMode;
  nashvilleFontPreset?: NashvilleFontPreset;
  capo?: number;
  pickup?: PickupMeasure;
  sections: Section[];
}
