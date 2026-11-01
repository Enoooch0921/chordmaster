import { useSyncExternalStore } from 'react';

// Keep these in step with the phone/portrait rules in DrummerMode.css.
const queries = [
  '(max-width: 599px)',
  '(orientation: portrait)',
  '(orientation: landscape) and (max-width: 1000px) and (max-height: 500px)',
];
const read = () => typeof window.matchMedia === 'function'
  ? queries.reduce((flags, query, index) => flags | (window.matchMedia(query).matches ? 1 << index : 0), 0)
  : 0;
function subscribe(notify: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = queries.map(query => window.matchMedia(query));
  media.forEach(item => {
    if (item.addEventListener) item.addEventListener('change', notify);
    else item.addListener?.(notify);
  });
  return () => media.forEach(item => {
    if (item.removeEventListener) item.removeEventListener('change', notify);
    else item.removeListener?.(notify);
  });
}

/** Hidden phone charts must not rebuild and paginate on every song selection. */
export function useDrummerChartVisibility(view: 'songs' | 'score', stage: boolean) {
  const flags = useSyncExternalStore(subscribe, read, () => 0);
  return !(flags & 4) && !(stage && (flags & 2)) && (!(flags & 1) || view === 'score');
}
