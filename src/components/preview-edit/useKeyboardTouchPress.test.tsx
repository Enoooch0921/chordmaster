import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import { useKeyboardTouchPress } from './useKeyboardTouchPress';

beforeAll(() => {
  if (!window.PointerEvent) vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string; isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'touch'; this.isPrimary = init.isPrimary ?? true;
    }
  });
});
function Keys({ remove, grace }: { remove: () => void; grace: () => void }) {
  const press = useKeyboardTouchPress(true);
  return <div onPointerDownCapture={press} data-keyboard-surface><button onClick={remove}>刪除</button><button onClick={grace}>裝飾音</button></div>;
}
const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 100 };
it('keeps the originally pressed key when another key moves under the release point, consuming only the compatibility click', () => {
  const remove = vi.fn(), grace = vi.fn(); render(<Keys remove={remove} grace={grace}/>);
  fireEvent.pointerDown(screen.getByText('刪除'), touch);
  fireEvent.pointerUp(screen.getByText('裝飾音'), touch);
  fireEvent.click(screen.getByText('裝飾音'), { detail: 1 });
  expect(remove).toHaveBeenCalledTimes(1); expect(grace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('裝飾音'), { detail: 0 });
  expect(grace).toHaveBeenCalledTimes(1);
});
it('cancels a scroll or multi-touch gesture and allows the next deliberate press', () => {
  const remove = vi.fn(), grace = vi.fn(); render(<Keys remove={remove} grace={grace}/>);
  fireEvent.pointerDown(screen.getByText('刪除'), touch);
  fireEvent.pointerMove(window, { ...touch, clientY: 130 });
  fireEvent.pointerUp(window, { ...touch, clientY: 130 });
  fireEvent.click(screen.getByText('刪除'), { detail: 1 });
  expect(remove).not.toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByText('刪除'), touch);
  fireEvent.pointerDown(window, { ...touch, pointerId: 2, isPrimary: false });
  fireEvent.pointerUp(window, touch);
  fireEvent.click(screen.getByText('刪除'), { detail: 1 });
  expect(remove).not.toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByText('裝飾音'), touch); fireEvent.pointerUp(window, touch);
  fireEvent.click(screen.getByText('裝飾音'), { detail: 1 });
  expect(grace).toHaveBeenCalledTimes(1);
});
it('leaves mouse activation native and cleans up a cancelled or unmounted press', () => {
  const remove = vi.fn(), grace = vi.fn(); const view = render(<Keys remove={remove} grace={grace}/>);
  fireEvent.pointerDown(screen.getByText('刪除'), { ...touch, pointerType: 'mouse' });
  fireEvent.pointerUp(window, { ...touch, pointerType: 'mouse' });
  fireEvent.click(screen.getByText('刪除'), { detail: 1 }); expect(remove).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(screen.getByText('刪除'), touch); fireEvent.pointerCancel(window, touch); fireEvent.pointerUp(window, touch);
  expect(remove).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(screen.getByText('刪除'), touch); view.unmount(); fireEvent.pointerUp(window, touch);
  expect(remove).toHaveBeenCalledTimes(1);
});
