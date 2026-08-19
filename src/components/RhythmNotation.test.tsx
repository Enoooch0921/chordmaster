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

  it('aligns compact preview glyphs by notehead center instead of glyph box center', () => {
    const { container } = render(
      <RhythmNotation notation="q q q q" timeSignature="4/4" compact />
    );

    const glyphs = container.querySelectorAll<HTMLElement>('[data-rhythm-glyph]');

    expect(glyphs).toHaveLength(4);
    expect(glyphs[0].style.transform).toContain('calc(-50% + 2.4px)');
  });
});
