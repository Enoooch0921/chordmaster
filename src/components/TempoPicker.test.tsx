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

it('restores a defined library tempo without adopting or changing the library', () => {
  const change = vi.fn(), adopt = vi.fn();
  render(<TempoPicker language="zh" value={110} originalTempo={92.5} showOriginalTempo onChange={change} onAdoptOriginalTempo={adopt}/>);
  fireEvent.click(screen.getByRole('button', { name: '速度 110 BPM' }));
  fireEvent.click(screen.getByRole('button', { name: '還原歌曲庫速度 · 92.5 BPM' }));
  expect(change).toHaveBeenCalledWith(92.5);
  expect(screen.getByRole('textbox', { name: '速度 BPM' })).toHaveValue('92.5');
  expect(adopt).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /設為歌曲原始速度/ })).toBeNull();
});
it('keeps ordinary practice edits separate from the explicit original-tempo action', async () => {
  const change = vi.fn(), adopt = vi.fn().mockResolvedValue(undefined);
  const { rerender } = render(<TempoPicker language="zh" value={90} showOriginalTempo onChange={change} onAdoptOriginalTempo={adopt}/>);
  fireEvent.click(screen.getByRole('button', { name: '速度 90 BPM' }));
  fireEvent.click(screen.getByRole('button', { name: '增加 1 BPM' }));
  expect(adopt).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: '速度 BPM' }), { target: { value: '112.5' } });
  fireEvent.click(screen.getByRole('button', { name: '套用到歌單' }));
  expect(change).toHaveBeenLastCalledWith(112.5);
  expect(adopt).not.toHaveBeenCalled();
  rerender(<TempoPicker language="zh" value={112.5} showOriginalTempo onChange={change} onAdoptOriginalTempo={adopt}/>);
  fireEvent.click(screen.getByRole('button', { name: '速度 112.5 BPM' }));
  fireEvent.click(screen.getByRole('button', { name: '設為歌曲原始速度 · 112.5 BPM' }));
  await waitFor(() => expect(adopt).toHaveBeenCalledWith(112.5));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('keeps a failed adoption open for review and prevents missing or invalid tempo adoption', async () => {
  const adopt = vi.fn().mockRejectedValueOnce(new Error('來源已被修改')).mockResolvedValue(undefined);
  render(<TempoPicker language="zh" showOriginalTempo onChange={vi.fn()} onAdoptOriginalTempo={adopt}/>);
  fireEvent.click(screen.getByRole('button', { name: '速度 未設定 BPM' }));
  expect(screen.getByRole('button', { name: '設為歌曲原始速度' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: '速度 BPM' }), { target: { value: '19' } });
  expect(screen.getByRole('button', { name: '設為歌曲原始速度' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: '速度 BPM' }), { target: { value: '92' } });
  fireEvent.click(screen.getByRole('button', { name: '設為歌曲原始速度 · 92 BPM' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('來源已被修改');
  expect(screen.getByRole('textbox', { name: '速度 BPM' })).toHaveValue('92');
  fireEvent.click(screen.getByRole('button', { name: '設為歌曲原始速度 · 92 BPM' }));
  await waitFor(() => expect(adopt).toHaveBeenCalledTimes(2));
});
it('does not offer adoption without library-edit permission and keeps an unchanged restore button disabled', () => {
  const { rerender } = render(<TempoPicker language="en" value={92} showOriginalTempo onChange={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Tempo 92 BPM' }));
  expect(screen.queryByRole('button', { name: /Set as original tempo/ })).toBeNull();
  rerender(<TempoPicker language="en" value={92} originalTempo={92} showOriginalTempo onChange={vi.fn()}/>);
  expect(screen.getByRole('button', { name: 'Restore library tempo · 92 BPM' })).toBeDisabled();
});
