import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SetlistEditorAssignmentSnapshot } from '../types';
import SetlistAssignmentDialog from './SetlistAssignmentDialog';

const snapshot: SetlistEditorAssignmentSnapshot = {
  setlistId: 'setlist-1',
  assignableMembers: [
    {
      userId: 'library-manager',
      email: 'manager@example.com',
      name: '小美',
      role: 'editor'
    },
    {
      userId: 'setlist-editor',
      email: 'editor@example.com',
      name: '大雄',
      role: 'setlist_manager'
    }
  ],
  assignments: [
    {
      userId: 'library-manager',
      assignedBy: 'owner',
      assignedAt: '2026-08-01T00:00:00Z'
    }
  ]
};

describe('SetlistAssignmentDialog', () => {
  it('根據目前指派狀態移除或新增歌單協作者', () => {
    const onToggle = vi.fn();

    render(
      <SetlistAssignmentDialog
        open
        language="zh"
        setlistName="8/2 主日敬拜"
        snapshot={snapshot}
        loading={false}
        updatingUserId={null}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onToggle={onToggle}
      />
    );

    expect(screen.getByText('8/2 主日敬拜')).toBeInTheDocument();
    expect(screen.getByText('歌曲管理員')).toBeInTheDocument();
    expect(screen.getAllByText('歌單協作者')).toHaveLength(2);
    expect(screen.getByText('manager@example.com')).toBeInTheDocument();
    expect(screen.getByText('editor@example.com')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '歌單協作者' })).toHaveAttribute('aria-busy', 'false');

    const managerButton = screen.getByRole('button', { name: /小美/ });
    const editorButton = screen.getByRole('button', { name: /大雄/ });
    expect(managerButton).toHaveAttribute('aria-pressed', 'true');
    expect(editorButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(managerButton);
    fireEvent.click(editorButton);

    expect(onToggle).toHaveBeenNthCalledWith(1, 'library-manager', false);
    expect(onToggle).toHaveBeenNthCalledWith(2, 'setlist-editor', true);
  });

  it('更新指派時鎖定所有成員、重新整理與關閉操作', () => {
    const onToggle = vi.fn();
    const onRefresh = vi.fn();
    const onClose = vi.fn();

    render(
      <SetlistAssignmentDialog
        open
        language="zh"
        setlistName="8/2 主日敬拜"
        snapshot={snapshot}
        loading={false}
        updatingUserId="setlist-editor"
        onClose={onClose}
        onRefresh={onRefresh}
        onToggle={onToggle}
      />
    );

    const managerButton = screen.getByRole('button', { name: /小美/ });
    const editorButton = screen.getByRole('button', { name: /大雄/ });
    const refreshButton = screen.getByRole('button', { name: '重新整理' });
    const closeButton = screen.getByRole('button', { name: '關閉' });
    const doneButton = screen.getByRole('button', { name: '完成' });

    expect(screen.getByRole('dialog', { name: '歌單協作者' })).toHaveAttribute('aria-busy', 'true');
    expect(managerButton).toBeDisabled();
    expect(editorButton).toBeDisabled();
    expect(refreshButton).toBeDisabled();
    expect(closeButton).toBeDisabled();
    expect(doneButton).toBeDisabled();

    fireEvent.click(editorButton);
    fireEvent.click(refreshButton);
    fireEvent.click(closeButton);
    fireEvent.click(doneButton);

    expect(onToggle).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
