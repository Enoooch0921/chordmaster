import { BookOpen, Info, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import SlidingSelection from './ui/SlidingSelection';

interface Props {
  logoSrc: string;
  songsLabel: string;
  setlistsLabel: string;
  aboutLabel: string;
  helpLabel: string;
  doneLabel: string;
  moreLabel: string;
  active: 'songs' | 'setlists' | null;
  onSongs: () => void;
  onSetlists: () => void;
  onAbout: () => void;
  onHelp: () => void;
  onClose: () => void;
}

export default function MobileSidebarNavigation(props: Props) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const lastTab = useRef(props.active ?? 'songs');
  if (props.active) lastTab.current = props.active;
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const tabClass = (active: boolean) => `ui-press relative flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-sm font-bold transition-colors ${active
    ? 'text-white'
    : 'text-gray-600 hover:bg-gray-100 dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface-raised)]'}`;

  return (
    <div data-mobile-sidebar-navigation className="relative z-20 flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-[color:var(--color-border)]">
      <img src={props.logoSrc} alt="ChordMaster" className="h-7 w-7 shrink-0 rounded-lg" />
      <nav aria-label="ChordMaster" className="relative flex min-w-0 flex-1 gap-1 rounded-xl bg-gray-50 p-1 dark:bg-[color:var(--color-surface-sunken)]">
        <SlidingSelection index={lastTab.current === 'setlists' ? 1 : 0} count={2} inset={4} gap={4}
          visible={props.active !== null} className="bg-indigo-600 shadow-sm" style={{ borderRadius: 8 }}/>
        <button type="button" onClick={props.onSongs} aria-pressed={props.active === 'songs'} className={tabClass(props.active === 'songs')}>
          {props.songsLabel}
        </button>
        <button type="button" onClick={props.onSetlists} aria-pressed={props.active === 'setlists'} className={tabClass(props.active === 'setlists')}>
          {props.setlistsLabel}
        </button>
      </nav>
      <details
        ref={menuRef}
        className="relative shrink-0"
        onBlur={(event) => {
          // Safari touch taps can blur the summary with a null relatedTarget
          // before dispatching the menu item's click. Outside taps are handled
          // by pointerdown; only a known keyboard focus destination closes here.
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}
      >
        <summary aria-label={props.moreLabel} title={props.moreLabel} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
          <MoreHorizontal size={20} />
        </summary>
        <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface-raised)]">
          <button type="button" onClick={() => { props.onAbout(); if (menuRef.current) menuRef.current.open = false; }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-[color:var(--color-text)] dark:hover:bg-[color:var(--color-surface)]">
            <Info size={16} />{props.aboutLabel}
          </button>
          <button type="button" onClick={() => { props.onHelp(); if (menuRef.current) menuRef.current.open = false; }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-[color:var(--color-text)] dark:hover:bg-[color:var(--color-surface)]">
            <BookOpen size={16} />{props.helpLabel}
          </button>
        </div>
      </details>
      <button type="button" onClick={props.onClose} className="flex h-11 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950">
        {props.doneLabel}
      </button>
    </div>
  );
}
