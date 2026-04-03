/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const hasVisibleChordTokens = (chords?: string[] | null) => (
  Array.isArray(chords) && chords.some((chord) => chord.trim() !== '')
);

export const hasMeaningfulChordContent = (chords?: string[] | null) => (
  Array.isArray(chords) && chords.some((chord) => {
    const normalized = chord.trim();
    return normalized !== '' && normalized !== '/';
  })
);

export const normalizeBarChords = (chords?: string[] | null) => (
  hasVisibleChordTokens(chords) ? [...(chords ?? [])] : []
);
