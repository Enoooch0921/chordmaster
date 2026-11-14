import { useSyncExternalStore } from 'react';
import type { AuditionScope } from '../lib/chordAudition';

const changed = 'chordmaster-audition-preference';
const fallback = new Map<string, string>();
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(changed, listener);
    window.removeEventListener('storage', listener);
  };
}

function usePreference(key: string) {
  function read() {
    if (fallback.has(key)) return fallback.get(key)!;
    try { return localStorage.getItem(key); } catch { return null; }
  }
  const value = useSyncExternalStore(subscribe, read, () => null);
  function write(next: string) {
    try { localStorage.setItem(key, next); fallback.delete(key); }
    catch { fallback.set(key, next); }
    window.dispatchEvent(new Event(changed));
  }
  return [value, write] as const;
}

export function useAuditionPreferences(userId: string | null | undefined, defaultScope: AuditionScope) {
  const prefix = 'chordmaster.audition.v1.' + (userId ? 'user.' + encodeURIComponent(userId) : 'guest');
  const [range, setScope] = usePreference(prefix + '.scope');
  const [click, setClick] = usePreference(prefix + '.metronome');
  const [lead, setLead] = usePreference(prefix + '.melody');
  const scope = range === 'chord' || range === 'bar' || range === 'section' || range === 'song' ? range : defaultScope;
  return {
    scope, setScope, metronome: click !== 'false', melody: lead !== 'false',
    setMetronome: (on: boolean) => setClick(String(on)),
    setMelody: (on: boolean) => setLead(String(on))
  };
}
