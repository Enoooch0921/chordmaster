import { render, waitFor } from '@testing-library/react';
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
