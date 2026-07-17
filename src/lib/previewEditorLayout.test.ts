import { describe, expect, it } from 'vitest';
import { resolvePreviewEditorDeviceLayout } from './previewEditorLayout';

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
});
