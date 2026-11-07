import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricsBookSettings } from '../utils/lyricsBook';
import { DEFAULT_LYRICS_READING_SETTINGS, useLyricsReadingPreferences } from './useLyricsReadingPreferences';

const storageKey = (identity = 'local') => `chordmaster.lyrics-reading.v1:${encodeURIComponent(identity)}`;
const preference: LyricsBookSettings = { font: 'kaiti', fontSize: 32, lineHeight: 2, language: 'mixed' };
beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('lyrics reading device preferences', () => {
  it('starts phones at 22px, keeps that size through rotation and honors saved sizes', () => {
    const media = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', media);
    const { result, rerender, unmount } = renderHook(() => useLyricsReadingPreferences());
    expect(result.current[0].fontSize).toBe(22);
    expect(localStorage.getItem(storageKey())).toBeNull();
    media.mockReturnValue({ matches: false });
    rerender();
    expect(result.current[0].fontSize).toBe(22);
    act(() => result.current[1](previous => ({ ...previous, fontSize: 28 })));
    unmount();
    media.mockReturnValue({ matches: true });
    expect(renderHook(() => useLyricsReadingPreferences()).result.current[0].fontSize).toBe(28);
  });

  it('does not write defaults on mount and restores only reader fields after remount', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { result, unmount } = renderHook(() => useLyricsReadingPreferences('user/一:二'));
    expect(result.current[0]).toEqual(DEFAULT_LYRICS_READING_SETTINGS);
    expect(write).not.toHaveBeenCalled();
    act(() => result.current[1]({ ...preference, layout: 'compact' }));
    expect(result.current[0]).toEqual(preference);
    expect(JSON.parse(localStorage.getItem(storageKey('user/一:二'))!)).toEqual(preference);
    unmount();
    expect(renderHook(() => useLyricsReadingPreferences('user/一:二')).result.current[0]).toEqual(preference);
  });

  it('isolates identity changes in the render before effects and bases functional updates on the new account', () => {
    localStorage.setItem(storageKey('bob'), JSON.stringify({ ...preference, fontSize: 28 }));
    const renders: { identity: string; settings: LyricsBookSettings }[] = [];
    const { result, rerender } = renderHook(({ identity, adjustBeforeEffect }) => {
      const reading = useLyricsReadingPreferences(identity);
      renders.push({ identity, settings: reading[0] });
      React.useLayoutEffect(() => {
        if (adjustBeforeEffect) reading[1](previous => ({ ...previous, fontSize: previous.fontSize + 2 }));
      }, [identity, adjustBeforeEffect]);
      return reading;
    }, { initialProps: { identity: 'alice', adjustBeforeEffect: false } });
    act(() => result.current[1]({ ...preference, fontSize: 40 }));
    rerender({ identity: 'bob', adjustBeforeEffect: true });
    expect(renders.find(render => render.identity === 'bob')?.settings).toEqual({ ...preference, fontSize: 28 });
    expect(result.current[0]).toEqual({ ...preference, fontSize: 30 });
    rerender({ identity: 'local', adjustBeforeEffect: false });
    expect(renders.find(render => render.identity === 'local')?.settings).toEqual(DEFAULT_LYRICS_READING_SETTINGS);
    rerender({ identity: 'alice', adjustBeforeEffect: false });
    expect(result.current[0]).toEqual({ ...preference, fontSize: 40 });
    expect(JSON.parse(localStorage.getItem(storageKey('bob'))!)).toEqual({ ...preference, fontSize: 30 });
  });

  it.each([
    'bad json', 'null', '[]', '42', '{}',
    JSON.stringify({ ...preference, font: 'other' }),
    JSON.stringify({ ...preference, fontSize: 16 }),
    JSON.stringify({ ...preference, fontSize: 42 }),
    JSON.stringify({ ...preference, fontSize: 25 }),
    JSON.stringify({ ...preference, fontSize: 24.5 }),
    JSON.stringify({ ...preference, fontSize: '24' }),
    JSON.stringify({ ...preference, fontSize: null }),
    '{"font":"sans","fontSize":1e309,"lineHeight":1.7,"language":"chinese"}',
    JSON.stringify({ ...preference, lineHeight: 1.875 }),
    JSON.stringify({ ...preference, language: 'french' }),
  ])('falls back without rewriting malformed stored settings: %s', stored => {
    localStorage.setItem(storageKey(), stored);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useLyricsReadingPreferences());
    expect(result.current[0]).toEqual(DEFAULT_LYRICS_READING_SETTINGS);
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps functional adjustments usable when storage cannot be read or written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result, rerender } = renderHook(({ identity }) => useLyricsReadingPreferences(identity), { initialProps: { identity: 'alice' } });
    expect(result.current[0]).toEqual(DEFAULT_LYRICS_READING_SETTINGS);
    act(() => {
      result.current[1](previous => ({ ...previous, fontSize: previous.fontSize + 2 }));
      result.current[1](previous => ({ ...previous, fontSize: previous.fontSize + 2 }));
    });
    expect(result.current[0].fontSize).toBe(28);
    rerender({ identity: 'bob' });
    expect(result.current[0]).toEqual(DEFAULT_LYRICS_READING_SETTINGS);
  });

  it('rejects invalid runtime updates without discarding a valid in-memory preference', () => {
    const { result } = renderHook(() => useLyricsReadingPreferences());
    act(() => result.current[1](preference));
    act(() => result.current[1](previous => ({ ...previous, fontSize: Number.NaN })));
    expect(result.current[0]).toEqual(preference);
    expect(JSON.parse(localStorage.getItem(storageKey())!)).toEqual(preference);
  });

  it('responds only to current-identity storage events and safe resets', () => {
    const { result } = renderHook(() => useLyricsReadingPreferences('alice'));
    localStorage.setItem(storageKey('alice'), JSON.stringify(preference));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: storageKey('bob') })));
    expect(result.current[0]).toEqual(DEFAULT_LYRICS_READING_SETTINGS);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: storageKey('alice') })));
    expect(result.current[0]).toEqual(preference);
    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(result.current[0]).toEqual(DEFAULT_LYRICS_READING_SETTINGS);
  });
});

it('carries the prior readability floor into legacy 18px preferences before fixed sizing', () => {
  localStorage.setItem(storageKey(), JSON.stringify({ ...preference, fontSize: 18 }));
  const { result } = renderHook(() => useLyricsReadingPreferences());
  expect(result.current[0]).toEqual({ ...preference, fontSize: 20 });
});

it('starts touch tablets at 28px while retaining explicit sizes and rotation continuity', () => {
  const media = vi.fn((query: string) => ({ matches: query === '(any-pointer: coarse)' }));
  vi.stubGlobal('matchMedia', media);
  const { result, rerender, unmount } = renderHook(() => useLyricsReadingPreferences());
  expect(result.current[0].fontSize).toBe(28);
  media.mockReturnValue({ matches: false });
  rerender();
  expect(result.current[0].fontSize).toBe(28);
  unmount();
  localStorage.setItem(storageKey(), JSON.stringify({ ...DEFAULT_LYRICS_READING_SETTINGS, fontSize: 24 }));
  media.mockImplementation(query => ({ matches: query === '(any-pointer: coarse)' }));
  expect(renderHook(() => useLyricsReadingPreferences()).result.current[0].fontSize).toBe(24);
});
