import { expect, it } from 'vitest';
import { createSearchQuery, getSearchDictionaryState, loadSearchDictionary, subscribeSearchDictionary } from './songSearch';

it('finds a lyric phrase before any phonetic dictionary loads', () => {
  expect(getSearchDictionaryState()).toBe('idle');
  expect(createSearchQuery('星光照亮前路').match(['新歌'], { chinese: '星光照亮\n前路' })).toBe('lyrics');
  expect(getSearchDictionaryState()).toBe('idle');
});

it('keeps literal search available before the lazy dictionary loads and does not cache missing pronunciations', async () => {
  const states: string[] = [];
  const unsubscribe = subscribeSearchDictionary(() => states.push(getSearchDictionaryState()));
  const phonetic = createSearchQuery('wmhyjwjl');
  expect(getSearchDictionaryState()).toBe('idle');
  expect(createSearchQuery('歡迎').match(['我們歡迎君王降臨'])).toBe('text');
  expect(phonetic.match(['我們歡迎君王降臨'])).toBeNull();
  const first = loadSearchDictionary();
  const second = loadSearchDictionary();
  expect(first).toBe(second);
  await first;
  expect(phonetic.match(['我們歡迎君王降臨'])).toBe('phonetic');
  expect(states).toEqual(['loading', 'ready']);
  await loadSearchDictionary();
  expect(states).toEqual(['loading', 'ready']);
  unsubscribe();
});
