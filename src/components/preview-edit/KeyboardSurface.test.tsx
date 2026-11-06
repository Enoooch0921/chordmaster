import { fireEvent, render, waitFor } from '@testing-library/react';
import { AnimatePresence } from 'motion/react';
import { describe, expect, it } from 'vitest';
import KeyboardSurface from './KeyboardSurface';

function Harness({ open, desktop = false }: { open: boolean; desktop?: boolean }) {
  return <AnimatePresence initial={false}>{open && <KeyboardSurface key="keyboard" docked={!desktop} role="dialog"
    style={{ position: 'fixed', bottom: 0, width: 620, transform: desktop ? 'scale(0.8)' : undefined }}>
    <button>Input</button>
  </KeyboardSurface>}</AnimatePresence>;
}
describe('keyboard spatial animation', () => {
  it('settles its moving surface when keyboard input takes over and immediately releases an exit', async () => {
    const { container, rerender } = render(<Harness open={false}/>);
    fireEvent.pointerDown(document); rerender(<Harness open/>);
    fireEvent.keyDown(document, { key: 'Tab' });
    const surface = container.querySelector<HTMLElement>('[data-keyboard-motion]')!;
    await waitFor(() => expect(surface.style.transform).toBe('translate3d(0, 0%, 0)'), { timeout: 100 });
    expect(surface.style.opacity).toBe('1');
    fireEvent.pointerDown(document); rerender(<Harness open={false}/>);
    fireEvent.keyDown(document, { key: 'Tab' });
    await waitFor(() => expect(container.querySelector('[data-keyboard-motion]')).toBeNull());
  });
  it('keeps scale and measurement on the stationary shell', () => {
    const { getByRole, container } = render(<Harness open desktop/>);
    expect(getByRole('dialog').style.transform).toBe('scale(0.8)');
    expect(container.querySelector('[data-keyboard-motion]')?.parentElement).toBe(getByRole('dialog'));
    expect(getByRole('dialog').style.width).toBe('620px');
  });
  it('disables an exiting keyboard immediately, then removes its visual surface', async () => {
    const { rerender, queryByRole, container } = render(<Harness open/>);
    rerender(<Harness open={false}/>);
    const shell = container.querySelector('[data-keyboard-position-shell]');
    expect(shell).toHaveAttribute('inert'); expect(queryByRole('dialog')).toBeNull();
    expect(container.querySelector('[data-keyboard-motion]')).toHaveAttribute('data-keyboard-motion', 'closing');
    await waitFor(() => expect(container.querySelector('[data-keyboard-position-shell]')).toBeNull());
  });
  it('can reverse a dismissal without mounting a second keyboard', () => {
    const { rerender, getByRole, container } = render(<Harness open/>);
    rerender(<Harness open={false}/>); rerender(<Harness open/>);
    expect(container.querySelectorAll('[data-keyboard-position-shell]')).toHaveLength(1);
    expect(getByRole('dialog')).not.toHaveAttribute('inert');
    expect(container.querySelector('[data-keyboard-motion]')).toHaveAttribute('data-keyboard-motion', 'open');
  });
});
