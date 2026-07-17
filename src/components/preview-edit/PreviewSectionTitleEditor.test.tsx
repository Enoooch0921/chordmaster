import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../../types';
import { createPreviewEditSession } from '../../lib/previewEditSession';
import PreviewSectionTitleEditor from './PreviewSectionTitleEditor';

const song: Song = {
  title: 'Sections',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'] }] }]
};

const target = {
  kind: 'section' as const,
  previewIdentity: 'song-1',
  sectionId: 'section-1',
  barId: 'bar-1',
  field: 'sectionName' as const,
  slotIndex: 0 as const,
  rawChordIndex: null,
  anchorKey: 'song-1|section-1|section|sectionName|title',
  anchorRect: { left: 20, top: 30, right: 100, bottom: 58, width: 80, height: 28 }
};

const renderEditor = () => {
  const callbacks = { onChange: vi.fn(), onDone: vi.fn(), onCancel: vi.fn() };
  render(
    <PreviewSectionTitleEditor
      session={createPreviewEditSession({ song, target, inputMode: 'letters' })}
      language="zh"
      isMobile={false}
      {...callbacks}
    />
  );
  return callbacks;
};

describe('PreviewSectionTitleEditor', () => {
  it('edits in place and submits with Enter', () => {
    const { onChange, onDone } = renderEditor();
    const input = screen.getByRole('textbox', { name: '段落名稱' });
    expect(input).toHaveFocus();
    expect(input.closest('[data-preview-section-title-editor]')).toHaveStyle({ left: '20px', top: '30px', width: '80px', height: '28px' });
    fireEvent.change(input, { target: { value: 'Chorus' } });
    expect(onChange).toHaveBeenCalledWith('Chorus');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onDone).toHaveBeenCalledWith('Chorus');
  });

  it('keeps Shift+Enter for a manual line break and cancels with Escape', () => {
    const { onDone, onCancel } = renderEditor();
    const input = screen.getByRole('textbox', { name: '段落名稱' });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('submits when focus leaves the in-place editor', () => {
    const { onDone } = renderEditor();
    const input = screen.getByRole('textbox', { name: '段落名稱' });
    fireEvent.blur(input, { relatedTarget: null });
    expect(onDone).toHaveBeenCalledWith('Verse');
  });
});
