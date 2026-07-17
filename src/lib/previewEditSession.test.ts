import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import {
  applyPreviewDraft,
  createPreviewEditSession,
  markPreviewTargetDeleted,
  redoPreviewDraft,
  retargetPreviewEditSession,
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
