const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 萬: 10000, 億: 100000000 };
const collator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' });
const parts = (name: string) => name.normalize('NFKC').trim().match(/\d+|[零〇一二兩三四五六七八九十百千萬億]+|[^\d零〇一二兩三四五六七八九十百千萬億]+/gu) ?? [];

const number = (token: string): number | null => {
  if (/^\d+$/.test(token)) return Number(token);
  if (!/^[零〇一二兩三四五六七八九十百千萬億]+$/.test(token)) return null;
  if (![...token].some(char => char in units)) return Number([...token].map(char => digits[char]).join(''));
  let total = 0, group = 0, digit = 0;
  for (const char of token) {
    if (char in digits) digit = digits[char];
    else if (units[char] < 10000) { group += (digit || 1) * units[char]; digit = 0; }
    else {
      total = units[char] === 100000000 ? (total + group + digit) * units[char] : total + (group + digit) * units[char];
      group = 0; digit = 0;
    }
  }
  return total + group + digit;
};

export const compareNaturalNames = (first: string, second: string): number => {
  const a = parts(first), b = parts(second);
  if (!a.length || !b.length) return a.length ? -1 : b.length ? 1 : 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = number(a[i]), y = number(b[i]);
    const comparison = x !== null && y !== null ? x - y : collator.compare(a[i], b[i]);
    if (comparison) return comparison;
  }
  return a.length - b.length;
};
