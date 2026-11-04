import { Minus, Plus } from 'lucide-react';
import { memo, useMemo } from 'react';
import type { AppLanguage, Song } from '../types';
import type { SourceComparisonRow, SourceScoreExcerpt } from '../lib/setlistSourceComparison';
import { compareSetlistSourceScores } from '../lib/setlistSourceComparison';
import { getSongKeyStates, getSongTimeSignatureStates } from '../lib/songEditing';
import ChordSheet from './ChordSheet';
import PickupPreview from './PickupPreview';

function ScoreExcerpt({ value, fields, language }: { value: SourceScoreExcerpt; fields: string[]; language: AppLanguage }) {
  const { song, sectionIndex } = value;
  const bars = value.barIndex === undefined ? song.sections[sectionIndex].bars.map((_, index) => index) : [value.barIndex];
  const keys = getSongKeyStates(song);
  const meters = getSongTimeSignatureStates(song);
  // Display both versions as written, without personal capo, transposition or density.
  const written = { ...song, capo: 0, currentKey: song.originalKey, barRowCount: 2 as const, barNumberMode: 'none' as const, showNashvilleNumbers: false, showAbsoluteJianpu: false };
  return <div className="source-score-measures">
    {bars.map(barIndex => <div key={barIndex} className="source-score-measure" data-print-preview data-diff-fields={fields.join(' ')}>
      <div className="source-score-context"><span>{language === 'zh' ? `第 ${barIndex + 1} 小節` : `Bar ${barIndex + 1}`}</span><span><span data-score-context-field="keyChangeTo">{keys.barActiveKeys[sectionIndex]?.[barIndex] ?? song.originalKey}</span> · <span data-score-context-field="timeSignature">{meters.barActiveTimeSignatures[sectionIndex]?.[barIndex] ?? song.timeSignature}</span></span></div>
      <ChordSheet song={written} language={language} currentKey={song.originalKey} transposeFromOriginal={false}
        showPageBadges={false} excerpt={{ sectionIndex, barIndex }} />
      <div className="source-score-labels">{(['label', 'riffLabel', 'rhythmLabel'] as const).map(field => {
        const label = song.sections[sectionIndex].bars[barIndex][field];
        return label ? <span key={field} data-changed={fields.includes(field) || fields.includes('all') ? true : undefined}>{label}</span> : null;
      })}</div>
    </div>)}
  </div>;
}

/** Shared ink and glyphs with the chart, plus a separate, accessible difference layer. */
const SourceScoreComparison = memo(function SourceScoreComparison({ row, side, language }: { row: SourceComparisonRow; side: 'library' | 'setlist'; language: AppLanguage }) {
  const value = row[side], other = row[side === 'library' ? 'setlist' : 'library'];
  if (row.score) {
    const excerpt = row.score[side];
    return <div className="source-score-value" data-diff-side={side}>
      {excerpt ? <ScoreExcerpt value={excerpt} fields={row.score.fields} language={language} />
        : <span className="source-score-absent"><Minus size={16} aria-hidden="true" />{language === 'zh' ? '無此內容' : 'Absent'}</span>}
      {(!row.score.library || !row.score.setlist) && excerpt && <span className="source-score-presence"><Plus size={14} aria-hidden="true" />{language === 'zh' ? '此版本有此內容' : 'Present in this version'}</span>}
      <span className="sr-only">{value}</span>
    </div>;
  }
  if (row.pickup) {
    const song = row.pickup[side];
    return <div className="source-score-value source-score-pickup" data-print-preview data-diff-side={side}>
      {song.pickup ? <PickupPreview pickup={song.pickup} meter={song.timeSignature} language={language} playKey={song.originalKey} />
        : <span className="source-score-absent"><Minus size={16} aria-hidden="true" />{language === 'zh' ? '無弱起拍' : 'No pickup'}</span>}
      <span className="sr-only">{value}</span>
    </div>;
  }
  // Preserve shared text, highlighting only the changed span of metadata or lyrics.
  let start = 0, end = 0;
  while (start < Math.min(value.length, other.length) && value[start] === other[start]) start++;
  while (end < Math.min(value.length, other.length) - start && value[value.length - 1 - end] === other[other.length - 1 - end]) end++;
  const changed = value.slice(start, value.length - end);
  return <span className="source-text-value" data-diff-side={side}>{value.slice(0, start)}{changed && <mark>{changed}</mark>}{end > 0 && value.slice(-end)}</span>;
});
export default SourceScoreComparison;

export function SourceScoreHistory({ before, after, language }: { before: Song; after: Song; language: AppLanguage }) {
  const rows = useMemo(() => compareSetlistSourceScores(before, after, language, true), [before, after, language]);
  return <div className="source-score-history">
    {rows.length ? rows.map((row, index) => <div key={index}>
      <p className="source-comparison-label">{row.label}</p>
      <div className="source-score-history-versions"><div><h5>{language === 'zh' ? '先前' : 'Before'}</h5><SourceScoreComparison row={row} side="library" language={language} /></div>
        <div><h5>{language === 'zh' ? '目前' : 'Current'}</h5><SourceScoreComparison row={row} side="setlist" language={language} /></div></div>
    </div>) : <p>{language === 'zh' ? '無譜面差異' : 'No score changes'}</p>}
  </div>;
}
