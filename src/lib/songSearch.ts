import * as OpenCC from 'opencc-js/t2cn';
import type { LyricsDoc } from '../types';
import { getLyricsBlocks } from '../utils/lyricsDocument';

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
  // Editorial status is still searchable as literal text, but must not make
  // nearly every imported title match dr / ㄉㄖ (待人工 = dai ren gong).
  const pronunciationText = field.text.replace(/\(\s*待人工\s*\)/gu, '');
  const chinese = [...pronunciationText].filter(character => HAN.test(character)).join('').slice(0, 240);
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

// Lyrics stay literal-only: transliterating full song bodies would swamp short
// title initials and spend dictionary work on every verse. Weak keys release
// old documents after edits or workspace changes.
type SnippetBody = { raw: string; normalized: string; offsets?: number[] };
const lyricsCache = new WeakMap<LyricsDoc, { fields: string[]; bodies: SnippetBody[] }>();
const normalizeLyricsText = (value: string) => normalizeSearchText(value).replace(/[\s\p{P}\u200B-\u200D\uFEFF]+/gu, '');
const getLyricsData = (doc: LyricsDoc) => {
  const cached = lyricsCache.get(doc);
  if (cached) return cached;
  const blocks = getLyricsBlocks(doc);
  const bodies = (['chinese', 'english'] as const).map(language => {
    const raw = blocks.map(block => block[language]).join('\n');
    return { raw, normalized: normalizeLyricsText(raw) };
  });
  const value = { bodies, fields: bodies.map(body => body.normalized).filter(Boolean) };
  lyricsCache.set(doc, value);
  return value;
};
const getLyricsIndex = (doc?: LyricsDoc): readonly string[] => doc ? getLyricsData(doc).fields : [];

export type SearchMatch = 'text' | 'phonetic' | 'keyboard' | 'lyrics';
const matchOrder: Record<SearchMatch, number> = { text: 0, phonetic: 1, keyboard: 2, lyrics: 3 };
export type SearchQuery = {
  isEmpty: boolean;
  match: (fields: readonly (string | undefined | null)[], lyrics?: LyricsDoc) => SearchMatch | null;
  isExactTitleMatch: (title: string | undefined | null) => boolean;
  titleRank: (title: string | undefined | null) => number | null;
  lyricsSnippet: (lyrics?: LyricsDoc) => string | null;
};

const visibleLyricCharacters = /[^\s\p{P}\u200B-\u200D\uFEFF]/gu;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function snippetOffsets(body: SnippetBody): number[] {
  if (body.offsets) return body.offsets;
  const offsets: number[] = [];
  if (body.raw.normalize('NFKC') === body.raw && body.raw.toLowerCase().length === body.raw.length) {
    // Common CJK/Latin lyrics preserve character width. Avoid an OpenCC call
    // for every character, and reuse this map across all subsequent queries.
    for (const match of body.raw.matchAll(visibleLyricCharacters)) {
      for (let i = 0; i < match[0].length; i++) offsets.push(match.index + i);
    }
  }
  if (offsets.length !== body.normalized.length) {
    offsets.length = 0;
    for (const { segment, index } of graphemes.segment(body.raw)) {
      for (let i = 0, length = normalizeLyricsText(segment).length; i < length; i++) offsets.push(index);
    }
  }
  offsets.push(body.raw.length);
  body.offsets = offsets;
  return offsets;
}
/** Reuse the literal lyrics index; only build a short display excerpt for a hit. */
const lyricsSnippet = (doc: LyricsDoc | undefined, needles: string[]): string | null => {
  if (!doc || !needles.length) return null;
  const { bodies } = getLyricsData(doc);
  for (const needle of needles) {
    if (!needle) continue;
    for (const indexed of bodies) {
      const { raw: body, normalized } = indexed;
      const at = normalized.indexOf(needle);
      if (at < 0) continue;
      const offsets = snippetOffsets(indexed);
      const start = offsets[at], end = offsets[at + needle.length] ?? body.length;
      // Keep the match near the start so a single mobile line does not clip it away.
      const from = Math.max(0, start - 8), to = Math.min(body.length, Math.max(end + 24, start + 64), from + 140);
      return `${from > 0 ? '…' : ''}${body.slice(from, to).replace(/\s+/gu, ' ').trim()}${to < body.length ? '…' : ''}`;
    }
  }
  return null;
};

/** Prepare once per query; field pronunciation keys are cached across keystrokes and renders. */
export const createSearchQuery = (raw: string): SearchQuery => {
  const text = normalizeSearchText(raw);
  const latin = pinyinQuery(text);
  const symbols = ZHUYIN.test(text) && ZHUYIN_ONLY.test(text) ? text.replace(/[^ㄅ-ㄩ]/gu, '') : '';
  const keyboard = keyboardQuery(text);
  const matchTerm = (fields: FieldIndex[], literal: string, phonetic: string, zhuyin: string, keys: KeyboardQuery | null, lyricText: string, lyrics?: LyricsDoc): SearchMatch | null => {
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
    if (lyricText && getLyricsIndex(lyrics).some(field => field.includes(lyricText))) return 'lyrics';
    return null;
  };
  const lyricText = normalizeLyricsText(text);
  const terms = text.split(/\s+/u).filter(Boolean).map(term => ({ text: term, lyricText: normalizeLyricsText(term), latin: pinyinQuery(term), symbols: ZHUYIN_ONLY.test(term) ? term.replace(/[^ㄅ-ㄩ]/gu, '') : '', keyboard: keyboardQuery(term) }));
  const titleRank = (title: string | undefined | null): number | null => {
    if (!title || !text) return null;
    const stored = getField(title);
    if (stored.text === text) return 0;
    // Rank the song name separately from its trailing version/status labels.
    // Those labels remain searchable through the full metadata match below.
    const field = getField(stored.text.replace(/(?:\s*\([^()]*\))+\s*$/u, '').trim());
    if (!field.text) return null;
    if (field.text === text) return 0;
    const index = latin || symbols || keyboard ? getPhonetics(field) : EMPTY_PHONETICS;
    const phonetic = latin ? [index.pinyin, index.initials]
      : symbols ? [index.zhuyin, ...(symbols.length >= 2 ? [index.zhuyinInitials] : [])] : [];
    const needle = latin || symbols;
    const keys = keyboard?.initialsOnly ? index.zhuyinInitials : index.zhuyin;
    if (phonetic.includes(needle)) return 1;
    if (keyboard && keys === keyboard.symbols) return 2;
    if (field.text.startsWith(text)) return 3;
    if (phonetic.some(value => value.startsWith(needle))) return 4;
    if (keyboard && keys.startsWith(keyboard.symbols)) return 5;
    const match = query.match([field.text]);
    return match ? 6 + matchOrder[match] : null;
  };
  const query: SearchQuery = {
    isEmpty: !text,
    lyricsSnippet: lyrics => lyricsSnippet(lyrics, text ? [lyricText, ...terms.map(term => term.lyricText)] : []),
    titleRank,
    isExactTitleMatch: title => { const rank = titleRank(title); return rank !== null && rank < 3; },
    match(values, lyrics) {
      if (!text) return 'text';
      const fields = values.filter((value): value is string => Boolean(value)).map(getField);
      if (fields.map(field => field.text).join(' ').includes(text)) return 'text';
      const whole = matchTerm(fields, text, latin, symbols, keyboard, lyricText, lyrics);
      if (whole || terms.length < 2) return whole;
      let result: SearchMatch = 'text';
      for (const term of terms) {
        const match = matchTerm(fields, term.text, term.latin, term.symbols, term.keyboard, term.lyricText, lyrics);
        if (!match) return null;
        if (match === 'lyrics' || result === 'lyrics') result = 'lyrics';
        else if (match === 'keyboard' || result === 'keyboard') result = 'keyboard';
        else if (match === 'phonetic') result = 'phonetic';
      }
      return result;
    }
  };
  return query;
};

/** Complete names/initials, title prefixes, title fragments, metadata, then lyrics.
 * Preserve the caller's sort order when relevance is tied. */
export const searchItemsWithMatches = <T,>(items: readonly T[], query: SearchQuery, fields: (item: T) => readonly (string | undefined | null)[], lyrics?: (item: T) => LyricsDoc | undefined): Array<{ item: T; match: SearchMatch }> => {
  if (query.isEmpty) return items.map(item => ({ item, match: 'text' }));
  return items.flatMap(item => {
    const values = fields(item);
    const match = query.match(values, lyrics?.(item));
    return match ? [{ item, match, rank: query.titleRank(values[0]) ?? (match === 'lyrics' ? 12 : 9 + matchOrder[match]) }] : [];
  }).sort((left, right) => left.rank - right.rank);
};

export const searchItems = <T,>(items: readonly T[], query: SearchQuery, fields: (item: T) => readonly (string | undefined | null)[], lyrics?: (item: T) => LyricsDoc | undefined): T[] =>
  query.isEmpty ? [...items] : searchItemsWithMatches(items, query, fields, lyrics).map(entry => entry.item);
