import React from 'react';

/** Display-only hierarchy: the saved title stays intact for editing and search. */
export default function SongTitle({ title, number, bookBrackets = false, stackSubtitle = false }: {
  title: string; number?: number; bookBrackets?: boolean; stackSubtitle?: boolean;
}) {
  const parts = title.split(/(\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】)/g);
  const prefix = number !== undefined && number > 0 ? `${number}. ` : '';
  if (stackSubtitle && parts.length > 1 && parts.slice(2).every((part, index) => index % 2 === 1 || !part.trim())) {
    return <>{prefix}{bookBrackets && '《'}{parts[0].trimEnd()}{bookBrackets && '》'}<br/>
      <span className="song-title-subtitle">{parts.filter((_, index) => index % 2 === 1).join(' ')}</span></>;
  }
  return <>{prefix}{bookBrackets && '《'}{parts.map((part, index) =>
    index % 2 === 1
      ? <span key={index} className="song-title-subtitle">{part}</span>
      : <React.Fragment key={index}>{part}</React.Fragment>
  )}{bookBrackets && '》'}</>;
}
