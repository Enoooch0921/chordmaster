import { useId, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { AppLanguage, StoredSong } from '../types';
import { getSongLibraryIdentity } from '../lib/songLibraryPresentation';
import { AnimatedDisclosure } from './ui/InteractionMotion';

export default function LibrarySelectionSummary({ songs, language, onRemove, onClear }: {
  songs: StoredSong[]; language: AppLanguage; onRemove: (id: string) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false), id = useId(), zh = language === 'zh';
  return <div className="song-library-selection">
    <div className="song-library-bulk-heading">
      <button type="button" className="song-library-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {zh ? `已選 ${songs.length} 首` : `${songs.length} selected`}<ChevronDown size={14} className={`ui-motion-chevron ${open ? 'rotate-180' : ''}`} />
      </button>
      <button type="button" className="song-library-button is-muted" disabled={!songs.length} onClick={onClear}>{zh ? '清除全部選取' : 'Clear selection'}</button>
    </div>
    <AnimatedDisclosure open={open}><div id={id} role="region" aria-label={zh ? '已選歌曲' : 'Selected songs'} className="song-library-selection-list">
      {!songs.length && <p>{zh ? '尚未選取歌曲' : 'No songs selected'}</p>}
      <ul>{songs.map(song => {
        const identity = getSongLibraryIdentity(song, language);
        return <li key={song.id}><div><strong>{song.title}</strong><span>{identity.authors} · {identity.version}</span></div>
          <button type="button" aria-label={zh ? `取消選取：${song.title}` : `Deselect: ${song.title}`} onClick={() => onRemove(song.id)}><X size={16}/></button>
        </li>;
      })}</ul>
    </div></AnimatedDisclosure>
  </div>;
}
