import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock('../lib/songEditingPresence', () => ({ subscribeToSongEditors: mocks.subscribe }));
import { useSongEditingPresence } from './useSongEditingPresence';
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
it('updates editing state without reopening the channel and clears it when backgrounded', () => {
  const setSong = vi.fn(), dispose = vi.fn();
  mocks.subscribe.mockReturnValue({ setSong, dispose });
  const props = { enabled: true, libraryId: 'team', user: { id: 'me', name: 'Me' }, editingSongId: null as string | null };
  const { rerender, unmount } = renderHook(useSongEditingPresence, { initialProps: props });
  rerender({ ...props, editingSongId: 'song' });
  expect(mocks.subscribe).toHaveBeenCalledOnce();
  expect(setSong).toHaveBeenLastCalledWith('song');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(setSong).toHaveBeenLastCalledWith(null);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(setSong).toHaveBeenLastCalledWith('song');
  rerender({ ...props, libraryId: 'other', editingSongId: 'other-song' });
  expect(dispose).toHaveBeenCalledOnce();
  unmount(); expect(dispose).toHaveBeenCalledTimes(2);
});
it('does not publish from a disabled or unauthenticated workspace', () => {
  renderHook(() => useSongEditingPresence({ enabled: false, libraryId: 'team', user: null, editingSongId: 'song' }));
  expect(mocks.subscribe).not.toHaveBeenCalled();
});
