import { describe, expect, it } from 'vitest';
import { compareNaturalNames } from './naturalNameCompare';
describe('Chinese number-aware setlist names', () => {
  it('sorts meetings across Chinese decimal positions', () => {
    const names = ['聚會十一','聚會四','聚會二十','聚會三','聚會一','聚會十','聚會二','聚會九','聚會十九'];
    expect([...names].sort(compareNaturalNames)).toEqual(['聚會一','聚會二','聚會三','聚會四','聚會九','聚會十','聚會十一','聚會十九','聚會二十']);
  });
  it('handles mixed Arabic/full-width numbers, prefixes and blank names', () => {
    expect(['聚會１０','聚會二','聚會3','聚會一',''].sort(compareNaturalNames)).toEqual(['聚會一','聚會二','聚會3','聚會１０','']);
    expect(['B 2','A 十','A 二'].sort(compareNaturalNames)).toEqual(['A 二','A 十','B 2']);
  });
  it('supports zero digits, hundreds and large units', () => {
    expect(['第兩百場','第一〇一場','第一百場','第九十九場'].sort(compareNaturalNames)).toEqual(['第九十九場','第一百場','第一〇一場','第兩百場']);
    expect(compareNaturalNames('第一億零二萬場','第一億零三萬場')).toBeLessThan(0);
  });
});
