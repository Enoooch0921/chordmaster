import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useReducedMotionPreference } from './useReducedMotionPreference';
afterEach(() => vi.unstubAllGlobals());
it('updates already mounted surfaces when the system changes and when the app resumes', () => {
  const media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', vi.fn(() => media as unknown as MediaQueryList));
  const { result, unmount } = renderHook(useReducedMotionPreference);
  expect(result.current).toBe(false);
  act(() => { media.matches = true; media.dispatchEvent(new Event('change')); });
  expect(result.current).toBe(true);
  act(() => { media.matches = false; window.dispatchEvent(new Event('pageshow')); });
  expect(result.current).toBe(false);
  unmount();
});
