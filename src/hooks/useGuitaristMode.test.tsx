import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useGuitaristMode } from './useGuitaristMode';

beforeEach(() => localStorage.clear());

it('isolates the preference across account switches, sign-out and remounts', () => {
  const invited = { id: 'invited', email: ' PeienLee0609@gmail.com ' };
  const other = { id: 'other', email: 'other@example.com' };
  const hook = renderHook(({ user }) => useGuitaristMode(user), {
    initialProps: { user: invited as typeof invited | null },
  });
  expect(hook.result.current.available).toBe(true);
  expect(hook.result.current.enabled).toBe(false);
  act(() => hook.result.current.toggle());
  expect(hook.result.current.enabled).toBe(true);
  hook.rerender({ user: other });
  expect(hook.result.current.available).toBe(false);
  expect(hook.result.current.enabled).toBe(false);
  act(() => hook.result.current.toggle());
  expect(hook.result.current.enabled).toBe(false);
  hook.rerender({ user: null });
  expect(hook.result.current.available).toBe(false);
  expect(hook.result.current.enabled).toBe(false);
  hook.unmount();
  expect(renderHook(() => useGuitaristMode(invited)).result.current.enabled).toBe(true);
});
