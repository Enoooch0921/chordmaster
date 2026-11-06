export const MIN_TEMPO_BPM = 20;
export const MAX_TEMPO_BPM = 400;

/** Normalize typography, never remove invalid characters or truncate a pasted value. */
export const sanitizeTempoInput = (value: string): string => value.replace(/[，。]/g, '.').normalize('NFKC');

export const isValidTempoDraft = (value: string): boolean => {
  const text = sanitizeTempoInput(value).trim();
  return !text || (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)
    && Number(text) >= MIN_TEMPO_BPM && Number(text) <= MAX_TEMPO_BPM);
};

export const normalizeTempoBpm = (tempo: unknown): number | undefined => {
  if (tempo === '' || tempo === null || tempo === undefined) return undefined;
  const normalizedTempo = typeof tempo === 'number'
    ? tempo
    : Number(String(tempo).trim().replace(/[，。]/g, '.'));

  if (!Number.isFinite(normalizedTempo)) return undefined;

  const clampedTempo = Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, normalizedTempo));
  return Number((Math.round(clampedTempo * 100) / 100).toFixed(2));
};

export const formatTempoBpm = (tempo?: number): string => {
  const normalizedTempo = normalizeTempoBpm(tempo);
  return typeof normalizedTempo === 'number' ? String(normalizedTempo) : '';
};
