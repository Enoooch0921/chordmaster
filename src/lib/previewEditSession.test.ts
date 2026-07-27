import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import {
  applyPreviewDraft,
  cyclePreviewNotationMode,
  createPreviewEditSession,
  getDefaultPreviewNotationCursor,
  getNextPreviewNotationMode,
  getPreviewCursorByModeForBar,
  markPreviewTargetDeleted,
  redoPreviewDraft,
  retargetPreviewEditSession,
  setPreviewEditChordInputMode,
  setPreviewEditInputMode,
  setPreviewNotationCursor,
  setPreviewNotationMode,
  undoPreviewDraft
} from './previewEditSession';

const song: Song = {
  title: 'Base',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'] }] }]
};

const target = {
  kind: 'bar' as const,
  previewIdentity: 'song-1',
  sectionId: 'section-1',
  barId: 'bar-1',
  field: 'chords' as const,
  slotIndex: 0,
  rawChordIndex: 0,
  anchorKey: 'song-1|section-1|bar-1|chords|0',
  anchorRect: { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }
};

describe('preview edit session', () => {
  it('keeps draft changes local until the caller commits', () => {
    const session = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const draft = { ...song, title: 'Draft' };
    const edited = applyPreviewDraft(session, draft);
    expect(edited.draftSong.title).toBe('Draft');
    expect(edited.baseSong.title).toBe('Base');
    expect(song.title).toBe('Base');
  });

  it('undoes and redoes visual button operations', () => {
    const session = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const first = applyPreviewDraft(session, { ...song, title: 'First' }, { now: 100 });
    const second = applyPreviewDraft(first, { ...song, title: 'Second' }, { now: 200 });
    const undone = undoPreviewDraft(second);
    expect(undone.draftSong.title).toBe('First');
    expect(redoPreviewDraft(undone).draftSong.title).toBe('Second');
  });

  it('coalesces text mutations within 500ms', () => {
    const session = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const first = applyPreviewDraft(session, { ...song, title: 'D' }, { mergeKey: 'chord-text', now: 100 });
    const second = applyPreviewDraft(first, { ...song, title: 'Dm' }, { mergeKey: 'chord-text', now: 500 });
    expect(second.past).toHaveLength(1);
    expect(undoPreviewDraft(second).draftSong).toBe(song);
  });

  it('retargets without discarding the existing draft or history', () => {
    const session = applyPreviewDraft(
      createPreviewEditSession({ song, target, inputMode: 'letters' }),
      { ...song, title: 'Draft' }
    );
    const moved = retargetPreviewEditSession(session, { ...target, slotIndex: 1 });
    expect(moved.draftSong.title).toBe('Draft');
    expect(moved.past).toHaveLength(1);
    expect(moved.target.slotIndex).toBe(1);
    expect(moved.targetStatus).toBe('active');
  });

  it('initializes the chord cursor and keeps the legacy input mode synchronized', () => {
    const session = createPreviewEditSession({ song, target, chordInputMode: 'nashville' });
    expect(session.notationMode).toBe('chords');
    expect(session.cursorByMode.chords).toEqual({
      kind: 'chord',
      slotIndex: 0,
      rawChordIndex: 0
    });
    expect(session.chordInputMode).toBe('nashville');
    expect(session.inputMode).toBe('nashville');

    const letters = setPreviewEditChordInputMode(session, 'letters');
    expect(letters.chordInputMode).toBe('letters');
    expect(letters.inputMode).toBe('letters');
    expect(setPreviewEditInputMode(letters, 'nashville').chordInputMode).toBe('nashville');
  });

  it('cycles chords, rhythm and jianpu in a stable order', () => {
    expect(getNextPreviewNotationMode('chords')).toBe('rhythm');
    expect(getNextPreviewNotationMode('rhythm')).toBe('jianpu');
    expect(getNextPreviewNotationMode('jianpu')).toBe('chords');

    const session = createPreviewEditSession({ song, target, inputMode: 'letters' });
    expect(cyclePreviewNotationMode(session).notationMode).toBe('rhythm');
  });

  it('provides semantic defaults for each notation mode', () => {
    expect(getDefaultPreviewNotationCursor('chords')).toEqual({
      kind: 'chord',
      slotIndex: 0,
      rawChordIndex: null
    });
    expect(getDefaultPreviewNotationCursor('rhythm')).toEqual({ kind: 'rhythm', cursorUnit: 0 });
    expect(getDefaultPreviewNotationCursor('jianpu')).toEqual({
      kind: 'jianpu',
      beatIndex: 0,
      unitIndex: 0,
      noteIndex: null
    });
  });

  it('preserves a separate semantic cursor when switching notation modes', () => {
    const session = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const rhythm = setPreviewNotationCursor(session, { kind: 'rhythm', cursorUnit: 1.5 });
    const jianpu = setPreviewNotationMode(rhythm, 'jianpu', {
      kind: 'jianpu',
      beatIndex: 2,
      unitIndex: 1,
      noteIndex: 0
    });
    const chords = setPreviewNotationMode(jianpu, 'chords');

    expect(chords.cursorByMode.chords).toEqual({ kind: 'chord', slotIndex: 0, rawChordIndex: 0 });
    expect(chords.cursorByMode.rhythm).toEqual({ kind: 'rhythm', cursorUnit: 1.5 });
    expect(chords.cursorByMode.jianpu).toEqual({
      kind: 'jianpu',
      beatIndex: 2,
      unitIndex: 1,
      noteIndex: 0
    });
  });

  it('reinitializes every mode cursor for a newly targeted meter', () => {
    const mixedMeterSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [
          song.sections[0].bars[0],
          { id: 'bar-2', chords: ['D'], timeSignature: '6/8', riff: '1 | 2' },
          { id: 'bar-3', chords: ['G'], timeSignature: '3/4', rhythm: 'q q q' }
        ]
      }]
    };

    const cursors = getPreviewCursorByModeForBar(
      mixedMeterSong,
      { sectionId: 'section-1', barId: 'bar-3' },
      { kind: 'chord', slotIndex: 2, rawChordIndex: 0 }
    );

    expect(cursors.chords).toEqual({ kind: 'chord', slotIndex: 2, rawChordIndex: 0 });
    expect(cursors.rhythm.cursorUnit).toBeLessThanOrEqual(12);
    expect(cursors.jianpu.beatIndex).toBeLessThan(3);
    expect(cursors.jianpu.unitIndex).toBeLessThan(4);
  });

  it('retargets a notation cursor without resetting cursors from other modes', () => {
    const session = setPreviewNotationCursor(
      createPreviewEditSession({ song, target, inputMode: 'letters' }),
      { kind: 'rhythm', cursorUnit: 2 }
    );
    const moved = retargetPreviewEditSession(session, {
      ...target,
      field: 'jianpu',
      cursor: { kind: 'jianpu', beatIndex: 1, unitIndex: 2, noteIndex: null }
    });

    expect(moved.notationMode).toBe('jianpu');
    expect(moved.cursorByMode.rhythm).toEqual({ kind: 'rhythm', cursorUnit: 2 });
    expect(moved.cursorByMode.jianpu).toEqual({
      kind: 'jianpu',
      beatIndex: 1,
      unitIndex: 2,
      noteIndex: null
    });
  });

  it('treats the legacy symbols and text tools as chord-mode targets', () => {
    const session = setPreviewNotationMode(
      createPreviewEditSession({ song, target, inputMode: 'letters' }),
      'rhythm'
    );
    const symbols = retargetPreviewEditSession(session, { ...target, field: 'symbols' });
    const text = retargetPreviewEditSession(symbols, { ...target, field: 'text' });
    expect(symbols.notationMode).toBe('chords');
    expect(text.notationMode).toBe('chords');
    expect(symbols.cursorByMode.rhythm).toEqual({ kind: 'rhythm', cursorUnit: 0 });
  });

  it('only preserves a deleted target state while the target is absent', () => {
    const session = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const missing = { ...song, sections: [{ ...song.sections[0], bars: [] }] };
    const deleted = markPreviewTargetDeleted(applyPreviewDraft(session, missing));
    expect(deleted.targetStatus).toBe('deleted');
    const restored = undoPreviewDraft(deleted);
    expect(restored.targetStatus).toBe('active');
    expect(redoPreviewDraft(restored).targetStatus).toBe('deleted');
  });
});
