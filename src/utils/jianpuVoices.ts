import type { JianpuVoice } from '../types';

export function normalizeJianpuVoices(value: unknown): JianpuVoice[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>(['primary']);
  const voices: JianpuVoice[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || typeof raw.riff !== 'string') return;
    const base = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `voice-${index + 1}`;
    let id = base;
    while (ids.has(id)) id += '-copy';
    ids.add(id);
    voices.push({ id, label: typeof raw.label === 'string' ? raw.label : '', riff: raw.riff });
  });
  return voices.length ? voices : undefined;
}

export const visibleJianpuVoices = (voices?: JianpuVoice[]) => voices?.filter(voice => voice.riff.trim()) ?? [];
