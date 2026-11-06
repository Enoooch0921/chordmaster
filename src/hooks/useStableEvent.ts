import { useCallback, useLayoutEffect, useRef } from 'react';

/** Stable UI callback identity, always invoking the latest committed implementation. */
export function useStableEvent<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; });
  return useCallback((...args: Args) => latest.current(...args), []);
}
