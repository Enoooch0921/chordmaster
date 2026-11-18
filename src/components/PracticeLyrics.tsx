import React, { useMemo } from 'react';
import type { AppLanguage, LyricsDoc } from '../types';
import { expandSongMapSectionLabel, songMapDisplayParts, songMapLabel } from '../lib/songMap';
import { getLyricsBlocks, getLyricsLanguage } from '../utils/lyricsDocument';
import { prepareReadingSections } from '../utils/lyricsReading';

export default function PracticeLyrics({ doc, label, language }: {
  doc?: LyricsDoc; label: string; language: AppLanguage;
}) {
  const zh = language === 'zh';
  const sections = useMemo(() => {
    const blocks = getLyricsBlocks(doc);
    const display = doc?.displayLanguage ?? (blocks.some(block => block.chinese.trim()) ? getLyricsLanguage(doc) : 'english');
    return prepareReadingSections(blocks, display);
  }, [doc]);
  const canonical = songMapLabel(label);
  const match = (name: string) => sections.filter(section =>
    expandSongMapSectionLabel(section.label).some(alias => alias.toLowerCase() === name.toLowerCase()));
  // The roadmap owns the words. Never look them up by the borrowed score section.
  let matches = sections.filter(section => songMapLabel(section.label).name.toLowerCase() === canonical.name.toLowerCase());
  if (!matches.length) matches = match(canonical.name);
  if (!matches.length && songMapDisplayParts(label).cue) matches = match(songMapLabel(canonical.code).name);
  const instrumental = /^(Intro|Outro|Interlude|Instrumental|Ending|Turnaround)(?: \d+)?$/.test(canonical.name);
  let message = zh ? '這個段落尚未配到歌詞' : 'No lyrics matched this section';
  if (matches.length > 1) message = zh ? '有多段同名歌詞，請確認段落名稱' : 'Multiple lyrics sections share this name';
  else if (instrumental) message = zh ? '器樂段' : 'Instrumental';
  return <section className="practice-lyrics" aria-label={zh ? '練唱歌詞' : 'Sing-along lyrics'}>
    <h3>{label}</h3>
    {matches.length === 1 ? matches[0].rows.map((row, i) => <p key={i}>
      {row.map(line => <span key={line.field} lang={line.field === 'chinese' ? 'zh-Hant' : doc?.translationLanguage ?? 'en'}>{line.text}</span>)}
    </p>) : <p className="practice-lyrics-empty">{message}</p>}
  </section>;
}
