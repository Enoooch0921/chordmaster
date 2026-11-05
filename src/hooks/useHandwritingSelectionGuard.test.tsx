import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useHandwritingSelectionGuard } from './useHandwritingSelectionGuard';
function Guard({ enabled }: { enabled: boolean }) {
  useHandwritingSelectionGuard(enabled);
  return <><p>Score text</p><input aria-label="Song name" /></>;
}
it('blocks native text callouts only while handwriting is active and restores normal selection on exit', () => {
  const view = render(<Guard enabled />);
  const text = screen.getByText('Score text');
  const event = new Event('selectstart', { bubbles: true, cancelable: true });
  text.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(fireEvent.contextMenu(text)).toBe(false);
  expect(document.body).toHaveAttribute('data-handwriting-active');
  const range = document.createRange(); range.selectNodeContents(text);
  document.getSelection()!.addRange(range);
  fireEvent(document, new Event('selectionchange'));
  expect(document.getSelection()!.isCollapsed).toBe(true);
  const inputEvent = new Event('selectstart', { bubbles: true, cancelable: true });
  screen.getByRole('textbox').dispatchEvent(inputEvent);
  expect(inputEvent.defaultPrevented).toBe(false);
  view.rerender(<Guard enabled={false} />);
  expect(document.body).not.toHaveAttribute('data-handwriting-active');
  expect(fireEvent.contextMenu(text)).toBe(true);
});
