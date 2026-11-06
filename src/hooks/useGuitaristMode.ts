import { useState } from 'react';

const readPreference = (key: string | null) => {
  try { return Boolean(key && localStorage.getItem(key) === 'true'); }
  catch { return false; }
};

/** Personal display preference, available only to the invited account. */
export function useGuitaristMode(user: { id: string; email?: string } | null) {
  const available = user?.email?.trim().toLowerCase() === 'peienlee0609@gmail.com';
  const key = available ? `chordmaster.guitarist-mode.v2:user:${encodeURIComponent(user!.id)}` : null;
  const [preference, setPreference] = useState(() => ({ key, enabled: readPreference(key) }));
  const enabled = available && (preference.key === key ? preference.enabled : readPreference(key));
  const toggle = () => {
    if (!key) return;
    const next = !enabled;
    setPreference({ key, enabled: next });
    try { localStorage.setItem(key, String(next)); } catch { /* Keep usable in memory. */ }
  };
  return { available, enabled, toggle };
}
