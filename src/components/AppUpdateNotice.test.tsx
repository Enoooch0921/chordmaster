import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import AppUpdateNotice from './AppUpdateNotice';
import type { appUpdates } from '../lib/appUpdates';
const fixture = () => ({ getSnapshot: () => true, subscribe: () => () => {}, apply: vi.fn(async (prepare: () => Promise<void>) => prepare()), watch: vi.fn(), dispose: vi.fn() } satisfies typeof appUpdates);

it('can defer and reopen without activating or moving keyboard focus', () => {
  const updates = fixture();
  render(<AppUpdateNotice language="zh" prepare={async () => {}} onUpdatingChange={vi.fn()} updates={updates} />);
  expect(screen.getByRole('status')).toHaveTextContent('有新版本');
  fireEvent.click(screen.getByRole('button', { name: '稍後' }));
  expect(screen.queryByRole('button', { name: '立即更新' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '新版本可更新' }));
  expect(screen.getByRole('button', { name: '立即更新' })).toBeEnabled();
  expect(updates.apply).not.toHaveBeenCalled();
});
it('shows save failure without reloading and allows a retry', async () => {
  const updates = fixture(); const prepare = vi.fn().mockRejectedValueOnce(new Error('儲存失敗')).mockResolvedValue(undefined);
  const onUpdatingChange = vi.fn();
  render(<AppUpdateNotice language="zh" prepare={prepare} onUpdatingChange={onUpdatingChange} updates={updates} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '立即更新' })));
  expect(screen.getByRole('alert')).toHaveTextContent('儲存失敗');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '立即更新' })));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(onUpdatingChange.mock.calls.map(([busy]) => busy)).toEqual([true, false, true, false]);
});
it('hides during performance and disables updating during protected operations', () => {
  const props = { language: 'zh' as const, prepare: vi.fn(), onUpdatingChange: vi.fn(), updates: fixture() };
  const { rerender } = render(<AppUpdateNotice {...props} hidden />);
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<AppUpdateNotice {...props} blockedReason="請先完成編輯" />);
  expect(screen.getByRole('button', { name: '立即更新' })).toBeDisabled();
  expect(screen.getByText('請先完成編輯')).toBeInTheDocument();
});
