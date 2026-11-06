import { expect, it } from 'vitest';
import type { Song } from '../types';
import { EMPTY_LIBRARY_FILTERS, libraryFilterError, libraryKey, matchesLibraryFilters } from './songLibraryFilters';
import { getSongLibraryIdentity } from './songLibraryPresentation';
const song: Song = { title: '同名歌曲（現場版）', lyricist: '甲', composer: '乙', currentKey: 'C', originalKey: 'C', currentKeyMode: 'minor', tempo: 92.5, timeSignature: '6/8', sections: [] };
it('combines key/meter/inclusive fractional BPM and excludes unknown tempos from ranges', () => {
  const filters = { ...EMPTY_LIBRARY_FILTERS, key: libraryKey(song), meter: '6/8', minBpm: '92.5', maxBpm: '92.5' };
  expect(matchesLibraryFilters(song, filters)).toBe(true);
  expect(matchesLibraryFilters({ ...song, currentKeyMode: 'major' }, filters)).toBe(false);
  expect(matchesLibraryFilters({ ...song, originalKeyUnspecified: true }, filters)).toBe(false);
  expect(matchesLibraryFilters({ ...song, timeSignatureUnspecified: true }, filters)).toBe(false);
  expect(matchesLibraryFilters({ ...song, tempo: undefined }, filters)).toBe(false);
  expect(matchesLibraryFilters({ ...song, tempo: undefined }, EMPTY_LIBRARY_FILTERS)).toBe(true);
  expect(libraryFilterError({ ...filters, minBpm: '100' })).toBe('range');
  expect(libraryFilterError({ ...filters, minBpm: 'foo' })).toBe('bpm');
});
it('separates saved suffixes and actual lyric languages without inventing missing metadata', () => {
  const result = getSongLibraryIdentity({ ...song, lyricsDoc: { chinese: 'legacy', english: 'stale', translationLanguage: 'ja', blocks: [{ id: 'v', marker: '', chinese: '', english: '日本語' }] } }, 'zh');
  expect(result).toMatchObject({ title: '同名歌曲', version: '（現場版）', authors: '甲 / 乙', language: '日文' });
  expect(getSongLibraryIdentity({ ...song, title: '同名歌曲', composer: '', lyricist: '' }, 'zh')).toMatchObject({ title: '同名歌曲', version: '版本未註明', authors: '作者未註明', language: '' });
});
