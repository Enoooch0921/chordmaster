import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import { appendPreviewContent, copyPreviewContent, pastePreviewContent } from './previewClipboard';
import { applyPreviewDraft, createPreviewEditSession, redoPreviewDraft, undoPreviewDraft } from './previewEditSession';
import { getBarStoredKey, getEffectiveTimeSignatureForBar } from './songEditing';

const target = (barId: string) => ({ sectionId: 'verse', barId });
const makeSong = (): Song => ({
  title: 'Clipboard', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: 'verse', title: 'Verse', bars: [
    { id: 'a', chords: ['C', '', 'G/B', ''], rhythm: 'q e e q', riff: '1 2 3 4', annotation: 'Build', repeatStart: true, chordMarks: { 0: { special: true } } },
    { id: 'b', chords: ['F'], rhythm: 'h h', riff: '5 6 7 1', annotation: 'Keep me', ending: '2' },
    { id: 'c', chords: [] }
  ] }]
});

describe('preview clipboard commands', () => {
  it('appends multiple complete bars without consuming the existing empty last bar', () => {
    const song = makeSong();
    const result = appendPreviewContent(song, 'verse', copyPreviewContent(song, [target('a'), target('b')], 'bars')!);
    expect(result.error).toBeUndefined();
    expect(result.inserted).toBe(true);
    expect(result.song.sections[0].bars).toHaveLength(5);
    expect(result.song.sections[0].bars.slice(0, 3)).toEqual(song.sections[0].bars);
    expect(result.song.sections[0].bars.slice(3).map((bar) => bar.chords)).toEqual([song.sections[0].bars[0].chords, ['F']]);
    expect(new Set(result.song.sections[0].bars.map((bar) => bar.id)).size).toBe(5);
    expect(result.targets).toHaveLength(2);
  });

  it.each(['chords', 'rhythm', 'jianpu'] as const)('creates new bars containing only the copied %s lane', (kind) => {
    const song = makeSong();
    const result = appendPreviewContent(song, 'verse', copyPreviewContent(song, [target('a'), target('b')], kind)!);
    expect(result.error).toBeUndefined();
    expect(result.song.sections[0].bars).toHaveLength(5);
    const field = kind === 'jianpu' ? 'riff' : kind;
    for (const [index, bar] of result.song.sections[0].bars.slice(3).entries()) {
      expect(bar[field]).toEqual(song.sections[0].bars[index][field]);
      expect(bar.annotation).toBeUndefined();
      if (kind !== 'chords') expect(bar.chords).toEqual([]);
      if (kind !== 'rhythm') expect(bar.rhythm).toBeUndefined();
      if (kind !== 'jianpu') expect(bar.riff).toBeUndefined();
    }
  });

  it('does not leave new bars behind when appended content is incompatible', () => {
    const song = makeSong();
    const clipboard = copyPreviewContent(song, [target('a')], 'jianpu')!;
    clipboard.items[0].absoluteJianpu = true;
    const result = appendPreviewContent(song, 'verse', clipboard);
    expect(result.error).toBe('jianpu-mode');
    expect(result.song).toBe(song);
    expect(result.targets).toEqual([]);
    expect(appendPreviewContent(song, 'missing', clipboard).song).toBe(song);
  });

  it('copies multiple complete bars in sheet order as an independent snapshot', () => {
    const song = makeSong();
    const clipboard = copyPreviewContent(song, [target('b'), target('a')], 'bars')!;
    expect(clipboard.items.map(({ bar }) => bar.id)).toEqual(['a', 'b']);
    song.sections[0].bars[0].chords[0] = 'Dm';
    expect(clipboard.items[0].bar.chords[0]).toBe('C');
  });

  it('replaces the whole chord lane and its marks while preserving other lanes', () => {
    const song = makeSong();
    const clipboard = copyPreviewContent(song, [target('a')], 'chords')!;
    const result = pastePreviewContent(song, [target('b')], clipboard);
    expect(result.song.sections[0].bars[1]).toEqual({
      ...song.sections[0].bars[1], chords: ['C', '', 'G/B', ''], chordMarks: { 0: { special: true } }
    });
    expect(song.sections[0].bars[1].chords).toEqual(['F']);
  });

  it.each(['rhythm', 'jianpu'] as const)('pastes only the %s lane into multiple selected bars', (kind) => {
    const song = makeSong();
    const clipboard = copyPreviewContent(song, [target('a')], kind)!;
    const result = pastePreviewContent(song, [target('b'), target('c')], clipboard);
    const field = kind === 'jianpu' ? 'riff' : 'rhythm';
    for (const index of [1, 2]) {
      expect(result.song.sections[0].bars[index][field]).toBe(song.sections[0].bars[0][field]);
      expect(result.song.sections[0].bars[index].chords).toEqual(song.sections[0].bars[index].chords);
      expect(result.song.sections[0].bars[index].annotation).toBe(song.sections[0].bars[index].annotation);
    }
  });

  it('fills an empty bar with the first copied bar and inserts remaining bars with unique IDs', () => {
    const song = makeSong();
    const clipboard = copyPreviewContent(song, [target('a'), target('b')], 'bars')!;
    const result = pastePreviewContent(song, [target('c')], clipboard);
    const bars = result.song.sections[0].bars;
    expect(bars).toHaveLength(4);
    expect(bars[2]).toEqual({ ...song.sections[0].bars[0], id: 'c' });
    expect(bars[3].chords).toEqual(['F']);
    expect(new Set(bars.map(({ id }) => id)).size).toBe(4);
    expect(result.targets.map(({ barId }) => barId)).toEqual(['c', bars[3].id]);
  });

  it('inserts after occupied bars without overwriting their content', () => {
    const song = makeSong();
    const result = pastePreviewContent(song, [target('b')], copyPreviewContent(song, [target('a')], 'bars')!);
    expect(result.inserted).toBe(true);
    expect(result.song.sections[0].bars[1]).toEqual(song.sections[0].bars[1]);
    expect(result.song.sections[0].bars[2].chords).toEqual(song.sections[0].bars[0].chords);
    expect(result.song.sections[0].bars[3].id).toBe('c');
  });

  it('rejects a whole batch atomically when a destination has a different meter', () => {
    const song = makeSong();
    song.sections[0].bars[2].timeSignature = '3/4';
    const result = pastePreviewContent(song, [target('b'), target('c')], copyPreviewContent(song, [target('a')], 'rhythm')!);
    expect(result.error).toBe('time-signature');
    expect(result.song).toBe(song);
  });

  it('preserves copied bar meter/key without changing the untouched following bars', () => {
    const source = makeSong();
    source.timeSignature = '3/4';
    source.originalKey = 'D';
    source.sections[0].bars[0].chords = ['D', 'A', 'G'];
    const destination = makeSong();
    const result = pastePreviewContent(destination, [target('b')], copyPreviewContent(source, [target('a')], 'bars')!);
    const pasted = result.song.sections[0].bars[2];
    const following = result.song.sections[0].bars[3];
    expect(getEffectiveTimeSignatureForBar(result.song, pasted)).toBe('3/4');
    expect(getBarStoredKey(result.song, target(pasted.id!))).toBe('D');
    expect(getEffectiveTimeSignatureForBar(result.song, following)).toBe('4/4');
    expect(getBarStoredKey(result.song, target('c'))).toBe('C');
    expect(following.chords).toEqual([]);
  });

  it('rejects mismatched multi-lane counts without partial changes', () => {
    const song = makeSong();
    const result = pastePreviewContent(song, [target('c')], copyPreviewContent(song, [target('a'), target('b')], 'chords')!);
    expect(result).toMatchObject({ song, error: 'count-mismatch' });
    expect(result.song).toBe(song);
  });

  it('copies annotations without overwriting chords or navigation markers', () => {
    const song = makeSong();
    const result = pastePreviewContent(song, [target('b')], copyPreviewContent(song, [target('a')], 'annotation')!);
    expect(result.song.sections[0].bars[1]).toEqual({ ...song.sections[0].bars[1], annotation: 'Build' });
  });

  it('keeps letter chord degrees and slash bass spelling when pasting into a modulated bar', () => {
    const song = makeSong();
    song.sections[0].bars[1].keyChangeTo = 'D';
    const result = pastePreviewContent(song, [target('b')], copyPreviewContent(song, [target('a')], 'chords')!);
    expect(result.song.sections[0].bars[1].chords).toEqual(['D', '', 'A/C#', '']);
  });

  it('rejects incompatible jianpu input modes and stale destinations', () => {
    const song = makeSong();
    const clipboard = copyPreviewContent(song, [target('a')], 'jianpu')!;
    const fixed = { ...song, jianpuInputAbsolute: true };
    expect(pastePreviewContent(fixed, [target('b')], clipboard)).toMatchObject({ song: fixed, error: 'jianpu-mode' });
    expect(pastePreviewContent(song, [target('deleted')], clipboard).error).toBe('missing-target');
  });

  it('undoes and redoes a multi-bar paste in one step without losing earlier draft edits', () => {
    const song = makeSong();
    const session = createPreviewEditSession({ song, inputMode: 'letters', target: {
      kind: 'bar', ...target('a'), previewIdentity: 'song', field: 'chords', slotIndex: 0, rawChordIndex: 0,
      anchorKey: 'song|verse|a|chords|0', anchorRect: { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }
    } });
    const draft = applyPreviewDraft(session, { ...song, title: 'Earlier unsaved edit' });
    const result = pastePreviewContent(draft.draftSong, [target('c')], copyPreviewContent(draft.draftSong, [target('a'), target('b')], 'bars')!);
    const pasted = applyPreviewDraft(draft, result.song);
    const undone = undoPreviewDraft(pasted);
    expect(undone.draftSong).toEqual(draft.draftSong);
    expect(undone.draftSong.title).toBe('Earlier unsaved edit');
    expect(redoPreviewDraft(undone).draftSong).toEqual(result.song);
  });
});
