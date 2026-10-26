import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SetlistEditorAssignmentSnapshot } from '../types';
import SetlistAssignmentDialog from './SetlistAssignmentDialog';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});

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
  it('blocks stale assignment edits while refreshing and resumes with the refreshed assignment', () => {
    const onToggle = vi.fn();
    const props = { open: true, language: 'zh' as const, setlistName: '主日敬拜', snapshot, loading: true, updatingUserId: null, onClose: vi.fn(), onRefresh: vi.fn(), onToggle };
    const { rerender } = render(<SetlistAssignmentDialog {...props} />);
    const manager = screen.getByRole('button', { name: /小美/ });
    expect(manager).toBeDisabled();
    fireEvent.click(manager);
    expect(onToggle).not.toHaveBeenCalled();

    rerender(<SetlistAssignmentDialog {...props} loading={false} snapshot={{ ...snapshot, assignments: [] }} />);
    expect(screen.getByRole('button', { name: /小美/ })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: /小美/ }));
    expect(onToggle).toHaveBeenCalledWith('library-manager', true);
  });

  it('opens as a modal outside the editor and handles Escape without leaking editor shortcuts', () => {
    const onClose = vi.fn();
    const onEditorKeyDown = vi.fn();
    const props = { open: true, language: 'zh' as const, setlistName: '主日敬拜', snapshot, loading: false, updatingUserId: null, onClose, onRefresh: vi.fn(), onToggle: vi.fn() };
    const { container, rerender, unmount } = render(<div onKeyDown={onEditorKeyDown}><SetlistAssignmentDialog {...props} /></div>);
    const dialog = screen.getByRole('dialog', { name: '歌單協作者' });
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('open');
    expect(dialog.parentElement).toBe(document.body);
    expect(container).not.toContainElement(dialog);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowRight' });
    expect(onEditorKeyDown).not.toHaveBeenCalled();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<SetlistAssignmentDialog {...props} updatingUserId="library-manager" />);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('filters members without changing their assignments', () => {
    const onToggle = vi.fn();
    render(<SetlistAssignmentDialog open language="zh" setlistName="主日敬拜" snapshot={snapshot} loading={false} updatingUserId={null} onClose={vi.fn()} onRefresh={vi.fn()} onToggle={onToggle} />);
    fireEvent.change(screen.getByRole('textbox', { name: '搜尋團隊成員' }), { target: { value: 'manager@example.com' } });
    expect(screen.getByRole('button', { name: /小美/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /大雄/ })).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: '搜尋團隊成員' }), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /大雄/ })).toHaveAttribute('aria-pressed', 'false');
  });

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
    expect(screen.getByText('歌單管理員')).toBeInTheDocument();
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
