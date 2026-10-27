import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getProjectPinsStorageKey, sortProjectsByPin, useProjectPins } from './useProjectPins';

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('restores pins after reload and isolates accounts, libraries and local mode', () => {
  const { result, rerender, unmount } = renderHook(({ user, library }) => useProjectPins(user, library), {
    initialProps: { user: 'alice' as string | null, library: 'team-one' }
  });
  act(() => result.current.togglePin('project'));
  rerender({ user: 'alice', library: 'team-two' });
  expect(result.current.pinnedIds.has('project')).toBe(false);
  rerender({ user: 'bob', library: 'team-one' });
  expect(result.current.pinnedIds.has('project')).toBe(false);
  rerender({ user: null, library: 'team-one' });
  expect(result.current.pinnedIds.has('project')).toBe(false);
  rerender({ user: 'alice', library: 'team-one' });
  expect(result.current.pinnedIds.has('project')).toBe(true);
  unmount();
  const restored = renderHook(() => useProjectPins('alice', 'team-one'));
  expect(restored.result.current.pinnedIds.has('project')).toBe(true);
  act(() => restored.result.current.togglePin('project'));
  expect(restored.result.current.pinnedIds.has('project')).toBe(false);
});

it('keeps pinning usable when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const { result } = renderHook(() => useProjectPins(null, null));
  act(() => result.current.togglePin('project'));
  expect(result.current.pinnedIds.has('project')).toBe(true);
});

it('ignores malformed saved pins and handles changes from another tab only in the current scope', () => {
  const key = getProjectPinsStorageKey('alice', 'team-one');
  localStorage.setItem(key, JSON.stringify(['one', 'one', '', null, 4]));
  const { result } = renderHook(() => useProjectPins('alice', 'team-one'));
  expect([...result.current.pinnedIds]).toEqual(['one']);
  localStorage.setItem(key, JSON.stringify(['two']));
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'another-library' })));
  expect([...result.current.pinnedIds]).toEqual(['one']);
  act(() => window.dispatchEvent(new StorageEvent('storage', { key })));
  expect([...result.current.pinnedIds]).toEqual(['two']);
  localStorage.setItem(key, '{broken');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key })));
  expect(result.current.pinnedIds.size).toBe(0);
});

it('moves owned and shared pins ahead of other projects without changing either group’s order or data', () => {
  const projects = [{ id: 'a' }, { id: 'b' }, { id: 'shared' }, { id: 'c' }];
  const result = sortProjectsByPin(projects, new Set(['c', 'shared']));
  expect(result.map(project => project.id)).toEqual(['shared', 'c', 'a', 'b']);
  expect(projects.map(project => project.id)).toEqual(['a', 'b', 'shared', 'c']);
  expect(result[0]).toBe(projects[2]);
});
