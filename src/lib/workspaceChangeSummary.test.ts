import { expect, it } from 'vitest';
import type { Setlist, StoredSong } from '../types';
import { getWorkspaceChanges, hasUnsavedWorkspaceChanges } from './workspaceChangeSummary';
const song: StoredSong = { id: 'song', title: '常常喜樂', originalKey: 'C', currentKey: 'C', updatedAt: 100,
  timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
const setlist: Setlist = { id: 'list', name: '主日敬拜', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 100,
  songs: [{ id: 'entry', songId: 'song', setlistId: 'list', order: 0, sectionOrder: ['verse'], songData: song }] };
const saved = () => JSON.parse(JSON.stringify({ songs: [song], setlists: [setlist], projects: [] })) as { songs: StoredSong[]; setlists: Setlist[]; projects: [] };
it('identifies library edits even when the currently selected page is a setlist', () => {
  const before = saved(), after = saved(); after.songs[0].sections[0].bars[0].chords = ['G'];
  expect(getWorkspaceChanges(after, before, 'zh')).toEqual([{ location: '歌曲庫', name: '常常喜樂', detail: '和弦' }]);
});
it('names the individual setlist copy and its actual changed content', () => {
  const before = saved(), after = saved(); after.setlists[0].songs[0].songData!.tempo = 90;
  expect(getWorkspaceChanges(after, before, 'zh')).toEqual([{ location: '歌單「主日敬拜」', name: '常常喜樂', detail: '速度' }]);
});
it('does not report timestamp-only or personal-display metadata as unsaved content', () => {
  const before = saved(), after = saved(); after.songs[0].updatedAt = 999; after.songs[0].lastEditedAt = 500;
  after.setlists[0].updatedAt = 600; after.setlists[0].songs[0].personalCapoOverride = 3;
  expect(getWorkspaceChanges(after, before, 'zh')).toEqual([]);
  expect(hasUnsavedWorkspaceChanges(after, before)).toBe(false);
});
it('lists deletions and non-song changes rather than showing an empty save prompt', () => {
  const before = saved(), after = saved(); after.songs = []; after.setlists[0].name = '週日';
  expect(getWorkspaceChanges(after, before, 'zh')).toEqual([
    { location: '歌曲庫', name: '常常喜樂', detail: '刪除' }, { location: '歌單', name: '週日', detail: '名稱' }
  ]);
});
