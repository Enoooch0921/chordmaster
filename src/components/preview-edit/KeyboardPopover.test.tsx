import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import KeyboardPopover from './KeyboardPopover';

it('focuses the visible positioned panel, preserves an input focus on resize, and returns to its trigger', async () => {
  const focus = HTMLElement.prototype.focus;
  const visibilityAtFocus: string[] = [];
  const spy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options) {
    if (this.hasAttribute('data-keyboard-auxiliary')) visibilityAtFocus.push(getComputedStyle(this).visibility);
    focus.call(this, options);
  });
  try {
    render(<KeyboardPopover label="Settings"><input aria-label="Tempo" /></KeyboardPopover>);
    const trigger = screen.getByRole('button', { name: 'Settings' });
    trigger.focus(); fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Settings' });
    expect(visibilityAtFocus).toEqual(['visible']);
    expect(panel).toHaveFocus();
    const input = screen.getByRole('textbox', { name: 'Tempo' }); input.focus();
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 300, right: 350, top: 400, bottom: 440, width: 50, height: 40, x: 300, y: 400, toJSON() {} });
    fireEvent(window, new Event('resize'));
    expect(input).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '關閉Settings' }));
    expect(trigger).toHaveFocus();
    expect(panel).toHaveAttribute('inert');
    await waitFor(() => expect(panel).not.toBeInTheDocument());
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  } finally { spy.mockRestore(); }
});
