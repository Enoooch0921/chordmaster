import type { Song, AppLanguage } from '../types';
import { getLyricsBlocks } from '../utils/lyricsDocument';
import { currentKeyMode, formatKeyName } from '../utils/keyMode';

const formatSongLibraryCredits = (song: Song) => {
  const lyricist = song.lyricist?.trim();
  const composer = song.composer?.trim();
  const translator = song.translator?.trim();
  const versionNames = Array.from(new Set([lyricist, composer].filter(Boolean)));
  const parts: string[] = [];

  if (versionNames.length > 0) parts.push(versionNames.join(' / '));
  if (translator) parts.push(translator);

  return parts;
};

type Identity = { title: string; authors: string; version: string; language: string };
const identities = new WeakMap<Song, Map<AppLanguage, Identity>>();

/** Saved version suffixes and actual lyric contents, never inferred from a title's language. */
export const getSongLibraryIdentity = (song: Song, language: AppLanguage): Identity => {
  const cached = identities.get(song);
  if (cached?.has(language)) return cached.get(language)!;
  const zh = language === 'zh';
  const suffix = song.title.match(/(?:\s*(?:\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】))+\s*$/u);
  const version = suffix?.[0].trim() ?? '';
  const blocks = getLyricsBlocks(song.lyricsDoc);
  const languages: string[] = [];
  if (blocks.some(block => block.chinese.trim())) languages.push(zh ? '中文' : 'Chinese');
  if (blocks.some(block => block.english.trim())) {
    const code = song.lyricsDoc?.translationLanguage || 'en';
    try { languages.push(new Intl.DisplayNames([zh ? 'zh-Hant' : 'en'], { type: 'language' }).of(code) ?? code); }
    catch { languages.push(code); }
  }
  const identity = {
    title: (version ? song.title.slice(0, suffix!.index).trim() : song.title) || song.title,
    authors: formatSongLibraryCredits(song).join(' · ') || (zh ? '作者未註明' : 'Writer not specified'),
    version: version || (zh ? '版本未註明' : 'Version not specified'),
    language: languages.join(' / '),
  };
  const entries = cached ?? new Map<AppLanguage, Identity>();
  entries.set(language, identity); identities.set(song, entries);
  return identity;
};

export const getSongLibraryMeta = (song: Song, shuffleLabel: string) => {
  const creditParts = formatSongLibraryCredits(song);
  const primary = [
    formatKeyName(song.currentKey, currentKeyMode(song)),
    typeof song.tempo === 'number' ? `${song.tempo} BPM` : '',
    song.timeSignature
  ].filter(Boolean).join(' · ');
  const isShuffle = song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle';

  if (creditParts.length > 0 || isShuffle) {
    return {
      primary,
      secondary: [isShuffle ? shuffleLabel : '', ...creditParts].filter(Boolean).join(' · '),
      tooltip: [primary, isShuffle ? shuffleLabel : '', ...creditParts].filter(Boolean).join('\n'),
    };
  }

  return {
    primary,
    secondary: '',
    tooltip: primary,
  };
};
