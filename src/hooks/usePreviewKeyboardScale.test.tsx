import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PREVIEW_KEYBOARD_SCALE_KEY, getKeyboardSizeProfile, usePreviewKeyboardScale } from './usePreviewKeyboardScale';

beforeEach(() => localStorage.removeItem(PREVIEW_KEYBOARD_SCALE_KEY));
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(PREVIEW_KEYBOARD_SCALE_KEY); });

it.each([[900, 600, 'compact', 70], [1366, 768, 'regular', 80], [1920, 1080, 'spacious', 100], [1920, 600, 'compact', 70], [900, 1080, 'compact', 70]] as const)
('defaults a %s × %s viewport to %s at %s%%', (width, height, profile, percent) => {
  expect(getKeyboardSizeProfile(width, height)).toBe(profile);
  expect(renderHook(() => usePreviewKeyboardScale(width, height)).result.current.percent).toBe(percent);
});

it('remembers each window-size preference independently after resizing and reopening', () => {
  const { result, rerender, unmount } = renderHook(({ width, height }) => usePreviewKeyboardScale(width, height), { initialProps: { width: 900, height: 600 } });
  act(() => result.current.setScale(80));
  rerender({ width: 1920, height: 1080 });
  expect(result.current.percent).toBe(100);
  act(() => result.current.setScale(110));
  rerender({ width: 900, height: 600 });
  expect(result.current.percent).toBe(80);
  unmount();
  const reopened = renderHook(() => usePreviewKeyboardScale(900, 600));
  expect(reopened.result.current.percent).toBe(80);
  act(() => reopened.result.current.resetScale());
  expect(reopened.result.current.percent).toBe(70);
  expect(JSON.parse(localStorage.getItem(PREVIEW_KEYBOARD_SCALE_KEY)!)).toEqual({ spacious: 110 });
});

it.each(['garbage', '', 'null', '80', '[]', '{"compact":"80"}'])('ignores invalid preferences %s', saved => {
  localStorage.setItem(PREVIEW_KEYBOARD_SCALE_KEY, saved);
  expect(renderHook(() => usePreviewKeyboardScale(900, 600)).result.current.percent).toBe(70);
});

it('bounds and rounds stored values', () => {
  localStorage.setItem(PREVIEW_KEYBOARD_SCALE_KEY, JSON.stringify({ compact: 40, regular: 83, spacious: 900 }));
  expect(renderHook(() => usePreviewKeyboardScale(900, 600)).result.current.percent).toBe(70);
  expect(renderHook(() => usePreviewKeyboardScale(1366, 768)).result.current.percent).toBe(80);
  expect(renderHook(() => usePreviewKeyboardScale(1920, 1080)).result.current.percent).toBe(120);
});

it('remains adjustable when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const { result } = renderHook(() => usePreviewKeyboardScale(900, 600));
  expect(result.current.percent).toBe(70);
  act(() => result.current.setScale(80));
  expect(result.current.percent).toBe(80);
});
