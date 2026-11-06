import { BookOpen, Info, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatedPopover } from './ui/InteractionMotion';
import { useAnchoredPortalPanel } from './useAnchoredPortalPanel';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const instantExit = useRef(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { panelStyle, isPositioned, transformOrigin } = useAnchoredPortalPanel({
    isOpen: menuOpen, align: 'right', triggerRef: menuButton, panelRef: panel, onRequestClose: closeMenu,
  });
  useEffect(() => {
    if (!menuOpen) return;
    // WebKit pointer taps need not focus the trigger. Escape still closes only this menu.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      instantExit.current = true;
      setMenuOpen(false); menuButton.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen || document.documentElement.dataset.uiInput !== 'keyboard') return;
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('button')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [menuOpen]);
  const lastTab = useRef(props.active ?? 'songs');
  if (props.active) lastTab.current = props.active;
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (event.target instanceof Node && !menu?.contains(event.target) && !panel.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const tabClass = (active: boolean) => `ui-press touch-manipulation relative flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-sm font-bold whitespace-nowrap transition-colors ${active
    ? 'text-white'
    : 'text-gray-600 hover:bg-gray-100 dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface-raised)]'}`;

  return (
    <div data-mobile-sidebar-navigation className="mobile-sidebar-navigation relative z-20 shrink-0 border-b border-gray-200 px-3 py-2 dark:border-[color:var(--color-border)]">
      <div className="mobile-sidebar-layout">
      <img src={props.logoSrc} alt="ChordMaster" className="h-7 w-7 shrink-0 rounded-lg" />
      <nav aria-label="ChordMaster" className="relative flex min-w-0 flex-1 gap-1 rounded-xl bg-gray-50 p-1 dark:bg-[color:var(--color-surface-sunken)]">
        <SlidingSelection index={lastTab.current === 'setlists' ? 1 : 0} count={2} inset="0.25rem" gap="0.25rem"
          visible={props.active !== null} className="bg-indigo-600 shadow-sm" style={{ borderRadius: 8 }}/>
        <button type="button" onClick={props.onSongs} aria-pressed={props.active === 'songs'} className={tabClass(props.active === 'songs')}>
          {props.songsLabel}
        </button>
        <button type="button" onClick={props.onSetlists} aria-pressed={props.active === 'setlists'} className={tabClass(props.active === 'setlists')}>
          {props.setlistsLabel}
        </button>
      </nav>
      <div
        ref={menuRef}
        className="relative shrink-0"
        onBlur={(event) => {
          // Safari touch taps can blur the trigger with a null relatedTarget
          // before dispatching the menu item's click. Outside taps are handled
          // by pointerdown; only a known keyboard focus destination closes here.
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget)) setMenuOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <button ref={menuButton} type="button" aria-label={props.moreLabel} title={props.moreLabel} aria-expanded={menuOpen} aria-haspopup="dialog" onClick={() => { instantExit.current = false; setMenuOpen(open => !open); }} className="ui-press flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          <MoreHorizontal size={20} />
        </button>
        {typeof document !== 'undefined' && createPortal(<AnimatedPopover open={menuOpen} instantExit={instantExit.current} ready={isPositioned} panelRef={panel} style={panelStyle} origin={transformOrigin} role="dialog" aria-label={props.moreLabel} className="ui-anchored-panel w-36 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface-raised)]">
          <button type="button" onClick={() => { props.onAbout(); setMenuOpen(false); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-[color:var(--color-text)] dark:hover:bg-[color:var(--color-surface)]">
            <Info size={16} />{props.aboutLabel}
          </button>
          <button type="button" onClick={() => { props.onHelp(); setMenuOpen(false); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-[color:var(--color-text)] dark:hover:bg-[color:var(--color-surface)]">
            <BookOpen size={16} />{props.helpLabel}
          </button>
        </AnimatedPopover>, document.body)}
      </div>
      <button type="button" onClick={props.onClose} className="flex h-11 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950">
        {props.doneLabel}
      </button>
      </div>
    </div>
  );
}
