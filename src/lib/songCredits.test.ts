import { expect, it } from 'vitest';
import type { Song } from '../types';
import { applySongVersionText, getSongVersionText } from './songCredits';
import { classifySetlistSource } from './setlistSourceSync';
const base: Song = { title: 'Song', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };

it.each([
  { composer: 'Original Composer' },
  { lyricist: 'Original Version' },
  { lyricist: 'Original Writer', composer: 'Original Composer' },
  { lyricist: 'Same Credit', composer: 'Same Credit' }
])('preserves credit storage across separate temporary edits and reversals: %o', credits => {
  const original = { ...base, ...credits };
  const text = getSongVersionText(original);
  expect(applySongVersionText(original, text)).toBe(original);
  const changed = applySongVersionText(original, `${text}1`);
  expect(classifySetlistSource(original, changed, { songId: 'song', sourceContent: original, entryContent: original, sourceRevision: '', capturedAt: '' })).toBe('setlist-changed');
  const restored = applySongVersionText(changed, text);
  expect(restored).toEqual(original);
  expect(classifySetlistSource(original, restored)).toBe('aligned');
});

it('restores the exact original credits after clearing a field without reverting other edits', () => {
  const original = { ...base, lyricist: '  Original Writer ', composer: 'Original Composer' };
  const cleared = { ...applySongVersionText(original, '', original), tempo: 100 };
  const restored = applySongVersionText(cleared, getSongVersionText(original), original);
  expect(restored.lyricist).toBe(original.lyricist);
  expect(restored.composer).toBe(original.composer);
  expect(restored.tempo).toBe(100);
});
