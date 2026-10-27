import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSetlistOpening } from './useSetlistOpening';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('shows acknowledgement before committing a costly navigation', () => {
  const { result } = renderHook(() => useSetlistOpening('team'));
  const navigate = vi.fn(); let token = 0;
  act(() => { token = result.current.begin('meeting', '聚會一'); result.current.commit(token, navigate); });
  expect(result.current.opening?.name).toBe('聚會一');
  expect(navigate).not.toHaveBeenCalled();
  act(() => vi.runAllTimers());
  expect(navigate).toHaveBeenCalledOnce();
  expect(result.current.opening).toBeNull();
});
it('ignores an older request when a newer destination was chosen', () => {
  const { result } = renderHook(() => useSetlistOpening('team'));
  const stale = vi.fn(), latest = vi.fn();
  act(() => {
    const first = result.current.begin('one', 'One');
    const second = result.current.begin('two', 'Two');
    result.current.commit(first, stale); result.current.commit(second, latest);
  });
  act(() => vi.runAllTimers());
  expect(stale).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce();
});
it('cancels queued work when switching libraries', () => {
  const { result, rerender } = renderHook(scope => useSetlistOpening(scope), { initialProps: 'first' });
  const navigate = vi.fn();
  act(() => { const token = result.current.begin('meeting', 'Meeting'); result.current.commit(token, navigate); });
  rerender('another'); act(() => vi.runAllTimers());
  expect(navigate).not.toHaveBeenCalled(); expect(result.current.opening).toBeNull();
});
