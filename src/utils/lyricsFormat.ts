import { readLyricsHeading } from './lyricsSections';

// Parse editable English section headings while accepting legacy numeric and
// symbol markers from existing lyrics documents.

export type LyricSectionKind = 'verse' | 'marked' | 'plain';

export interface LyricSection {
  kind: LyricSectionKind;
  marker: string;   // e.g. "Verse 1" / "Chorus" / "" (plain)
  indented: boolean;
  lines: string[];  // section text lines; first line has the marker stripped
}

/** Parse headings and old symbols, with or without blank lines between them. */
export function parseLyricsBody(text: string): LyricSection[] {
  const sections: LyricSection[] = [];
  let current: LyricSection | null = null;
  const finish = () => {
    if (current && (current.marker || current.lines.length)) sections.push(current);
    current = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      // A blank line after a heading must not detach it from its lyrics.
      if (current?.lines.length) finish();
      continue;
    }
    const heading = readLyricsHeading(line);
    if (heading) {
      if (current?.lines.length || (current?.marker && current.marker !== heading.marker)) finish();
      current = { kind: /^Verse(?: |$)/.test(heading.marker) ? 'verse' : 'marked', marker: heading.marker, indented: false, lines: heading.rest ? [heading.rest] : [] };
    } else {
      current ??= { kind: 'plain', marker: '', indented: false, lines: [] };
      current.lines.push(line);
    }
  }
  finish();
  return sections;
}

export interface PairedSection {
  en?: LyricSection;
  zh?: LyricSection;
}

/** Pair English and Chinese sections by index for the bilingual layout. */
export function pairSections(en: LyricSection[], zh: LyricSection[]): PairedSection[] {
  const length = Math.max(en.length, zh.length);
  const pairs: PairedSection[] = [];
  for (let i = 0; i < length; i += 1) {
    pairs.push({ en: en[i], zh: zh[i] });
  }
  return pairs;
}

// Keyword → symbol map for the textarea auto-convert. `verse` resolves to the
// next sequential number, so it is handled separately by the editor.
export const LYRIC_KEYWORD_SYMBOLS: Record<string, string> = {
  pre: '○',
  prechorus: '○',
  chorus: '※',
  bridge: '◎',
  refrain: '△',
};

export const LYRIC_VERSE_KEYWORDS = new Set(['verse', 'v']);

// Quick-insert symbols offered as buttons above the textareas. Section names
// stay in English (Verse / Pre-Chorus / Chorus / Bridge / Refrain) rather than
// being translated, matching how worship charts are typically labelled.
export const LYRIC_QUICK_SYMBOLS: Array<{ symbol: string; label: string }> = [
  { symbol: '○', label: 'Pre-Chorus' },
  { symbol: '※', label: 'Chorus' },
  { symbol: '◎', label: 'Bridge' },
  { symbol: '△', label: 'Refrain' },
];

/** Find the next free verse number, including named headings. */
export function nextVerseNumber(text: string): number {
  return Math.max(0, ...parseLyricsBody(text).map(section => Number(section.marker.match(/^Verse (\d+)$/)?.[1]) || 0)) + 1;
}
