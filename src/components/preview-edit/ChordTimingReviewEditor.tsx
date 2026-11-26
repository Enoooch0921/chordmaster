import { useState } from 'react';
import type { AppLanguage } from '../../types';
import type { TimingReview } from '../../lib/chordTimingReview';

export default function ChordTimingReviewEditor({ review, language, onConfirm }: {
  review: TimingReview; language: AppLanguage; onConfirm: (positions: number[], matching: boolean) => void;
}) {
  const [positions, setPositions] = useState(review.positions);
  const zh = language === 'zh';
  return <fieldset className="flex flex-wrap items-end gap-2 rounded-lg border border-amber-200 p-2 text-xs">
    <legend className="px-1 font-semibold">{zh ? '核對和弦拍位' : 'Review chord timing'}</legend>
    {review.tokens.map((chord, index) => <label key={index} className="grid gap-1 font-semibold">
      <span translate="no">{chord}</span>
      <select className="min-h-8 rounded border border-slate-300 bg-white px-1 text-slate-900" name={`chord-beat-${index}`}
        aria-label={zh ? `第 ${index + 1} 個和弦 ${chord} 的拍位` : `Beat for chord ${index + 1}, ${chord}`} value={positions[index]}
        onChange={event => setPositions(positions.map((beat, i) => i === index ? Number(event.target.value) : beat))}>
        {Array.from({ length: review.beats }, (_, beat) =>
          <option key={beat} value={beat} disabled={beat <= (positions[index - 1] ?? -1) || beat >= (positions[index + 1] ?? review.beats)}>
            {zh ? `第 ${beat + 1} 拍` : `Beat ${beat + 1}`}
          </option>)}
      </select>
    </label>)}
    <div className="flex w-full flex-wrap gap-2">
      <button type="button" className="min-h-8 rounded-md border px-2" onClick={() => onConfirm(positions, false)}>
        {zh ? '確認此小節' : 'Confirm this bar'}</button>
      {review.count > 1 && <button type="button" className="min-h-8 rounded-md bg-indigo-700 px-2 font-semibold text-white" onClick={() => onConfirm(positions, true)}>
        {zh ? `確認全部 ${review.count} 個同型小節` : `Confirm all ${review.count} matching bars`}</button>}
    </div>
  </fieldset>;
}
