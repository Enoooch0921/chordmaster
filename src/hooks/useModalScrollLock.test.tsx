import { createRef } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useModalScrollLock } from './useModalScrollLock';

describe('mobile sheet background scroll lock', () => {
  it('locks the score and page, then restores their previous styles and score position', () => {
    const background = createRef<HTMLDivElement>();
    background.current = document.createElement('div');
    background.current.style.overflow = 'auto';
    background.current.style.overscrollBehavior = 'contain';
    background.current.scrollTop = 240;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const { rerender, unmount } = renderHook(({ open }) => useModalScrollLock(open, background), {
      initialProps: { open: false }
    });

    expect(background.current.style.overflow).toBe('auto');
    rerender({ open: true });
    expect(background.current.style.overflow).toBe('hidden');
    expect(background.current.style.overscrollBehavior).toBe('none');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    rerender({ open: false });
    expect(background.current.style.overflow).toBe('auto');
    expect(background.current.style.overscrollBehavior).toBe('contain');
    expect(background.current.scrollTop).toBe(240);
    expect(document.body.style.overflow).toBe(bodyOverflow);
    expect(document.documentElement.style.overflow).toBe(rootOverflow);

    rerender({ open: true });
    unmount();
    expect(background.current.style.overflow).toBe('auto');
    expect(document.body.style.overflow).toBe(bodyOverflow);
  });
});
