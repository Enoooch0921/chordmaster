import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownWideNarrow, ChevronLeft, Search, X } from 'lucide-react';

interface Props {
  title: string;
  isRoot: boolean;
  backLabel: string;
  onBack: () => void;
  searchLabel: string;
  closeSearchLabel: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortLabel: string;
  sortMode: string;
  sortOptions: Array<{ value: string; label: string }>;
  onSortChange: (value: string) => void;
  countLabel: string | null;
  newAction?: ReactNode;
  projectAction?: ReactNode;
  contextAction?: ReactNode;
  archiveAction?: ReactNode;
}

const isSearchTarget = (target: EventTarget | null, ...elements: Array<HTMLElement | null>) =>
  target instanceof Node && elements.some(element => element?.contains(target));

export default function SetlistBrowserHeader({
  title, isRoot, backLabel, onBack, searchLabel, closeSearchLabel, searchQuery,
  onSearchChange, sortLabel, sortMode, sortOptions, onSortChange, countLabel,
  newAction, projectAction, contextAction, archiveAction
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchVisible = searchOpen || Boolean(searchQuery);
  const input = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchRow = useRef<HTMLDivElement>(null);
  const outsidePress = useRef(false);
  const searchId = useId();

  useLayoutEffect(() => {
    if (searchOpen) input.current?.focus({ preventScroll: true });
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim()) return;
    let releaseFrame = 0;
    const collapse = () => {
      onSearchChange('');
      setSearchOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      outsidePress.current = !isSearchTarget(event.target, searchTrigger.current, searchRow.current);
    };
    const onOutsideClick = (event: MouseEvent) => {
      outsidePress.current = false;
      if (isSearchTarget(event.target, searchTrigger.current, searchRow.current)) return;
      collapse();
    };
    const onPointerEnd = () => {
      outsidePress.current = false;
      window.cancelAnimationFrame(releaseFrame);
      // Let the release and click finish before a disappearing search row moves the list.
      releaseFrame = window.requestAnimationFrame(() => {
        if (!isSearchTarget(document.activeElement, searchTrigger.current, searchRow.current)) collapse();
      });
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);
    return () => {
      outsidePress.current = false;
      window.cancelAnimationFrame(releaseFrame);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onOutsideClick);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
    };
  }, [searchOpen, searchQuery, onSearchChange]);

  const closeSearch = () => {
    onSearchChange('');
    setSearchOpen(false);
    searchTrigger.current?.focus({ preventScroll: true });
  };
  const sortPicker = <select value={sortMode} onChange={event => onSortChange(event.target.value)}
    aria-label={sortLabel} className="setlist-browser-sort-select">
    {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
  const searchField = <div ref={searchRow} className="setlist-browser-search-row">
    <label className="setlist-browser-search">
      <Search size={16} aria-hidden="true"/>
      <input ref={input} id={searchId} type="search" value={searchQuery}
        onFocus={() => setSearchOpen(true)}
        onChange={event => onSearchChange(event.target.value)}
        placeholder={searchLabel} aria-label={searchLabel}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); closeSearch();
          }
        }}/>
    </label>
    <button type="button" className="setlist-browser-icon" aria-label={closeSearchLabel}
      onClick={closeSearch}><X size={18}/></button>
  </div>;
  const searchButton = <button ref={searchTrigger} type="button" className="setlist-browser-icon"
    aria-label={searchLabel} title={searchLabel} aria-expanded={searchVisible}
    aria-controls={searchVisible ? searchId : undefined}
    onClick={() => searchVisible ? closeSearch() : setSearchOpen(true)}><Search size={18}/></button>;

  return <div className="setlist-browser-header" data-setlist-browser-header
    onBlur={event => {
      if (outsidePress.current || searchQuery.trim() || isSearchTarget(event.relatedTarget, searchTrigger.current, searchRow.current)) return;
      onSearchChange('');
      setSearchOpen(false);
    }}
    data-project-header={isRoot ? undefined : true} data-root-header={isRoot ? true : undefined}>
    <div className="setlist-browser-title">
      {!isRoot && <button type="button" className="setlist-browser-back setlist-browser-icon"
        aria-label={backLabel} title={backLabel} onClick={onBack}><ChevronLeft size={20}/></button>}
      <h2 tabIndex={-1}>{title}</h2>
      {isRoot && newAction}
      {isRoot && searchButton}
      {projectAction}
    </div>
    {isRoot ? <>
      {searchVisible && searchField}
      {countLabel && <div className="setlist-browser-options"><span>{countLabel}</span>{sortPicker}</div>}
    </> : <>
      <div className="setlist-project-toolbar">
        <div className="setlist-project-context">
          <span className="setlist-browser-count">{countLabel}</span>
          {contextAction}
        </div>
        <div className="setlist-project-tools">
          {newAction}
          {searchButton}
          <span className="setlist-browser-sort" title={`${sortLabel}：${sortOptions.find(option => option.value === sortMode)?.label ?? ''}`}>
            <ArrowDownWideNarrow size={18} aria-hidden="true"/>{sortPicker}
          </span>
        </div>
      </div>
      {searchVisible && searchField}
    </>}
    {archiveAction}
  </div>;
}
