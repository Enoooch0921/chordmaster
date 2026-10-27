import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreviewPinchZoom } from './usePreviewPinchZoom';

const point = (identifier: number, clientX: number, clientY = 250) => ({ identifier, clientX, clientY });
function setup() {
  const root = document.createElement('div'), sheet = document.createElement('div'), label = document.createElement('button');
  root.append(sheet); document.body.append(root);
  sheet.style.transform = 'scale(0.5)';
  label.textContent = '100%';
  Object.defineProperty(sheet, 'offsetWidth', { value: 1000 });
  sheet.getBoundingClientRect = vi.fn(() => ({ left: 50, top: 20, width: 500, height: 1000 }) as DOMRect);
  root.getBoundingClientRect = vi.fn(() => ({ left: 10, top: 10 }) as DOMRect);
  const options = { rootRef: { current: root }, sheetRef: { current: sheet }, activeRef: { current: false }, labelRef: { current: label },
    enabled: true, identity: 'song', minScale: 0.35, maxScale: 2.4, fitHeightScale: 0.5,
    onStart: vi.fn(), onCommit: vi.fn(), onFinish: vi.fn(), onSuppressClick: vi.fn(), onSingleTouchStart: vi.fn() };
  const hook = renderHook(usePreviewPinchZoom, { initialProps: options });
  const touch = (type: string, touches: ReturnType<typeof point>[]) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: touches });
    fireEvent(root, event); return event;
  };
  const frame = () => act(() => vi.advanceTimersByTime(20));
  return { root, sheet, options, hook, touch, frame };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe('preview pinch ownership and compositor updates', () => {
  it('yields a pending pinch to three fingers without committing zoom or restarting mid-gesture', () => {
    const { sheet, options, touch, frame } = setup();
    touch('touchstart',[point(1,100),point(2,200)]);
    touch('touchmove',[point(1,50),point(2,250)]);frame();
    expect(touch('touchstart',[point(1,50),point(2,250),point(3,300)]).defaultPrevented).toBe(false);
    expect(sheet.style.transform).toBe('scale(0.5)');expect(options.onCommit).not.toHaveBeenCalled();
    expect(touch('touchmove',[point(1,0),point(2,200),point(3,250)]).defaultPrevented).toBe(false);
    touch('touchend',[point(1,0),point(2,200)]);touch('touchstart',[point(1,0),point(2,200)]);
    expect(options.onStart).toHaveBeenCalledTimes(1);
    touch('touchend',[]);touch('touchstart',[point(4,100),point(5,200)]);touch('touchend',[]);
    expect(options.onStart).toHaveBeenCalledTimes(2);expect(options.onCommit).toHaveBeenCalledTimes(1);
  });
  it('cancels a system-interrupted pinch without saving its partial zoom', () => {
    const { sheet, options, touch, frame } = setup();
    touch('touchstart',[point(1,100),point(2,200)]);touch('touchmove',[point(1,50),point(2,250)]);frame();
    touch('touchcancel',[]);
    expect(sheet.style.transform).toBe('scale(0.5)');expect(options.onCommit).not.toHaveBeenCalled();
    touch('touchstart',[point(3,100),point(4,200)]);touch('touchend',[]);
    expect(options.onCommit).toHaveBeenCalledTimes(1);
  });
  it('keeps single-finger scrolling native', () => {
    const { options, touch } = setup();
    expect(touch('touchstart', [point(1, 100)]).defaultPrevented).toBe(false);
    expect(touch('touchmove', [point(1, 110)]).defaultPrevented).toBe(false);
    expect(options.onStart).not.toHaveBeenCalled();
    expect(options.onSingleTouchStart).toHaveBeenCalledOnce();
  });

  it('coalesces movements without reading layout or committing React state for each move', () => {
    const { root, sheet, options, touch, frame } = setup();
    expect(touch('touchstart', [point(1, 100), point(2, 200)]).defaultPrevented).toBe(true);
    for (let i = 0; i < 40; i++) touch('touchmove', [point(2, 250 + i), point(1, 100 - i)]);
    expect(sheet.style.transform).toBe('scale(0.5)');
    frame();
    expect(sheet.style.transform).toContain('translate3d');
    expect(sheet.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(root.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(options.onCommit).not.toHaveBeenCalled();
    touch('touchend', []);
    expect(options.onCommit).toHaveBeenCalledTimes(1);
    expect(options.onCommit).toHaveBeenCalledWith(expect.objectContaining({ scale: 1.14, focalX: 165, focalY: 240 }));
    expect(options.activeRef.current).toBe(false);
    expect(sheet.style.willChange).toBe('');
    expect(options.onSuppressClick).toHaveBeenCalledOnce();
  });

  it('commits the final pending move once and owns a remaining finger until release', () => {
    const { options, touch, frame } = setup();
    touch('touchstart', [point(1, 100), point(2, 200)]);
    touch('touchmove', [point(1, 80), point(2, 220)]);
    touch('touchend', [point(1, 80)]);
    expect(options.onCommit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ scale: 0.7 }));
    expect(touch('touchmove', [point(1, 90)]).defaultPrevented).toBe(true);
    frame(); touch('touchend', []);
    expect(options.onCommit).toHaveBeenCalledOnce();
    expect(options.onSuppressClick).toHaveBeenCalledOnce();
    expect(touch('touchmove', [point(3, 50)]).defaultPrevented).toBe(false);
  });

  it('cancels pending work and restores the sheet when its song is replaced', () => {
    const { sheet, options, hook, touch, frame } = setup();
    touch('touchstart', [point(1, 100), point(2, 200)]);
    touch('touchmove', [point(1, 50), point(2, 250)]);
    frame();
    expect(options.labelRef.current.textContent).toBe('200%');
    hook.rerender({ ...options, identity: 'another-song' });
    frame();
    expect(options.onCommit).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('scale(0.5)');
    expect(sheet.style.willChange).toBe('');
    expect(options.activeRef.current).toBe(false);
    expect(options.labelRef.current.textContent).toBe('100%');
  });

  it('cancels the old viewport gesture on resize and accepts the next pinch', () => {
    const { sheet, options, touch, frame } = setup();
    touch('touchstart', [point(1, 100), point(2, 200)]);
    touch('touchmove', [point(1, 50), point(2, 250)]);
    frame();
    expect(options.labelRef.current.textContent).toBe('200%');
    fireEvent.resize(window); frame();
    expect(options.onCommit).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('scale(0.5)');
    expect(options.activeRef.current).toBe(false);
    expect(options.labelRef.current.textContent).toBe('100%');
    touch('touchstart', [point(3, 100), point(4, 200)]);
    touch('touchmove', [point(3, 80), point(4, 220)]);
    touch('touchend', []);
    expect(options.onCommit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ scale: 0.7 }));
  });
});
