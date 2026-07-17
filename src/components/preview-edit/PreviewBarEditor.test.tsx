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
    expect(screen.getByRole('button', { name: '選擇小節拍號' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '文字欄位' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '顯示字母數字鍵' }));
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
    renderEditor({ deviceLayout: 'phone' });
    const dialog = screen.getByRole('dialog', { name: '預覽快捷編輯' });
    expect(dialog).toHaveAttribute('data-fixed-keyboard-height', '40dvh');
    expect(dialog.querySelector('[data-keyboard-mode="common"]')).toHaveAttribute('data-keyboard-surface', 'system');
    expect(dialog.querySelector('[data-keyboard-mode="common"]')).not.toHaveClass('overflow-y-auto');
    expect(dialog.querySelector('[data-keyboard-view="main"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /切換鍵盤模式/ })).not.toBeInTheDocument();
    const roots = dialog.querySelector('[data-chord-key-row="roots"]');
    const modifiers = dialog.querySelector('[data-chord-key-row="modifiers"]');
    expect(roots).toHaveAttribute('data-key-surface', 'character');
    expect(modifiers).toHaveAttribute('data-key-surface', 'utility');
    expect(roots?.querySelectorAll('button')).toHaveLength(10);
    expect(roots?.querySelector('button')).toHaveClass('rounded-[12px]');
    expect(roots).toHaveTextContent('CDEFGAB♭♯m');
    expect(roots).not.toHaveTextContent('♮');
    expect(dialog.querySelector('[data-chord-key-row="suffixes"]')?.querySelectorAll('button')).toHaveLength(12);
    expect(screen.getByRole('button', { name: '加入數字 8' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'maj7' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'm7' })).not.toBeInTheDocument();
  });

  it('composes minor, extended and altered qualities one fragment at a time', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'phone' });
    const applyAndRerender = async (buttonName: string | RegExp) => {
      await user.click(screen.getByRole('button', { name: buttonName }));
      const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
      rerenderSession({ ...base, draftSong: nextSong });
      return nextSong;
    };

    await applyAndRerender(/^C$/);
    await applyAndRerender('加入小和弦 m');
    const minorSeven = await applyAndRerender('加入數字 7');
    expect(minorSeven.sections[0].bars[0].chords[1]).toBe('Cm7');

    const secondTarget = { ...target, slotIndex: 2, anchorKey: 'song-1|section-1|bar-1|chords|2' };
    const secondBase = createPreviewEditSession({ song, target: secondTarget, inputMode: 'letters' });
    rerenderSession(secondBase);
    await user.click(screen.getByRole('button', { name: /^C$/ }));
    let nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...secondBase, draftSong: nextSong });
    await user.click(screen.getByRole('button', { name: '加入數字 1' }));
    nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...secondBase, draftSong: nextSong });
    await user.click(screen.getByRole('button', { name: '加入數字 1' }));
    nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].chords[2]).toBe('C11');

    rerenderSession({ ...secondBase, draftSong: nextSong });
    await user.click(screen.getByRole('button', { name: '降記號' }));
    nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...secondBase, draftSong: nextSong });
    await user.click(screen.getByRole('button', { name: '加入數字 9' }));
    nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].chords[2]).toBe('C11b9');
  });

  it('keeps a visual flat attached to the selected root', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: /^C$/ }));
    const withC = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...base, draftSong: withC });
    await user.click(screen.getByRole('button', { name: '降記號' }));
    const withFlat = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(withFlat.sections[0].bars[0].chords[1]).toBe('Cb');
  });

  it('opens compact anchored popovers for time signatures and endings', async () => {
    const user = userEvent.setup();
    renderEditor({ deviceLayout: 'phone' });

    await user.click(screen.getByRole('button', { name: '選擇小節拍號' }));
    const timePicker = document.querySelector('[data-keyboard-picker="time"]');
    expect(timePicker).toHaveAttribute('data-picker-placement', 'anchored');
    expect(timePicker?.querySelector('[data-picker-layout="time-grid"]')).toBeInTheDocument();
    expect(timePicker?.querySelector('[data-picker-arrow]')).toBeInTheDocument();
    expect(timePicker?.querySelectorAll('[data-time-signature-glyph]')).toHaveLength(14);
    expect(screen.getByRole('button', { name: '9/8' })).toBeInTheDocument();
    expect(document.querySelector('[data-keyboard-view="main"]')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '選擇小節拍號' }));
    await user.click(screen.getByRole('button', { name: '選擇房子記號' }));
    const endingPicker = document.querySelector('[data-keyboard-picker="ending"]');
    expect(endingPicker).toHaveAttribute('data-picker-placement', 'anchored');
    expect(endingPicker?.querySelector('[data-picker-layout="ending-list"]')).toBeInTheDocument();
    expect(endingPicker?.querySelector('[data-picker-arrow]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ending 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清除房子記號' })).toBeInTheDocument();
  });

  it('keeps articulation in its own picker between rests and endings', async () => {
    const user = userEvent.setup();
    renderEditor({ deviceLayout: 'phone' });
    const restTrigger = screen.getByRole('button', { name: '休止符與整小節符號' }) as HTMLButtonElement;
    const articulationTrigger = screen.getByRole('button', { name: '選擇演奏記號' }) as HTMLButtonElement;
    const endingTrigger = screen.getByRole('button', { name: '選擇房子記號' }) as HTMLButtonElement;
    const utilityButtons = Array.from(restTrigger.parentElement?.querySelectorAll('button') ?? []);
    expect(utilityButtons.indexOf(articulationTrigger)).toBe(utilityButtons.indexOf(restTrigger) + 1);
    expect(utilityButtons.indexOf(endingTrigger)).toBe(utilityButtons.indexOf(articulationTrigger) + 1);

    await user.click(restTrigger);
    expect(screen.queryByRole('button', { name: '搶拍' })).not.toBeInTheDocument();
    await user.click(restTrigger);
    await user.click(articulationTrigger);
    expect(document.querySelector('[data-keyboard-picker="articulation"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '搶拍' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拖拍' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重音' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '延長記號' })).toBeInTheDocument();
  });

  it('deletes one character from the current chord instead of clearing it', async () => {
    const user = userEvent.setup();
    const chordSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C', 'C11', '', ''] }] }]
    };
    const chordSession = createPreviewEditSession({ song: chordSong, target, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: chordSession, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '刪除最後一個字元' }));
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].chords[1]).toBe('C1');
  });

  it('opens notation pickers from small symbol keys and returns to the same keyboard', async () => {
    const user = userEvent.setup();
    const { onApplyDraft } = renderEditor({ deviceLayout: 'tablet' });
    await user.click(screen.getByRole('button', { name: '選擇小節線與反覆' }));
    expect(document.querySelector('[data-keyboard-picker="barline"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '一般小節線' })).not.toBeInTheDocument();
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

  it('allows repeat start and repeat end together without a normal-barline option', async () => {
    const user = userEvent.setup();
    const repeatSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C'], repeatStart: true }] }]
    };
    const repeatSession = createPreviewEditSession({ song: repeatSong, target, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: repeatSession, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '選擇小節線與反覆' }));
    expect(screen.queryByRole('button', { name: '一般小節線' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: ':| Repeat End' }));
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0]).toMatchObject({ repeatStart: true, repeatEnd: true });
  });

  it('opens numeric input from the multi-measure glyph and only enables it on beat one of an empty bar', async () => {
    const user = userEvent.setup();
    const emptySong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: [] }] }]
    };
    const firstBeatTarget = { ...target, slotIndex: 0, anchorKey: 'song-1|section-1|bar-1|chords|0' };
    const emptySession = createPreviewEditSession({ song: emptySong, target: firstBeatTarget, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: emptySession, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '休止符與整小節符號' }));

    const countInput = screen.getByRole('textbox', { name: '多小節休止數量' });
    const openCountInput = screen.getByRole('button', { name: '輸入多小節休止數量' });
    expect(countInput.closest('[data-multi-rest-control]')).not.toBeNull();
    expect(countInput).toHaveAttribute('inputmode', 'numeric');
    expect(openCountInput).toBeEnabled();
    await user.click(openCountInput);
    expect(countInput).toHaveFocus();
    await user.clear(countInput);
    await user.type(countInput, '8');
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].chords).toEqual(['|8|', '', '', '']);

    const wrongBeatSession = createPreviewEditSession({ song: emptySong, target, inputMode: 'letters' });
    rerenderSession(wrongBeatSession);
    await user.click(screen.getByRole('button', { name: '休止符與整小節符號' }));
    expect(screen.getByRole('button', { name: '輸入多小節休止數量' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('只能放在第一拍');

    const occupiedFirstBeat = createPreviewEditSession({ song, target: firstBeatTarget, inputMode: 'letters' });
    rerenderSession(occupiedFirstBeat);
    await user.click(screen.getByRole('button', { name: '休止符與整小節符號' }));
    expect(screen.getByRole('button', { name: '輸入多小節休止數量' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('請先清空');
  });

  it('shows all four text positions together without nested tabs', async () => {
    const user = userEvent.setup();
    renderEditor({ deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '文字欄位' }));
    expect(screen.getByRole('textbox', { name: '小節標籤' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '上方註記' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '左側文字' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '右側文字' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上方註記' })).not.toBeInTheDocument();
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
