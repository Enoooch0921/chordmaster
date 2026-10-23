import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_SCREEN_ADDED_KEY, useHomeScreenInstall } from './useHomeScreenInstall';

let standalone = false;
let displayChange: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  standalone = false;
  displayChange = undefined;
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return standalone; },
    addEventListener: (_: string, listener: () => void) => { displayChange = listener; },
    removeEventListener: vi.fn(),
  })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('Home Screen installation guidance', () => {
  it('offers guidance in a normal browser without marking the app installed', () => {
    const { result } = renderHook(() => useHomeScreenInstall());
    expect(result.current.shouldShowInstallGuide).toBe(true);
    expect(result.current.isStandalone).toBe(false);
    expect(localStorage.getItem(HOME_SCREEN_ADDED_KEY)).toBeNull();
    expect(window.matchMedia).not.toHaveBeenCalledWith(expect.stringContaining('display-mode: fullscreen'));
  });

  it('remembers an explicit already-added choice across reloads', () => {
    const first = renderHook(() => useHomeScreenInstall());
    act(() => first.result.current.markAsAdded());
    expect(first.result.current.shouldShowInstallGuide).toBe(false);
    first.unmount();
    const next = renderHook(() => useHomeScreenInstall());
    expect(next.result.current.shouldShowInstallGuide).toBe(false);
  });

  it('detects Home Screen launch through Safari navigator.standalone', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    const { result } = renderHook(() => useHomeScreenInstall());
    expect(result.current.isStandalone).toBe(true);
    expect(result.current.shouldShowInstallGuide).toBe(false);
    expect(localStorage.getItem(HOME_SCREEN_ADDED_KEY)).toBe('true');
  });

  it('detects display-mode changes and keeps guidance suppressed after returning to a tab', () => {
    const { result } = renderHook(() => useHomeScreenInstall());
    act(() => { standalone = true; displayChange?.(); });
    expect(result.current.isStandalone).toBe(true);
    expect(result.current.shouldShowInstallGuide).toBe(false);
    act(() => { standalone = false; displayChange?.(); });
    expect(result.current.isStandalone).toBe(false);
    expect(result.current.shouldShowInstallGuide).toBe(false);
  });

  it('hides guidance in the native app', () => {
    const { result } = renderHook(() => useHomeScreenInstall(true));
    expect(result.current.shouldShowInstallGuide).toBe(false);
    expect(result.current.isStandalone).toBe(true);
  });

  it('suppresses guidance when an installation finishes in a supporting browser', () => {
    const { result } = renderHook(() => useHomeScreenInstall());
    act(() => window.dispatchEvent(new Event('appinstalled')));
    expect(result.current.shouldShowInstallGuide).toBe(false);
  });

  it('keeps the current session usable when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useHomeScreenInstall());
    act(() => result.current.markAsAdded());
    expect(result.current.shouldShowInstallGuide).toBe(false);
  });

  it('honors the already-added preference changed in another tab', () => {
    const { result } = renderHook(() => useHomeScreenInstall());
    act(() => {
      localStorage.setItem(HOME_SCREEN_ADDED_KEY, 'true');
      window.dispatchEvent(new StorageEvent('storage', { key: HOME_SCREEN_ADDED_KEY, newValue: 'true' }));
    });
    expect(result.current.shouldShowInstallGuide).toBe(false);
  });
});
