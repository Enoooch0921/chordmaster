import { afterEach, describe, expect, it } from 'vitest';
import type { Setlist } from '../types';
import { getNavigationStorageKey, getSetlistParentFilter, loadNavigationLocation, resolveNavigationLocation, saveNavigationLocation, type NavigationWorkspace, type SetlistNavigationLocation } from './setlistNavigationMemory';

const meeting: Setlist = { id: 'meeting-1', name: '聚會一', projectId: 'la', songs: [{ id: 'entry', setlistId: 'meeting-1', songId: 'song', order: 0, sectionOrder: [] }], displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1 };
const workspace: NavigationWorkspace = { projects: [{ id: 'la', name: '洛杉磯烈火', createdAt: 1, updatedAt: 1 }], setlists: [meeting], joinedSetlists: [], joinedProjects: [] };
const location: SetlistNavigationLocation = { version: 1, workspaceMode: 'setlists', filter: { kind: 'owned-project', projectId: 'la' }, parentFilter: { kind: 'owned-project', projectId: 'la' }, view: 'detail', setlistId: 'meeting-1', songId: 'entry' };
afterEach(() => localStorage.clear());

describe('remembered project and meeting navigation', () => {
  it('restores an active meeting and the selected song', () => {
    expect(resolveNavigationLocation(location, workspace)).toEqual(location);
  });
  it('keeps a project overview as an overview rather than opening its first meeting', () => {
    expect(resolveNavigationLocation({ ...location, view: 'list' }, workspace)).toMatchObject({ view: 'list', filter: location.filter });
  });
  it.each(['archived', 'deleted'])('returns to the parent when a meeting is %s', state => {
    const data = { ...workspace, setlists: state === 'deleted' ? [] : [{ ...meeting, archived: true }] };
    expect(resolveNavigationLocation(location, data)).toMatchObject({ view: 'list', filter: location.filter, setlistId: null, songId: null });
  });
  it.each(['archived', 'deleted'])('returns to all setlists when the project is %s', state => {
    const data = { ...workspace, projects: state === 'deleted' ? [] : [{ ...workspace.projects[0], archived: true }] };
    expect(resolveNavigationLocation(location, data)).toMatchObject({ view: 'list', filter: { kind: 'all' }, setlistId: null });
  });
  it('finds the meeting parent even when it was opened from all setlists', () => {
    expect(resolveNavigationLocation({ ...location, filter: { kind: 'all' } }, { ...workspace, setlists: [{ ...meeting, archived: true }] }).filter).toEqual(location.filter);
  });
  it('does not let an unrelated archived preview reset the project overview', () => {
    const data = { ...workspace, projects: [...workspace.projects, { id: 'old', name: 'Old', archived: true, createdAt: 1, updatedAt: 1 }], setlists: [{ ...meeting, projectId: 'old' }] };
    expect(resolveNavigationLocation({ ...location, view: 'list' }, data).filter).toEqual(location.filter);
  });
  it('supports shared projects and falls back one level when their meetings are archived', () => {
    const data: NavigationWorkspace = { ...workspace, setlists: [], projects: [], joinedProjects: [{ ...workspace.projects[0], isJoined: true, role: 'viewer', setlists: [meeting] }] };
    const shared = { ...location, filter: { kind: 'shared-project', projectId: 'la' } as const, parentFilter: { kind: 'shared-project', projectId: 'la' } as const };
    expect(getSetlistParentFilter(meeting.id, data)).toEqual(shared.filter);
    expect(resolveNavigationLocation(shared, data).view).toBe('detail');
    data.joinedProjects[0].setlists[0] = { ...meeting, archived: true };
    expect(resolveNavigationLocation(shared, data)).toMatchObject({ view: 'list', filter: shared.filter });
    data.joinedProjects[0].archived = true;
    expect(resolveNavigationLocation(shared, data).filter).toEqual({ kind: 'all' });
  });
  it('isolates accounts and libraries and tolerates corrupt preferences', () => {
    const key = getNavigationStorageKey('user', 'team');
    saveNavigationLocation(key, location);
    expect(loadNavigationLocation(key)).toEqual(location);
    expect(loadNavigationLocation(getNavigationStorageKey('other', 'team'))).toBeNull();
    expect(loadNavigationLocation(getNavigationStorageKey('user', 'other'))).toBeNull();
    localStorage.setItem(key, '{broken');
    expect(loadNavigationLocation(key)).toBeNull();
  });
});
it('migrates legacy loose/shared category views to the folder/file root',()=>{
 expect(resolveNavigationLocation({...location,view:'list',filter:{kind:'ungrouped'}},workspace).filter).toEqual({kind:'all'});
 expect(resolveNavigationLocation({...location,view:'list',filter:{kind:'shared-setlists'}},workspace).filter).toEqual({kind:'all'});
 expect(resolveNavigationLocation({...location,filter:{kind:'all'}},workspace).filter).toEqual(location.filter);
});
