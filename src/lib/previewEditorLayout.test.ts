import { describe, expect, it } from 'vitest';
import { resolvePreviewEditorDeviceLayout } from './previewEditorLayout';

describe('preview editor device layout', () => {
  it('keeps an iPad with a Magic Keyboard in the tablet dock layout', () => {
    expect(resolvePreviewEditorDeviceLayout({
      viewportWidth: 1024,
      maxTouchPoints: 5,
      hasCoarsePointer: false,
      isPhoneDevice: false
    })).toBe('tablet');
  });

  it('keeps landscape phones in the phone layout', () => {
    expect(resolvePreviewEditorDeviceLayout({
      viewportWidth: 844,
      maxTouchPoints: 5,
      hasCoarsePointer: false,
      isPhoneDevice: true
    })).toBe('phone');
  });

  it('uses the compact desktop editor on a non-touch laptop', () => {
    expect(resolvePreviewEditorDeviceLayout({
      viewportWidth: 1024,
      maxTouchPoints: 0,
      hasCoarsePointer: false,
      isPhoneDevice: false
    })).toBe('desktop');
  });
});
