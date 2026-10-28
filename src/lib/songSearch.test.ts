import { beforeAll, describe, expect, it } from 'vitest';
import { createSearchQuery, loadSearchDictionary, normalizeSearchText, searchItems } from './songSearch';

beforeAll(() => loadSearchDictionary());

const match = (query: string, ...fields: string[]) => createSearchQuery(query).match(fields);

describe('song search, adapted from Spotlight Han', () => {
  it.each(['dr', 'DR', 'ㄉㄖ', 'dianran'])('finds 點燃 and its library versions using %s', query => {
    for (const title of ['點燃', '點燃（官方版）', '點燃（手寫F調）（待人工）']) {
      expect(match(query, title)).toBe('phonetic');
    }
  });

  it.each(['dr', 'ㄉㄖ'])('does not let editorial 待人工 status flood results for %s', query => {
    expect(match(query, '我跟隨主（待人工）')).toBeNull();
    expect(match(query, 'Joy to the World（Remix）（待人工）')).toBeNull();
    expect(match(query, '我跟隨主(待人工)')).toBeNull();
    expect(match(query, '待人工')).toBe('phonetic');
    expect(match('待人工', '我跟隨主（待人工）')).toBe('text');
    expect(match('dairengong', '等待人工智慧')).toBe('phonetic');
  });

  it.each(['dr', 'ㄉㄖ'])('ranks exact song initials before partial title matches for %s', query => {
    const titles = ['以利亞的日子（Father’s Day 編曲）（待人工）', '點燃（官方版）', '點燃（手寫F調）（待人工）', '在教會中得榮耀（待人工）', '我跟隨主（待人工）'];
    expect(searchItems(titles, createSearchQuery(query), title => [title])).toEqual([
      titles[1], titles[2], titles[0], titles[3]
    ]);
  });
  it.each(['我們歡迎君王降臨', '我们欢迎君王降临', '歡迎君王', 'wmhyjwjl', 'WMHYJWJL', 'womenhuanyingjunwangjianglin', 'huanying', 'hyjw', 'wo3 men5 huan1 ying2', 'ㄨㄛˇ ㄇㄣ˙', 'ㄨㄇㄏㄧㄐㄨㄐㄌ', 'ㄏㄧㄐㄨ'])('finds a Chinese song using %s', query => {
    expect(match(query, '我們歡迎君王降臨')).not.toBeNull();
  });

  it.each(['rnr', 'RNR', 'ru4nj04ru', 'ru4nj04ru '])('recovers standard Zhuyin physical keys: %s', query => {
    expect(match(query, '計算機')).toBe('keyboard');
  });

  it.each(['ji3ap7cj0 u/6rmp j;6ru;4xup6', 'jacurjrx'])('recovers a song including syllables beginning with ㄨ and ㄧ: %s', query => {
    expect(match(query, '我們歡迎君王降臨')).toBe('keyboard');
  });

  it.each(['rn', 'ru', 'rnr!', 'DL32', 'm32', 'dl 32', 'logicpro', 'fcp', 'wifi', 'https://example.com', 'ru44nj04ru'])('does not reinterpret unrelated input: %s', query => {
    expect(match(query, '計算機')).toBeNull();
  });

  it('keeps exact English titles, musical keys, tempos, authors and meter searchable', () => {
    expect(match('nothing impossible', 'Nothing Is Impossible')).toBe('text');
    expect(match('Em7', 'Em7 Study')).toBe('text');
    expect(match('DL32', 'DL32 Live')).toBe('text');
    expect(match('C', 'C')).toBe('text');
    expect(match('136', '136')).toBe('text');
    expect(match('4/4', '4/4')).toBe('text');
    expect(match('Planet Shakers', 'Planet Shakers')).toBe('text');
    expect(match('C 136', '新歌', 'C', '136')).toBe('text');
  });

  it('combines phonetic words with other terms without dropping any term', () => {
    expect(match('wmhy 136', '我們歡迎君王降臨', '136')).toBe('phonetic');
    expect(match('wmhy 92', '我們歡迎君王降臨', '136')).toBeNull();
    expect(match('nothing missing', 'Nothing Is Impossible')).toBeNull();
  });

  it('handles full-width text, worship pronouns, accents, ü and lü keyboard spellings', () => {
    expect(normalizeSearchText('  ＷＭＨＹ　祢  ')).toBe('wmhy 你');
    expect(match('你的愛', '祢的愛')).toBe('text');
    for (const query of ['nideai', 'nda', 'ㄋㄉㄞ']) expect(match(query, '祢的愛')).toBe('phonetic');
    expect(match('su3c.4ㄞ', '祢的愛')).toBeNull();
    expect(match('5j3b4', '主日敬拜開場曲')).toBe('keyboard');
    for (const query of ['lvcheng', 'lu:cheng', 'lǚchéng', 'ㄌㄩㄔㄥ']) expect(match(query, '旅程')).toBe('phonetic');
  });

  it('uses contextual pronunciation for common musical titles', () => {
    expect(match('yinyue', '音樂')).toBe('phonetic');
    expect(match('ㄧㄩ', '音樂')).toBe('phonetic');
    expect(match('kuaile', '快樂')).toBe('phonetic');
    expect(match('jianglin', '降臨')).toBe('phonetic');
    expect(match('ㄐㄧㄤㄌㄧㄣ', '降臨')).toBe('phonetic');
    expect(match('ㄩㄝ', '月亮')).toBe('phonetic');
    expect(match('ㄓㄨ', '主')).toBe('phonetic');
    expect(match('ㄕ', '詩歌')).toBe('phonetic');
  });

  it('does not combine phonetic fragments across unrelated fields', () => {
    expect(match('zmes', '讚美', '恩賜')).toBeNull();
    expect(match('讚美 恩賜', '讚美', '恩賜')).toBe('text');
  });

  it('prioritizes literal matches and keeps the input ordering within each tier', () => {
    const songs = [{ title: '計算機（二）' }, { title: 'RNR' }, { title: '計算機（一）' }];
    expect(searchItems(songs, createSearchQuery('rnr'), item => [item.title]).map(item => item.title))
      .toEqual(['RNR', '計算機（二）', '計算機（一）']);
    expect(searchItems(songs, createSearchQuery(''), item => [item.title])).toEqual(songs);
  });

  it('updates search keys after a rename and supports empty or non-Chinese fields', () => {
    const query = createSearchQuery('wmhy');
    expect(query.match(['我們歡迎君王降臨'])).toBe('phonetic');
    expect(query.match(['另一首歌'])).toBeNull();
    expect(query.match([null, undefined, ''])).toBeNull();
    expect(match('hkhk', 'Hello World')).toBeNull();
    expect(match('', '')).toBe('text');
  });
});
