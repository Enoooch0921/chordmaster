import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AnimatedDisclosure, AnimatedPopover } from './InteractionMotion';

const state = vi.hoisted(() => ({ preference: { reduced: false, instant: false } }));
vi.mock('../../hooks/useUiMotion', async original => ({ ...await original<typeof import('../../hooks/useUiMotion')>(), useUiMotion: () => state.preference }));
beforeEach(() => { state.preference = { reduced: false, instant: false }; });

it.each(['popover', 'disclosure'] as const)('settles %s on keyboard takeover and releases an interrupted exit', async kind => {
  const Surface = kind === 'popover' ? AnimatedPopover : AnimatedDisclosure;
  const { container, rerender } = render(<Surface open={false}><button>Option</button></Surface>);
  fireEvent.pointerDown(document);
  rerender(<Surface open><button>Option</button></Surface>);
  fireEvent.keyDown(document, { key: 'Tab' });
  const shell = container.firstElementChild as HTMLElement;
  const ink = kind === 'popover' ? shell.firstElementChild as HTMLElement : shell;
  await waitFor(() => expect(ink.style.opacity).toBe('1'), { timeout: 100 });
  if (kind === 'popover') expect(ink.style.transform).toBe('scale(1)');
  fireEvent.pointerDown(document);
  rerender(<Surface open={false}><button>Option</button></Surface>);
  expect(shell).toHaveAttribute('inert');
  fireEvent.keyDown(document, { key: 'Tab' });
  await waitFor(() => expect(container.firstElementChild).toBeNull(), { timeout: 100 });
});

it('keeps an unpositioned popover hidden and reverses dismissal without remounting controls', async () => {
  const { container, rerender } = render(<AnimatedPopover open={false}><button>Option</button></AnimatedPopover>);
  fireEvent.pointerDown(document);
  rerender(<AnimatedPopover open ready={false}><button>Option</button></AnimatedPopover>);
  fireEvent.keyDown(document, { key: 'Tab' });
  const shell = container.firstElementChild as HTMLElement;
  const ink = shell.firstElementChild as HTMLElement;
  await waitFor(() => expect(ink.style.opacity).toBe('0'), { timeout: 100 });
  rerender(<AnimatedPopover open><button>Option</button></AnimatedPopover>);
  fireEvent.pointerDown(document);
  rerender(<AnimatedPopover open={false}><button>Option</button></AnimatedPopover>);
  expect(shell).toHaveAttribute('inert');
  rerender(<AnimatedPopover open><button>Option</button></AnimatedPopover>);
  expect(container.firstElementChild).toBe(shell);
  expect(shell).not.toHaveAttribute('inert');
  fireEvent.keyDown(document, { key: 'Tab' });
  await waitFor(() => expect(ink.style.opacity).toBe('1'), { timeout: 100 });
});

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
