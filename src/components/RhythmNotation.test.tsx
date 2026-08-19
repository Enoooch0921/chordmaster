import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RhythmNotation from './RhythmNotation';

describe('RhythmNotation', () => {
  it('aligns compact preview ties to the rendered notehead centers', () => {
    const { container } = render(
      <RhythmNotation notation="q~ q q q" timeSignature="4/4" compact />
    );

    const tiePath = container.querySelector('[data-rhythm-tie]');

    expect(tiePath).not.toBeNull();
    expect(tiePath?.getAttribute('d')).toMatch(/^M 12\.5 13\.2 C .* 37\.5 13\.2$/);
  });
});
