import { Profiler } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SwipeActionGroup, SwipeActionRow } from './SwipeActionRow';

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());
const leftAction = { label: 'Archive', accessibleLabel: 'Archive meeting', tone: 'archive' as const, onAction: vi.fn() };
const rightAction = { label: 'Delete', accessibleLabel: 'Delete meeting', tone: 'delete' as const, onAction: vi.fn() };
function pointer(element: Element, kind: 'Down' | 'Move' | 'Up' | 'Cancel', x: number, y = 20) {
  fireEvent[`pointer${kind}`](element, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y });
}
function fixture() {
  const commits = vi.fn(), select = vi.fn();
  const result = render(<SwipeActionGroup resetKey="project"><Profiler id="rows" onRender={commits}>
    <SwipeActionRow leftAction={leftAction} rightAction={rightAction} contentClassName="content"><button onClick={select}>Meeting</button></SwipeActionRow>
    <SwipeActionRow rightAction={{ ...rightAction, accessibleLabel: 'Remove member' }} contentClassName="content"><button>Member</button></SwipeActionRow>
  </Profiler></SwipeActionGroup>);
  const rows = result.container.querySelectorAll('[data-swipe-foreground]');
  commits.mockClear();
  return { ...result, row: rows[0], member: rows[1], commits, select };
}

it('moves only the dragged DOM layer without a React commit on every pointer move', () => {
  const { row, commits, select } = fixture();
  pointer(row, 'Down', 200);
  for (const x of [190, 175, 160, 145]) { pointer(row, 'Move', x); act(() => vi.advanceTimersByTime(16)); }
  expect(row).toHaveStyle({ transform: 'translate3d(-55px, 0, 0)' });
  expect(commits).not.toHaveBeenCalled();
  pointer(row, 'Up', 145);
  expect(row).toHaveStyle({ transform: 'translate3d(-80px, 0, 0)' });
  expect(screen.getByRole('button', { name: 'Delete meeting' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Meeting' }));
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete meeting' }));
  expect(rightAction.onAction).toHaveBeenCalledOnce();
});

it('hides action colors at rest, paints only the matching side, and closes after a reverse drag', () => {
  const { row } = fixture();
  const actions = row.parentElement!.querySelectorAll('[data-swipe-action]');
  actions.forEach(action => { expect(action).toHaveStyle({ visibility: 'hidden' }); expect(action).toHaveAttribute('inert'); });
  pointer(row, 'Down', 100); pointer(row, 'Move', 170); act(() => vi.advanceTimersByTime(16)); pointer(row, 'Up', 170);
  expect(actions[0]).toHaveStyle({ visibility: 'visible' }); expect(actions[1]).toHaveStyle({ visibility: 'hidden' });
  expect(screen.getByRole('button', { name: 'Archive meeting' })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(160));
  // jsdom does not compute translate3d into a matrix, so provide its compositor position.
  row.setAttribute('style', 'transform: matrix(1, 0, 0, 1, 80, 0)');
  pointer(row, 'Down', 170); pointer(row, 'Move', 120); pointer(row, 'Up', 120);
  expect(row).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
  expect(actions[0]).toHaveAttribute('inert');
  act(() => vi.advanceTimersByTime(160)); expect(actions[0]).toHaveStyle({ visibility: 'hidden' });
});

it('does not reveal a nonexistent right-swipe action on members, or intercept vertical scrolling', () => {
  const { member, row, commits } = fixture();
  pointer(member, 'Down', 100); pointer(member, 'Move', 170); act(() => vi.advanceTimersByTime(16)); pointer(member, 'Up', 170);
  expect(member).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
  expect(screen.queryByRole('button', { name: 'Remove member' })).toBeNull();
  commits.mockClear();
  pointer(row, 'Down', 100); pointer(row, 'Move', 105, 90); pointer(row, 'Up', 105, 90);
  expect(row).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
  expect(commits).not.toHaveBeenCalled();
});

it('closes the preceding row, cancels interrupted drags, and hides actions after closing', () => {
  const { row, member } = fixture();
  pointer(row, 'Down', 200); pointer(row, 'Move', 140); pointer(row, 'Up', 140);
  expect(screen.getByRole('button', { name: 'Delete meeting' })).toBeInTheDocument();
  pointer(member, 'Down', 200); pointer(member, 'Move', 140); pointer(member, 'Up', 140);
  expect(screen.queryByRole('button', { name: 'Delete meeting' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Remove member' })).toBeInTheDocument();
  pointer(member, 'Cancel', 140); act(() => vi.advanceTimersByTime(160));
  expect(screen.queryByRole('button', { name: 'Remove member' })).toBeNull();
  expect(member).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
});

it('supports keyboard reveal, Escape, outside clicks and context resets', () => {
  const { row, rerender } = fixture();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Meeting' }), { key: 'ArrowLeft' });
  act(() => vi.advanceTimersByTime(16));
  expect(screen.getByRole('button', { name: 'Delete meeting' })).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'Delete meeting' })).toBeNull();
  pointer(row, 'Down', 200); pointer(row, 'Move', 140); pointer(row, 'Up', 140);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('button', { name: 'Delete meeting' })).toBeNull();
  pointer(row, 'Down', 200); pointer(row, 'Move', 140); pointer(row, 'Up', 140);
  rerender(<SwipeActionGroup resetKey="another-project"><SwipeActionRow rightAction={rightAction} contentClassName="content"><button>Meeting</button></SwipeActionRow></SwipeActionGroup>);
  expect(screen.queryByRole('button', { name: 'Delete meeting' })).toBeNull();
});
