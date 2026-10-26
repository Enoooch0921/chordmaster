import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSetlistDisplayModePreference } from './useSetlistDisplayModePreference';
beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it('remembers each account’s own mode without leaking on account switches', () => {
  const { result, rerender, unmount } = renderHook(({ user }) => useSetlistDisplayModePreference(user), { initialProps: { user: 'alice' as string | null } });
  act(() => result.current.setMode('set', 'nashville-number-system'));
  rerender({ user: 'bob' });
  expect(result.current.modes.set).toBeUndefined();
  act(() => result.current.setMode('set', 'chord-fixed-key'));
  rerender({ user: 'alice' });
  expect(result.current.modes.set).toBe('nashville-number-system');
  rerender({ user: null });
  expect(result.current.modes.set).toBeUndefined();
  unmount();
  expect(renderHook(() => useSetlistDisplayModePreference('bob')).result.current.modes.set).toBe('chord-fixed-key');
});
it('keeps controls working when browser storage cannot be written', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const { result } = renderHook(() => useSetlistDisplayModePreference('alice'));
  act(() => result.current.setMode('set', 'nashville-number-system'));
  expect(result.current.modes.set).toBe('nashville-number-system');
});
it('ignores malformed modes and refreshes only the current account after a storage event', () => {
  const key = 'chordmaster.personal-setlist-display-modes.v1:user:alice';
  localStorage.setItem(key, JSON.stringify({ valid: 'chord-fixed-key', invalid: 'wrong' }));
  const { result } = renderHook(() => useSetlistDisplayModePreference('alice'));
  expect(result.current.modes).toEqual({ valid: 'chord-fixed-key' });
  localStorage.setItem(key, JSON.stringify({ valid: 'nashville-number-system' }));
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'another-account' })));
  expect(result.current.modes.valid).toBe('chord-fixed-key');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key })));
  expect(result.current.modes.valid).toBe('nashville-number-system');
});
