import React from 'react';
import { Project, Setlist, StoredSong } from '../types';

export type SetlistPanelView = 'list' | 'detail' | 'addSongs' | 'manageProjects';

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

interface SetlistNavigatorProps {
  view: SetlistPanelView;
  list: React.ReactNode;
  detail: React.ReactNode;
  addSongs: React.ReactNode;
  manageProjects: React.ReactNode;
}

const SetlistNavigator: React.FC<SetlistNavigatorProps> = ({
  view,
  list,
  detail,
  addSongs,
  manageProjects
}) => {
  if (view === 'detail') return <>{detail}</>;
  if (view === 'addSongs') return <>{addSongs}</>;
  if (view === 'manageProjects') return <>{manageProjects}</>;
  return <>{list}</>;
};

export default SetlistNavigator;
