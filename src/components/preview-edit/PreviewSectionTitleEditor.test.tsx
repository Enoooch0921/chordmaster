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

const renderEditor = (sourceSong = song) => {
  const callbacks = { onChange: vi.fn(), onDone: vi.fn(), onCancel: vi.fn() };
  const renderWithSong = (nextSong: Song) => (
    <PreviewSectionTitleEditor
      session={createPreviewEditSession({ song: nextSong, target, inputMode: 'letters' })}
      language="zh"
      isMobile={false}
      {...callbacks}
    />
  );
  const result = render(renderWithSong(sourceSong));
  return {
    ...callbacks,
    rerenderSong: (nextSong: Song) => result.rerender(renderWithSong(nextSong))
  };
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

  it('suggests common section names from a partial prefix and accepts the active option with Enter', () => {
    const { onChange, onDone } = renderEditor();
    const input = screen.getByRole('textbox', { name: '段落名稱' });
    fireEvent.change(input, { target: { value: 'in' } });

    expect(screen.getByRole('listbox', { name: '段落名稱建議' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Intro' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Interlude' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Instrumental' })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('Intro');
    expect(onDone).toHaveBeenCalledWith('Intro');
  });

  it('matches contained text and lets touch or mouse selection choose Pre-Chorus', () => {
    const { onChange, onDone } = renderEditor();
    const input = screen.getByRole('textbox', { name: '段落名稱' });
    fireEvent.change(input, { target: { value: 'cho' } });

    expect(screen.getByRole('option', { name: 'Chorus' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pre-Chorus' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Post-Chorus' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Pre-Chorus' }));

    expect(onChange).toHaveBeenLastCalledWith('Pre-Chorus');
    expect(onDone).toHaveBeenCalledWith('Pre-Chorus');
  });

  it('includes section names already used by the current song', () => {
    renderEditor({
      ...song,
      sections: [
        ...song.sections,
        { id: 'section-2', title: 'Custom Build', bars: [{ id: 'bar-2', chords: ['F'] }] }
      ]
    });
    const input = screen.getByRole('textbox', { name: '段落名稱' });
    fireEvent.change(input, { target: { value: 'custom' } });
    expect(screen.getByRole('option', { name: 'Custom Build' })).toBeInTheDocument();
  });

  it('keeps suggestions open while the parent mirrors the typed section title', () => {
    const { rerenderSong } = renderEditor();
    const input = screen.getByRole('textbox', { name: '段落名稱' });
    fireEvent.change(input, { target: { value: 'in' } });
    rerenderSong({
      ...song,
      sections: [{ ...song.sections[0], title: 'in' }]
    });
    expect(screen.getByRole('listbox', { name: '段落名稱建議' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'in' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Intro' })).toHaveAttribute('aria-selected', 'true');
  });
});
