// Parsing + helpers for the worship-lyrics formatter.
//
// A lyrics body is plain text split into sections by blank lines. The first
// line of each section may carry a marker that controls indentation:
//   - leading number (e.g. "1.", "2、", "3)") → verse, NOT indented
//   - leading non-alphanumeric symbol (○ ※ ◎ △ or anything the user types)
//     → marked section, whole block indented with the symbol hanging left
//   - otherwise → plain block, not indented
//
// Symbols are intentionally free-form: whatever the user types is shown as-is.

export type LyricSectionKind = 'verse' | 'marked' | 'plain';

export interface LyricSection {
  kind: LyricSectionKind;
  marker: string;   // e.g. "1." / "○" / "" (plain)
  indented: boolean;
  lines: string[];  // section text lines; first line has the marker stripped
}

// Verse markers: a number followed by . 、 ) or 。 and optional trailing space.
const VERSE_MARKER = /^\s*(\d+[.。、)）])\s?/;

/** Parse one lyrics body (Chinese or English) into sections. */
export function parseLyricsBody(text: string): LyricSection[] {
  if (!text || !text.trim()) return [];

  // Normalise newlines, then split into blocks on one-or-more blank lines.
  const normalised = text.replace(/\r\n?/g, '\n');
  const blocks = normalised
    .split(/\n[ \t]*\n+/)
    .map((block) => block.replace(/\s+$/g, ''))
    .filter((block) => block.trim().length > 0);

  return blocks.map((block) => {
    const rawLines = block.split('\n').map((line) => line.replace(/\s+$/g, ''));
    const firstLine = rawLines[0] ?? '';

    const verseMatch = firstLine.match(VERSE_MARKER);
    if (verseMatch) {
      const marker = verseMatch[1];
      const rest = firstLine.slice(verseMatch[0].length);
      return {
        kind: 'verse' as const,
        marker,
        indented: false,
        lines: [rest, ...rawLines.slice(1)].filter((_, i) => i > 0 || rest.length > 0),
      };
    }

    const trimmedFirst = firstLine.trimStart();
    const firstChar = [...trimmedFirst][0] ?? '';
    if (firstChar && isMarkerSymbol(firstChar)) {
      const rest = trimmedFirst.slice(firstChar.length).replace(/^\s+/, '');
      return {
        kind: 'marked' as const,
        marker: firstChar,
        indented: true,
        lines: [rest, ...rawLines.slice(1)].filter((_, i) => i > 0 || rest.length > 0),
      };
    }

    return {
      kind: 'plain' as const,
      marker: '',
      indented: false,
      lines: rawLines,
    };
  });
}

// A "marker symbol" is a single leading char that is neither a letter, a CJK
// character, nor a digit — i.e. ○ ※ ◎ △ ◆ ● ☆ * etc.
function isMarkerSymbol(ch: string): boolean {
  if (/[0-9A-Za-z]/.test(ch)) return false;
  // CJK ideographs / Hiragana / Katakana / Hangul → treat as text, not marker.
  if (/[぀-ヿ㐀-鿿가-힯＀-￯]/.test(ch)) return false;
  if (/\s/.test(ch)) return false;
  return true;
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

/** Count existing verse blocks so the number button inserts the next index. */
export function nextVerseNumber(text: string): number {
  if (!text) return 1;
  const matches = text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .filter((block) => VERSE_MARKER.test(block.trimStart()));
  return matches.length + 1;
}
