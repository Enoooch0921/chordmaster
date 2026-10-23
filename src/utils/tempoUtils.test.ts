import { describe, expect, it } from 'vitest';
import { formatTempoBpm, normalizeTempoBpm, sanitizeTempoInput } from './tempoUtils';

describe('tempo utilities', () => {
  it('preserves source BPM values to two decimal places', () => {
    expect(normalizeTempoBpm('164.5')).toBe(164.5);
    expect(normalizeTempoBpm('164.56')).toBe(164.56);
    expect(normalizeTempoBpm('66.75')).toBe(66.75);
    expect(formatTempoBpm(164.5)).toBe('164.5');
    expect(formatTempoBpm(66.75)).toBe('66.75');
  });

  it('sanitizes draft input while preserving an in-progress decimal', () => {
    expect(sanitizeTempoInput('164.5')).toBe('164.5');
    expect(sanitizeTempoInput('164.56')).toBe('164.56');
    expect(sanitizeTempoInput('164.567')).toBe('164.56');
    expect(sanitizeTempoInput('164.')).toBe('164.');
    expect(sanitizeTempoInput('164..5')).toBe('164.5');
  });

  it('clamps BPM values to the supported range', () => {
    expect(normalizeTempoBpm('19.9')).toBe(20);
    expect(normalizeTempoBpm('401')).toBe(400);
  });
});
