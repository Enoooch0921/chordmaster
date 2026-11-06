/** Keep a short pointer jump legible without flying through pages of notation. */
export function getNavigationScrollBehavior(
  distance: number,
  viewportHeight: number,
  instant = false
): ScrollBehavior {
  // App's shared input observer updates this before the interaction is handled.
  const keyboard = typeof document !== 'undefined' && document.documentElement.dataset.uiInput === 'keyboard';
  const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return instant || keyboard || reduced || viewportHeight <= 0 || Math.abs(distance) > viewportHeight
    ? 'instant'
    : 'smooth';
}
