/** Hide punctuation while preserving the author's hard breaks and whitespace.
 * Offsets let an inline edit update only its source range, even after marks are
 * omitted from the displayed text. English apostrophes remain part of words. */
export function formatLyricsForDisplay(source: string): { text: string; offsets: number[] } {
  const output: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < source.length; i++) {
    let char = source[i];
    if (/[「」『』“”‘’《》〈〉（）()\[\]…～~]/.test(char)) {
      // A curly apostrophe inside an English word is grammatical, not a pause.
      if (char !== '’' || !/[A-Za-z]/.test(source[i - 1] ?? '') || !/[A-Za-z]/.test(source[i + 1] ?? '')) continue;
    }
    if (/[，。！？；、,.;:!?：]/.test(char)) {
      // Retain a word boundary where a mark separated words, but never insert
      // a line break. CSS decides whether a space needs to wrap at this width.
      if (!output.length || /\s/.test(output.at(-1)!) || !source[i + 1] || /\s/.test(source[i + 1])) continue;
      char = ' ';
    }
    if (char === '\r') {
      if (source[i + 1] === '\n') continue;
      char = '\n';
    }
    output.push(char);
    offsets.push(i);
  }
  if (offsets.length) offsets[0] = 0;
  offsets.push(source.length);
  return { text: output.join(''), offsets };
}
