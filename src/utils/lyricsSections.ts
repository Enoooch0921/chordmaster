export const LYRICS_SECTION_NAMES = ['Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Refrain', 'Intro', 'Interlude', 'Tag', 'Outro', 'Ending'] as const;
const LEGACY_LABELS: Record<string, string> = { '○': 'Pre-Chorus', '※': 'Chorus', '◎': 'Bridge', '△': 'Refrain' };
const NAME_PATTERN = '(Verse|Pre[- ]?Chorus|Chorus|Bridge|Refrain|Intro|Interlude|Tag|Outro|Ending)';
const NAMED_LABEL = new RegExp(`^${NAME_PATTERN}(?:\\s*(\\d+))?$`, 'i');

export function lyricsSectionLabel(marker: string): string {
  const value = marker.trim().replace(/^\[(.*)\]$/, '$1');
  if (LEGACY_LABELS[value]) return LEGACY_LABELS[value];
  const verse = value.match(/^(\d+)[.。、)）]$/);
  if (verse) return `Verse ${Number(verse[1])}`;
  const named = value.match(NAMED_LABEL);
  if (!named) return value;
  const name = LYRICS_SECTION_NAMES.find(name => name.replace(/[- ]/g, '').toLowerCase() === named[1].replace(/[- ]/g, '').toLowerCase())!;
  return `${name}${named[2] ? ` ${Number(named[2])}` : ''}`;
}

/** Recognize explicit headings, not lyric sentences that happen to start with
 * words such as "Verse" or "Bridge". Bracketed custom headings are preserved. */
export function readLyricsHeading(line: string): { marker: string; rest: string } | null {
  const bracket = line.match(/^\s*\[([^\]\n]+)\]\s*(.*)$/);
  if (bracket) return { marker: lyricsSectionLabel(bracket[1]), rest: bracket[2] };
  const heading = line.trim().replace(/[:：]\s*$/, '');
  if (NAMED_LABEL.test(heading)) return { marker: lyricsSectionLabel(heading), rest: '' };
  const inline = line.match(new RegExp(`^\\s*(${NAME_PATTERN}(?:\\s*\\d+)?)\\s*[:：]\\s*(.*)$`, 'i'));
  if (inline) return { marker: lyricsSectionLabel(inline[1]), rest: inline[3] };
  const numbered = line.match(/^\s*(\d+[.。、)）])\s*(.*)$/);
  if (numbered) return { marker: lyricsSectionLabel(numbered[1]), rest: numbered[2] };
  const symbol = line.match(/^\s*([○※◎△◆●☆*])\s*(.*)$/);
  if (symbol) return { marker: lyricsSectionLabel(symbol[1]), rest: symbol[2] };
  return null;
}

export const DEFAULT_LYRICS_FONT_SIZE = 14 * 4 / 3; // 14 pt on an A4 export
export const DEFAULT_LYRICS_LINE_HEIGHT = 22 / 14; // 22 pt baseline spacing
export const LYRICS_SECTION_HEADING_HEIGHT = 22; // 18 px heading + 4 px gap
