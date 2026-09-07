export interface LyricsTextRow { start: number; end: number; height: number }

/** Map visual lines back to source offsets, including soft wraps. No inserted
 * newlines are written into the song, so changing typography stays lossless. */
export function measureLyricsText(element: Element | null | undefined, text: string, lineHeight: number): LyricsTextRow[] {
  let offset = 0;
  const rows: LyricsTextRow[] = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const node = element?.querySelector(`[data-line="${index}"]`)?.firstChild;
    const range = document.createRange();
    if (!line || !node || typeof range.getBoundingClientRect !== 'function') {
      rows.push({ start: offset, end: offset + line.length + (index < lines.length - 1 ? 1 : 0), height: lineHeight });
    } else {
      let start = 0;
      const topAt = (position: number) => {
        range.setStart(node, position);
        range.setEnd(node, Math.min(position + 1, line.length));
        return range.getBoundingClientRect().top;
      };
      while (start < line.length) {
        const top = topAt(start);
        let low = start + 1;
        let high = line.length;
        // Find the first character on the following visual line.
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (Math.abs(topAt(mid) - top) < 1) low = mid + 1;
          else high = mid;
        }
        let end = low;
        // Never split a surrogate pair across pages.
        if (end < line.length && /[\uDC00-\uDFFF]/.test(line[end])) end += 1;
        rows.push({ start: offset + start, end: offset + end + (end === line.length && index < lines.length - 1 ? 1 : 0), height: lineHeight });
        start = end;
      }
    }
    offset += line.length + 1;
  });
  return rows;
}
