import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeMode } from './useThemeMode';

class SystemTheme extends EventTarget { matches = false; }
let media: SystemTheme;
beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  media = new SystemTheme();
  vi.stubGlobal('matchMedia', vi.fn(() => media));
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  localStorage.clear();
});

describe('system theme changes', () => {
  it('updates the root theme and native color scheme in both directions', () => {
    const { result } = renderHook(useThemeMode);
    act(() => { media.matches = true; media.dispatchEvent(new Event('change')); });
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    act(() => { media.matches = false; media.dispatchEvent(new Event('change')); });
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('honors manual mode and resolves the latest system preference when returning to auto', () => {
    const { result } = renderHook(useThemeMode);
    act(() => result.current.setMode('light'));
    act(() => { media.matches = true; media.dispatchEvent(new Event('change')); });
    expect(result.current.isDark).toBe(false);
    act(() => result.current.setMode('auto'));
    expect(result.current.isDark).toBe(true);
    expect(localStorage.getItem('chordmaster.theme-mode.v1')).toBe('auto');
  });

  it('catches system changes missed while the installed app was suspended', () => {
    const { result } = renderHook(useThemeMode);
    act(() => { media.matches = true; window.dispatchEvent(new Event('pageshow')); });
    expect(result.current.isDark).toBe(true);
    act(() => { media.matches = false; window.dispatchEvent(new Event('focus')); });
    expect(result.current.isDark).toBe(false);
  });
});
