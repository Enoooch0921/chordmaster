import React from 'react';

/** Setlist labels omit version/language tags, while meaningful song subtitles stay intact. */
export function compactSongTitle(title: string) {
  const suffix = title.match(/(?:\s*(?:\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】))+\s*$/u);
  if (!suffix) return title;
  const kept = suffix[0].replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】/gu, part => {
    const text = part.slice(1, -1).trim();
    const metadata = /版本?|雙語|双语|中譯|中译|翻譯|翻译|原調|原调|\b(?:bilingual|version|translation|arrangement)\b/iu.test(text)
      || /^(?:live(?:\s+(?:at|from)\b.*)?|acoustic|instrumental)$/iu.test(text)
      || /^(?:(?:中英|英中|中文|英文|國語|国语|台語|台语|粵語|粤语|華語|华语|English|Chinese|Mandarin|Cantonese|EN|ZH)\s*[/／、&+・·,，-]?\s*)+$/iu.test(text);
    return metadata ? '' : part;
  }).trim();
  const compact = [title.slice(0, suffix.index).trimEnd(), kept].filter(Boolean).join(' ');
  return compact || title;
}

/** Display-only hierarchy: the saved title stays intact for editing and search. */
export default function SongTitle({ title, number, bookBrackets = false, stackSubtitle = false, compact = false }: {
  title: string; number?: number; bookBrackets?: boolean; stackSubtitle?: boolean; compact?: boolean;
}) {
  const parts = (compact ? compactSongTitle(title) : title).split(/(\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】)/g);
  const prefix = number !== undefined && number > 0 ? `${number}. ` : '';
  if (stackSubtitle && parts.length > 1 && parts.slice(2).every((part, index) => index % 2 === 1 || !part.trim())) {
    return <><span className="song-title-main">{prefix}{bookBrackets && '《'}{parts[0].trimEnd()}{bookBrackets && '》'}</span>{' '}
      <span className="song-title-subtitle song-title-wrap-subtitle">{parts.filter((_, index) => index % 2 === 1).join(' ')}</span></>;
  }
  return <>{prefix}{bookBrackets && '《'}{parts.map((part, index) =>
    index % 2 === 1
      ? <span key={index} className="song-title-subtitle">{part}</span>
      : <React.Fragment key={index}>{part}</React.Fragment>
  )}{bookBrackets && '》'}</>;
}
