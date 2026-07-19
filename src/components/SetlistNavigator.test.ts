import { describe, expect, it } from 'vitest';
import { Project, Setlist, StoredSong } from '../types';
import {
  filterOwnedSetlistsByProject,
  getSetlistPreviewTitles,
  parseSetlistProjectFilter,
  resolveInitialSetlistProjectFilter,
  serializeSetlistProjectFilter,
  shouldCollapseSetlistSidebar,
  validateSetlistProjectFilter
} from './SetlistNavigator';

const projects: Project[] = [{
  id: 'project-1',
  name: 'Sunday',
  archived: false,
  createdAt: 1,
  updatedAt: 1
}];

const setlists: Setlist[] = [
  { id: 'setlist-1', name: 'Grouped', displayMode: 'chord-movable-key', projectId: 'project-1', songs: [], createdAt: 1, updatedAt: 1 },
  { id: 'setlist-2', name: 'Loose', displayMode: 'chord-movable-key', projectId: null, songs: [], createdAt: 1, updatedAt: 1 }
];

describe('setlist project filters', () => {
  it('serializes and parses every persisted filter shape', () => {
    const filters = [
      { kind: 'all' } as const,
      { kind: 'ungrouped' } as const,
      { kind: 'owned-project', projectId: 'project-1' } as const,
      { kind: 'shared-project', projectId: 'shared-1' } as const,
      { kind: 'shared-setlists' } as const
    ];

    filters.forEach((filter) => {
      expect(parseSetlistProjectFilter(serializeSetlistProjectFilter(filter))).toEqual(filter);
    });
  });

  it('migrates a valid legacy project and otherwise defaults to all', () => {
    expect(resolveInitialSetlistProjectFilter({ storedFilter: null, legacyProjectId: 'project-1', projects }))
      .toEqual({ kind: 'owned-project', projectId: 'project-1' });
    expect(resolveInitialSetlistProjectFilter({ storedFilter: null, legacyProjectId: 'missing', projects }))
      .toEqual({ kind: 'all' });
  });

  it('filters owned setlists without changing their stored project data', () => {
    expect(filterOwnedSetlistsByProject(setlists, { kind: 'all' })).toHaveLength(2);
    expect(filterOwnedSetlistsByProject(setlists, { kind: 'ungrouped' }).map((item) => item.id)).toEqual(['setlist-2']);
    expect(filterOwnedSetlistsByProject(setlists, { kind: 'owned-project', projectId: 'project-1' }).map((item) => item.id)).toEqual(['setlist-1']);
    expect(filterOwnedSetlistsByProject(setlists, { kind: 'shared-setlists' })).toEqual([]);
  });

  it('falls back to all when a remembered project no longer exists', () => {
    expect(validateSetlistProjectFilter({ kind: 'owned-project', projectId: 'missing' }, projects, []))
      .toEqual({ kind: 'all' });
    expect(validateSetlistProjectFilter({ kind: 'shared-project', projectId: 'shared-1' }, projects, [{ id: 'shared-1' }]))
      .toEqual({ kind: 'shared-project', projectId: 'shared-1' });
  });
});

describe('setlist sidebar collapse', () => {
  it('collapses touch drawers but keeps fine-pointer desktop navigation open', () => {
    expect(shouldCollapseSetlistSidebar({ isPhoneViewport: true, usesOverlaySidebar: false, hasFinePointer: true })).toBe(true);
    expect(shouldCollapseSetlistSidebar({ isPhoneViewport: false, usesOverlaySidebar: true, hasFinePointer: false })).toBe(true);
    expect(shouldCollapseSetlistSidebar({ isPhoneViewport: false, usesOverlaySidebar: false, hasFinePointer: false })).toBe(false);
    expect(shouldCollapseSetlistSidebar({ isPhoneViewport: false, usesOverlaySidebar: true, hasFinePointer: true })).toBe(false);
  });
});

describe('setlist card summaries', () => {
  it('uses embedded titles first and limits the visible preview', () => {
    const songs = Array.from({ length: 4 }, (_, index): StoredSong => ({
      id: `song-${index + 1}`,
      title: `Library ${index + 1}`,
      currentKey: 'C',
      originalKey: 'C',
      tempo: 80,
      timeSignature: '4/4',
      sections: [],
      updatedAt: 1
    }));
    const setlist: Setlist = {
      ...setlists[0],
      songs: songs.map((song, index) => ({
        id: `item-${index}`,
        setlistId: 'setlist-1',
        songId: song.id,
        order: index,
        sectionOrder: [],
        ...(index === 0 ? { songData: { ...song, title: 'Embedded title' } } : {})
      }))
    };

    expect(getSetlistPreviewTitles(setlist, songs)).toEqual(['Embedded title', 'Library 2', 'Library 3']);
  });
});
