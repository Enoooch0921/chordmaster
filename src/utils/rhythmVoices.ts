import type { RhythmVoice } from '../types';

export function normalizeRhythmVoices(value: unknown): RhythmVoice[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>(['primary']);
  const voices: RhythmVoice[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || typeof raw.rhythm !== 'string') return;
    const base = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `voice-${index + 1}`;
    let id = base;
    while (ids.has(id)) id += '-copy';
    ids.add(id);
    voices.push({ id, label: typeof raw.label === 'string' ? raw.label : '', rhythm: raw.rhythm });
  });
  return voices.length ? voices : undefined;
}
export const visibleRhythmVoices = (voices?: RhythmVoice[]) => voices?.filter(v => v.rhythm.trim()) ?? [];
