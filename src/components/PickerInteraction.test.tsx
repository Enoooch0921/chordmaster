import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import KeyPicker from './KeyPicker';
import CapoPicker from './CapoPicker';
import TempoChangeControl from './TempoChangeControl';

const motion = vi.hoisted(() => ({ instant: true }));
vi.mock('../hooks/useUiMotion', () => ({ useUiMotion: () => ({ instant: motion.instant, reduced: false }) }));
vi.mock('./useAnchoredPortalPanel', () => ({ useAnchoredPortalPanel: () => ({
  panelStyle: { position: 'fixed', top: 0, left: 0 }, placement: 'bottom', isPositioned: true, transformOrigin: 'top right'
}) }));
beforeEach(() => { motion.instant = true; });

const pickers = [
  { name: 'Key', label: '調性', option: 'D', value: 'D', render: (change: ComponentProps<typeof KeyPicker>['onChange']) => <KeyPicker value="C" label="調性" onChange={change} /> },
  { name: 'Capo', label: 'Capo', option: /^2\(/, value: 2, render: (change: ComponentProps<typeof CapoPicker>['onChange']) => <CapoPicker value={0} currentKey="C" label="Capo" onChange={change} /> }
];

describe.each(pickers)('$name picker', picker => {
  it.each(['keyboard', 'pointer'])('commits immediately and restores trigger focus after %s selection', method => {
    const change = vi.fn(); render(picker.render(change));
    const trigger = screen.getByRole('button'); trigger.focus(); fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: picker.label });
    expect(trigger).toHaveAttribute('aria-controls', panel.id);
    const option = within(panel).getByRole('button', { name: picker.option }); option.focus();
    if (method === 'keyboard') fireEvent.keyDown(option, { key: 'Enter' }); else fireEvent.click(option);
    expect(change).toHaveBeenCalledExactlyOnceWith(picker.value);
    expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('restores focus on Escape without allowing a queued opening frame to steal it', async () => {
    const change = vi.fn(); render(picker.render(change));
    const trigger = screen.getByRole('button'); trigger.focus(); fireEvent.click(trigger);
    const option = within(screen.getByRole('dialog')).getByRole('button', { name: picker.option }); option.focus();
    fireEvent.keyDown(option, { key: 'Escape' });
    await act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(trigger).toHaveFocus(); expect(change).not.toHaveBeenCalled();
  });

  it('keeps another control focused when an outside click cancels opening', async () => {
    const change = vi.fn(); render(<>{picker.render(change)}<button>Other control</button></>);
    const trigger = screen.getAllByRole('button')[0]; trigger.focus(); fireEvent.click(trigger);
    const other = screen.getByRole('button', { name: 'Other control' });
    fireEvent.mouseDown(other); other.focus();
    await act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(other).toHaveFocus(); expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

it('retains a cancelled tempo-change menu for an inert exit and supports immediate reopening', async () => {
  motion.instant = false;
  render(<><TempoChangeControl value={{}} label="段落速度" language="zh" onChange={vi.fn()} /><button>Other control</button></>);
  const trigger = screen.getByRole('button', { name: '設定段落速度' }); fireEvent.click(trigger);
  const panel = screen.getByRole('dialog', { name: '段落速度設定' });
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Other control' }));
  expect(panel).toBeInTheDocument(); expect(panel).toHaveAttribute('inert'); expect(panel).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog')).toBe(panel); expect(panel).not.toHaveAttribute('inert');
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Other control' }));
  await waitFor(() => expect(panel).not.toBeInTheDocument());
});

it('commits a tempo-change setting before closing and returns focus immediately', () => {
  motion.instant = false;
  const change = vi.fn(); render(<TempoChangeControl value={{ tempo: 90 }} label="段落速度" language="zh" onChange={change} />);
  const trigger = screen.getByRole('button', { name: '設定段落速度' }); fireEvent.click(trigger);
  const input = screen.getByRole('textbox', { name: '段落速度 BPM' });
  fireEvent.change(input, { target: { value: '96.5' } });
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  expect(change).toHaveBeenLastCalledWith({ tempo: 96.5, resetTempo: undefined });
  expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

it('does not commit a focused tempo draft when Escape returns focus during exit', async () => {
  motion.instant = false;
  const change = vi.fn(); render(<TempoChangeControl value={{ tempo: 90 }} label="段落速度" language="zh" onChange={change} />);
  const trigger = screen.getByRole('button', { name: '設定段落速度' }); fireEvent.click(trigger);
  const input = screen.getByRole('textbox', { name: '段落速度 BPM' }); input.focus();
  fireEvent.change(input, { target: { value: '96.5' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  await act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  expect(change).not.toHaveBeenCalled(); expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
