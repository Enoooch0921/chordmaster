import { useSyncExternalStore } from 'react';
const query = '(prefers-reduced-motion: reduce)';
const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
function subscribe(notify: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(query);
  if (media.addEventListener) media.addEventListener('change', notify);
  else media.addListener(notify);
  window.addEventListener('pageshow', notify);
  window.addEventListener('focus', notify);
  return () => {
    if (media.removeEventListener) media.removeEventListener('change', notify);
    else media.removeListener(notify);
    window.removeEventListener('pageshow', notify);
    window.removeEventListener('focus', notify);
  };
}
/** Motion's installed hook snapshots this setting; keep open UI in sync as it changes. */
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, read, () => false);
}
