import { memo, useCallback, type ComponentProps } from 'react';
import PersonalChordSheet from './PersonalChordSheet';
import type { Song } from '../types';

type SheetProps = ComponentProps<typeof PersonalChordSheet>;
type ElementClick = NonNullable<SheetProps['onElementClick']>;
type Props = Omit<SheetProps, 'onElementClick'> & {
  entryId: string;
  onSetlistElementClick?: (id: string, song: Song, ...args: Parameters<ElementClick>) => void;
};

/** Keep the other songs in a continuous setlist untouched by the current draft/cursor. */
export default memo(function SetlistPreviewSong({ entryId, onSetlistElementClick, ...props }: Props) {
  const onElementClick = useCallback<ElementClick>((...args) => onSetlistElementClick?.(entryId, props.song, ...args),
    [entryId, props.song, onSetlistElementClick]);
  return <PersonalChordSheet {...props} onElementClick={onSetlistElementClick ? onElementClick : undefined} />;
});
