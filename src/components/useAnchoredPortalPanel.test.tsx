import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAnchoredPortalPanel } from './useAnchoredPortalPanel';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

it('fits a short visual viewport and follows keyboard resize/pan while preserving focused input', () => {
  vi.useFakeTimers();
  const viewport = Object.assign(new EventTarget(), { width: 844, height: 390, offsetLeft: 0, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  const triggerRef = createRef<HTMLButtonElement>(), panelRef = createRef<HTMLDivElement>();
  triggerRef.current = document.createElement('button'); panelRef.current = document.createElement('div');
  const input = document.createElement('input'); panelRef.current.append(input);
  document.body.append(triggerRef.current, panelRef.current);
  triggerRef.current.getBoundingClientRect = () => ({ left: 300, top: 300, right: 344, bottom: 344, width: 44, height: 44 }) as DOMRect;
  panelRef.current.getBoundingClientRect = () => ({ width: 216, height: 497 }) as DOMRect;
  const close = vi.fn();
  const { result, unmount } = renderHook(() => useAnchoredPortalPanel({ isOpen: true, align: 'right', triggerRef, panelRef, onRequestClose: close }));
  expect(result.current.panelStyle).toMatchObject({ maxHeight: 366, top: 12 });
  input.focus();
  act(() => { viewport.height = 200; viewport.offsetTop = 40; viewport.dispatchEvent(new Event('resize')); vi.advanceTimersByTime(20); });
  expect(result.current.panelStyle).toMatchObject({ maxHeight: 176, top: 52 });
  expect(close).not.toHaveBeenCalled(); expect(input).toHaveFocus();
  input.blur();
  act(() => { viewport.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(20); });
  expect(close).toHaveBeenCalledOnce();
  unmount(); close.mockClear();
  act(() => { viewport.dispatchEvent(new Event('resize')); vi.advanceTimersByTime(20); });
  expect(close).not.toHaveBeenCalled();
});
