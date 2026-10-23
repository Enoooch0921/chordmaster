import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Jianpu from './Jianpu';

describe('Jianpu', () => {
  it('keeps ordinary compact jianpu at the normal height', () => {
    const { container } = render(
      <Jianpu notation="1 2 3 4" compact />
    );

    const root = container.firstElementChild as HTMLElement;
    const firstDigit = Array.from(container.querySelectorAll<HTMLElement>('span'))
      .find((node) => node.textContent === '1');

    expect(root.style.height).toBe('20px');
    expect(firstDigit?.style.top).toBe('9.25px');
  });

  it('keeps compact triplet marks above the jianpu underline', () => {
    const { container } = render(
      <Jianpu notation="1_t2_t3_t" compact />
    );

    const root = container.firstElementChild as HTMLElement;
    const tripletMark = container.querySelector<HTMLElement>('[data-jianpu-triplet-mark]');
    const tripletLines = tripletMark?.querySelectorAll<HTMLElement>('[data-jianpu-triplet-line-segment]');
    const tripletNumber = tripletMark?.querySelector<HTMLElement>('.font-semibold');

    expect(root.style.height).toBe('24px');
    expect(tripletMark).not.toBeNull();
    expect(tripletNumber?.style.top).toBe('1.8px');
    expect(tripletNumber).not.toHaveClass('bg-white');
    expect(container.querySelector<HTMLElement>('span[style*="12.25px"]')).not.toBeNull();
    expect(tripletLines).toHaveLength(2);
    expect(tripletLines?.[0].style.top).toBe('5px');
    expect(tripletLines?.[1].style.top).toBe('5px');
  });

  it.each(['preview', 'editor'] as const)('groups quarter triplets across beat tokens in %s', (renderMode) => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    try {
      const { container } = render(<Jianpu notation="1t 7,t | 5,t | 3, | 5," renderMode={renderMode} />);
      const marks = container.querySelectorAll<HTMLElement>('[data-jianpu-triplet-mark]');
      expect(marks).toHaveLength(1);
      expect(parseFloat(marks[0].style.width)).toBeGreaterThan(renderMode === 'editor' ? 100 : 25);
      // Quarter notes have no eighth-note underline.
      expect(container.querySelectorAll('[data-jianpu-underline]')).toHaveLength(0);
    } finally {
      widthSpy.mockRestore();
    }
  });

  it('keeps consecutive triplets in groups of three and breaks at a real gap', () => {
    const consecutive = render(<Jianpu notation="1t 2t | 3t | 4t 5t | 6t" />);
    expect(consecutive.container.querySelectorAll('[data-jianpu-triplet-mark]')).toHaveLength(2);
    const gap = render(<Jianpu notation="1_t 2_t | 3_t | 4" />);
    expect(gap.container.querySelectorAll('[data-jianpu-triplet-mark]')).toHaveLength(2);
  });

  it('anchors a cross-bar slur on the sounded note before sustain dashes', () => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    try {
      const { container } = render(
        <Jianpu
          notation="5 | - | - | (-"
          nextNotationForCrossBar="5_)1'_ | 7_(5_ | 5_)3_ | 4_(5_"
          compact
        />
      );

      const outgoingSlur = container.querySelector<SVGPathElement>('[data-jianpu-slur="outgoing"]');

      expect(outgoingSlur).not.toBeNull();
      expect(outgoingSlur?.getAttribute('d')).toMatch(/^M 50 /);
    } finally {
      widthSpy.mockRestore();
    }
  });

  it('does not draw a self slur when one note ends a cross-bar slur and starts the next', () => {
    const { container } = render(
      <Jianpu
        notation="(4') | - | 4'_) 6_ | 7_ 1'_"
        previousNotationForCrossBar="1' | - | 1'_ 2'_ | 3'_ (4'_"
        compact
      />
    );

    expect(container.querySelector('[data-jianpu-slur="self"]')).toBeNull();
    expect(container.querySelectorAll('[data-jianpu-slur="pair"]')).toHaveLength(1);
  });

  it('still draws an explicitly self-contained slur without an incoming cross-bar slur', () => {
    const { container } = render(<Jianpu notation="(1)" compact />);

    expect(container.querySelectorAll('[data-jianpu-slur="self"]')).toHaveLength(1);
  });
});
