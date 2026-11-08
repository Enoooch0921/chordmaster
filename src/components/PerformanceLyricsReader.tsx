import React from 'react';
import type { PersonalNotesOptions } from './PersonalNotes';
import AdaptiveLyricsReader, { type LyricsReaderHandle } from './AdaptiveLyricsReader';
import type { LyricsBookEntry } from './LyricsBook';
import type { AppLanguage } from '../types';
import type { ReadingAnchor } from '../utils/lyricsReading';
import { useLyricsReadingPreferences, useSongReadingSize } from '../hooks/useLyricsReadingPreferences';

/** Uses the same screen layout as ordinary reading; A4 export is independent. */
const PerformanceLyricsReader = React.forwardRef<LyricsReaderHandle, PersonalNotesOptions & {
  entries: LyricsBookEntry[]; selectedId: string | null; onSelectSong: (id: string) => void;
  language: AppLanguage; preferenceKey: string;
}>(function PerformanceLyricsReader({ entries, selectedId, onSelectSong, language, preferenceKey, ...notes }, ref) {
  const [defaults] = useLyricsReadingPreferences(preferenceKey);
  const anchors = React.useRef(new Map<string, ReadingAnchor | 'last'>());
  const index = Math.max(0, entries.findIndex(entry => entry.id === selectedId));
  const current = entries[index];
  const [fontSize, setFontSize] = useSongReadingSize(preferenceKey, current?.sourceSongId ?? current?.id, defaults.fontSize);
  const select = (next: number, last = false) => {
    const id = entries[next].id;
    anchors.current.delete(id);
    if (last) anchors.current.set(id, 'last');
    onSelectSong(id);
  };
  if (!current) return null;
  return <AdaptiveLyricsReader {...notes} noteSongId={current.sourceSongId ?? current.id} notesPerformance ref={ref} key={current.id} identity={current.id} song={current.song} number={entries.length > 1 ? index + 1 : undefined}
    language={language} settings={{ ...defaults, fontSize }} onSizeChange={setFontSize} keyboard={false} gestures={Boolean(notes.notesOpen)} initialAnchor={anchors.current.get(current.id)}
    onAnchorChange={anchor => anchors.current.set(current.id, anchor)}
    onNextSong={index < entries.length - 1 ? () => select(index + 1) : undefined}
    onPreviousSong={index > 0 ? () => select(index - 1, true) : undefined}/>;
});
export default PerformanceLyricsReader;
