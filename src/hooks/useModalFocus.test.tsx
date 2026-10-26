import { createRef, StrictMode } from 'react';
import { fireEvent, renderHook, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useModalFocus } from './useModalFocus';

it('contains sheet focus, permits portalled pickers, and restores the opener', async () => {
  const opener = document.createElement('button');
  opener.textContent = 'Open editor';
  const dialog = document.createElement('div');
  const first = document.createElement('button');
  first.textContent = 'Done';
  const last = document.createElement('input');
  const picker = document.createElement('div');
  picker.dataset.placement = 'bottom';
  const option = document.createElement('button');
  option.textContent = 'Choose key';
  picker.append(option);
  dialog.append(first, last);
  document.body.append(opener, dialog, picker);
  opener.focus(); expect(opener).toHaveFocus();
  const ref = createRef<HTMLElement>(); ref.current = dialog;
  const { unmount } = renderHook(() => useModalFocus(true, ref));
  expect(first).toHaveFocus();
  last.focus(); fireEvent.keyDown(last, { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  opener.focus(); expect(first).toHaveFocus();
  option.focus(); expect(option).toHaveFocus();
  unmount(); await waitFor(() => expect(opener).toHaveFocus());
  opener.remove(); dialog.remove(); picker.remove();
});

it('restores the original opener after Strict Mode replays mount effects', async () => {
  const opener = document.createElement('button'), dialog = document.createElement('div'), done = document.createElement('button');
  dialog.append(done); document.body.append(opener, dialog); opener.focus();
  const ref = createRef<HTMLElement>(); ref.current = dialog;
  const { unmount } = renderHook(() => useModalFocus(true, ref), { wrapper: StrictMode });
  await Promise.resolve(); expect(done).toHaveFocus();
  unmount(); await waitFor(() => expect(opener).toHaveFocus());
  opener.remove(); dialog.remove();
});
