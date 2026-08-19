import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Jianpu from './Jianpu';

describe('Jianpu', () => {
  it('keeps compact triplet marks above the jianpu underline', () => {
    const { container } = render(
      <Jianpu notation="1_t2_t3_t" compact />
    );

    const root = container.firstElementChild as HTMLElement;
    const tripletMark = container.querySelector<HTMLElement>('[data-jianpu-triplet-mark]');
    const tripletLine = tripletMark?.querySelector<HTMLElement>('.bg-current');
    const tripletNumber = tripletMark?.querySelector<HTMLElement>('.font-semibold');

    expect(root.style.height).toBe('24px');
    expect(tripletMark).not.toBeNull();
    expect(tripletLine?.style.top).toBe('5px');
    expect(tripletNumber?.style.top).toBe('1.8px');
  });
});
