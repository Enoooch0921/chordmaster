import type { JoinedProject, JoinedSetlist, Project, Setlist } from '../types';
import { parseSetlistProjectFilter, serializeSetlistProjectFilter, type SetlistProjectFilter } from '../components/SetlistNavigator';

export interface SetlistNavigationLocation {
  version: 1;
  workspaceMode: 'songs' | 'setlists';
  filter: SetlistProjectFilter;
  view: 'list' | 'detail';
  setlistId: string | null;
  songId: string | null;
  parentFilter: SetlistProjectFilter;
}

export interface NavigationWorkspace {
  projects: Project[];
  setlists: Setlist[];
  joinedProjects: JoinedProject[];
  joinedSetlists: JoinedSetlist[];
}

export const getNavigationStorageKey = (userId: string | null, libraryId: string | null) => (
  userId
    ? `chordmaster.navigation.${encodeURIComponent(userId)}.${encodeURIComponent(libraryId ?? 'default')}.v1`
    : 'chordmaster.navigation.local.v1'
);

export function loadNavigationLocation(key: string): SetlistNavigationLocation | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (!value || value.version !== 1 || !['songs', 'setlists'].includes(value.workspaceMode)
      || !['list', 'detail'].includes(value.view)) return null;
    const filter = parseSetlistProjectFilter(value.filter);
    const parentFilter = parseSetlistProjectFilter(value.parentFilter);
    if (!filter || !parentFilter) return null;
    return {
      version: 1, workspaceMode: value.workspaceMode, view: value.view, filter, parentFilter,
      setlistId: typeof value.setlistId === 'string' ? value.setlistId : null,
      songId: typeof value.songId === 'string' ? value.songId : null
    };
  } catch {
    return null;
  }
}

export function saveNavigationLocation(key: string, location: SetlistNavigationLocation) {
  try {
    const value = JSON.stringify({
      ...location,
      filter: serializeSetlistProjectFilter(location.filter),
      parentFilter: serializeSetlistProjectFilter(location.parentFilter)
    });
    if (window.localStorage.getItem(key) !== value) window.localStorage.setItem(key, value);
  } catch {
    // A blocked or full browser store must not prevent navigation.
  }
}

export function getSetlistParentFilter(id: string | null, workspace: NavigationWorkspace): SetlistProjectFilter {
  const owned = workspace.setlists.find(setlist => setlist.id === id);
  if (owned) return owned.projectId ? { kind: 'owned-project', projectId: owned.projectId } : { kind: 'all' };
  const sharedProject = workspace.joinedProjects.find(project => project.setlists.some(setlist => setlist.id === id));
  if (sharedProject) return { kind: 'shared-project', projectId: sharedProject.id };
  if (workspace.joinedSetlists.some(setlist => setlist.id === id)) return { kind: 'all' };
  return { kind: 'all' };
}

/** Resolve only against a fully loaded workspace, never a partial pre-auth cache. */
export function resolveNavigationLocation(location: SetlistNavigationLocation, workspace: NavigationWorkspace): SetlistNavigationLocation {
  const validate = (filter: SetlistProjectFilter): SetlistProjectFilter => {
    if (filter.kind === 'ungrouped' || filter.kind === 'shared-setlists') return { kind: 'all' };
    if (filter.kind === 'owned-project'
      && !workspace.projects.some(project => project.id === filter.projectId && !project.archived)) return { kind: 'all' };
    if (filter.kind === 'shared-project'
      && !workspace.joinedProjects.some(project => project.id === filter.projectId && !project.archived)) return { kind: 'all' };
    return filter;
  };
  const filter = validate(location.filter);
  const selected = workspace.setlists.find(setlist => setlist.id === location.setlistId)
    ?? workspace.joinedSetlists.find(setlist => setlist.id === location.setlistId)
    ?? workspace.joinedProjects.flatMap(project => project.setlists).find(setlist => setlist.id === location.setlistId);
  const parentFilter = selected ? getSetlistParentFilter(selected.id, workspace) : location.parentFilter;
  const activeParent = validate(parentFilter);
  const projectUnavailable = (['owned-project','shared-project'].includes(location.filter.kind) && serializeSetlistProjectFilter(filter) !== serializeSetlistProjectFilter(location.filter))
    || (location.view === 'detail' && serializeSetlistProjectFilter(parentFilter) !== serializeSetlistProjectFilter(activeParent));
  if (projectUnavailable) {
    return { ...location, filter: { kind: 'all' }, view: 'list', setlistId: null, songId: null, parentFilter: { kind: 'all' } };
  }
  if (location.view === 'detail' && (!selected || selected.archived)) {
    return { ...location, filter: activeParent, view: 'list', setlistId: null, songId: null, parentFilter: activeParent };
  }
  return {
    ...location, filter: location.view === 'detail' && selected ? activeParent : filter, parentFilter,
    setlistId: selected && !selected.archived ? selected.id : null,
    songId: selected && !selected.archived
      ? selected.songs.find(song => song.id === location.songId)?.id ?? selected.songs[0]?.id ?? null
      : null
  };
}
