import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../../types';
import { createPreviewEditSession } from '../../lib/previewEditSession';
import PreviewBarEditor from './PreviewBarEditor';

const song: Song = {
  title: 'Test song',
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
  slotIndex: 1,
  rawChordIndex: null,
  anchorKey: 'song-1|section-1|bar-1|chords|1',
  anchorRect: { left: 20, top: 20, right: 40, bottom: 40, width: 20, height: 20 }
};

const renderEditor = (session = createPreviewEditSession({ song, target, inputMode: 'letters' })) => {
  const callbacks = {
    onApplyDraft: vi.fn(),
    onInputModeChange: vi.fn(),
    onNavigate: vi.fn(),
    onStructure: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onDone: vi.fn(),
    onCancel: vi.fn()
  };
  render(
    <PreviewBarEditor
      session={session}
      language="zh"
      deviceLayout="desktop"
      storedKey="C"
      displayedKey="C"
      storageMode="letters"
      {...callbacks}
    />
  );
  return callbacks;
};

describe('PreviewBarEditor', () => {
  it('does not auto-focus the text field when opened', () => {
    renderEditor();
    expect(screen.getByRole('textbox', { name: '目前和弦文字' })).not.toHaveFocus();
  });

  it('writes a visual chord into the selected empty beat', async () => {
    const user = userEvent.setup();
    const { onApplyDraft } = renderEditor();
    await user.click(screen.getByRole('button', { name: /^G$/ }));
    const nextSong = onApplyDraft.mock.calls[0][0] as Song;
    expect(nextSong.sections[0].bars[0].chords).toEqual(['C', 'G', '', '']);
  });

  it('exposes complete bar symbols and separate text fields', async () => {
    const user = userEvent.setup();
    const { onApplyDraft } = renderEditor();
    await user.click(screen.getByRole('button', { name: '符號' }));
    await user.click(screen.getByRole('button', { name: '|: Repeat Start' }));
    expect((onApplyDraft.mock.calls[0][0] as Song).sections[0].bars[0].repeatStart).toBe(true);

    await user.click(screen.getByRole('button', { name: '文字' }));
    expect(screen.getByRole('textbox', { name: '小節標籤' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '上方註記' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '左側文字' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '右側文字' })).toBeInTheDocument();
  });

  it('keeps outside clicks from implicitly completing or cancelling', async () => {
    const user = userEvent.setup();
    const { onDone, onCancel } = renderEditor();
    await user.click(document.body);
    expect(onDone).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '預覽快捷編輯' })).toBeInTheDocument();
  });

  it('keeps recovery controls visible after deleting the final bar', () => {
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    renderEditor({
      ...base,
      draftSong: { ...song, sections: [{ ...song.sections[0], bars: [] }] },
      past: [song],
      dirty: true
    });
    expect(screen.getByText('小節已刪除，可復原或完成這次編輯')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '完成' })).toBeEnabled();
  });
});
