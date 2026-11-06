import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';

describe('KeyboardShortcutsDialog', () => {
  it('keeps Tab focus in help and restores the opener after dismissal', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open help</button><button>Background action</button>
        {open && <KeyboardShortcutsDialog language="en" onClose={() => setOpen(false)} />}</>;
    }
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open help' });
    await user.click(opener);
    const close = screen.getByRole('button', { name: 'Close shortcuts' });
    expect(close).toHaveFocus();
    await user.tab(); expect(close).toHaveFocus();
    await user.tab({ shift: true }); expect(close).toHaveFocus();
    screen.getByRole('button', { name: 'Background action' }).focus();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
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
