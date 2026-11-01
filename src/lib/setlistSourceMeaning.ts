import type { Bar, Key, Song } from '../types';
import { normalizeSongBars } from './workspace';
import { getSongKeyStates, getSongTimeSignatureStates } from './songEditing';
import { getChordEvents } from '../utils/chordSubdivisions';
import { parseNashvilleToChord } from '../utils/musicUtils';
import { hasUnmeteredChords } from '../utils/unmeteredChords';

export const SOURCE_SCORE_FIELDS = [
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

// Read-only comparison data. Never use this representation as a saved score,
// a server authorization decision, or an optimistic-concurrency token.
export const normalizeSourceChordNotation = (song: Song) => {
  const keys = getSongKeyStates(song), meters = getSongTimeSignatureStates(song);
  let knownKey = !song.originalKeyUnspecified;
  const harmony = (bar: Bar, key: Key, beats: number, resolveDegrees: boolean) => {
    const chord = (value: string) => resolveDegrees ? parseNashvilleToChord(value.trim(), key) : value.trim();
    const positions = (candidate: Bar) => {
      const events = !candidate.chordTimingUnspecified && !hasUnmeteredChords(candidate) && candidate.chords.length <= beats
        ? getChordEvents(candidate, beats).filter(event => event.subdivisionIndex === null) : null;
      // Malformed overlaps/full-bar symbols must not hide stored chord data.
      return events && events.length === candidate.chords.filter(value => value.trim()).length
        ? events.map(({ beat, offset, chord: value }) => ({ beat, offset, chord: chord(value) }))
        : candidate.chords.map(chord);
    };
    return {
      ...bar,
      chords: positions(bar),
      ...(bar.chordSubdivisions ? { chordSubdivisions: bar.chordSubdivisions.map(event => ({ ...event, chord: chord(event.chord) })) } : {}),
      ...(bar.unmeteredChordLines ? { unmeteredChordLines: bar.unmeteredChordLines.map(line => line.map(chord)) } : {}),
      ...(bar.chordPassVariants ? { chordPassVariants: bar.chordPassVariants.map(variant => {
        const pass = { ...bar, chords: variant.chords, chordMarks: undefined, chordSubdivisions: variant.chordSubdivisions };
        return { ...variant,
          chords: positions(pass),
          ...(variant.chordSubdivisions ? { chordSubdivisions: variant.chordSubdivisions.map(event => ({ ...event, chord: chord(event.chord) })) } : {})
        };
      }) } : {})
    };
  };
  return { ...song, sections: song.sections.map((section, sIdx) => {
    if (section.keyChangeTo) knownKey = true;
    return { ...section, bars: section.bars.map((bar, bIdx) => {
      if (bar.keyChangeTo) knownKey = true;
      const key = keys.barActiveKeys[sIdx]?.[bIdx] ?? song.originalKey;
      const meter = meters.barActiveTimeSignatures[sIdx]?.[bIdx] ?? song.timeSignature;
      const beats = Math.max(1, Number.parseInt(meter.split('/')[0], 10) || 4);
      return harmony(bar, key, beats, knownKey && !bar.chordKeyUnspecified);
    }) };
  }) };
};

export const sourceScoreMeaningSignature = (song: Song | undefined): string => {
  if (!song) return 'null';
  const normalized = normalizeSourceChordNotation(normalizeSongBars(song));
  const score = Object.fromEntries(SOURCE_SCORE_FIELDS.map(field => [field, normalized[field]]));
  if (normalized.lyricsDoc) {
    const { displayLanguage, fontSize, lineHeight, ...content } = normalized.lyricsDoc;
    score.lyricsDoc = { ...content, translationLanguage: content.translationLanguage || 'en' };
  }
  return JSON.stringify(canonical(score));
};
