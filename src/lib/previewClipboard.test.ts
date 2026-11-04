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
  it.each(['marker', 'bars'] as const)('preserves a double barline when copying %s', (kind) => {
    const song = makeSong();
    song.sections[0].bars[0].doubleBar = true;
    const clipboard = copyPreviewContent(song, [target('a')], kind)!;
    const result = pastePreviewContent(song, [target('c')], clipboard);
    expect(result.error).toBeUndefined();
    expect(result.song.sections[0].bars[2].doubleBar).toBe(true);
  });

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

  it('overwrites occupied bars while keeping their identities', () => {
    const song = makeSong();
    const result = pastePreviewContent(song, [target('b')], copyPreviewContent(song, [target('a')], 'bars')!);
    expect(result.inserted).not.toBe(true);
    expect(result.song.sections[0].bars).toHaveLength(3);
    expect(result.song.sections[0].bars[1]).toEqual({ ...song.sections[0].bars[0], id: 'b' });
    expect(result.song.sections[0].bars[2]).toEqual(song.sections[0].bars[2]);
  });

  it('overwrites a consecutive range and extends only the destination section', () => {
    const song = makeSong();
    song.sections.push({ id: 'chorus', title: 'Chorus', bars: [{ id: 'd', chords: ['Am'] }] });
    const original = structuredClone(song);
    const result = pastePreviewContent(song, [target('b')], copyPreviewContent(song, [target('a'), target('b'), target('c')], 'bars')!);
    expect(result.song.sections[0].bars.map((bar) => bar.chords)).toEqual([original.sections[0].bars[0].chords, original.sections[0].bars[0].chords, ['F'], []]);
    expect(result.targets.slice(0, 2)).toEqual([target('b'), target('c')]);
    expect(result.song.sections[1]).toEqual(original.sections[1]);
    expect(new Set(result.song.sections[0].bars.map((bar) => bar.id)).size).toBe(4);
    expect(song).toEqual(original);
  });

  it('overwrites non-contiguous selections across sections and preserves surrounding key/meter', () => {
    const source = makeSong();
    source.timeSignature = '3/4';
    source.originalKey = 'D';
    const song = makeSong();
    song.sections.push({ id: 'chorus', title: 'Chorus', bars: [{ id: 'd', chords: ['Am'] }, { id: 'e', chords: ['G'] }] });
    const destinations = [target('b'), { sectionId: 'chorus', barId: 'd' }];
    const result = pastePreviewContent(song, destinations, copyPreviewContent(source, [target('a'), target('b')], 'bars')!);
    expect(result.targets).toEqual(destinations);
    for (const destination of destinations) {
      expect(getBarStoredKey(result.song, destination)).toBe('D');
    }
    expect(result.song.sections.map((section) => section.bars.length)).toEqual([3, 2]);
    expect(getEffectiveTimeSignatureForBar(result.song, result.song.sections[0].bars[2])).toBe('4/4');
    expect(getEffectiveTimeSignatureForBar(result.song, result.song.sections[1].bars[1])).toBe('4/4');
    expect(getBarStoredKey(result.song, target('c'))).toBe('C');
    expect(getBarStoredKey(result.song, { sectionId: 'chorus', barId: 'e' })).toBe('C');
  });

  it('rejects mismatched whole-bar destination counts atomically', () => {
    const song = makeSong();
    const result = pastePreviewContent(song, [target('a'), target('b'), target('c')], copyPreviewContent(song, [target('a'), target('b')], 'bars')!);
    expect(result.error).toBe('count-mismatch');
    expect(result.song).toBe(song);
  });

  it('rejects a meter change that would alter an untouched partial measure', () => {
    const source = makeSong();
    source.timeSignature = '3/4';
    const song = makeSong();
    song.sections[0].bars[2] = { id: 'c', chords: ['G'], partialMeasure: true, timeSignature: '1/4' };
    const result = pastePreviewContent(song, [target('b')], copyPreviewContent(source, [target('a')], 'bars')!);
    expect(result.error).toBe('time-signature');
    expect(result.song).toBe(song);
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
    const pasted = result.song.sections[0].bars[1];
    const following = result.song.sections[0].bars[2];
    expect(getEffectiveTimeSignatureForBar(result.song, pasted)).toBe('3/4');
    expect(getBarStoredKey(result.song, target(pasted.id!))).toBe('D');
    expect(getEffectiveTimeSignatureForBar(result.song, following)).toBe('4/4');
    expect(getBarStoredKey(result.song, target('c'))).toBe('C');
    expect(following.chords).toEqual([]);
  });

  it('copies a partial measure without turning its short length into a continuing meter', () => {
    const source = makeSong();
    source.sections[0].bars[0] = { id: 'a', chords: ['C'], timeSignature: '3/4', partialMeasure: true, riff: '1 | 2 | 3' };
    const clipboard = copyPreviewContent(source, [target('a')], 'bars')!;
    expect(clipboard.items[0].timeSignature).toBe('3/4');
    expect(clipboard.items[0].structuralTimeSignature).toBe('4/4');
    const destination = makeSong();
    const result = pastePreviewContent(destination, [target('b')], clipboard);
    expect(result.error).toBeUndefined();
    const pasted = result.song.sections[0].bars[1];
    expect(pasted.partialMeasure).toBe(true);
    expect(getEffectiveTimeSignatureForBar(result.song, pasted)).toBe('3/4');
    expect(getEffectiveTimeSignatureForBar(result.song, result.song.sections[0].bars[2])).toBe('4/4');
    const otherMeter = { ...destination, timeSignature: '6/8' };
    expect(pastePreviewContent(otherMeter, [target('b')], clipboard).error).toBe('time-signature');
  });

  it('rejects mismatched multi-lane counts without partial changes', () => {
    const song = makeSong();
    const result = pastePreviewContent(song, [target('a'), target('b'), target('c')], copyPreviewContent(song, [target('a'), target('b')], 'chords')!);
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

it.each(['chords', 'rhythm', 'jianpu'] as const)('pastes multiple %s bars from a single start, preserving other lanes and section boundaries', (kind) => {
  const song = makeSong();
  song.sections.push({ id: 'chorus', title: 'Chorus', bars: [{ id: 'd', chords: ['Am'], riff: '7' }] });
  const clipboard = copyPreviewContent(song, [target('b'), target('a')], kind)!;
  const result = pastePreviewContent(song, [target('b')], clipboard);
  expect(result.error).toBeUndefined();
  expect(result.targets).toEqual([target('b'), target('c')]);
  const field = kind === 'jianpu' ? 'riff' : kind;
  expect(result.song.sections[0].bars.slice(1).map(bar => bar[field])).toEqual(clipboard.items.map(item => item.bar[field]));
  expect(result.song.sections[1]).toEqual(song.sections[1]);
  for (const index of [1, 2]) {
    const bar = result.song.sections[0].bars[index];
    for (const other of ['chords', 'rhythm', 'riff', 'annotation', 'ending'] as const) {
      if (other !== field) expect(bar[other]).toEqual(song.sections[0].bars[index][other]);
    }
  }
  const extended = pastePreviewContent(song, [target('c')], clipboard);
  expect(extended.song.sections[0].bars).toHaveLength(4);
  expect(extended.song.sections[1]).toEqual(song.sections[1]);
  expect(extended.song.sections[0].bars[3].id).not.toBe('b');
});

it.each(['rhythm', 'jianpu'] as const)('copies all %s voices independently and clears old destination voices', kind => {
  const song = makeSong();
  const voiceField = kind === 'jianpu' ? 'riffVoices' : 'rhythmVoices';
  song.sections[0].bars[0].riffVoices = [{ id: 'harmony', label: 'Harmony', riff: '3 4 5 6' }];
  song.sections[0].bars[0].rhythmVoices = [{ id: 'drums', label: 'Drums', rhythm: 'q q q q' }];
  const clipboard = copyPreviewContent(song, [target('a'), target('b')], kind)!;
  const result = pastePreviewContent(song, [target('b')], clipboard);
  const pasted = result.song.sections[0].bars[1][voiceField];
  expect(pasted).toEqual(song.sections[0].bars[0][voiceField]);
  expect(pasted).not.toBe(clipboard.items[0].bar[voiceField]);
  const cleared = pastePreviewContent(result.song, [target('b')], copyPreviewContent(song, [target('c')], kind)!);
  expect(cleared.song.sections[0].bars[1][voiceField]).toBeUndefined();
});

it('rejects a later incompatible meter without applying earlier lanes or appending blanks', () => {
  const song = makeSong();
  const clipboard = copyPreviewContent(song, [target('a'), target('b')], 'jianpu')!;
  clipboard.items[1].timeSignature = '3/4';
  const result = pastePreviewContent(song, [target('c')], clipboard);
  expect(result.error).toBe('time-signature');
  expect(result.song).toBe(song);
  expect(result.targets).toEqual([]);
});

it.each(['bars', 'marker'] as const)('copies a leading double barline as %s without altering the preceding bar', kind => {
  const song = makeSong();
  song.sections[0].bars[0].doubleBarStart = true;
  const result = pastePreviewContent(song, [target('c')], copyPreviewContent(song, [target('a')], kind)!);
  expect(result.error).toBeUndefined();
  expect(result.song.sections[0].bars[2].doubleBarStart).toBe(true);
  expect(result.song.sections[0].bars[1]).toEqual(song.sections[0].bars[1]);
});
