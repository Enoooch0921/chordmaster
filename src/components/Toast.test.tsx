import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

vi.mock('../hooks/useUiMotion', () => ({ useUiMotion: () => ({ instant: true, reduced: true }) }));

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
