import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';

describe('KeyboardShortcutsDialog', () => {
  it('shows grouped shortcut help in Chinese', () => {
    render(<KeyboardShortcutsDialog language="zh" onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '快捷鍵' })).toBeInTheDocument();
    expect(screen.getByText('全站')).toBeInTheDocument();
    expect(screen.getAllByText('預覽快捷編輯')[0]).toBeInTheDocument();
    expect(screen.getByText('開啟快捷鍵清單')).toBeInTheDocument();
    expect(screen.getAllByText('?')[0]).toBeInTheDocument();
  });

  it('closes with Escape or the close button', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsDialog language="en" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Close shortcuts' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
