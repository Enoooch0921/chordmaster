import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import WorkspaceOptions from './WorkspaceOptions';

it('keeps switching, management and creation available without selecting the current workspace again', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onManage = vi.fn();
  const onCreate = vi.fn();
  const libraries = [
    { id: 'personal', kind: 'personal' as const, name: 'Personal', role: 'owner' as const, ownerUserId: 'me', createdAt: '', updatedAt: '' },
    { id: 'team', kind: 'team' as const, name: 'TopChurchWorship', role: 'owner' as const, ownerUserId: 'me', createdAt: '', updatedAt: '' },
  ];
  const { rerender } = render(<WorkspaceOptions language="zh" libraries={libraries} activeId="team" disabled={false} canManage createOpen={false} onSelect={onSelect} onManage={onManage} onCreate={onCreate} />);
  expect(screen.getByRole('button', { name: /TopChurchWorship/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '個人區' }));
  expect(onSelect).toHaveBeenCalledWith('personal');
  await user.click(screen.getByRole('button', { name: '管理成員' }));
  expect(onManage).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: '建立團隊' }));
  expect(onCreate).toHaveBeenCalledOnce();
  rerender(<WorkspaceOptions language="zh" libraries={libraries} activeId="team" disabled canManage={false} createOpen onSelect={onSelect} onManage={onManage} onCreate={onCreate} />);
  expect(screen.queryByRole('button', { name: '管理成員' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '個人區' })).toBeDisabled();
});
