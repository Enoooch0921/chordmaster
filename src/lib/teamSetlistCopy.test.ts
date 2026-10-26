import { expect, it } from 'vitest';
import type { Setlist, SetlistSong } from '../types';
import { resolveSetlistCopySourceId } from './teamSetlistCopy';

const entry: SetlistSong = { id: 'saved-entry', setlistId: 'setlist', songId: 'song', order: 0, sectionOrder: [] };
const saved: Setlist[] = [{ id: 'setlist', name: 'Sunday', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1, songs: [entry] }];

it('uses the persisted source to preserve a custom arrangement when copying', () => {
  expect(resolveSetlistCopySourceId(entry, saved)).toBe(entry.id);
});

it('copies a still-unsaved duplicate from its saved origin, avoiding a race between saves', () => {
  expect(resolveSetlistCopySourceId({ ...entry, id: 'new-copy', copySourceId: entry.id }, saved)).toBe(entry.id);
});

it('uses a canonical library score for fresh unsaved additions, never an unpersisted source ID', () => {
  expect(resolveSetlistCopySourceId({ ...entry, id: 'new-entry' }, saved)).toBeUndefined();
  expect(resolveSetlistCopySourceId({ ...entry, id: 'new-copy', copySourceId: 'another-unsaved-copy' }, saved)).toBeUndefined();
  expect(resolveSetlistCopySourceId({ ...entry, songId: 'different-song' }, saved)).toBeUndefined();
});
