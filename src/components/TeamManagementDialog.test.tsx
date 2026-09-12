import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamManagementDialog from './TeamManagementDialog';
import type { ComponentProps } from 'react';

const invite = { id: 'invite-1', email: 'a-long-invitee-address@example.com', role: 'editor' as const, token: 'token-1', invitedBy: 'owner', invitedAt: '', expiresAt: null, acceptedAt: null, revokedAt: null };
const makeProps = (): ComponentProps<typeof TeamManagementDialog> => ({
  language: 'zh', teamName: 'TopChurchWorship', loading: false, error: null,
  snapshot: { members: [
    { userId: 'owner', name: 'Enoch', email: 'owner@example.com', role: 'owner', joinedAt: '' },
    { userId: 'member', name: 'Joseph', email: 'member@example.com', role: 'viewer', joinedAt: '' },
  ], invites: [invite] },
  inviteEmail: '', inviteRole: 'setlist_manager', inviteShareUrl: null,
  creatingInvite: false, updatingUserId: null,
  onClose: vi.fn(), onRetry: vi.fn(), onEmailChange: vi.fn(), onRoleChange: vi.fn(),
  onCreateInvite: vi.fn().mockResolvedValue(undefined), onCopyUrl: vi.fn().mockResolvedValue(true),
  onCopyInvite: vi.fn().mockResolvedValue(true), onRevokeInvite: vi.fn().mockResolvedValue(undefined),
  onUpdateRole: vi.fn().mockResolvedValue(undefined), onRemoveMember: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});

describe('TeamManagementDialog', () => {
  it('opens outside the sidebar, restores scrolling on close, and preserves member actions', async () => {
    const props = makeProps();
    const user = userEvent.setup();
    const { container, unmount } = render(<TeamManagementDialog {...props} />);
    const dialog = screen.getByRole('dialog', { name: 'TopChurchWorship' });
    expect(dialog.parentElement).toBe(document.body);
    expect(container).not.toContainElement(dialog);
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.queryByLabelText('調整 Enoch 的權限')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('調整 Joseph 的權限'), 'editor');
    expect(props.onUpdateRole).toHaveBeenCalledWith('member', 'editor');
    await user.click(screen.getByRole('button', { name: '移除 Joseph' }));
    expect(props.onRemoveMember).toHaveBeenCalledWith('member');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(props.onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('switches to pending invitations and copies or revokes the selected invitation', async () => {
    const props = makeProps();
    const user = userEvent.setup();
    render(<TeamManagementDialog {...props} />);
    expect(screen.queryByText(invite.email)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /待接受\s*1/ }));
    expect(screen.getByText(invite.email)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '複製連結' }));
    expect(props.onCopyInvite).toHaveBeenCalledWith(invite);
    expect(await screen.findByRole('button', { name: '已複製' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消邀請' }));
    expect(props.onRevokeInvite).toHaveBeenCalledWith(invite.id);
  });

  it('submits an invitation with the selected email and role without losing input when changing views', async () => {
    const props = makeProps();
    const user = userEvent.setup();
    function Harness() {
      const [email, setEmail] = useState('');
      const [role, setRole] = useState(props.inviteRole);
      return <TeamManagementDialog {...props} inviteEmail={email} inviteRole={role} onEmailChange={setEmail} onRoleChange={setRole} onCreateInvite={async () => { props.onEmailChange(email); props.onRoleChange(role); await props.onCreateInvite(); }} />;
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '邀請' }));
    await user.type(screen.getByLabelText('電子郵件'), 'new@example.com');
    await user.selectOptions(screen.getByLabelText('成員權限'), 'editor');
    await user.click(screen.getByRole('button', { name: '返回成員名單' }));
    await user.click(screen.getByRole('button', { name: '邀請' }));
    expect(screen.getByLabelText('電子郵件')).toHaveValue('new@example.com');
    await user.click(screen.getByRole('button', { name: '建立邀請連結' }));
    expect(props.onCreateInvite).toHaveBeenCalledOnce();
    expect(props.onEmailChange).toHaveBeenCalledWith('new@example.com');
    expect(props.onRoleChange).toHaveBeenCalledWith('editor');
  });

  it('shows load and clipboard failures inside the modal and blocks closing during a mutation', async () => {
    const props = makeProps();
    const user = userEvent.setup();
    const { rerender } = render(<TeamManagementDialog {...props} snapshot={null} error="載入失敗" />);
    expect(screen.getByRole('alert')).toHaveTextContent('載入失敗');
    await user.click(screen.getByRole('button', { name: '重新載入' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    rerender(<TeamManagementDialog {...props} creatingInvite />);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '關閉團隊管理' })).toBeDisabled();
    rerender(<TeamManagementDialog {...props} onCopyInvite={vi.fn().mockResolvedValue(false)} />);
    await user.click(screen.getByRole('button', { name: /待接受\s*1/ }));
    await user.click(screen.getByRole('button', { name: '複製連結' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('無法複製連結'));
    expect(screen.queryByRole('button', { name: '已複製' })).not.toBeInTheDocument();
  });
});
