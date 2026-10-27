import * as OpenCC from 'opencc-js/t2cn';

// Standard Zhuyin keyboard recovery follows Spotlight Han's SearchSupplement.swift.
// Copyright (c) 2026 Enoooch0921, MIT; see docs/licenses/spotlight-han-MIT.txt.
const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
const HAN = /\p{Script=Han}/u;
const ZHUYIN = /[ㄅ-ㄩ]/u;
// NFKC expands the neutral tone ˙ to a space plus a combining dot.
const ZHUYIN_ONLY = /^[ㄅ-ㄩ\sˉˊˇˋ˙1-5\p{M}]+$/u;
const ZHUYIN_CONSONANTS = /^[ㄅ-ㄙ]+$/u;
const KEY_SYMBOLS = [...'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ'];
const PHYSICAL_KEYS = [...'1qaz2wsxedcrfv5tgbyhnujm8ik,9ol.0p;/-'];
const keyToZhuyin = new Map(PHYSICAL_KEYS.map((key, index) => [key, KEY_SYMBOLS[index]]));
const INITIALS: Record<string, string> = {
  b: 'ㄅ', p: 'ㄆ', m: 'ㄇ', f: 'ㄈ', d: 'ㄉ', t: 'ㄊ', n: 'ㄋ', l: 'ㄌ',
  g: 'ㄍ', k: 'ㄎ', h: 'ㄏ', j: 'ㄐ', q: 'ㄑ', x: 'ㄒ', zh: 'ㄓ', ch: 'ㄔ',
  sh: 'ㄕ', r: 'ㄖ', z: 'ㄗ', c: 'ㄘ', s: 'ㄙ'
};
const FINALS: Record<string, string> = {
  a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ê: 'ㄝ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ',
  an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ',
  i: 'ㄧ', ia: 'ㄧㄚ', io: 'ㄧㄛ', ie: 'ㄧㄝ', iai: 'ㄧㄞ', iao: 'ㄧㄠ',
  iu: 'ㄧㄡ', ian: 'ㄧㄢ', in: 'ㄧㄣ', iang: 'ㄧㄤ', ing: 'ㄧㄥ', iong: 'ㄩㄥ',
  u: 'ㄨ', ua: 'ㄨㄚ', uo: 'ㄨㄛ', uai: 'ㄨㄞ', ui: 'ㄨㄟ', uan: 'ㄨㄢ',
  un: 'ㄨㄣ', uang: 'ㄨㄤ', ueng: 'ㄨㄥ', ong: 'ㄨㄥ',
  ü: 'ㄩ', üe: 'ㄩㄝ', üan: 'ㄩㄢ', ün: 'ㄩㄣ'
};
const ZERO_INITIALS: Record<string, string> = {
  yi: 'i', ya: 'ia', yo: 'io', ye: 'ie', yao: 'iao', you: 'iu', yan: 'ian',
  yin: 'in', yang: 'iang', ying: 'ing', yong: 'iong', yu: 'ü', yue: 'üe', yuan: 'üan', yun: 'ün',
  wu: 'u', wa: 'ua', wo: 'uo', wai: 'uai', wei: 'ui', wan: 'uan', wen: 'un', wang: 'uang', weng: 'ueng'
};

export const normalizeSearchText = (value: string): string => (
  toSimplified(value.normalize('NFKC')).trim().toLowerCase().replace(/祢/g, '你')
);

/** Convert a tone-free syllable without depending on a browser's ICU transliterator. */
const toZhuyin = (syllable: string): string => {
  const plain = ZERO_INITIALS[syllable] ?? syllable;
  const initial = plain.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/u)?.[0] ?? '';
  let final = plain.slice(initial.length);
  if (/^[jqx]$/u.test(initial)) final = final.replace(/^u/u, 'ü');
  if (/^(zh|ch|sh|r|z|c|s)$/u.test(initial) && final === 'i') final = '';
  if (final && !FINALS[final]) return '';
  return (INITIALS[initial] ?? '') + (FINALS[final] ?? '');
};

type DictionaryState = 'idle' | 'loading' | 'ready' | 'error';
let dictionaryState: DictionaryState = 'idle';
let pinyin: typeof import('pinyin-pro')['pinyin'] | undefined;
let dictionaryPromise: Promise<void> | undefined;
const dictionaryListeners = new Set<() => void>();
const publishDictionaryState = (state: DictionaryState) => {
  dictionaryState = state;
  dictionaryListeners.forEach(listener => listener());
};
export const getSearchDictionaryState = () => dictionaryState;
export const subscribeSearchDictionary = (listener: () => void) => {
  dictionaryListeners.add(listener);
  return () => { dictionaryListeners.delete(listener); };
};
/** Fetch the dictionary only when a phonetic query is used, never on initial app load. */
export const loadSearchDictionary = (): Promise<void> => {
  if (pinyin) return Promise.resolve();
  if (dictionaryPromise) return dictionaryPromise;
  publishDictionaryState('loading');
  dictionaryPromise = import('pinyin-pro').then(module => {
    pinyin = module.pinyin;
    publishDictionaryState('ready');
  }).catch(error => {
    dictionaryPromise = undefined;
    publishDictionaryState('error');
    throw error;
  });
  return dictionaryPromise;
};

type Phonetics = { pinyin: string; initials: string; zhuyin: string; zhuyinInitials: string };
const EMPTY_PHONETICS: Phonetics = { pinyin: '', initials: '', zhuyin: '', zhuyinInitials: '' };
type FieldIndex = { text: string; phonetics?: Phonetics };
const fieldCache = new Map<string, FieldIndex>();
const MAX_CACHED_FIELDS = 4096;
const getField = (raw: string): FieldIndex => {
  const cached = fieldCache.get(raw);
  if (cached) return cached;
  const field = { text: normalizeSearchText(raw) };
  if (fieldCache.size >= MAX_CACHED_FIELDS) fieldCache.delete(fieldCache.keys().next().value!);
  fieldCache.set(raw, field);
  return field;
};
const plainLatin = (value: string): string => value.normalize('NFKD').replace(/\p{M}/gu, '');
const getPhonetics = (field: FieldIndex): Phonetics => {
  if (field.phonetics) return field.phonetics;
  // Only names/metadata supplied by a caller are indexed; score bodies are never transliterated.
  const chinese = [...field.text].filter(character => HAN.test(character)).join('').slice(0, 240);
  if (chinese && !pinyin) return EMPTY_PHONETICS;
  const syllables = chinese && pinyin ? pinyin(chinese, { type: 'array', toneType: 'none' }) : [];
  const symbols = syllables.map(toZhuyin);
  field.phonetics = {
    pinyin: syllables.map(plainLatin).join(''),
    initials: syllables.map(syllable => plainLatin(syllable)[0]).join(''),
    zhuyin: symbols.join(''),
    zhuyinInitials: symbols.map(syllable => syllable[0] ?? '').join('')
  };
  return field.phonetics;
};

const pinyinQuery = (raw: string): string => {
  const value = plainLatin(raw).replace(/([ln])(?:v|u:)/gu, '$1u');
  if (!/^[a-z\s'1-5]+$/u.test(value)) return '';
  const syllables = value.split(/[\s']+/u).filter(Boolean);
  // Never strip digits from keys, tempos or identifiers such as Em7 and DL32.
  if (/\d/u.test(value) && !(syllables.length >= 2 && syllables.every(syllable => /^[a-z]+[1-5]?$/u.test(syllable) && /[aeiou]/u.test(syllable)))) return '';
  const letters = value.replace(/[^a-z]/gu, '');
  return letters.length >= 2 ? letters : '';
};
type KeyboardQuery = { symbols: string; initialsOnly: boolean };
const keyboardQuery = (raw: string): KeyboardQuery | null => {
  if (raw.length < 3 || raw.length > 80 || !/^[\x00-\x7f]+$/u.test(raw)) return null;
  const syllables: string[] = [];
  let current = '';
  let boundaries = 0;
  for (const key of raw) {
    if ('3467 '.includes(key)) {
      if (!current) return null;
      syllables.push(current);
      current = '';
      boundaries += 1;
    } else {
      const symbol = keyToZhuyin.get(key);
      if (!symbol) return null;
      current += symbol;
    }
  }
  if (current) syllables.push(current);
  const symbols = syllables.join('');
  if (!boundaries && symbols.length >= 3 && /^[ㄅ-ㄙㄧㄨㄩ]+$/u.test(symbols)) return { symbols, initialsOnly: true };
  if (syllables.length < 2 || !syllables.every(value => (
    /^[ㄅ-ㄙ]?[ㄧㄨㄩ]?[ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ]?$/u.test(value)
    && (!ZHUYIN_CONSONANTS.test(value) || /^[ㄓㄔㄕㄖㄗㄘㄙ]$/u.test(value))
  ))) return null;
  return { symbols, initialsOnly: false };
};

export const needsSearchDictionary = (raw: string): boolean => {
  const text = normalizeSearchText(raw);
  return Boolean(pinyinQuery(text) || ZHUYIN.test(text) || keyboardQuery(text)
    || text.split(/\s+/u).some(term => pinyinQuery(term) || keyboardQuery(term)));
};

export type SearchMatch = 'text' | 'phonetic' | 'keyboard';
export type SearchQuery = {
  isEmpty: boolean;
  match: (fields: readonly (string | undefined | null)[]) => SearchMatch | null;
};

/** Prepare once per query; field pronunciation keys are cached across keystrokes and renders. */
export const createSearchQuery = (raw: string): SearchQuery => {
  const text = normalizeSearchText(raw);
  const latin = pinyinQuery(text);
  const symbols = ZHUYIN.test(text) && ZHUYIN_ONLY.test(text) ? text.replace(/[^ㄅ-ㄩ]/gu, '') : '';
  const keyboard = keyboardQuery(text);
  const matchTerm = (fields: FieldIndex[], literal: string, phonetic: string, zhuyin: string, keys: KeyboardQuery | null): SearchMatch | null => {
    if (fields.some(field => field.text.includes(literal))) return 'text';
    if (phonetic || zhuyin) {
      if (fields.some(field => {
        const index = getPhonetics(field);
        return Boolean(phonetic && (index.pinyin.includes(phonetic) || index.initials.includes(phonetic)))
          || Boolean(zhuyin && (index.zhuyin.includes(zhuyin) || zhuyin.length >= 2 && index.zhuyinInitials.includes(zhuyin)));
      })) return 'phonetic';
    }
    if (keys && fields.some(field => {
      const index = getPhonetics(field);
      return keys.initialsOnly ? index.zhuyinInitials.includes(keys.symbols) : index.zhuyin.includes(keys.symbols);
    })) return 'keyboard';
    return null;
  };
  const terms = text.split(/\s+/u).filter(Boolean).map(term => ({ text: term, latin: pinyinQuery(term), symbols: ZHUYIN_ONLY.test(term) ? term.replace(/[^ㄅ-ㄩ]/gu, '') : '', keyboard: keyboardQuery(term) }));
  return {
    isEmpty: !text,
    match(values) {
      if (!text) return 'text';
      const fields = values.filter((value): value is string => Boolean(value)).map(getField);
      if (fields.map(field => field.text).join(' ').includes(text)) return 'text';
      const whole = matchTerm(fields, text, latin, symbols, keyboard);
      if (whole || terms.length < 2) return whole;
      let result: SearchMatch = 'text';
      for (const term of terms) {
        const match = matchTerm(fields, term.text, term.latin, term.symbols, term.keyboard);
        if (!match) return null;
        if (match === 'keyboard' || result === 'keyboard') result = 'keyboard';
        else if (match === 'phonetic') result = 'phonetic';
      }
      return result;
    }
  };
};

/** Keep the user's chosen sort within each tier, with literal results before inferred input. */
export const searchItems = <T,>(items: readonly T[], query: SearchQuery, fields: (item: T) => readonly (string | undefined | null)[]): T[] => {
  if (query.isEmpty) return [...items];
  const ranks = { text: 0, phonetic: 1, keyboard: 2 };
  return items.flatMap(item => {
    const match = query.match(fields(item));
    return match ? [{ item, rank: ranks[match] }] : [];
  }).sort((left, right) => left.rank - right.rank).map(entry => entry.item);
};
