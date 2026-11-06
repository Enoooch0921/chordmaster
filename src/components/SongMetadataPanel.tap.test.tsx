import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SongMetadataPanel from './SongMetadataPanel';
import type { Song } from '../types';
const song: Song = { title: 'Tap test', originalKey: 'C', currentKey: 'C', tempo: 92, timeSignature: '4/4', sections: [] };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId = 1; isPrimary = true;
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  render(<SongMetadataPanel song={song} language="zh" onChange={vi.fn()} showReferenceFields presentation="popover" deviceLayout="phone"/>);
  fireEvent.click(screen.getByRole('tab', { name: '參考音源' }));
  return screen.getAllByRole('button', { name: 'TAP' })[0];
}
it('holds pointer feedback until release and clears it on cancellation, without a release tap', () => {
  const tap = setup();
  fireEvent.pointerDown(tap, { button: 0, pointerId: 1 });
  expect(tap).toHaveAttribute('data-control-pressed', 'true');
  act(() => vi.advanceTimersByTime(400));
  expect(tap).toHaveAttribute('data-control-pressed', 'true');
  fireEvent.pointerCancel(tap);
  expect(tap).not.toHaveAttribute('data-control-pressed');
  fireEvent.click(tap);
  expect(tap).toHaveTextContent('TAP');
  fireEvent.pointerDown(tap, { button: 2, pointerId: 2 });
  expect(tap).not.toHaveAttribute('data-control-pressed');
});
it('supports the focused key and global T key without autorepeat, and releases on blur', () => {
  const tap = setup();
  fireEvent.keyDown(tap, { key: 'Enter' });
  expect(tap).toHaveAttribute('data-control-pressed', 'true');
  fireEvent.keyUp(tap, { key: 'Enter' });
  expect(tap).not.toHaveAttribute('data-control-pressed');
  fireEvent.keyDown(tap, { key: 'Enter', repeat: true });
  expect(tap).not.toHaveAttribute('data-control-pressed');
  fireEvent.keyDown(window, { key: 't' });
  expect(tap).toHaveAttribute('data-control-pressed', 'true');
  fireEvent.keyUp(window, { key: 't' });
  expect(tap).not.toHaveAttribute('data-control-pressed');
  fireEvent.keyDown(window, { key: 't', repeat: true });
  expect(tap).not.toHaveAttribute('data-control-pressed');
  fireEvent.keyDown(tap, { key: ' ' });
  fireEvent.blur(window);
  expect(tap).not.toHaveAttribute('data-control-pressed');
});
