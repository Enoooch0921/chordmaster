import type { Song } from '../types';
import { updateBarById, type SongBarIdentity } from './songEditing';

export function titleWithoutReviewMarker(title: string) {
  const clean = title.replace(/\s*(?:（\s*待人工\s*）|\(\s*待人工\s*\))\s*$/u, '');
  return clean && clean !== title ? clean : null;
}

export interface ReviewPart {
  text: string;
  start: number;
  review: boolean;
}

// Some imported notes put a performance cue before or after the marked question.
export function reviewNoteParts(note: string): ReviewPart[] {
  const parts: ReviewPart[] = [];
  const markers = /(?:待檢查|待確認)[ \t]*(?:[：:]|(?=$|[\r\n]))/gu;
  const matches = Array.from(note.matchAll(markers)).filter(match =>
    /[：:]$/u.test(match[0]) || !/[\p{L}\p{N}]/u.test(note[match.index - 1] ?? ''));
  let cursor = 0;
  for (const [i, match] of matches.entries()) {
    const start = match.index;
    const body = start + match[0].length;
    const remaining = note.slice(body, matches[i + 1]?.index);
    // A semicolon may introduce a separate cue. Keep it unless the next clause
    // explicitly asks a follow-up question (common in imported review notes).
    const sentence = /^[^。！？?!；;\r\n｜|]*[。！？?!]*/u.exec(remaining)![0];
    const followUp = /^(?:[；; \t]*[^。！？?!；;\r\n｜|]+[？?]+|[；; \t]*(?:請確認|請核對)[^。！？?!；;\r\n｜|]*[。！？?!]*)/u;
    let length = sentence.length;
    for (let more = followUp.exec(remaining.slice(length)); more; more = followUp.exec(remaining.slice(length))) {
      length += more[0].length;
    }
    const end = body + remaining.slice(0, length).trimEnd().length;
    if (start > cursor) parts.push({ text: note.slice(cursor, start), start: cursor, review: false });
    parts.push({ text: note.slice(start, end), start, review: true });
    cursor = end;
  }
  if (cursor < note.length) parts.push({ text: note.slice(cursor), start: cursor, review: false });
  return parts;
}

export type SheetReviewEdit =
  | { kind: 'complete'; title: string }
  | { kind: 'remove-note'; target: SongBarIdentity; note: string; start: number };

export function applySheetReview(song: Song, edit: SheetReviewEdit): Song {
  if (edit.kind === 'complete') {
    const title = song.title === edit.title && titleWithoutReviewMarker(song.title);
    return title ? { ...song, title } : song;
  }
  return updateBarById(song, edit.target, bar => {
    if (bar.annotation !== edit.note) return bar;
    const part = reviewNoteParts(edit.note).find(piece => piece.review && piece.start === edit.start);
    if (!part) return bar;
    const before = edit.note.slice(0, part.start);
    const after = edit.note.slice(part.start + part.text.length);
    let annotation: string;
    if (!before.trim()) annotation = after.replace(/^[\s｜|；;]+/u, '');
    else if (!after.trim()) annotation = before.replace(/[\s｜|；;]+$/u, '');
    else if (/[｜|；;]\s*$/u.test(before)) annotation = before + after.replace(/^[｜|；;]\s*/u, '');
    else annotation = before + after;
    annotation = annotation.trim();
    return { ...bar, annotation: annotation || undefined };
  });
}
