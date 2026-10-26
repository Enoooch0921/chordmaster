import type { LibraryRole, Project, Setlist } from '../types';

export const isTeamAdministrator = (role: LibraryRole) => role === 'owner' || role === 'admin';

export const canArrangeTeamSetlist = (
  role: LibraryRole,
  userId: string | undefined,
  setlist: Pick<Setlist, 'createdBy' | 'assignedToCurrentUser'> | null | undefined,
) => Boolean(setlist && (isTeamAdministrator(role) || (
  (role === 'editor' || role === 'setlist_manager')
  && ((Boolean(userId) && setlist.createdBy === userId) || setlist.assignedToCurrentUser === true)
)));

export const canEditTeamSetlistScore = (
  role: LibraryRole,
  userId: string | undefined,
  setlist: Pick<Setlist, 'createdBy' | 'assignedToCurrentUser'> | null | undefined,
) => role !== 'setlist_manager' && canArrangeTeamSetlist(role, userId, setlist);

export const canManageTeamProject = (
  role: LibraryRole,
  userId: string | undefined,
  project: Pick<Project, 'createdBy'>,
) => isTeamAdministrator(role) || (
  (role === 'editor' || role === 'setlist_manager') && Boolean(userId) && project.createdBy === userId
);
