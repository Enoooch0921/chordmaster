import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SetlistContextMenu from './SetlistContextMenu';

const props = () => ({
  language: 'zh' as const, title: '主日敬拜', archived: false, x: 120, y: 160,
  onArchive: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onClose: vi.fn()
});

describe('setlist context menu', () => {
  it('supports keyboard navigation and closes before performing an action', () => {
    const options = props();
    const calls: string[] = [];
    options.onClose.mockImplementation(() => calls.push('close'));
    options.onMove.mockImplementation(() => calls.push('move'));
    render(<SetlistContextMenu {...options} />);
    expect(screen.getByRole('menuitem', { name: '歸檔' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    const move = screen.getByRole('menuitem', { name: '移至專案' });
    expect(move).toHaveFocus();
    fireEvent.click(move);
    expect(calls).toEqual(['close', 'move']);
    expect(options.onDelete).not.toHaveBeenCalled();
  });

  it('offers unarchive for archived setlists and keeps delete separate', () => {
    const options = props();
    render(<SetlistContextMenu {...options} archived />);
    fireEvent.click(screen.getByRole('menuitem', { name: '取消歸檔' }));
    expect(options.onArchive).toHaveBeenCalledOnce();
    expect(options.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: '刪除' }));
    expect(options.onDelete).toHaveBeenCalledOnce();
  });

  it('dismisses on Escape, outside clicks, scroll and resize, and removes listeners on unmount', () => {
    const options = props();
    const { unmount } = render(<SetlistContextMenu {...options} />);
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(options.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    fireEvent.scroll(window);
    fireEvent.resize(window);
    expect(options.onClose).toHaveBeenCalledTimes(4);
    unmount();
    fireEvent.pointerDown(document.body);
    fireEvent.scroll(window);
    expect(options.onClose).toHaveBeenCalledTimes(4);
  });

  it('keeps the menu inside the viewport near its lower right corner', () => {
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 224, height: 180 } as DOMRect);
    render(<SetlistContextMenu {...props()} x={window.innerWidth} y={window.innerHeight} />);
    expect(screen.getByRole('menu')).toHaveStyle({ left: `${window.innerWidth - 232}px`, top: `${window.innerHeight - 188}px` });
    bounds.mockRestore();
  });
});
