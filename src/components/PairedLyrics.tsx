import type { ReactNode } from 'react';
import type { LyricsField, LyricsLinePair, LyricsSourceLine } from '../utils/lyricsPairing';

/** Keep each sentence pair together, side by side or Chinese above English.
 * No presentation-only padding/newlines are persisted in either language. */
export default function PairedLyrics({ pairs, start, end, gap, indent, layout = 'columns', renderLine }: {
  pairs: LyricsLinePair[];
  start: number;
  end: number;
  gap: number;
  indent: number;
  layout?: 'columns' | 'mixed';
  renderLine: (field: LyricsField, line: LyricsSourceLine, index: number) => ReactNode;
}) {
  const fields = layout === 'mixed' ? ['chinese', 'english'] as const : ['english', 'chinese'] as const;
  return <div className="col-span-full min-w-0" data-lyrics-layout={layout}>
    {pairs.slice(start, end).map((pair, index) => <div key={start + index} data-lyrics-pair={start + index}
      className="lyrics-pair grid" style={{ gridTemplateColumns: layout === 'mixed' ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', columnGap: gap, alignItems: 'start', breakInside: 'avoid' }}>
      {fields.filter(field => layout !== 'mixed' || pair[field]).map(field => <div key={field} data-lyrics-language={field} className="min-w-0" style={{ paddingLeft: indent }}>
        {pair[field] ? renderLine(field, pair[field], start + index) : null}
      </div>)}
    </div>)}
  </div>;
}
