import { describe, expect, it } from 'vitest';
import { formatTempoBpm, normalizeTempoBpm, sanitizeTempoInput } from './tempoUtils';

describe('tempo utilities', () => {
  it('keeps one decimal place for BPM values', () => {
    expect(normalizeTempoBpm('164.5')).toBe(164.5);
    expect(normalizeTempoBpm('164.56')).toBe(164.6);
    expect(formatTempoBpm(164.5)).toBe('164.5');
  });

  it('sanitizes draft input while preserving an in-progress decimal', () => {
    expect(sanitizeTempoInput('164.5')).toBe('164.5');
    expect(sanitizeTempoInput('164.56')).toBe('164.5');
    expect(sanitizeTempoInput('164.')).toBe('164.');
    expect(sanitizeTempoInput('164..5')).toBe('164.5');
  });

  it('clamps BPM values to the supported range', () => {
    expect(normalizeTempoBpm('19.9')).toBe(20);
    expect(normalizeTempoBpm('401')).toBe(400);
  });
});
