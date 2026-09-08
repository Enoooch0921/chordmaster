import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSongHistoryShortcuts } from './useSongHistoryShortcuts';

const shortcuts = () => ({ enabled: true, onUndo: vi.fn(), onRedo: vi.fn() });

describe('sheet history shortcuts', () => {
  it('handles Cmd-Z and uppercase Cmd-Shift-Z without any editor mounted', () => {
    const options = shortcuts();
    renderHook(() => useSongHistoryShortcuts(options));
    expect(fireEvent.keyDown(window, { key: 'z', metaKey: true })).toBe(false);
    expect(options.onUndo).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true })).toBe(false);
    expect(options.onRedo).toHaveBeenCalledTimes(1);
  });

  it('keeps Ctrl shortcuts and the existing Y redo alias', () => {
    const options = shortcuts();
    renderHook(() => useSongHistoryShortcuts(options));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(options.onUndo).toHaveBeenCalledTimes(1);
    expect(options.onRedo).toHaveBeenCalledTimes(2);
  });

  it('uses current callbacks when moving from a song to a setlist draft and back', () => {
    const song = shortcuts();
    const setlist = shortcuts();
    const draft = shortcuts();
    const hook = renderHook(useSongHistoryShortcuts, { initialProps: song });
    hook.rerender(setlist);
    hook.rerender(draft);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(draft.onUndo).toHaveBeenCalledTimes(1);
    expect(setlist.onUndo).not.toHaveBeenCalled();
    expect(song.onUndo).not.toHaveBeenCalled();
    hook.rerender(setlist);
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect(setlist.onRedo).toHaveBeenCalledTimes(1);
    expect(draft.onRedo).not.toHaveBeenCalled();
  });

  it('does not intercept typing, IME composition, or a handled key', () => {
    const options = shortcuts();
    renderHook(() => useSongHistoryShortcuts(options));
    for (const event of [
      { key: 'z' },
      { key: 'z', metaKey: true, altKey: true },
      { key: 'z', metaKey: true, isComposing: true }
    ]) expect(fireEvent.keyDown(window, event)).toBe(true);
    const handled = new KeyboardEvent('keydown', { key: 'z', metaKey: true, cancelable: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(options.onUndo).not.toHaveBeenCalled();
    expect(options.onRedo).not.toHaveBeenCalled();
  });

  it('preserves native undo in search, local text drafts, and contenteditable fields', () => {
    const options = shortcuts();
    renderHook(() => useSongHistoryShortcuts(options));
    render(<><input aria-label="Search" /><textarea aria-label="Lyrics draft" />
      <div contentEditable suppressContentEditableWarning data-testid="editable"><span>Draft</span></div></>);
    for (const target of [screen.getByLabelText('Search'), screen.getByLabelText('Lyrics draft'), screen.getByText('Draft')]) {
      expect(fireEvent.keyDown(target, { key: 'z', metaKey: true })).toBe(true);
      expect(fireEvent.keyDown(target, { key: 'Z', metaKey: true, shiftKey: true })).toBe(true);
    }
    expect(options.onUndo).not.toHaveBeenCalled();
    expect(options.onRedo).not.toHaveBeenCalled();
  });

  it('routes chord input to history even inside the preview dialog', () => {
    const options = shortcuts();
    renderHook(() => useSongHistoryShortcuts(options));
    render(<><div data-song-history-input><input aria-label="Editor chord" /></div>
      <section role="dialog" data-preview-bar-editor><input data-preview-chord-capture aria-label="Preview chord" /><button>Note</button></section></>);
    for (const target of [screen.getByLabelText('Editor chord'), screen.getByLabelText('Preview chord'), screen.getByText('Note')]) {
      expect(fireEvent.keyDown(target, { key: 'z', metaKey: true })).toBe(false);
    }
    expect(options.onUndo).toHaveBeenCalledTimes(3);
  });

  it('does not undo a song through an unrelated dialog', () => {
    const options = shortcuts();
    renderHook(() => useSongHistoryShortcuts(options));
    render(<section role="dialog"><button>Share</button></section>);
    expect(fireEvent.keyDown(screen.getByText('Share'), { key: 'z', metaKey: true })).toBe(true);
    expect(options.onUndo).not.toHaveBeenCalled();
  });

  it('stops handling shortcuts when disabled or unmounted', () => {
    const options = shortcuts();
    const hook = renderHook(useSongHistoryShortcuts, { initialProps: options });
    hook.rerender({ ...options, enabled: false });
    expect(fireEvent.keyDown(window, { key: 'z', metaKey: true })).toBe(true);
    expect(options.onUndo).not.toHaveBeenCalled();
    hook.rerender(options);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(options.onUndo).toHaveBeenCalledTimes(1);
    hook.unmount();
    expect(fireEvent.keyDown(window, { key: 'z', metaKey: true })).toBe(true);
    expect(options.onUndo).toHaveBeenCalledTimes(1);
  });
});
