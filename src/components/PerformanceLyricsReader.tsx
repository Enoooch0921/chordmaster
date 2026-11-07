import React from 'react';
import AdaptiveLyricsReader, { type LyricsReaderHandle } from './AdaptiveLyricsReader';
import type { LyricsBookEntry } from './LyricsBook';
import type { AppLanguage } from '../types';
import type { ReadingAnchor } from '../utils/lyricsReading';
import { useLyricsReadingPreferences } from '../hooks/useLyricsReadingPreferences';

/** Uses the same screen layout as ordinary reading; A4 export is independent. */
const PerformanceLyricsReader = React.forwardRef<LyricsReaderHandle, {
  entries: LyricsBookEntry[]; selectedId: string | null; onSelectSong: (id: string) => void;
  language: AppLanguage; preferenceKey: string;
}>(function PerformanceLyricsReader({ entries, selectedId, onSelectSong, language, preferenceKey }, ref) {
  const [settings] = useLyricsReadingPreferences(preferenceKey);
  const anchors = React.useRef(new Map<string, ReadingAnchor | 'last'>());
  const index = Math.max(0, entries.findIndex(entry => entry.id === selectedId));
  const current = entries[index];
  const select = (next: number, last = false) => {
    const id = entries[next].id;
    anchors.current.delete(id);
    if (last) anchors.current.set(id, 'last');
    onSelectSong(id);
  };
  if (!current) return null;
  return <AdaptiveLyricsReader ref={ref} key={current.id} identity={current.id} song={current.song} number={entries.length > 1 ? index + 1 : undefined}
    language={language} settings={settings} keyboard={false} gestures={false} initialAnchor={anchors.current.get(current.id)}
    onAnchorChange={anchor => anchors.current.set(current.id, anchor)}
    onNextSong={index < entries.length - 1 ? () => select(index + 1) : undefined}
    onPreviousSong={index > 0 ? () => select(index - 1, true) : undefined}/>;
});
export default PerformanceLyricsReader;
