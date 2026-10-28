import { useCallback, useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useWorkspaceSwitcherDismiss } from './useWorkspaceSwitcherDismiss';

function Harness({ contextKey = 'first', events = [] }: { contextKey?: string; events?: string[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { events.push('close'); setOpen(false); }, [events]);
  useWorkspaceSwitcherDismiss({ open, rootRef, triggerRef, contextKey, onClose: close });
  return <><div ref={rootRef}><button ref={triggerRef} aria-expanded={open} onClick={() => setOpen(value => !value)}>Workspace</button>
    {open && <div aria-label="Workspace options"><button>Internal action</button><div aria-label="Library list">Libraries</div></div>}
  </div><button onClick={() => events.push('select')}>Other setlist</button><div aria-label="Chart">Chart</div></>;
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
const expectClosed = () => expect(screen.getByRole('button', { name: 'Workspace' })).toHaveAttribute('aria-expanded', 'false');
const pointer = (target: Element | Window, type: string, x: number, y: number) => fireEvent(target, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));

it('lets the original outside tap select its target before collapsing the inline menu', async () => {
  const events: string[] = [];
  render(<Harness events={events}/>); open();
  const target = screen.getByRole('button', { name: 'Other setlist' });
  pointer(target, 'pointerdown', 10, 10);
  fireEvent.focusIn(target);
  expect(screen.getByRole('button', { name: 'Workspace' })).toHaveAttribute('aria-expanded', 'true');
  await act(async () => fireEvent.click(target));
  expect(events).toEqual(['select', 'close']); expectClosed();
});
it.each(['scroll', 'wheel'])('closes on outside %s while keeping internal list scrolling available', type => {
  render(<Harness/>); open();
  fireEvent(screen.getByLabelText('Library list'), new Event(type, { bubbles: false }));
  expect(screen.getByRole('button', { name: 'Workspace' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent(screen.getByLabelText('Chart'), new Event(type, { bubbles: false }));
  expectClosed();
});
it('closes on an outside swipe without suppressing scrolling or treating a small tap movement as a swipe', () => {
  render(<Harness/>); open();
  const chart = screen.getByLabelText('Chart');
  pointer(chart, 'pointerdown', 20, 20); pointer(chart, 'pointermove', 23, 23);
  expect(screen.getByRole('button', { name: 'Workspace' })).toHaveAttribute('aria-expanded', 'true');
  expect(pointer(chart, 'pointermove', 20, 40)).toBe(true);
  expectClosed();
});
it('keeps internal actions open and closes when keyboard focus moves outside', async () => {
  render(<Harness/>); open();
  fireEvent.click(screen.getByRole('button', { name: 'Internal action' }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Workspace' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.focusIn(screen.getByRole('button', { name: 'Other setlist' }));
  expectClosed();
});
it('closes for a new song or setlist context and returns focus to the trigger on Escape', async () => {
  const events: string[] = [];
  const { rerender } = render(<Harness events={events}/>); open();
  rerender(<Harness contextKey="second" events={events}/>); expectClosed();
  open(); fireEvent.keyDown(window, { key: 'Escape' }); expectClosed();
  expect(screen.getByRole('button', { name: 'Workspace' })).toHaveFocus();
  await waitFor(() => expect(events).toEqual(['close', 'close']));
});
