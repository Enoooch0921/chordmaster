import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePerformanceChrome } from './usePerformanceChrome';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('rearms idle hiding without rendering the score workspace', () => {
  const overlay=createRef<HTMLDivElement>();overlay.current=document.createElement('div');
  const render=vi.fn();
  const {result}=renderHook(()=>{render();return usePerformanceChrome(true,overlay);});
  expect(overlay.current.dataset.performanceChrome).toBe('visible');
  act(()=>vi.advanceTimersByTime(1500));act(()=>result.current());
  act(()=>vi.advanceTimersByTime(1500));expect(overlay.current.dataset.performanceChrome).toBe('visible');
  act(()=>vi.advanceTimersByTime(500));expect(overlay.current.dataset.performanceChrome).toBe('hidden');
  act(()=>result.current());expect(overlay.current.dataset.performanceChrome).toBe('visible');
  expect(render).toHaveBeenCalledTimes(1);
});

it('clears timers on exit/unmount and starts visible when reopened', () => {
  const overlay=createRef<HTMLDivElement>();overlay.current=document.createElement('div');
  const {rerender,unmount}=renderHook(({enabled})=>usePerformanceChrome(enabled,overlay),{initialProps:{enabled:true}});
  rerender({enabled:false});act(()=>vi.advanceTimersByTime(3000));
  expect(overlay.current.dataset.performanceChrome).toBe('visible');
  rerender({enabled:true});act(()=>vi.advanceTimersByTime(2000));
  expect(overlay.current.dataset.performanceChrome).toBe('hidden');
  rerender({enabled:false});rerender({enabled:true});
  expect(overlay.current.dataset.performanceChrome).toBe('visible');
  unmount();act(()=>vi.advanceTimersByTime(3000));expect(overlay.current.dataset.performanceChrome).toBe('visible');
});

it('changes styling state only on chrome controls and leaves score attributes untouched', () => {
  const overlay = createRef<HTMLDivElement>(); overlay.current = document.createElement('div');
  const score = document.createElement('article'), chrome = document.createElement('div');
  chrome.dataset.performanceChromeItem = ''; overlay.current.append(score, chrome);
  const scoreAttributes = vi.spyOn(score, 'setAttribute');
  const { result } = renderHook(() => usePerformanceChrome(true, overlay));
  act(() => vi.advanceTimersByTime(2000));
  expect(chrome).toHaveAttribute('data-performance-chrome-hidden');
  expect(overlay.current).not.toHaveAttribute('data-performance-chrome-hidden');
  act(() => result.current());
  expect(chrome).not.toHaveAttribute('data-performance-chrome-hidden');
  expect(scoreAttributes).not.toHaveBeenCalled();
});
