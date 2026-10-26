import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import { applyPickupEditorSong, openPickupPreviewSession, toPickupEditorSong } from './pickupEditing';
import { applyPreviewDraft, redoPreviewDraft, undoPreviewDraft } from './previewEditSession';
import { applyJianpuCommand, DEFAULT_JIANPU_INPUT_MODE } from './jianpuEditing';
import { PICKUP_EDITOR_BAR_ID, PICKUP_EDITOR_SECTION_ID } from '../utils/pickupUtils';

const song: Song = { title: 'Original', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: 's', title: 'Verse', bars: [{ id: 'b', chords: ['C'], riff: '1 | 2 | 3 | 4' }] }] };
const target = { kind: 'bar' as const, previewIdentity: 'song', sectionId: PICKUP_EDITOR_SECTION_ID, barId: PICKUP_EDITOR_BAR_ID,
  field: 'jianpu' as const, slotIndex: 0, rawChordIndex: null, anchorKey: 'pickup',
  anchorRect: { top: 0, left: 0, bottom: 40, right: 64, width: 64, height: 40 } };

describe('pickup preview drafts', () => {
  it('adds, edits, undoes and redoes only the pickup with the full song retained', () => {
    const session = openPickupPreviewSession(song, target, null);
    expect(session.baseSong).toBe(song);
    expect(session.draftSong.pickup?.timeSignature).toBe('1/4');
    expect(session.draftSong.sections).toBe(song.sections);
    const undone = undoPreviewDraft(session);
    expect(undone.draftSong.pickup).toBeUndefined();
    expect(undone.targetStatus).toBe('deleted');
    const redone = redoPreviewDraft(undone);
    expect(redone.targetStatus).toBe('active');
    const keyboard = toPickupEditorSong(redone.draftSong);
    const result = applyJianpuCommand(keyboard, target, { beatIndex: 0, unitIndex: 0, noteIndex: null },
      { type: 'insert-pitch', pitch: '5' }, DEFAULT_JIANPU_INPUT_MODE);
    const changed = applyPickupEditorSong(redone.draftSong, result.song);
    expect(changed.pickup?.riff).toBe('5');
    expect(changed.sections).toBe(song.sections);
    expect(changed.title).toBe(song.title);
    const edited = applyPreviewDraft(redone, changed);
    expect(undoPreviewDraft(edited).draftSong.pickup?.riff).toBeUndefined();
    expect(edited.baseSong.pickup).toBeUndefined(); // Cancel restores the real base song.
  });

  it('retains an earlier regular-bar draft when retargeting to the pickup', () => {
    const first = openPickupPreviewSession(song, target, null);
    const changed = { ...first.draftSong, title: 'Prior edit' };
    const session = openPickupPreviewSession(song, target, applyPreviewDraft(first, changed));
    expect(session.draftSong.title).toBe('Prior edit');
    const keyboard = toPickupEditorSong(session.draftSong);
    keyboard.sections[0].bars[0].riff = '6';
    keyboard.title = 'Must not escape adapter';
    expect(applyPickupEditorSong(session.draftSong, keyboard)).toMatchObject({ title: 'Prior edit', sections: song.sections, pickup: { riff: '6' } });
  });

  it.each(['1/8', '1/4', '3/8'])('keeps an insertion cursor at the end of a %s pickup and backspaces the last note', timeSignature => {
    let keyboard = toPickupEditorSong({ ...song, pickup: { timeSignature } });
    let cursor = { beatIndex: 0, unitIndex: 0, noteIndex: null as number | null };
    const mode = { ...DEFAULT_JIANPU_INPUT_MODE, duration: 'eighth' as const };
    const count = timeSignature === '1/8' ? 1 : timeSignature === '1/4' ? 2 : 3;
    for (let index = 0; index < count; index++) {
      const result = applyJianpuCommand(keyboard, target, cursor, { type: 'insert-pitch', pitch: '5' }, mode);
      expect(result.error).toBeNull();
      keyboard = result.song;
      cursor = result.cursor;
    }
    expect(cursor.noteIndex).toBeNull();
    const overflow = applyJianpuCommand(keyboard, target, cursor, { type: 'insert-pitch', pitch: '6' }, mode);
    expect(overflow.song).toBe(keyboard);
    expect(overflow.error).toBeTruthy();
    const deleted = applyJianpuCommand(keyboard, target, cursor, { type: 'delete' }, mode);
    expect(deleted.error).toBeNull();
    expect(deleted.song.sections[0].bars[0].riff?.match(/5/g)?.length ?? 0).toBe(count - 1);
    const replacement = applyJianpuCommand(deleted.song, target, deleted.cursor, { type: 'insert-pitch', pitch: '6' }, mode);
    expect(replacement.error).toBeNull();
    expect(replacement.song.sections[0].bars[0].riff).toContain('6_');
  });
});
