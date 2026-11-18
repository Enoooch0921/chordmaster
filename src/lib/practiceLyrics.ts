import { expandSongMapSectionLabel, songMapDisplayParts, songMapLabel } from './songMap';

export interface PracticeReaderState {
  label: string;
  visit?: number;
  labels: readonly string[];
  select: (label: string) => void;
}

export function practiceLyricIds(sections: readonly { id: string; label: string }[], label?: string) {
  if (!label) return [];
  const canonical = songMapLabel(label);
  const names = [canonical.name];
  if (songMapDisplayParts(label).cue) {
    const base = songMapLabel(canonical.code).name;
    const ordinal = /\b(\d+)(?:st|nd|rd|th)\s+/i.exec(label);
    if (ordinal) names.push(base + ' ' + ordinal[1]);
    names.push(base);
  }
  if (/ \d+$/.test(canonical.name)) names.push(canonical.name.replace(/ \d+$/, ''));
  if (canonical.name === 'Verse') names.push('Verse 1');
  for (const name of names) {
    const matches = sections.filter(s => expandSongMapSectionLabel(s.label).some(alias => alias.toLowerCase() === name.toLowerCase()));
    if (matches.length) return matches.length === 1 ? [matches[0].id] : [];
  }
  // A full chorus can have several numbered lyric blocks and no timed split.
  if (names.includes('Chorus')) return sections.filter(s => /^Chorus \d+$/.test(songMapLabel(s.label).name)).map(s => s.id);
  return [];
}
