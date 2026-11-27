import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import { applySheetReview, reviewNoteParts, titleWithoutReviewMarker } from './sheetReview';

const note = 'Band In。待檢查：D.S. 後回哪一段？弱起 3 拍。 待確認: 末拍是 G 嗎？';
const song: Song = {
  title: '同聲（手寫版）（待人工）', originalKey: 'D', currentKey: 'D', timeSignature: '4/4',
  sections: [{ id: 's', title: 'Intro', bars: [{ id: 'a', chords: ['D'], annotation: note }] }]
};
const target = { sectionId: 's', barId: 'a' };

describe('sheet review marks', () => {
  it('removes only a trailing status from the current title', () => {
    expect(applySheetReview(song, { kind: 'complete', title: song.title })).toEqual({ ...song, title: '同聲（手寫版）' });
    expect(titleWithoutReviewMarker('同聲 ( 待人工 )  ')).toBe('同聲');
    expect(titleWithoutReviewMarker('（待人工）')).toBeNull();
    expect(titleWithoutReviewMarker('等待人工智慧')).toBeNull();
    expect(applySheetReview(song, { kind: 'complete', title: '另一首（待人工）' })).toBe(song);
  });

  it('keeps free text and performance cues while recognizing follow-up questions', () => {
    const marked = (text: string) => reviewNoteParts(text).filter(part => part.review).map(part => part.text);
    expect(marked('這次仍待確認')).toEqual([]);
    expect(marked('待確認：落拍；Band In')).toEqual(['待確認：落拍']);
    expect(marked('待檢查：拍號未標；Ending 要幾拍？Band In')).toEqual(['待檢查：拍號未標；Ending 要幾拍？']);
    expect(marked('待檢查：在哪進？請確認鼓型。Piano In')).toEqual(['待檢查：在哪進？請確認鼓型。']);
  });

  it('removes one marked question by its position and preserves adjacent cues and other questions', () => {
    const parts = reviewNoteParts(note);
    expect(parts.map(part => part.text).join('')).toBe(note);
    const [first, second] = parts.filter(part => part.review);
    expect(first.text).toBe('待檢查：D.S. 後回哪一段？');
    const remove = { kind: 'remove-note', target, note, start: first.start } as const;
    expect(applySheetReview(song, remove).sections[0].bars[0].annotation).toBe('Band In。弱起 3 拍。 待確認: 末拍是 G 嗎？');
    expect(applySheetReview(song, { ...remove, start: second.start }).sections[0].bars[0].annotation).toBe('Band In。待檢查：D.S. 後回哪一段？弱起 3 拍。');
    expect(applySheetReview(song, { ...remove, note: '待檢查：已被別人更新' })).toBe(song);
    expect(applySheetReview(song, { ...remove, start: 0 })).toBe(song);
  });
});
