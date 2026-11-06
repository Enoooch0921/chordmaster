import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { AppLanguage } from '../types';

const PAGE_SIZE = 60;

/** Bound mount work while keeping searching and bulk selection across the full result set. */
export default function SongLibraryResults<T extends { id: string }>({ items, queryKey, language, renderRow, children }: {
  items: readonly T[];
  queryKey: string;
  language: AppLanguage;
  renderRow: (item: T) => ReactNode;
  children?: ReactNode;
}) {
  const [location, setLocation] = useState({ queryKey, page: 0 });
  const scroll = useRef<HTMLDivElement>(null);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = location.queryKey === queryKey ? Math.min(location.page, pages - 1) : 0;
  // Reset the remembered page as well, so A -> B -> A never resurrects A's old page.
  if (location.queryKey !== queryKey || location.page !== page) setLocation({ queryKey, page });
  useLayoutEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [page, queryKey]);
  const from = page * PAGE_SIZE;
  return <>
    <div ref={scroll} className="song-library-scroll" data-library-scroll>
      {children}
      {items.slice(from, from + PAGE_SIZE).map(renderRow)}
    </div>
    {pages > 1 && <nav className="song-library-pagination" aria-label={language === 'zh' ? '歌曲結果分頁' : 'Song result pages'}>
      <button type="button" className="song-library-button" disabled={page === 0} onClick={() => setLocation({ queryKey, page: page - 1 })}>{language === 'zh' ? '上一頁' : 'Previous'}</button>
      <span role="status" aria-live="polite">{from + 1}–{Math.min(items.length, from + PAGE_SIZE)} / {items.length}</span>
      <button type="button" className="song-library-button" disabled={page === pages - 1} onClick={() => setLocation({ queryKey, page: page + 1 })}>{language === 'zh' ? '下一頁' : 'Next'}</button>
    </nav>}
  </>;
}
