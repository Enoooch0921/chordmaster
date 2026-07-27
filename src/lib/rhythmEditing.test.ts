import { describe, expect, it } from 'vitest';
import type { Bar, Song } from '../types';
import { parseRhythmNotation } from '../utils/rhythmUtils';
import {
  applyRhythmEdit,
  buildRhythmHiddenGapTokens,
  getDefaultRhythmCursor,
  getRhythmCursorUnits,
  getRhythmEventAtCursor,
  getRhythmTieContext,
  type RhythmCursor
} from './rhythmEditing';

const target = { sectionId: 'section-1', barId: 'bar-1' };

const makeSong = (bar: Partial<Bar> = {}, timeSignature = '4/4'): Song => ({
  title: 'Rhythm test',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature,
  sections: [{
    id: 'section-1',
    title: 'Verse',
    bars: [{ id: 'bar-1', chords: [], ...bar }]
  }]
});

const edit = (
  song: Song,
  cursor: number,
  action: Parameters<typeof applyRhythmEdit>[3]
) => applyRhythmEdit(song, target, { cursorUnit: cursor }, action);

const rhythmOf = (song: Song) => song.sections[0].bars[0].rhythm;

describe('rhythm insertion and capacity', () => {
  it('inserts notes and rests immutably while advancing the semantic cursor', () => {
    const song = makeSong();
    const first = edit(song, 0, { type: 'insert', token: 'q' });
    const second = edit(first.song, first.cursor.cursorUnit, { type: 'insert', token: 'er' });

    expect(first.changed).toBe(true);
    expect(first.song).not.toBe(song);
    expect(rhythmOf(second.song)).toBe('q er');
    expect(second.cursor).toEqual({ cursorUnit: 6 });
    expect(song.sections[0].bars[0].rhythm).toBeUndefined();
  });

  it.each([
    ['3/4', 'w'],
    ['6/8', 'w']
  ])('rejects a token that exceeds a %s bar', (timeSignature, token) => {
    const song = makeSong({}, timeSignature);
    const result = edit(song, 0, { type: 'insert', token });
    expect(result.song).toBe(song);
    expect(result.changed).toBe(false);
    expect(result.error).toContain('沒有足夠');
  });

  it('uses grouped compound-meter capacity in 6/8', () => {
    const song = makeSong({}, '6/8');
    const first = edit(song, 0, { type: 'insert', token: 'q.' });
    const second = edit(first.song, 6, { type: 'insert', token: 'q.' });
    expect(rhythmOf(second.song)).toBe('q. q.');
    expect(parseRhythmNotation(rhythmOf(second.song) ?? '', '6/8')).toMatchObject({
      beats: 2,
      beatUnits: 6,
      barUnits: 12,
      overflow: false,
      underfilled: false
    });
  });

  it('supports exact triplet fractions without drifting the cursor', () => {
    let song = makeSong();
    let cursor: RhythmCursor = { cursorUnit: 0 };
    for (let index = 0; index < 3; index += 1) {
      const result = applyRhythmEdit(song, target, cursor, { type: 'insert', token: 'q3' });
      expect(result.error).toBeNull();
      song = result.song;
      cursor = result.cursor;
    }

    expect(rhythmOf(song)).toBe('q3 q3 q3');
    expect(cursor.cursorUnit).toBeCloseTo(8);
    expect(parseRhythmNotation(rhythmOf(song) ?? '', '4/4').overflow).toBe(false);
  });

  it('rejects unsupported triplets and canonicalizes a triplet without a dot', () => {
    const song = makeSong();
    expect(edit(song, 0, { type: 'insert', token: 'h3' }).error).toContain('無效');
    const canonicalized = edit(song, 0, { type: 'insert', token: 'q3.' });
    expect(canonicalized.error).toBeNull();
    expect(rhythmOf(canonicalized.song)).toBe('q3');
  });
});

describe('rhythm replacement and modifiers', () => {
  it('keeps note modifiers when changing duration and strips them for rests', () => {
    const song = makeSong({ rhythm: 'q.^~' });
    const changedDuration = edit(song, 0, { type: 'insert', token: 'h' });
    expect(rhythmOf(changedDuration.song)).toBe('h.^~');

    const changedToRest = edit(song, 0, { type: 'insert', token: 'qr' });
    expect(rhythmOf(changedToRest.song)).toBe('qr');

    const undottedSong = makeSong({ rhythm: 'q q' });
    const ignoredIncomingDot = edit(undottedSong, 0, { type: 'insert', token: 'e.' });
    expect(rhythmOf(ignoredIncomingDot.song)).toBe('e ex q');
    expect(ignoredIncomingDot.cursor).toEqual({ cursorUnit: 2 });
  });

  it('preserves a same-duration triplet when changing a triplet note to a rest', () => {
    const song = makeSong({ rhythm: 'q3 q3 q3' });
    const result = edit(song, 0, { type: 'insert', token: 'qr' });
    expect(rhythmOf(result.song)).toBe('q3r q3 q3');
  });

  it('toggles dot, accent, and tie while enforcing their restrictions', () => {
    const song = makeSong({ rhythm: 'q' });
    const dotted = edit(song, 0, { type: 'toggle-dot' });
    const accented = edit(dotted.song, 0, { type: 'toggle-accent' });
    const tied = edit(accented.song, 0, { type: 'toggle-tie' });
    expect(rhythmOf(tied.song)).toBe('q.^~');

    const triplet = makeSong({ rhythm: 'q3 q3 q3' });
    expect(edit(triplet, 0, { type: 'toggle-dot' }).error).toContain('三連音');

    const rest = makeSong({ rhythm: 'qr' });
    expect(edit(rest, 0, { type: 'toggle-accent' }).error).toContain('休止符');
    expect(edit(rest, 0, { type: 'toggle-tie' }).error).toContain('休止符');
  });

  it('does not let a dotted event overlap the next event', () => {
    const song = makeSong({ rhythm: 'q q' });
    const result = edit(song, 0, { type: 'toggle-dot' });
    expect(result.song).toBe(song);
    expect(result.error).toContain('沒有足夠');
  });
});

describe('rhythm gaps, deletion, and cursor movement', () => {
  it('keeps later events at the same musical positions by writing hidden gaps', () => {
    const song = makeSong({ rhythm: 'q q q q' });
    const result = edit(song, 4, { type: 'delete' });
    const parsed = parseRhythmNotation(rhythmOf(result.song) ?? '', '4/4');

    expect(rhythmOf(result.song)).toBe('q qx q q');
    expect(parsed.events.filter((event) => !event.isHidden).map((event) => event.startUnit)).toEqual([0, 8, 12]);
    expect(result.cursor).toEqual({ cursorUnit: 0 });
  });

  it('can fill a hidden gap without shifting existing events', () => {
    const song = makeSong({ rhythm: 'q qx q' });
    const result = edit(song, 4, { type: 'insert', token: 'q' });
    expect(rhythmOf(result.song)).toBe('q q q');
    expect(parseRhythmNotation(rhythmOf(result.song) ?? '', '4/4').events.map((event) => event.startUnit)).toEqual([0, 4, 8]);
  });

  it('serializes regular and triplet-sized hidden gaps exactly', () => {
    expect(buildRhythmHiddenGapTokens(4)).toEqual(['qx']);
    expect(buildRhythmHiddenGapTokens(8 / 3)).toEqual(['q3x']);
    expect(parseRhythmNotation(buildRhythmHiddenGapTokens(4 / 3).join(' '), '4/4').totalUnits).toBeCloseTo(4 / 3);
  });

  it('clears the field when its last visible event is deleted', () => {
    const song = makeSong({ rhythm: 'hx q' });
    const result = edit(song, 8, { type: 'delete', mode: 'backspace' });
    expect(rhythmOf(result.song)).toBeUndefined();
    expect(result.cursor).toEqual({ cursorUnit: 0 });
  });

  it('exposes and moves through renderer-compatible semantic cursor units', () => {
    const song = makeSong({ rhythm: 'q qx e' });
    expect(getRhythmCursorUnits(song, target)).toEqual([0, 4, 5, 6, 8, 10]);
    expect(getDefaultRhythmCursor(song, target)).toEqual({ cursorUnit: 10 });
    expect(edit(song, 8, { type: 'move', direction: -1 }).cursor).toEqual({ cursorUnit: 6 });
    expect(edit(song, 8, { type: 'home' }).cursor).toEqual({ cursorUnit: 0 });
    expect(edit(song, 0, { type: 'end' }).cursor).toEqual({ cursorUnit: 10 });
    expect(getRhythmEventAtCursor(song, target, { cursorUnit: 10 })?.base).toBe('e');
  });
});

describe('cross-bar ties and stable targets', () => {
  it('toggles a tie on the final playable event and exposes it to the next bar', () => {
    const song = makeSong({ rhythm: 'q q' });
    song.sections[0].bars.push({ id: 'bar-2', chords: [], rhythm: 'e e' });
    const tied = edit(song, 8, { type: 'toggle-tie' });

    expect(rhythmOf(tied.song)).toBe('q q~');
    expect(getRhythmTieContext(tied.song, target)).toMatchObject({
      tieFromPrevious: false,
      tieToNext: true,
      nextNotation: 'e e'
    });
    expect(getRhythmTieContext(tied.song, { sectionId: 'section-1', barId: 'bar-2' }).tieFromPrevious).toBe(true);
  });

  it('finds adjacent bars across section boundaries', () => {
    const song = makeSong({ rhythm: 'q~' });
    song.sections.push({
      id: 'section-2',
      title: 'Chorus',
      bars: [{ id: 'bar-2', chords: [], rhythm: 'q' }]
    });
    const context = getRhythmTieContext(song, target);
    expect(context.nextNotation).toBe('q');
    expect(getRhythmTieContext(song, { sectionId: 'section-2', barId: 'bar-2' }).tieFromPrevious).toBe(true);
  });

  it('returns the original song when stable ids no longer resolve', () => {
    const song = makeSong({ rhythm: 'q' });
    const result = applyRhythmEdit(
      song,
      { sectionId: 'missing', barId: 'missing' },
      { cursorUnit: 0 },
      { type: 'insert', token: 'q' }
    );
    expect(result.song).toBe(song);
    expect(result.changed).toBe(false);
    expect(result.error).toContain('找不到');
  });
});
