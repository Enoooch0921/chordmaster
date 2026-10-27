import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import TempoPicker from './TempoPicker';
vi.mock('./useAnchoredPortalPanel', () => ({ useAnchoredPortalPanel: () => ({ panelStyle: { position: 'fixed', top: 0, left: 0 }, isPositioned: true, transformOrigin: 'top right' }) }));
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
it('accepts decimal input, applies by Enter, and keeps +/- immediately connected', async () => {
  const changed = vi.fn();
  function Harness() { const [value, setValue] = React.useState<number | undefined>(92); return <TempoPicker language="zh" value={value} onChange={next => { changed(next); setValue(next); }}/>; }
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button', { name: '速度 92 BPM' }));
  const input = screen.getByRole('textbox', { name: '速度 BPM' });
  fireEvent.change(input, { target: { value: '93.25' } });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.submit(input.closest('form')!);
  expect(changed).toHaveBeenLastCalledWith(93.25);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '速度 93.25 BPM' }));
  fireEvent.click(screen.getByRole('button', { name: '增加 1 BPM' }));
  expect(changed).toHaveBeenLastCalledWith(94.25);
  fireEvent.click(screen.getByRole('button', { name: '減少 1 BPM' }));
  expect(changed).toHaveBeenLastCalledWith(93.25);
  expect(screen.queryByRole('button', { name: /Tap/ })).toBeNull();
});
it('rejects invalid values, bounds the stepper, and allows removing an unspecified tempo', async () => {
  const changed = vi.fn();
  render(<TempoPicker language="zh" value={400} onChange={changed}/>);
  fireEvent.click(screen.getByRole('button', { name: '速度 400 BPM' }));
  expect(screen.getByRole('button', { name: '增加 1 BPM' })).toBeDisabled();
  const input = screen.getByRole('textbox', { name: '速度 BPM' });
  fireEvent.change(input, { target: { value: '19' } });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('button', { name: '套用' })).toBeDisabled();
  fireEvent.submit(input.closest('form')!);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '套用' }));
  expect(changed).toHaveBeenLastCalledWith(undefined);
});
it('dismisses an unfinished number without writing and respects read-only controls', async () => {
  const changed = vi.fn();
  const { rerender } = render(<TempoPicker language="en" value={80} onChange={changed}/>);
  const trigger = screen.getByRole('button', { name: 'Tempo 80 BPM' });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByRole('textbox', { name: 'Tempo BPM' }), { target: { value: '100' } });
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(changed).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  rerender(<TempoPicker language="en" value={80} onChange={changed} disabled/>);
  expect(trigger).toBeDisabled();
});
