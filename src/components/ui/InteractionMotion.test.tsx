import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AnimatedDisclosure } from './InteractionMotion';

const state = vi.hoisted(() => ({ preference: { reduced: false, instant: false } }));
vi.mock('../../hooks/useUiMotion', () => ({ useUiMotion: () => state.preference }));
beforeEach(() => { state.preference = { reduced: false, instant: false }; });

it('uses natural layout without observing or tweening resized content, then disables exiting controls', async () => {
  const observe = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect() {} });
  try {
    const { container, rerender } = render(<AnimatedDisclosure open resize><button>Chords</button></AnimatedDisclosure>);
    const disclosure = () => container.querySelector<HTMLElement>('[data-ui-disclosure]');
    expect(disclosure()?.style.height).toBe('');
    expect(observe).not.toHaveBeenCalled();
    rerender(<AnimatedDisclosure open resize><button>Rhythm and jianpu</button></AnimatedDisclosure>);
    expect(disclosure()?.textContent).toBe('Rhythm and jianpu');
    expect(disclosure()?.style.opacity).toBe('1');
    expect(disclosure()?.style.height).toBe('');
    expect(observe).not.toHaveBeenCalled();
    rerender(<AnimatedDisclosure open={false} resize><button>Rhythm and jianpu</button></AnimatedDisclosure>);
    expect(disclosure()).toHaveAttribute('inert');
    expect(disclosure()).toHaveAttribute('aria-hidden', 'true');
    expect(disclosure()?.style.height).toBe('');
    // Reversing a fade makes the same content interactive again, without remounting it.
    const exiting = disclosure();
    rerender(<AnimatedDisclosure open resize><button>Rhythm and jianpu</button></AnimatedDisclosure>);
    expect(disclosure()).toBe(exiting);
    expect(disclosure()).not.toHaveAttribute('inert');
    expect(disclosure()).not.toHaveAttribute('aria-hidden');
    rerender(<AnimatedDisclosure open={false} resize><button>Rhythm and jianpu</button></AnimatedDisclosure>);
    await waitFor(() => expect(disclosure()).toBeNull());
  } finally { vi.unstubAllGlobals(); }
});

it.each([false, true])('keeps keyboard disclosure changes immediate with reduced motion=%s', async reduced => {
  state.preference = { instant: true, reduced };
  const { container, rerender } = render(<AnimatedDisclosure open><button>Settings</button></AnimatedDisclosure>);
  rerender(<AnimatedDisclosure open={false}><button>Settings</button></AnimatedDisclosure>);
  await waitFor(() => expect(container.querySelector('[data-ui-disclosure]')).toBeNull());
});
