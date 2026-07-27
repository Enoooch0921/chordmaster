import { describe, expect, it } from 'vitest';
import {
  getPreviewEditorBottomInset,
  resolvePreviewEditorDeviceLayout,
  shouldAutoScrollPreviewEditTarget
} from './previewEditorLayout';

describe('preview editor device layout', () => {
  it('keeps an iPad with a Magic Keyboard in the tablet dock layout', () => {
    expect(resolvePreviewEditorDeviceLayout({
      viewportWidth: 1024,
      maxTouchPoints: 5,
      hasCoarsePointer: false,
      isPhoneDevice: false,
      isKnownTabletDevice: true
    })).toBe('tablet');
  });

  it('keeps landscape phones in the phone layout', () => {
    expect(resolvePreviewEditorDeviceLayout({
      viewportWidth: 844,
      maxTouchPoints: 5,
      hasCoarsePointer: false,
      isPhoneDevice: true,
      isKnownTabletDevice: false
    })).toBe('phone');
  });

  it('uses the compact desktop editor on a non-touch laptop', () => {
    expect(resolvePreviewEditorDeviceLayout({
      viewportWidth: 1024,
      maxTouchPoints: 0,
      hasCoarsePointer: false,
      isPhoneDevice: false,
      isKnownTabletDevice: false
    })).toBe('desktop');
  });

  it('keeps a known iPad Air docked even when touch signals are missing', () => {
    expect(resolvePreviewEditorDeviceLayout({
      viewportWidth: 1366,
      maxTouchPoints: 0,
      hasCoarsePointer: false,
      isPhoneDevice: false,
      isKnownTabletDevice: true
    })).toBe('tablet');
  });

  it('reserves the docked keyboard height plus a readable gap on touch layouts', () => {
    expect(getPreviewEditorBottomInset('phone', 337.4)).toBe(353);
    expect(getPreviewEditorBottomInset('tablet', 420, 20)).toBe(440);
    expect(getPreviewEditorBottomInset('desktop', 340)).toBe(0);
  });

  it('does not move a touch preview when opening or editing within the same bar', () => {
    const barKey = 'song-1|section-1|bar-1';

    expect(shouldAutoScrollPreviewEditTarget('phone', null, barKey)).toBe(false);
    expect(shouldAutoScrollPreviewEditTarget('phone', barKey, barKey)).toBe(false);
    expect(shouldAutoScrollPreviewEditTarget('tablet', barKey, barKey)).toBe(false);
  });

  it('does not move a desktop preview when opening or editing within the same bar', () => {
    const barKey = 'song-1|section-1|bar-1';

    expect(shouldAutoScrollPreviewEditTarget('desktop', null, barKey)).toBe(false);
    expect(shouldAutoScrollPreviewEditTarget('desktop', barKey, barKey)).toBe(false);
  });

  it('still repositions touch previews after keyboard navigation crosses a bar', () => {
    expect(shouldAutoScrollPreviewEditTarget(
      'phone',
      'song-1|section-1|bar-1',
      'song-1|section-1|bar-2',
      true
    )).toBe(true);
  });

  it('does not reposition after a direct click crosses to another bar', () => {
    expect(shouldAutoScrollPreviewEditTarget(
      'desktop',
      'song-1|section-1|bar-1',
      'song-1|section-1|bar-2'
    )).toBe(false);
  });

  it('retains non-bar anchor scrolling', () => {
    expect(shouldAutoScrollPreviewEditTarget('phone', null, null)).toBe(true);
    expect(shouldAutoScrollPreviewEditTarget('desktop', null, null)).toBe(true);
  });
});
