import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

const preference = vi.hoisted(() => ({ instant: true, reduced: true }));
vi.mock('../hooks/useUiMotion', async original => ({ ...await original<typeof import('../hooks/useUiMotion')>(), useUiMotion: () => preference }));
beforeEach(() => { preference.instant = true; preference.reduced = true; });

it('pauses an action toast while focused, protects it from overflow and resumes the remaining time', async () => {
  vi.useFakeTimers();
  function Test() {
    const toast = useToast();
    return <>
      <button onClick={() => toast.info('Action toast', { duration: 2000, action: { label: 'Undo action', run: () => {} } })}>Action</button>
      <button onClick={() => toast.info('Another notification')}>Push</button>
      <button>Outside</button>
    </>;
  }
  const view = render(<ToastProvider><Test /></ToastProvider>);
  try {
    fireEvent.click(screen.getByText('Action'));
    act(() => vi.advanceTimersByTime(500));
    act(() => screen.getByText('Undo action').focus());
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Push'));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Undo action')).toHaveFocus();
    act(() => screen.getByText('Outside').focus());
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('Undo action')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(screen.queryByText('Undo action')).toBeNull();
  } finally { view.unmount(); vi.useRealTimers(); }
});

function Controls() {
  const toast = useToast();
  const options = { id: 'history-feedback', placement: 'history' as const };
  return <>
    <button onClick={() => toast.loading('正在撤銷歌曲排序…', options)}>Start</button>
    <button onClick={() => toast.success('已撤銷歌曲排序', options)}>Complete</button>
    <button onClick={() => toast.error('無法撤銷，請重試', options)}>Fail</button>
    <button onClick={() => toast.info('一般通知')}>Other</button>
  </>;
}

it('updates centered history feedback in place without moving unrelated notifications', () => {
  render(<ToastProvider><Controls /></ToastProvider>);
  fireEvent.click(screen.getByText('Other'));
  fireEvent.click(screen.getByText('Start'));
  const card = screen.getByText('正在撤銷歌曲排序…').closest('[data-ui-toast]')!;
  const history = card.closest('[data-toast-viewport]')!;
  expect(history).toHaveAttribute('data-toast-viewport', 'history');
  expect(history).toHaveClass('left-1/2', '-translate-x-1/2');
  expect(card).toHaveClass('pointer-events-none');
  expect(screen.getByText('一般通知').closest('[data-toast-viewport]')).toHaveAttribute('data-toast-viewport', 'default');
  fireEvent.click(screen.getByText('Complete'));
  expect(screen.getByText('已撤銷歌曲排序').closest('[data-ui-toast]')).toBe(card);
  expect(history.querySelectorAll('[data-ui-toast]')).toHaveLength(1);
  fireEvent.click(screen.getByText('Fail'));
  expect(within(history as HTMLElement).getByRole('alert')).toHaveTextContent('無法撤銷，請重試');
  expect(screen.getByText('無法撤銷，請重試').closest('[data-ui-toast]')).toBe(card);
});

it('settles a notification on keyboard takeover and releases its interrupted exit', async () => {
  preference.instant = false; preference.reduced = false;
  render(<ToastProvider><Controls /></ToastProvider>);
  fireEvent.pointerDown(document); fireEvent.click(screen.getByText('Other'));
  const card = screen.getByText('一般通知').closest<HTMLElement>('[data-ui-toast]')!;
  fireEvent.keyDown(document, { key: 'Tab' });
  await waitFor(() => expect(card).toHaveStyle({ transform: 'translate3d(0, 0px, 0)', opacity: '1' }), { timeout: 100 });
  fireEvent.pointerDown(document); fireEvent.click(within(card).getByRole('button', { name: 'Dismiss notification' }));
  expect(card.parentElement).toHaveAttribute('inert');
  fireEvent.keyDown(document, { key: 'Tab' });
  await waitFor(() => expect(card).not.toBeInTheDocument(), { timeout: 100 });
});
