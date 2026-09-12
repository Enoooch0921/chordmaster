import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppNotification } from '../types';
import { NotificationBell } from './NotificationBell';

const labels = {
  title: '通知',
  close: '關閉通知',
  empty: '沒有通知',
  markAllRead: '全部已讀',
  open: '開啟',
  sharedSetlist: '分享歌單給你',
  sharedProject: '分享專案給你',
  promoted: '提升了你的權限',
  demoted: '調整了你的權限',
  removedSetlist: '已移除歌單權限',
  removedProject: '已移除專案權限',
  teamInvite: '邀請你加入團隊',
  reviewInvite: '確認邀請'
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 36, 36));
});

describe('NotificationBell', () => {
  it('escapes sidebar clipping and can be dismissed with the keyboard', async () => {
    const { container } = render(<NotificationBell notifications={[]} labels={labels} onOpen={vi.fn()} onMarkAllRead={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '通知' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '通知' });
    expect(container).not.toContainElement(dialog);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows team invitations and opens the confirmation flow', async () => {
    const onOpen = vi.fn();
    const notification: AppNotification = {
      id: 'notification-1',
      type: 'team_invite',
      resourceType: 'team',
      resourceId: 'invite-1',
      resourceName: '主日敬拜團',
      actorName: '小美',
      actorEmail: 'mei@example.com',
      createdAt: '2026-08-29T00:00:00Z',
      readAt: null
    };

    render(
      <NotificationBell
        notifications={[notification]}
        labels={labels}
        onOpen={onOpen}
        onMarkAllRead={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '通知' }));
    expect(screen.getByText('邀請你加入團隊')).toBeInTheDocument();
    expect(screen.getByText('主日敬拜團')).toBeInTheDocument();
    expect(screen.getByText('確認邀請')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /小美/ }));
    expect(onOpen).toHaveBeenCalledWith(notification);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
