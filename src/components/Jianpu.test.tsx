import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
