export const MIN_TEMPO_BPM = 20;
export const MAX_TEMPO_BPM = 400;

export const sanitizeTempoInput = (value: string): string => {
  const normalized = value.replace(/[，。]/g, '.').replace(/[^\d.]+/g, '');
  const [rawInteger = '', ...rawDecimalParts] = normalized.split('.');
  const integer = rawInteger.slice(0, 3);
  const hasDecimalPoint = normalized.includes('.');
  const decimal = rawDecimalParts.join('').slice(0, 1);

  if (!hasDecimalPoint) {
    return integer;
  }

  return `${integer}.${decimal}`;
};

export const normalizeTempoBpm = (tempo: unknown): number | undefined => {
  if (tempo === '' || tempo === null || tempo === undefined) return undefined;
  const normalizedTempo = typeof tempo === 'number'
    ? tempo
    : Number(String(tempo).trim().replace(/[，。]/g, '.'));

  if (!Number.isFinite(normalizedTempo)) return undefined;

  const clampedTempo = Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, normalizedTempo));
  return Number((Math.round(clampedTempo * 10) / 10).toFixed(1));
};

export const formatTempoBpm = (tempo?: number): string => {
  const normalizedTempo = normalizeTempoBpm(tempo);
  return typeof normalizedTempo === 'number' ? String(normalizedTempo) : '';
};
