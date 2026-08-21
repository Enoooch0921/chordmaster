import { describe, expect, it } from 'vitest';
import type { Bar, Song } from '../types';
import { convertRelativeJianpuToAbsoluteNotation } from '../utils/jianpuUtils';
import {
  DEFAULT_JIANPU_INPUT_MODE,
  applyJianpuCommand,
  getDefaultJianpuCursor,
  getJianpuBarLayout,
  getJianpuCursorForNote,
  getJianpuInputModeAtCursor,
  reinterpretSongJianpuInput,
  type JianpuCursor
} from './jianpuEditing';

const target = { sectionId: 'section-1', barId: 'bar-1' };

const makeSong = (bar: Partial<Bar> = {}, timeSignature = '4/4'): Song => ({
  title: 'Jianpu command test',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature,
  sections: [{
    id: 'section-1',
    title: 'Verse',
    bars: [{ id: 'bar-1', chords: [], ...bar }]
  }]
});

const insertion = (beatIndex = 0, unitIndex = 0): JianpuCursor => ({
  beatIndex,
  unitIndex,
  noteIndex: null
});

describe('jianpu insertion commands', () => {
  it('uses an explicit time signature until the next explicit change', () => {
    const song: Song = {
      title: 'Inherited meter',
      originalKey: 'C',
      currentKey: 'C',
      timeSignature: '4/4',
      sections: [{
        id: 'section-1',
        title: 'Verse',
        bars: [
          { id: 'bar-1', chords: [], timeSignature: '5/4', riff: '1 | 2 | 3 | 4 | 5' },
          { id: 'bar-2', chords: [], riff: '1 | 2 | 3 | 4 | 5' },
          { id: 'bar-3', chords: [], timeSignature: '3/4', riff: '1 | 2 | 3' }
        ]
      }]
    };

    expect(getJianpuBarLayout(song, { sectionId: 'section-1', barId: 'bar-2' })).toMatchObject({
      timeSignature: '5/4',
      beats: expect.arrayContaining([
        expect.objectContaining({ beatIndex: 4 })
      ])
    });
    expect(getJianpuBarLayout(song, { sectionId: 'section-1', barId: 'bar-3' })?.beats).toHaveLength(3);
  });

  it('inserts digits, rests, and a hold without mutating the source song', () => {
    const source = makeSong();
    const note = applyJianpuCommand(source, target, insertion(), { type: 'insert-pitch', pitch: '1' });
    expect(note.error).toBeNull();
    expect(note.song.sections[0].bars[0].riff).toBe('1');
    expect(source.sections[0].bars[0].riff).toBeUndefined();

    const rest = applyJianpuCommand(makeSong(), target, insertion(), { type: 'insert-rest' });
    expect(rest.song.sections[0].bars[0].riff).toBe('0');

    const hold = applyJianpuCommand(makeSong(), target, insertion(1), { type: 'insert-hold' });
    expect(hold.error).toBeNull();
    expect(hold.song.sections[0].bars[0].riff).toBe(' | -');
    expect(applyJianpuCommand(hold.song, target, insertion(1), { type: 'insert-hold' }).error).toContain('全空');
  });

  it('fits an eighth-note insertion and preserves its unused units as placeholders', () => {
    const result = applyJianpuCommand(
      makeSong(),
      target,
      insertion(),
      { type: 'insert-pitch', pitch: '3' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );
    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('3_ss');
    expect(result.cursor).toMatchObject({ beatIndex: 0, unitIndex: 2, noteIndex: null });
  });

  it('allows eighth-quarter-eighth to fill the first two beats exactly', () => {
    const first = applyJianpuCommand(
      makeSong(),
      target,
      insertion(),
      { type: 'insert-pitch', pitch: '1' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );
    const middle = applyJianpuCommand(
      first.song,
      target,
      first.cursor,
      { type: 'insert-pitch', pitch: '2' },
      DEFAULT_JIANPU_INPUT_MODE
    );
    const last = applyJianpuCommand(
      middle.song,
      target,
      middle.cursor,
      { type: 'insert-pitch', pitch: '3' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );

    expect(middle.error).toBeNull();
    expect(last.error).toBeNull();
    expect(last.song.sections[0].bars[0].riff).toBe('1_2 | 3_');
  });

  it('allows eighth-quarter-eighth to fill the third and fourth beats exactly', () => {
    const first = applyJianpuCommand(
      makeSong(),
      target,
      insertion(2, 0),
      { type: 'insert-pitch', pitch: '1' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );
    const middle = applyJianpuCommand(
      first.song,
      target,
      first.cursor,
      { type: 'insert-pitch', pitch: '2' },
      DEFAULT_JIANPU_INPUT_MODE
    );
    const last = applyJianpuCommand(
      middle.song,
      target,
      middle.cursor,
      { type: 'insert-pitch', pitch: '3' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );

    expect(middle.error).toBeNull();
    expect(last.error).toBeNull();
    expect(last.song.sections[0].bars[0].riff).toBe(' |  | 1_2 | 3_');
  });

  it('uses a grouped dotted beat in 6/8', () => {
    const result = applyJianpuCommand(
      makeSong({}, '6/8'),
      target,
      insertion(),
      { type: 'insert-pitch', pitch: '5' },
      { ...DEFAULT_JIANPU_INPUT_MODE, dotted: true }
    );
    expect(result.song.sections[0].bars[0].riff).toBe('5.');
    expect(getJianpuBarLayout(result.song, target)).toMatchObject({
      beatUnits: 6,
      beats: [{ usedUnits: 6 }, { usedUnits: 0 }]
    });
  });

  it('rejects insertion on occupied units instead of overlapping content', () => {
    const song = makeSong({ riff: '1 | 2 | 3 | 4' });
    const result = applyJianpuCommand(song, target, insertion(), { type: 'insert-pitch', pitch: '7' });
    expect(result.error).toContain('沒有可用');
    expect(result.song).toBe(song);
  });
});

describe('duration and placeholder commands', () => {
  it('expands an eighth note by consuming placeholders and shrinks it by releasing them', () => {
    const eighthSong = makeSong({ riff: '1_ss' });
    const selected = getJianpuCursorForNote(eighthSong, target, 0, 0)!;
    const expanded = applyJianpuCommand(
      eighthSong,
      target,
      selected,
      { type: 'set-duration', duration: 'quarter' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );
    expect(expanded.error).toBeNull();
    expect(expanded.song.sections[0].bars[0].riff).toBe('1');

    const shrunk = applyJianpuCommand(
      expanded.song,
      target,
      getJianpuCursorForNote(expanded.song, target, 0, 0)!,
      { type: 'set-duration', duration: 'eighth' },
      expanded.inputMode
    );
    expect(shrunk.error).toBeNull();
    expect(shrunk.song.sections[0].bars[0].riff).toBe('1_ss');
  });

  it('does not expand through a following note', () => {
    const song = makeSong({ riff: '1_2_' });
    const result = applyJianpuCommand(
      song,
      target,
      getJianpuCursorForNote(song, target, 0, 0)!,
      { type: 'set-duration', duration: 'quarter' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );
    expect(result.error).toContain('空位');
    expect(result.song).toBe(song);
  });

  it('consumes continuation placeholders when a duration grows across a grouped beat', () => {
    const song = makeSong({ riff: 'ssss1_ | ssssss' }, '6/8');
    const result = applyJianpuCommand(
      song,
      target,
      getJianpuCursorForNote(song, target, 0, 0)!,
      { type: 'set-duration', duration: 'quarter' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );
    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('ssss1 | ssss');
    const layout = getJianpuBarLayout(result.song, target)!;
    expect(layout.beats[0]).toMatchObject({ carryOutUnits: 2 });
    expect(layout.beats[1]).toMatchObject({ carryInUnits: 2 });
  });

  it('deletes a note into equal-duration placeholders without shifting its neighbor', () => {
    const song = makeSong({ riff: '1_2_' });
    const result = applyJianpuCommand(
      song,
      target,
      getJianpuCursorForNote(song, target, 0, 0)!,
      { type: 'delete' }
    );
    expect(result.song.sections[0].bars[0].riff).toBe('ss2_');
    const layout = getJianpuBarLayout(result.song, target)!;
    expect(layout.beats[0].notes[0]).toMatchObject({ pitch: '2', unitStart: 2, unitEnd: 4 });
    expect(result.cursor).toEqual({ beatIndex: 0, unitIndex: 0, noteIndex: null });
  });

  it('adds and removes a dot when capacity permits', () => {
    const song = makeSong({ riff: '1_ss' });
    const selected = getJianpuCursorForNote(song, target, 0, 0)!;
    const dotted = applyJianpuCommand(
      song,
      target,
      selected,
      { type: 'toggle-dot' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );
    expect(dotted.song.sections[0].bars[0].riff).toBe('1_.s');
    const plain = applyJianpuCommand(
      dotted.song,
      target,
      getJianpuCursorForNote(dotted.song, target, 0, 0)!,
      { type: 'toggle-dot' },
      dotted.inputMode
    );
    expect(plain.song.sections[0].bars[0].riff).toBe('1_ss');
  });

  it('dots a first-beat quarter note by consuming the next empty beat', () => {
    const song = makeSong({ riff: '5' });
    const result = applyJianpuCommand(
      song,
      target,
      getJianpuCursorForNote(song, target, 0, 0)!,
      { type: 'toggle-dot' },
      DEFAULT_JIANPU_INPUT_MODE
    );

    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('5. | ss');
  });

  it('dots the previous note when the cursor is immediately after it', () => {
    const song = makeSong({ riff: '5' });
    const result = applyJianpuCommand(
      song,
      target,
      insertion(1, 0),
      { type: 'toggle-dot' },
      DEFAULT_JIANPU_INPUT_MODE
    );

    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('5. | ss');
    expect(result.cursor).toEqual({ beatIndex: 1, unitIndex: 2, noteIndex: null });
  });

	  it('can insert an eighth note after dotting the previous quarter note', () => {
	    const song = makeSong({ riff: '5' });
    const dotted = applyJianpuCommand(
      song,
      target,
      insertion(1, 0),
      { type: 'toggle-dot' },
      DEFAULT_JIANPU_INPUT_MODE
    );
    const inserted = applyJianpuCommand(
      dotted.song,
      target,
      dotted.cursor,
      { type: 'insert-pitch', pitch: '1' },
      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
    );

	    expect(inserted.error).toBeNull();
	    expect(inserted.song.sections[0].bars[0].riff).toBe('5. | 1_');
	  });

	  it('inserts three eighth-note triplets into one beat with fractional cursors', () => {
	    const tripletMode = { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' as const, triplet: true };
	    const first = applyJianpuCommand(makeSong(), target, insertion(), { type: 'insert-pitch', pitch: '1' }, tripletMode);
	    const second = applyJianpuCommand(first.song, target, first.cursor, { type: 'insert-pitch', pitch: '2' }, first.inputMode);
	    const third = applyJianpuCommand(second.song, target, second.cursor, { type: 'insert-pitch', pitch: '3' }, second.inputMode);

	    expect(first.cursor.unitIndex).toBeCloseTo(4 / 3);
	    expect(second.cursor.unitIndex).toBeCloseTo(8 / 3);
	    expect(third.error).toBeNull();
	    expect(third.song.sections[0].bars[0].riff).toBe('1_t2_t3_t');
	    expect(third.cursor).toMatchObject({ beatIndex: 1, unitIndex: 0, noteIndex: null });
	    expect(getJianpuBarLayout(third.song, target)?.beats[0]).toMatchObject({ usedUnits: 4 });
	  });

	  it('toggles triplet on a selected jianpu note and keeps dots disabled', () => {
	    const song = makeSong({ riff: '1_ss' });
	    const selected = getJianpuCursorForNote(song, target, 0, 0)!;
	    const triplet = applyJianpuCommand(
	      song,
	      target,
	      selected,
	      { type: 'toggle-triplet' },
	      { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' }
	    );
	    expect(triplet.error).toBeNull();
	    expect(triplet.song.sections[0].bars[0].riff).toBe('1_txss');
	    expect(getJianpuInputModeAtCursor(triplet.song, target, getJianpuCursorForNote(triplet.song, target, 0, 0)!)).toMatchObject({
	      duration: 'eighth',
	      dotted: false,
	      triplet: true
	    });

	    const dotted = applyJianpuCommand(
	      triplet.song,
	      target,
	      getJianpuCursorForNote(triplet.song, target, 0, 0)!,
	      { type: 'toggle-dot' },
	      triplet.inputMode
	    );
	    expect(dotted.error).toContain('三連音');
	    expect(dotted.song.sections[0].bars[0].riff).toBe('1_txss');
	  });
	});

describe('pitch modifiers and fixed-do interpretation', () => {
  it('replaces only the pitch of a selected note and preserves its semantic formatting', () => {
    const song = makeSong({ riff: '1,_2_' });
    const selected = getJianpuCursorForNote(song, target, 0, 0)!;
    expect(getJianpuInputModeAtCursor(song, target, selected)).toMatchObject({
      duration: 'eighth',
      octave: -1
    });

    const result = applyJianpuCommand(
      song,
      target,
      selected,
      { type: 'insert-pitch', pitch: '7' }
    );
    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('7,_2_');
    expect(getJianpuBarLayout(result.song, target)?.beats[0].notes[0]).toMatchObject({
      pitch: '7',
      duration: 'eighth',
      octave: -1
    });
  });

  it('edits accidental and octave on a selected relative note', () => {
    const song = makeSong({ riff: '1' });
    const selected = getJianpuCursorForNote(song, target, 0, 0)!;
    const sharp = applyJianpuCommand(song, target, selected, { type: 'set-accidental', accidental: '#' });
    expect(sharp.song.sections[0].bars[0].riff).toBe('#1');
    const high = applyJianpuCommand(
      sharp.song,
      target,
      getJianpuCursorForNote(sharp.song, target, 0, 0)!,
      { type: 'set-octave', octave: 1 },
      sharp.inputMode
    );
    expect(high.song.sections[0].bars[0].riff).toBe("#1'");
  });

  it('stores fixed-do input relatively using the sounding section key', () => {
    const song: Song = {
      ...makeSong(),
      originalKey: 'D',
      currentKey: 'D',
      jianpuInputAbsolute: true
    };
    const result = applyJianpuCommand(song, target, insertion(), { type: 'insert-pitch', pitch: '1' });
    const stored = result.song.sections[0].bars[0].riff;
    expect(stored).toBe('#6,');
    expect(convertRelativeJianpuToAbsoluteNotation(stored, 'D')).toBe('1');
  });

  it('uses an effective setlist sounding-key override for fixed-do input and reinterpretation', () => {
    const song: Song = {
      ...makeSong(),
      jianpuInputAbsolute: true
    };
    const pitchContext = { playKeyBySectionId: { 'section-1': 'D' as const } };
    const inserted = applyJianpuCommand(
      song,
      target,
      insertion(),
      { type: 'insert-pitch', pitch: '1' },
      DEFAULT_JIANPU_INPUT_MODE,
      pitchContext
    );
    expect(inserted.song.sections[0].bars[0].riff).toBe('#6,');
    expect(convertRelativeJianpuToAbsoluteNotation(inserted.song.sections[0].bars[0].riff, 'D')).toBe('1');

    const reinterpreted = reinterpretSongJianpuInput(
      { ...makeSong({ riff: '1' }), jianpuInputAbsolute: false },
      true,
      pitchContext
    );
    expect(reinterpreted.sections[0].bars[0].riff).toBe('#6,');
    expect(convertRelativeJianpuToAbsoluteNotation(reinterpreted.sections[0].bars[0].riff, 'D')).toBe('1');
  });

  it('clears fixed-do formatting in display coordinates without changing the displayed pitch', () => {
    const song: Song = {
      ...makeSong({ riff: '#6,' }),
      originalKey: 'D',
      currentKey: 'D',
      jianpuInputAbsolute: true
    };
    const selected = getJianpuCursorForNote(song, target, 0, 0)!;
    const result = applyJianpuCommand(song, target, selected, { type: 'clear-formatting' });
    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('#6,');
    expect(convertRelativeJianpuToAbsoluteNotation(result.song.sections[0].bars[0].riff, 'D')).toBe('1');
  });

  it('reinterprets every section and round-trips while keeping visible numbers', () => {
    const song: Song = {
      ...makeSong({ riff: '1 | #2' }),
      originalKey: 'D',
      currentKey: 'D',
      sections: [
        { id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: [], riff: '1 | #2' }] },
        { id: 'section-2', title: 'Bridge', keyChangeTo: 'E', bars: [{ id: 'bar-2', chords: [], riff: '3' }] }
      ]
    };
    const fixed = reinterpretSongJianpuInput(song, true);
    expect(fixed.jianpuInputAbsolute).toBe(true);
    expect(convertRelativeJianpuToAbsoluteNotation(fixed.sections[0].bars[0].riff, 'D')).toBe('1 | #2');
    expect(convertRelativeJianpuToAbsoluteNotation(fixed.sections[1].bars[0].riff, 'E')).toBe('3');
    const relative = reinterpretSongJianpuInput(fixed, false);
    expect(relative.jianpuInputAbsolute).toBe(false);
    expect(relative.sections.map((section) => section.bars[0].riff)).toEqual(['1 | #2', '3']);
  });

  it('uses section order for legacy sections that do not yet have ids', () => {
    const song: Song = {
      ...makeSong(),
      originalKey: 'D',
      currentKey: 'D',
      sections: [
        { title: 'Verse', bars: [{ chords: [], riff: '1' }] },
        { title: 'Bridge', keyChangeTo: 'E', bars: [{ chords: [], riff: '3' }] }
      ]
    };
    const fixed = reinterpretSongJianpuInput(song, true);
    expect(convertRelativeJianpuToAbsoluteNotation(fixed.sections[0].bars[0].riff, 'D')).toBe('1');
    expect(convertRelativeJianpuToAbsoluteNotation(fixed.sections[1].bars[0].riff, 'E')).toBe('3');
  });

  it('uses per-bar key changes when reinterpreting fixed-do jianpu', () => {
    const song: Song = {
      ...makeSong(),
      originalKey: 'C',
      currentKey: 'C',
      sections: [
        {
          id: 'section-1',
          title: 'Verse',
          bars: [
            { id: 'bar-1', chords: [], riff: '1' },
            { id: 'bar-2', keyChangeTo: 'D', chords: [], riff: '1' }
          ]
        }
      ]
    };

    const fixed = reinterpretSongJianpuInput(song, true);
    expect(convertRelativeJianpuToAbsoluteNotation(fixed.sections[0].bars[0].riff, 'C')).toBe('1');
    expect(convertRelativeJianpuToAbsoluteNotation(fixed.sections[0].bars[1].riff, 'D')).toBe('1');
    const relative = reinterpretSongJianpuInput(fixed, false);
    expect(relative.sections[0].bars.map((bar) => bar.riff)).toEqual(['1', '1']);
  });
});

describe('slurs and semantic navigation', () => {
  it('toggles a slur pair across adjacent bars and removes both endpoints', () => {
    const song: Song = {
      ...makeSong({ riff: '1' }),
      sections: [{
        id: 'section-1',
        title: 'Verse',
        bars: [
          { id: 'bar-1', chords: [], riff: '1' },
          { id: 'bar-2', chords: [], riff: '2' }
        ]
      }]
    };
    const cursor = getJianpuCursorForNote(song, target, 0, 0)!;
    const tied = applyJianpuCommand(song, target, cursor, { type: 'toggle-slur' });
    expect(tied.song.sections[0].bars.map((bar) => bar.riff)).toEqual(['(1', '2)']);
    const untied = applyJianpuCommand(
      tied.song,
      target,
      getJianpuCursorForNote(tied.song, target, 0, 0)!,
      { type: 'toggle-slur' }
    );
    expect(untied.song.sections[0].bars.map((bar) => bar.riff)).toEqual(['1', '2']);
  });

  it('connects the previous note to the selected note when a previous note exists', () => {
    const song = makeSong({ riff: '1_7_' });
    const selected = getJianpuCursorForNote(song, target, 0, 1)!;
    const result = applyJianpuCommand(song, target, selected, { type: 'toggle-slur' });

    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('(1_7_)');
  });

  it('connects the previous note when the cursor is immediately after the current note', () => {
    const song = makeSong({ riff: '1_7_' });
    const result = applyJianpuCommand(song, target, insertion(1, 0), { type: 'toggle-slur' });

    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('(1_7_)');
  });

  it('targets the selected beat when multiple notes have the same token offsets', () => {
    const song = makeSong({ riff: '5. | 1_ | 1_' });
    const selected = getJianpuCursorForNote(song, target, 2, 0)!;
    const result = applyJianpuCommand(song, target, selected, { type: 'toggle-slur' });

    expect(result.error).toBeNull();
    expect(result.song.sections[0].bars[0].riff).toBe('5. | (1_ | 1_)');
  });

  it('starts at the first available semantic position and moves across bars by stable id', () => {
    const song: Song = {
      ...makeSong({ riff: '1' }),
      sections: [{
        id: 'section-1',
        title: 'Verse',
        bars: [
          { id: 'bar-1', chords: [], riff: '1 | 2 | 3 | 4' },
          { id: 'bar-2', chords: [] }
        ]
      }]
    };
    expect(getDefaultJianpuCursor(song, target)).toMatchObject({ beatIndex: 3, noteIndex: 0 });
    const last = getJianpuCursorForNote(song, target, 3, 0)!;
    const moved = applyJianpuCommand(song, target, last, { type: 'move', direction: 1 });
    expect(moved.target.barId).toBe('bar-2');
    expect(moved.cursor).toEqual({ beatIndex: 0, unitIndex: 0, noteIndex: null });
  });

  it('moves between a selected note and the trailing input space in the same beat', () => {
    const song = makeSong({ riff: '2_' });
    const selected = getJianpuCursorForNote(song, target, 0, 0)!;

    const next = applyJianpuCommand(song, target, selected, { type: 'move', direction: 1 });
    expect(next.cursor).toEqual({ beatIndex: 0, unitIndex: 2, noteIndex: null });

    const previous = applyJianpuCommand(song, target, next.cursor, { type: 'move', direction: -1 });
    expect(previous.cursor).toEqual(selected);
  });

  it('continues through explicit trailing jianpu placeholder space', () => {
    const song = makeSong({ riff: '2_s' });
    const selected = getJianpuCursorForNote(song, target, 0, 0)!;

    const firstGap = applyJianpuCommand(song, target, selected, { type: 'move', direction: 1 });
    expect(firstGap.cursor).toEqual({ beatIndex: 0, unitIndex: 2, noteIndex: null });

    const secondGap = applyJianpuCommand(song, target, firstGap.cursor, { type: 'move', direction: 1 });
    expect(secondGap.cursor).toEqual({ beatIndex: 0, unitIndex: 3, noteIndex: null });
  });

  it('uses preview auto-duration shorthand when moving into trailing empty beat space', () => {
    const song = makeSong({ riff: '234' });
    const selected = getJianpuCursorForNote(song, target, 0, 2)!;

    expect(selected).toEqual({ beatIndex: 0, unitIndex: 2, noteIndex: 2 });

    const next = applyJianpuCommand(song, target, selected, { type: 'move', direction: 1 });
    expect(next.cursor).toEqual({ beatIndex: 0, unitIndex: 3, noteIndex: null });

    const previous = applyJianpuCommand(song, target, next.cursor, { type: 'move', direction: -1 });
    expect(previous.cursor).toEqual(selected);
  });
});
