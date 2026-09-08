import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePreviewClipboardShortcuts, type RememberedPreviewClipboard } from './usePreviewClipboardShortcuts';
import type { PreviewClipboard } from '../lib/previewClipboard';

const content: PreviewClipboard = { kind: 'chords', items: [{ bar: { chords: ['C', '', 'G', ''] }, key: 'C', timeSignature: '4/4', absoluteJianpu: false }] };
function clipboardData() {
  const values = new Map<string, string>();
  return { setData: (type: string, value: string) => values.set(type, value), getData: (type: string) => values.get(type) ?? '' };
}
function clipboardEvent(type: 'copy' | 'paste', data: ReturnType<typeof clipboardData>, target: Window | HTMLElement = window) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  fireEvent(target, event);
  return event;
}
function options() {
  return {
    enabled: true, clipboardRef: { current: null as RememberedPreviewClipboard | null },
    onCopy: vi.fn(() => content), onPaste: vi.fn(), onUnavailable: vi.fn()
  };
}

describe('native preview copy and paste events', () => {
  it('routes paste over the add-bar control to its section without an existing bar', () => {
    const opts = options();
    renderHook(() => usePreviewClipboardShortcuts(opts));
    render(<button data-preview-add-bar-after="verse" data-preview-clipboard-identity="song-1">Add bar</button>);
    const data = clipboardData();
    clipboardEvent('copy', data);
    const original = document.querySelector.bind(document);
    const query = vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => (
      original(selector === '[data-preview-add-bar-after]:hover' ? '[data-preview-add-bar-after]' : selector)
    ));
    try {
      expect(clipboardEvent('paste', data).defaultPrevented).toBe(true);
      expect(opts.onPaste).toHaveBeenCalledExactlyOnceWith(content, {
        previewIdentity: 'song-1', sectionId: 'verse', barId: '', field: 'bars', appendToSection: true
      });
    } finally { query.mockRestore(); }
  });

  it('copies readable text and pastes the matching immutable app snapshot', () => {
    const opts = options();
    renderHook(() => usePreviewClipboardShortcuts(opts));
    const data = clipboardData();
    expect(clipboardEvent('copy', data).defaultPrevented).toBe(true);
    expect(data.getData('text/plain')).toBe('C  G ');
    expect(clipboardEvent('paste', data).defaultPrevented).toBe(true);
    expect(opts.onPaste).toHaveBeenCalledExactlyOnceWith(content, null);
  });

  it('never pastes a stale app snapshot after copying unrelated text or another app token', () => {
    const opts = options();
    renderHook(() => usePreviewClipboardShortcuts(opts));
    const data = clipboardData();
    clipboardEvent('copy', data);
    const external = clipboardData();
    external.setData('text/plain', 'Different clipboard');
    clipboardEvent('paste', external);
    data.setData('application/x-chordmaster-preview', 'another-tab');
    clipboardEvent('paste', data);
    expect(opts.onPaste).not.toHaveBeenCalled();
  });

  it('accepts plain-text fallback for the same clipboard when a browser strips custom formats', () => {
    const opts = options();
    renderHook(() => usePreviewClipboardShortcuts(opts));
    const data = clipboardData();
    clipboardEvent('copy', data);
    data.setData('application/x-chordmaster-preview', '');
    clipboardEvent('paste', data);
    expect(opts.onPaste).toHaveBeenCalledTimes(1);
  });

  it('keeps regular text fields and actual text selections native', () => {
    const opts = options();
    renderHook(() => usePreviewClipboardShortcuts(opts));
    render(<><input aria-label="Search" /><input aria-label="Chord" data-preview-chord-capture defaultValue="Cmaj7" /></>);
    const data = clipboardData();
    expect(clipboardEvent('copy', data, screen.getByLabelText('Search')).defaultPrevented).toBe(false);
    const chord = screen.getByLabelText('Chord') as HTMLInputElement;
    chord.setSelectionRange(1, 5);
    expect(clipboardEvent('copy', data, chord).defaultPrevented).toBe(false);
    expect(clipboardEvent('paste', data, chord).defaultPrevented).toBe(false);
    expect(opts.onCopy).not.toHaveBeenCalled();
    chord.setSelectionRange(5, 5);
    expect(clipboardEvent('copy', data, chord).defaultPrevented).toBe(true);
    expect(opts.onCopy).toHaveBeenCalledTimes(1);
  });

  it('uses current callbacks and removes listeners when disabled or unmounted', () => {
    const opts = options();
    const hook = renderHook(usePreviewClipboardShortcuts, { initialProps: opts });
    const onCopy = vi.fn(() => content);
    hook.rerender({ ...opts, onCopy });
    clipboardEvent('copy', clipboardData());
    expect(opts.onCopy).not.toHaveBeenCalled();
    expect(onCopy).toHaveBeenCalledTimes(1);
    hook.rerender({ ...opts, enabled: false });
    expect(clipboardEvent('copy', clipboardData()).defaultPrevented).toBe(false);
    hook.unmount();
    expect(clipboardEvent('paste', clipboardData()).defaultPrevented).toBe(false);
  });
});
