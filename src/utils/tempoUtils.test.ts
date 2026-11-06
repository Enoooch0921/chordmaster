import { describe, expect, it } from 'vitest';
import { formatTempoBpm, isValidTempoDraft, normalizeTempoBpm, sanitizeTempoInput } from './tempoUtils';

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
    expect(sanitizeTempoInput('164.567')).toBe('164.567');
    expect(sanitizeTempoInput('164.')).toBe('164.');
    expect(sanitizeTempoInput('164..5')).toBe('164..5');
  });

  it.each(['100–120', '1000', '164..5', '1e2', '0x64', '-100'])('retains and rejects ambiguous draft %s', value => {
    expect(sanitizeTempoInput(value)).toBe(value);
    expect(isValidTempoDraft(value)).toBe(false);
  });

  it('accepts full-width decimal typography and a deliberate empty value', () => {
    expect(sanitizeTempoInput('７２．５')).toBe('72.5');
    expect(isValidTempoDraft('７２．５')).toBe(true);
    expect(isValidTempoDraft('')).toBe(true);
  });

  it('clamps BPM values to the supported range', () => {
    expect(normalizeTempoBpm('19.9')).toBe(20);
    expect(normalizeTempoBpm('401')).toBe(400);
  });
});
