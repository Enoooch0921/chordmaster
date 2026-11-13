import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AnimatePresence, useMotionValue, type HTMLMotionProps } from 'motion/react';
import { PresenceSurface } from './ui/InteractionMotion';
import { useKeyboardMotionInterrupt } from '../hooks/useUiMotion';
import { UI_DRAWER_EASE, type UiMotionPreference } from '../lib/uiMotion';
import { Project, Setlist, StoredSong } from '../types';

export type SetlistPanelView = 'list' | 'detail' | 'addSongs' | 'manageProjects' | 'setlistMembers';

export type SetlistProjectFilter =
  | { kind: 'all' }
  | { kind: 'ungrouped' }
  | { kind: 'owned-project'; projectId: string }
  | { kind: 'shared-project'; projectId: string }
  | { kind: 'shared-setlists' };

export const SETLIST_PROJECT_FILTER_STORAGE_KEY = 'chordmaster.setlist-project-filter.v1';

export const serializeSetlistProjectFilter = (filter: SetlistProjectFilter) => {
  switch (filter.kind) {
    case 'owned-project':
      return `owned-project:${filter.projectId}`;
    case 'shared-project':
      return `shared-project:${filter.projectId}`;
    default:
      return filter.kind;
  }
};

export const parseSetlistProjectFilter = (value: string | null): SetlistProjectFilter | null => {
  if (value === 'all') return { kind: 'all' };
  if (value === 'ungrouped') return { kind: 'ungrouped' };
  if (value === 'shared-setlists') return { kind: 'shared-setlists' };
  if (value?.startsWith('owned-project:')) {
    const projectId = value.slice('owned-project:'.length).trim();
    return projectId ? { kind: 'owned-project', projectId } : null;
  }
  if (value?.startsWith('shared-project:')) {
    const projectId = value.slice('shared-project:'.length).trim();
    return projectId ? { kind: 'shared-project', projectId } : null;
  }
  return null;
};

export const resolveInitialSetlistProjectFilter = ({
  storedFilter,
  legacyProjectId,
  projects
}: {
  storedFilter: string | null;
  legacyProjectId: string | null;
  projects: Project[];
}): SetlistProjectFilter => {
  const parsed = parseSetlistProjectFilter(storedFilter);
  if (parsed) {
    if (parsed.kind !== 'owned-project' || projects.some((project) => project.id === parsed.projectId)) {
      return parsed;
    }
  }

  if (legacyProjectId && projects.some((project) => project.id === legacyProjectId)) {
    return { kind: 'owned-project', projectId: legacyProjectId };
  }

  return { kind: 'all' };
};

export const filterOwnedSetlistsByProject = (setlists: Setlist[], filter: SetlistProjectFilter) => {
  switch (filter.kind) {
    case 'all':
      return setlists;
    case 'ungrouped':
      return setlists.filter((setlist) => !setlist.projectId);
    case 'owned-project':
      return setlists.filter((setlist) => setlist.projectId === filter.projectId);
    default:
      return [];
  }
};

export const validateSetlistProjectFilter = (
  filter: SetlistProjectFilter,
  projects: Pick<Project, 'id'>[],
  joinedProjects: Pick<Project, 'id'>[]
): SetlistProjectFilter => {
  if (filter.kind === 'owned-project' && !projects.some((project) => project.id === filter.projectId)) {
    return { kind: 'all' };
  }
  if (filter.kind === 'shared-project' && !joinedProjects.some((project) => project.id === filter.projectId)) {
    return { kind: 'all' };
  }
  return filter;
};

export const shouldCollapseSetlistSidebar = ({
  isPhoneViewport,
  usesOverlaySidebar,
  hasFinePointer
}: {
  isPhoneViewport: boolean;
  usesOverlaySidebar: boolean;
  hasFinePointer: boolean;
}) => isPhoneViewport || (usesOverlaySidebar && !hasFinePointer);

export const getSetlistPreviewTitles = (
  setlist: Pick<Setlist, 'songs'>,
  songs: StoredSong[],
  limit = 3
) => {
  const songsById = new Map(songs.map((song) => [song.id, song] as const));
  return setlist.songs
    .map((item) => item.songData?.title || songsById.get(item.songId)?.title || '')
    .filter((title) => title.trim().length > 0)
    .slice(0, limit);
};

type PanelMotion = UiMotionPreference & { direction: number };
const panelDepth: Record<SetlistPanelView, number> = { list: 0, manageProjects: 1, detail: 1, addSongs: 2, setlistMembers: 2 };

export const setlistPanelVariants = {
  enter: ({ direction, reduced, instant }: PanelMotion) => ({
    transform: reduced || instant ? 'translate3d(0%, 0, 0)' : `translate3d(${direction > 0 ? '100%' : '-25%'}, 0, 0)`,
    opacity: reduced && !instant ? 0 : 1
  }),
  visible: ({ reduced, instant }: PanelMotion) => ({
    transform: 'translate3d(0%, 0, 0)', opacity: 1,
    transition: { duration: instant ? 0 : reduced ? 0.125 : 0.24, ease: UI_DRAWER_EASE,
      transform: { duration: instant || reduced ? 0 : 0.24, ease: UI_DRAWER_EASE } }
  }),
  exit: ({ direction, reduced, instant }: PanelMotion) => ({
    transform: reduced || instant ? 'translate3d(0%, 0, 0)' : `translate3d(${direction > 0 ? '-25%' : '100%'}, 0, 0)`,
    opacity: reduced && !instant ? 0 : 1,
    transition: { duration: instant ? 0 : reduced ? 0.125 : 0.24, ease: UI_DRAWER_EASE,
      transform: { duration: instant || reduced ? 0 : 0.24, ease: UI_DRAWER_EASE } }
  })
};

/** Keep navigation intent immediate when input or motion preferences change mid-slide. */
const PanelMotionPreference = createContext<UiMotionPreference>({ instant: false, reduced: false });
function SetlistPanelLayer(props: HTMLMotionProps<'div'>) {
  const preference = useContext(PanelMotionPreference);
  const transform = useMotionValue('translate3d(0%, 0, 0)');
  const opacity = useMotionValue(1);
  const previous = useRef(preference);
  const finish = () => { transform.animation?.complete(); opacity.animation?.complete(); };
  useKeyboardMotionInterrupt(finish);
  useEffect(() => {
    // A new transition alone does not retarget an unchanged "visible" value.
    const changed = previous.current.instant !== preference.instant || previous.current.reduced !== preference.reduced;
    previous.current = preference;
    if (changed && (preference.instant || preference.reduced)) finish();
  }, [preference.instant, preference.reduced]);
  return <PresenceSurface {...props} style={{ ...props.style, transform, opacity }} />;
}

interface SetlistNavigatorProps {
  view: SetlistPanelView;
  list: React.ReactNode;
  detail: React.ReactNode;
  addSongs: React.ReactNode;
  manageProjects: React.ReactNode;
  setlistMembers?: React.ReactNode;
  busy?: boolean;
  ready?: boolean;
  motion?: UiMotionPreference;
  path?: string[];
}

const SetlistNavigator: React.FC<SetlistNavigatorProps> = ({
  view, list, detail, addSongs, manageProjects, setlistMembers, busy = false, ready = true, path,
  motion: preference = { instant: false, reduced: false }
}) => {
  const depth = path?.length ?? panelDepth[view];
  const location = path ? view + ':' + path.join('/') : view;
  const root = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const previous = useRef({ location, depth, direction: 1 });
  const changed = previous.current.location !== location;
  const direction = !changed ? previous.current.direction
    : depth >= previous.current.depth ? 1 : -1;
  useLayoutEffect(() => { previous.current = { location, depth, direction }; }, [location, depth, direction]);
  useLayoutEffect(() => {
    if (!ready) scrollPositions.current.clear();
    const panel = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-setlist-location]') ?? [])
      .find(node => node.dataset.setlistLocation === location);
    const scroller = panel?.querySelector<HTMLElement>('[data-setlist-scroll], [data-project-scroll], [data-setlist-detail-scroll]');
    if (scroller) scroller.scrollTop = scrollPositions.current.get(location) ?? 0;
    if (ready && changed) (panel?.querySelector<HTMLElement>('h2[tabindex="-1"]') ?? panel?.querySelector<HTMLElement>('[data-setlist-detail-header] .pm-back'))?.focus({preventScroll:true});
    return () => { if (scroller) scrollPositions.current.set(location, scroller.scrollTop); };
  }, [location, ready]);
  const panelMotion = { ...preference, direction };
  // Exiting elements retain their old props, so deliver preference changes separately.
  const livePreference = useMemo(() => ({ instant: preference.instant, reduced: preference.reduced }), [preference.instant, preference.reduced]);
  const panel = view === 'detail' ? detail : view === 'addSongs' ? addSongs : view === 'manageProjects' ? manageProjects : view === 'setlistMembers' ? setlistMembers : list;
  return <PanelMotionPreference.Provider value={livePreference}><div ref={root} data-setlist-navigator data-setlist-panel={view} className="relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-busy={busy}>
    {/* Recreate presence at restoration so a remembered location appears immediately. */}
    <AnimatePresence key={ready ? 'ready' : 'restoring'} initial={false} custom={panelMotion}>
      <SetlistPanelLayer key={location} data-setlist-location={location} data-setlist-panel-layer={view} custom={panelMotion}
        variants={setlistPanelVariants} initial="enter" animate="visible" exit="exit"
        inert={busy ? true : undefined} style={{ zIndex: depth }}
        className="absolute inset-0 flex min-h-0 flex-col bg-white dark:bg-[color:var(--color-surface)]">
        {panel}
      </SetlistPanelLayer>
    </AnimatePresence>
  </div></PanelMotionPreference.Provider>;
};

export default SetlistNavigator;
