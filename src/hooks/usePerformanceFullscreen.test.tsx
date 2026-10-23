import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePerformanceFullscreen } from './usePerformanceFullscreen';

afterEach(() => vi.unstubAllGlobals());

function mockFullscreen(prefixed = false) {
  let current: Element | null = null;
  const change = () => document.dispatchEvent(new Event(prefixed ? 'webkitfullscreenchange' : 'fullscreenchange'));
  const enter = vi.fn(() => {
    current = document.documentElement;
    change();
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    current = null;
    change();
    return Promise.resolve();
  });
  vi.spyOn(document, 'fullscreenElement', 'get').mockImplementation(() => prefixed ? null : current);
  for (const [target, key, value] of [
    [document, 'fullscreenEnabled', !prefixed],
    [document, 'webkitFullscreenEnabled', prefixed],
    [document, 'webkitFullscreenElement', null],
    [document.documentElement, 'requestFullscreen', prefixed ? undefined : enter],
    [document.documentElement, 'webkitRequestFullscreen', prefixed ? enter : undefined],
    [document, 'exitFullscreen', prefixed ? undefined : exit],
    [document, 'webkitExitFullscreen', prefixed ? exit : undefined],
  ] as const) {
    Object.defineProperty(target, key, { configurable: true, value, writable: true });
  }
  if (prefixed) {
    Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, get: () => current });
  }
  return { enter, exit, setCurrent: (element: Element | null) => { current = element; change(); } };
}

// jsdom does not implement the Fullscreen API. Restore every added property so
// these tests also cover the unsupported-browser case without leaking mocks.
const apiProperties: [object, string][] = [
  [document, 'fullscreenElement'], [document, 'fullscreenEnabled'],
  [document, 'webkitFullscreenElement'], [document, 'webkitFullscreenEnabled'],
  [document, 'exitFullscreen'], [document, 'webkitExitFullscreen'],
  [document.documentElement, 'requestFullscreen'], [document.documentElement, 'webkitRequestFullscreen'],
];
afterEach(() => {
  for (const [target, key] of apiProperties) Reflect.deleteProperty(target, key);
});

describe('performance fullscreen session', () => {
  it.each([false, true])('requests fullscreen within the click and exits only its own session (prefixed: %s)', async prefixed => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    const browser = mockFullscreen(prefixed);
    const { result } = renderHook(usePerformanceFullscreen);
    act(() => {
      result.current.requestFullscreen();
      expect(browser.enter).toHaveBeenCalledOnce();
    });
    await waitFor(() => expect(result.current.isFullscreen).toBe(true));
    act(() => result.current.exitFullscreen());
    expect(browser.exit).toHaveBeenCalledOnce();
    expect(result.current.isFullscreen).toBe(false);
  });

  it('preserves fullscreen that was already active before entering performance mode', () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    const browser = mockFullscreen();
    browser.setCurrent(document.documentElement);
    const { result } = renderHook(usePerformanceFullscreen);
    act(() => { result.current.requestFullscreen(); result.current.exitFullscreen(); });
    expect(browser.enter).not.toHaveBeenCalled();
    expect(browser.exit).not.toHaveBeenCalled();
  });

  it('handles denied requests and allows a later user-initiated retry', async () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    const browser = mockFullscreen();
    browser.enter.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { result } = renderHook(usePerformanceFullscreen);
    await act(async () => result.current.requestFullscreen());
    expect(result.current.isFullscreen).toBe(false);
    await act(async () => result.current.requestFullscreen());
    expect(result.current.isFullscreen).toBe(true);
  });

  it('leaves fullscreen when an entry request finishes after performance mode closes', async () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    const browser = mockFullscreen();
    let finish!: () => void;
    browser.enter.mockImplementationOnce(() => new Promise<void>(resolve => {
      finish = () => { browser.setCurrent(document.documentElement); resolve(); };
    }));
    const { result } = renderHook(usePerformanceFullscreen);
    act(() => { result.current.requestFullscreen(); result.current.exitFullscreen(); });
    await act(async () => finish());
    expect(browser.exit).toHaveBeenCalledOnce();
    expect(result.current.isFullscreen).toBe(false);
  });

  it('continues without throwing when the browser has no Fullscreen API', () => {
    const { result } = renderHook(usePerformanceFullscreen);
    expect(result.current.canRequestFullscreen).toBe(false);
    expect(() => result.current.requestFullscreen()).not.toThrow();
    expect(() => result.current.exitFullscreen()).not.toThrow();
  });
});
