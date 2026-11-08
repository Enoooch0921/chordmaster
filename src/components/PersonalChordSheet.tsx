import { memo, useRef, type ComponentProps } from 'react';
import ChordSheet from './ChordSheet';
import PersonalNotes, { type PersonalNotesOptions } from './PersonalNotes';
const MemoChordSheet = memo(ChordSheet);

type Props = ComponentProps<typeof ChordSheet> & PersonalNotesOptions;
export default function PersonalChordSheet(props: Props) {
  const { noteOwner, noteSongId, notesActive, notesPerformance, notesOpen, onNotesOpenChange, ...sheetProps } = props;
  const root = useRef<HTMLDivElement>(null);
  if (!noteOwner || !noteSongId) return <ChordSheet {...sheetProps} />;
  return <>
    <div ref={root} className="personal-notes-sheet" data-personal-notes-owner={noteOwner}>
      <MemoChordSheet {...sheetProps} />
    </div>
    {/* Prepared stage neighbors keep their ink and measured anchors mounted. */}
    <PersonalNotes key={JSON.stringify([noteOwner, noteSongId])}
      root={root} noteOwner={noteOwner} noteSongId={noteSongId} language={sheetProps.language}
      notesActive={notesActive} notesPerformance={notesPerformance} notesOpen={notesOpen} onNotesOpenChange={onNotesOpenChange} />
  </>;
}
