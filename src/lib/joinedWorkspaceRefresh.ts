import type { Setlist, WorkspaceSnapshot } from '../types';

export type JoinedWorkspace = Pick<WorkspaceSnapshot, 'joinedSetlists' | 'joinedProjects'>;

const retainEqual = <T,>(current: T | undefined, next: T): T => (
  current && JSON.stringify(current) === JSON.stringify(next) ? current : next
);

const reconcileSetlist = <T extends Setlist>(current: T | undefined, remote: T): T => {
  const currentSongs = new Map(current?.songs.map((song) => [song.id, song]));
  const songs = remote.songs.map((song) => {
    const local = currentSongs.get(song.id);
    // Shared keys/order come from the owner. Capo remains the viewer's choice,
    // including a local preference whose write has not succeeded yet.
    return retainEqual(local, local?.personalCapoOverride !== undefined
      ? { ...song, personalCapoOverride: local.personalCapoOverride }
      : song);
  });
  return retainEqual(current, { ...remote, songs });
};

export const reconcileJoinedWorkspace = (current: JoinedWorkspace, remote: JoinedWorkspace): JoinedWorkspace => {
  const setlistsById = new Map(current.joinedSetlists.map((setlist) => [setlist.id, setlist]));
  const projectsById = new Map(current.joinedProjects?.map((project) => [project.id, project]));
  const joinedSetlists = retainEqual(current.joinedSetlists, remote.joinedSetlists.map((setlist) => (
    reconcileSetlist(setlistsById.get(setlist.id), setlist)
  )));
  const joinedProjects = retainEqual(current.joinedProjects, (remote.joinedProjects ?? []).map((project) => {
    const local = projectsById.get(project.id);
    const localSetlists = new Map(local?.setlists.map((setlist) => [setlist.id, setlist]));
    return retainEqual(local, { ...project, setlists: project.setlists.map((setlist) => (
      reconcileSetlist(localSetlists.get(setlist.id), setlist)
    )) });
  }));
  return { joinedSetlists, joinedProjects };
};
