import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../../types';
import { createPreviewEditSession } from '../../lib/previewEditSession';
import type { PreviewEditorDeviceLayout } from '../../lib/previewEditorLayout';
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

const renderEditor = ({
  session = createPreviewEditSession({ song, target, inputMode: 'letters' }),
  deviceLayout = 'desktop' as PreviewEditorDeviceLayout
} = {}) => {
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
  const renderWithSession = (nextSession = session) => (
    <PreviewBarEditor
      session={nextSession}
      language="zh"
      deviceLayout={deviceLayout}
      storedKey="C"
      displayedKey="C"
      storageMode="letters"
      {...callbacks}
    />
  );
  const result = render(renderWithSession());
  return {
    ...callbacks,
    rerenderSession: (nextSession: typeof session) => result.rerender(renderWithSession(nextSession))
  };
};

describe('PreviewBarEditor', () => {
  it('auto-focuses the hidden desktop chord capture and expands visual keys on demand', async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(screen.queryByPlaceholderText('點這裡使用文字輸入')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '和弦直接輸入' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /^G$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '顯示按鍵' }));
    expect(screen.getByRole('button', { name: /^G$/ })).toBeInTheDocument();
  });

  it('keeps touch input unfocused and writes a visual chord into the selected beat', async () => {
    const user = userEvent.setup();
    const { onApplyDraft } = renderEditor({ deviceLayout: 'phone' });
    expect(screen.queryByPlaceholderText('點這裡使用文字輸入')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '和弦直接輸入' })).not.toHaveFocus();
    await user.click(screen.getByRole('button', { name: /^G$/ }));
    const nextSong = onApplyDraft.mock.calls[0][0] as Song;
    expect(nextSong.sections[0].bars[0].chords).toEqual(['C', 'G', '', '']);
    expect(screen.getByRole('button', { name: 'Previous beat' })).toHaveTextContent('上一拍');
    expect(screen.getByRole('button', { name: 'Next beat' })).toHaveTextContent('下一拍');
  });

  it('keeps one fixed main keyboard without a vertical scrolling surface', async () => {
    const user = userEvent.setup();
    renderEditor({ deviceLayout: 'phone' });
    const dialog = screen.getByRole('dialog', { name: '預覽快捷編輯' });
    expect(dialog).toHaveAttribute('data-fixed-keyboard-height', '40dvh');
    expect(dialog.querySelector('[data-keyboard-mode="common"]')).not.toHaveClass('overflow-y-auto');
    expect(dialog.querySelector('[data-keyboard-view="main"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /切換鍵盤模式/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更多和弦種類' }));
    expect(dialog.querySelector('[data-keyboard-picker="quality"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'm13' })).toBeInTheDocument();
  });

  it('opens notation pickers from small symbol keys and returns to the same keyboard', async () => {
    const user = userEvent.setup();
    const { onApplyDraft } = renderEditor({ deviceLayout: 'tablet' });
    await user.click(screen.getByRole('button', { name: '選擇小節線與反覆' }));
    expect(document.querySelector('[data-keyboard-picker="barline"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '|: Repeat Start' })).toHaveTextContent('|:');
    expect(screen.getByRole('button', { name: '|: Repeat Start' })).not.toHaveTextContent('Repeat Start');
    await user.click(screen.getByRole('button', { name: '|: Repeat Start' }));
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].repeatStart).toBe(true);
    expect(document.querySelector('[data-keyboard-picker]')).not.toBeInTheDocument();
  });

  it('toggles a per-bar 4/4 override off and keeps complete symbol controls', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '選擇小節線與反覆' }));
    await user.click(screen.getByRole('button', { name: '|: Repeat Start' }));
    expect((onApplyDraft.mock.calls[0][0] as Song).sections[0].bars[0].repeatStart).toBe(true);

    await user.click(screen.getByRole('button', { name: '選擇小節拍號' }));
    await user.click(screen.getByRole('button', { name: '4/4' }));
    const withOverride = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(withOverride.sections[0].bars[0].timeSignature).toBe('4/4');
    rerenderSession({ ...base, draftSong: withOverride });
    await user.click(screen.getByRole('button', { name: '選擇小節拍號' }));
    await user.click(screen.getByRole('button', { name: '4/4' }));
    const withoutOverride = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(withoutOverride.sections[0].bars[0].timeSignature).toBeUndefined();
  });

  it('links the multi-measure count to its glyph and only enables it on beat one of an empty bar', async () => {
    const user = userEvent.setup();
    const emptySong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: [] }] }]
    };
    const firstBeatTarget = { ...target, slotIndex: 0, anchorKey: 'song-1|section-1|bar-1|chords|0' };
    const emptySession = createPreviewEditSession({ song: emptySong, target: firstBeatTarget, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: emptySession, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '休止與演奏符號' }));

    const countInput = screen.getByRole('textbox', { name: '多小節休止數量' });
    const applyRest = screen.getByRole('button', { name: '套用 4 小節休止' });
    expect(countInput.closest('[data-multi-rest-control]')).not.toBeNull();
    expect(applyRest).toBeEnabled();
    await user.click(applyRest);
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].chords).toEqual(['|4|', '', '', '']);

    const wrongBeatSession = createPreviewEditSession({ song: emptySong, target, inputMode: 'letters' });
    rerenderSession(wrongBeatSession);
    await user.click(screen.getByRole('button', { name: '休止與演奏符號' }));
    expect(screen.getByRole('button', { name: '套用 4 小節休止' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('只能放在第一拍');

    const occupiedFirstBeat = createPreviewEditSession({ song, target: firstBeatTarget, inputMode: 'letters' });
    rerenderSession(occupiedFirstBeat);
    await user.click(screen.getByRole('button', { name: '休止與演奏符號' }));
    expect(screen.getByRole('button', { name: '套用 4 小節休止' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('請先清空');
  });

  it('uses one active text field instead of a vertically stacked form', async () => {
    const user = userEvent.setup();
    renderEditor({ deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '文字與位置' }));
    expect(screen.getByRole('textbox', { name: '小節標籤' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '上方註記' }));
    expect(screen.getByRole('textbox', { name: '上方註記' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '小節標籤' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回和弦鍵盤' }));
    expect(screen.getByRole('button', { name: '選擇小節拍號' })).toBeInTheDocument();
  });

  it('normalizes typed roots before writing the draft', () => {
    const { onApplyDraft } = renderEditor();
    fireEvent.change(screen.getByRole('textbox', { name: '和弦直接輸入' }), { target: { value: 'bb/db' } });
    const nextSong = onApplyDraft.mock.calls[0][0] as Song;
    expect(nextSong.sections[0].bars[0].chords[1]).toBe('Bb/Db');
  });

  it('keeps hardware chord typing active after a visual key takes focus', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'tablet' });
    const cButton = screen.getByRole('button', { name: /^C$/ });
    await user.click(cButton);
    const withC = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...base, draftSong: withC });

    fireEvent.keyDown(screen.getByRole('button', { name: /^C$/ }), { key: 'b' });
    const withFlat = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(withFlat.sections[0].bars[0].chords[1]).toBe('Cb');
  });

  it('keeps outside clicks from implicitly completing or cancelling', async () => {
    const user = userEvent.setup();
    const { onDone, onCancel } = renderEditor();
    await user.click(document.body);
    expect(onDone).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('only shows the deletion message for an explicitly deleted target', () => {
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const missingDraft = { ...song, sections: [{ ...song.sections[0], bars: [] }] };
    const { rerenderSession } = renderEditor({
      session: { ...base, draftSong: missingDraft, past: [song], dirty: true },
      deviceLayout: 'tablet'
    });
    expect(screen.queryByText('小節已刪除，可復原或完成這次編輯')).not.toBeInTheDocument();
    expect(screen.getByText('正在恢復選取位置，請重新點選小節')).toBeInTheDocument();

    rerenderSession({ ...base, draftSong: missingDraft, past: [song], dirty: true, targetStatus: 'deleted' });
    expect(screen.getByText('小節已刪除，可復原或完成這次編輯')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });
});
