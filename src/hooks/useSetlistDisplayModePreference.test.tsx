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

it('keeps row heights per setlist and account, validates storage, and restores them after remount', async () => {
  const { useSetlistBarRowPreference } = await import('./useSetlistDisplayModePreference');
  const key = 'chordmaster.personal-setlist-bar-rows.v1:user:alice';
  localStorage.setItem(key, JSON.stringify({ old: 3, invalid: 4, string: '3' }));
  const { result, rerender, unmount } = renderHook(({ user }) => useSetlistBarRowPreference(user), { initialProps: { user: 'alice' } });
  expect(result.current.rowCounts).toEqual({ old: 3 });
  act(() => result.current.setRowCount('meeting', 3));
  expect(result.current.rowCounts.other).toBeUndefined();
  rerender({ user: 'bob' });
  expect(result.current.rowCounts).toEqual({});
  act(() => result.current.setRowCount('meeting', 2));
  rerender({ user: 'alice' });
  expect(result.current.rowCounts.meeting).toBe(3);
  unmount();
  expect(renderHook(() => useSetlistBarRowPreference('bob')).result.current.rowCounts.meeting).toBe(2);
});
