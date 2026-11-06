import { memo, useId, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { AppLanguage } from '../types';
import { EMPTY_LIBRARY_FILTERS, libraryFilterCount, libraryFilterError, type LibraryFilters, type LibraryScope } from '../lib/songLibraryFilters';
import { MIN_TEMPO_BPM, MAX_TEMPO_BPM } from '../utils/tempoUtils';

interface Props {
  language: AppLanguage; scope: LibraryScope; onScopeChange: (scope: LibraryScope) => void;
  filters: LibraryFilters; onChange: (filters: LibraryFilters) => void; keys: string[]; meters: string[];
}
export default memo(function SongLibraryFilters({ language, scope, onScopeChange, filters, onChange, keys, meters }: Props) {
  const zh = language === 'zh', [open, setOpen] = useState(false), id = useId();
  const count = libraryFilterCount(filters), error = libraryFilterError(filters);
  const field = (name: keyof LibraryFilters, value: string) => onChange({ ...filters, [name]: value });
  return <>
    <div className="song-library-browse">
      <div role="group" aria-label={zh ? '歌曲範圍' : 'Song scope'} className="song-library-scopes">
        {(['all', 'recent', 'favorites'] as const).map(value => <button key={value} type="button" aria-pressed={scope === value} onClick={() => onScopeChange(value)}>
          {{ all: zh ? '全部' : 'All', recent: zh ? '最近使用' : 'Recent', favorites: zh ? '收藏' : 'Favorites' }[value]}
        </button>)}
      </div>
      <button type="button" className="song-library-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <SlidersHorizontal size={15} /><span>{zh ? '篩選' : 'Filters'}{count ? ` (${count})` : ''}</span><ChevronDown size={13} className={open ? 'rotate-180' : ''} />
      </button>
    </div>
    {open && <div className="song-library-filters" id={id} role="region" aria-label={zh ? '歌曲篩選' : 'Song filters'}>
      <label>Key<select value={filters.key} onChange={event => field('key', event.target.value)}><option value="">{zh ? '所有調性' : 'All keys'}</option>{keys.map(key => <option key={key}>{key}</option>)}</select></label>
      <label>{zh ? '拍號' : 'Meter'}<select value={filters.meter} onChange={event => field('meter', event.target.value)}><option value="">{zh ? '所有拍號' : 'All meters'}</option>{meters.map(meter => <option key={meter}>{meter}</option>)}</select></label>
      <label>{zh ? '最低 BPM' : 'Minimum BPM'}<input type="number" inputMode="decimal" min={MIN_TEMPO_BPM} max={MAX_TEMPO_BPM} step="any" value={filters.minBpm} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} placeholder="20" onChange={event => field('minBpm', event.target.value)} /></label>
      <label>{zh ? '最高 BPM' : 'Maximum BPM'}<input type="number" inputMode="decimal" min={MIN_TEMPO_BPM} max={MAX_TEMPO_BPM} step="any" value={filters.maxBpm} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} placeholder="400" onChange={event => field('maxBpm', event.target.value)} /></label>
      {error && <p id={`${id}-error`} role="status">{error === 'range' ? (zh ? '最低 BPM 不可高於最高 BPM。' : 'Minimum BPM must not exceed maximum BPM.') : (zh ? 'BPM 請輸入 20–400。' : 'Enter a BPM from 20–400.')}</p>}
      <button type="button" className="song-library-button" disabled={!count} onClick={() => onChange(EMPTY_LIBRARY_FILTERS)}>{zh ? '清除篩選' : 'Clear filters'}</button>
    </div>}
  </>;
});
