import React, { useLayoutEffect, useMemo, useRef } from 'react';
import type { AppLanguage, LyricsDoc } from '../types';
import { expandSongMapSectionLabel, songMapDisplayParts, songMapLabel } from '../lib/songMap';
import { getLyricsBlocks, getLyricsLanguage, type LyricsLanguage } from '../utils/lyricsDocument';
import { prepareReadingSections } from '../utils/lyricsReading';

export default function PracticeLyrics({ doc, label, language, displayLanguage, labels = [], onSelect }: {
  doc?: LyricsDoc; label: string; language: AppLanguage; displayLanguage?: LyricsLanguage;
  labels?: string[]; onSelect?: (label: string) => void;
}) {
  const zh = language === 'zh';
  const active = useRef<HTMLElement>(null);
  const sections = useMemo(() => {
    const blocks = getLyricsBlocks(doc);
    return prepareReadingSections(blocks, displayLanguage ?? doc?.displayLanguage
      ?? (blocks.some(block => block.chinese.trim()) ? getLyricsLanguage(doc) : 'english'));
  }, [doc, displayLanguage]);
  const canonical = songMapLabel(label);
  const names = [canonical.name];
  if (songMapDisplayParts(label).cue) names.push(songMapLabel(canonical.code).name);
  if (canonical.name === 'Verse') names.push('Verse 1');
  const matches = names.map(name => sections.filter(s => expandSongMapSectionLabel(s.label)
    .some(alias => alias.toLowerCase() === name.toLowerCase()))).find(items => items.length);
  const activeId = matches?.length === 1 ? matches[0].id : undefined;
  useLayoutEffect(() => {
    active.current?.firstElementChild?.scrollIntoView?.({block:'nearest', inline:'nearest', behavior:'instant'});
  }, [activeId]);
  return <section className="practice-lyrics" aria-label={zh ? '練唱歌詞' : 'Sing-along lyrics'}>
    {sections.map(section => {
      const aliases = expandSongMapSectionLabel(section.label);
      const target = labels.find(l => aliases.includes(l));
      const current = section.id === activeId;
      return <article key={section.id} ref={current ? active : undefined} aria-current={current ? 'step' : undefined}>
        <h3>{target && onSelect
          ? <button type="button" onClick={() => onSelect(target)}>{section.label}</button>
          : section.label}</h3>
        {section.rows.map((row, i) => <p key={i}>{row.map(line =>
          <span key={line.field} lang={line.field === 'chinese' ? 'zh-Hant' : doc?.translationLanguage ?? 'en'}>{line.text}</span>)}</p>)}
      </article>;
    })}
    {!sections.length && <p>{zh ? '這首歌還沒有歌詞。' : 'This song has no lyrics yet.'}</p>}
  </section>;
}
