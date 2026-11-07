import { startTransition, useEffect, useState, type RefObject } from 'react';
import type { AppLanguage, SetlistSong, Song } from '../types';
import PersonalChordSheet from './PersonalChordSheet';
import RecoveryBoundary from './RecoveryBoundary';

interface Props {
  entries: readonly { item: SetlistSong; song: Song }[];
  selectedId: string;
  sheetRef: RefObject<HTMLDivElement | null>;
  language: AppLanguage;
  noteOwner?: string;
  notesOpen: boolean;
  onNotesOpenChange: (open: boolean) => void;
  lastEditedAt: (songId: string, setlistId: string, entryId: string) => number | null;
}

/** Lay out adjacent scores between turns so tapping or swiping can reveal a fitted page. */
export default function PerformanceSetlistSheets({ entries, selectedId, sheetRef, language, noteOwner,
  notesOpen, onNotesOpenChange, lastEditedAt }: Props) {
  const index = entries.findIndex(entry => entry.item.id === selectedId);
  const previous = entries[index - 1]?.item.id;
  const next = entries[index + 1]?.item.id;
  const [prepared, setPrepared] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!previous && !next) return;
    const prepare = () => startTransition(() => {
      setPrepared([previous, selectedId, next].filter(id => id !== undefined));
    });
    // Give the selected score a paint first, including on browsers without idle callbacks.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prepare, { timeout: 500 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(prepare, 100);
    return () => window.clearTimeout(timer);
  }, [selectedId, previous, next]);

  if (index < 0) return null;
  const sheets = [index - 1, index, index + 1].map(entryIndex => {
    const entry = entries[entryIndex];
    const active = entryIndex === index;
    if (!entry || (!active && !prepared.includes(entry.item.id))) return null;
    const { item, song } = entry;
    return <div key={item.id} ref={active ? sheetRef : undefined}
      data-performance-entry={item.id} inert={!active} aria-hidden={active ? undefined : true}>
      <RecoveryBoundary label="譜面預覽"><PersonalChordSheet song={song} currentKey={song.currentKey} language={language}
        lastEditedAt={lastEditedAt(item.songId, item.setlistId, item.id)} setlistSongNumber={entryIndex + 1} previewIdentity={item.id}
        noteOwner={noteOwner} noteSongId={item.songId} notesPerformance notesActive={active}
        notesOpen={notesOpen} onNotesOpenChange={onNotesOpenChange} /></RecoveryBoundary>
    </div>;
  });
  return <div className="grid">{sheets}</div>;
}
