import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSetlistPreviewNavigation } from './useSetlistPreviewNavigation';

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  Object.defineProperties(root, {
    clientHeight: { value: 600 },
    scrollHeight: { value: 3000 }
  });
  root.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600 }) as DOMRect;
  root.scrollTo = vi.fn();
  ['one', 'two', 'three'].forEach((id, index) => {
    const card = document.createElement('div');
    card.dataset.setlistPreviewSongId = id;
    card.getBoundingClientRect = () => ({
      top: index * 1000 - root.scrollTop,
      bottom: (index + 1) * 1000 - root.scrollTop
    }) as DOMRect;
    root.append(card);
  });
  const options = {
    previewRef: { current: root },
    enabled: true,
    trackScroll: true,
    selectedSongId: 'one',
    songCount: 3,
    skipNextAutoScrollRef: { current: false },
    preserveSelectionUntilRef: { current: 0 },
    gestureActiveRef: { current: false },
    onSelectSong: vi.fn()
  };
  const hook = renderHook(useSetlistPreviewNavigation, { initialProps: options });
  const advance = (ms = 40) => act(() => vi.advanceTimersByTime(ms));
  const move = (top: number) => {
    root.scrollTop = top;
    fireEvent.scroll(root);
  };
  advance();
  return { root, options, hook, advance, move };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('setlist preview navigation', () => {
  it('keeps the third song selected while a long smooth scroll crosses the second song', () => {
    const { root, options, hook, advance, move } = setup();
    hook.rerender({ ...options, selectedSongId: 'three' });
    // Even a delayed render must not let the old scroll position select a song.
    move(1000);
    advance();
    expect(root.scrollTo).toHaveBeenLastCalledWith({ top: 1904, behavior: 'smooth' });
    for (let step = 0; step < 20; step++) {
      move(1000 + step * 20);
      advance(100);
    }
    expect(options.onSelectSong).not.toHaveBeenCalled();
    move(1904);
    fireEvent(root, new Event('scrollend'));
    advance();
    expect(options.onSelectSong).not.toHaveBeenCalled();
    // Manual scrolling still selects the song the user is reading.
    move(1000);
    advance();
    expect(options.onSelectSong).toHaveBeenCalledExactlyOnceWith('two');
    expect(options.skipNextAutoScrollRef.current).toBe(true);
    hook.rerender({ ...options, selectedSongId: 'two' });
    advance();
    expect(root.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('resumes tracking after scrolling settles without browser scrollend support', () => {
    const { options, hook, advance, move } = setup();
    hook.rerender({ ...options, selectedSongId: 'three' });
    advance();
    move(1000);
    advance(100);
    move(1904);
    advance(200);
    expect(options.onSelectSong).not.toHaveBeenCalled();
    move(1000);
    advance();
    expect(options.onSelectSong).toHaveBeenCalledExactlyOnceWith('two');
  });

  it('cancels a superseded pending jump and keeps the latest choice', () => {
    const { root, options, hook, advance, move } = setup();
    hook.rerender({ ...options, selectedSongId: 'two' });
    hook.rerender({ ...options, selectedSongId: 'three' });
    advance();
    expect(root.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1904, behavior: 'smooth' });
    move(1000);
    advance();
    expect(options.onSelectSong).not.toHaveBeenCalled();
  });

  it('does not change the explicit selection on the final scroll event even if the previous card crosses the activation line', () => {
    const { root, options, hook, advance, move } = setup();
    hook.rerender({ ...options, selectedSongId: 'three' });
    advance();
    move(1800);
    fireEvent(root, new Event('scrollend'));
    advance();
    expect(options.onSelectSong).not.toHaveBeenCalled();
  });

  it('does not leave tracking locked when the target is already at the scroll boundary', () => {
    const { options, advance, move } = setup();
    move(1000);
    advance();
    expect(options.onSelectSong).toHaveBeenCalledExactlyOnceWith('two');
  });

  it('preserves the selection during zoom adjustments and editing', () => {
    const { options, hook, advance, move } = setup();
    options.preserveSelectionUntilRef.current = performance.now() + 900;
    move(1000);
    advance();
    expect(options.onSelectSong).not.toHaveBeenCalled();
    advance(1000);
    hook.rerender({ ...options, trackScroll: false });
    move(1904);
    advance();
    expect(options.onSelectSong).not.toHaveBeenCalled();
  });

  it('blocks selection and pending auto-positioning throughout a long pinch', () => {
    const { root, options, hook, advance, move } = setup();
    options.gestureActiveRef.current = true;
    advance(5000);
    move(1000);
    advance();
    expect(options.onSelectSong).not.toHaveBeenCalled();
    hook.rerender({ ...options, selectedSongId: 'three' });
    advance();
    expect(root.scrollTo).not.toHaveBeenCalled();
    options.gestureActiveRef.current = false;
    move(1000);
    advance();
    expect(options.onSelectSong).toHaveBeenCalledExactlyOnceWith('two');
  });

  it('selects the song occupying most of the viewport even when the previous song crosses the old activation line', () => {
    const { root, options, advance, move } = setup();
    // A tall iPad viewport: the old 180px line is still on song two,
    // while song three occupies over 80% of the screen.
    root.getBoundingClientRect = () => ({ top: 0, bottom: 1100, height: 1100 }) as DOMRect;
    move(1820);
    advance();
    expect(options.onSelectSong).toHaveBeenCalledExactlyOnceWith('three');
  });

  it('lets a fresh touch interrupt a programmatic jump without waiting for scrollend', () => {
    const { root, options, hook, advance, move } = setup();
    hook.rerender({ ...options, selectedSongId: 'three' });
    advance(); move(1000); advance();
    const touch = new Event('touchstart'); Object.defineProperty(touch, 'touches', { value: [{}] });
    fireEvent(root, touch);
    expect(root.scrollTo).toHaveBeenLastCalledWith({ top: 1000, left: 0, behavior: 'instant' });
    move(1100); advance();
    expect(options.onSelectSong).toHaveBeenCalledExactlyOnceWith('two');
  });

  it('releases a jump even when the browser emits no scroll events', () => {
    const { options, hook, advance, move } = setup();
    hook.rerender({ ...options, selectedSongId: 'three' }); advance(500);
    move(1000); advance();
    expect(options.onSelectSong).toHaveBeenCalledExactlyOnceWith('two');
  });

  it('removes pending navigation work on unmount', () => {
    const { root, options, hook, advance } = setup();
    hook.rerender({ ...options, selectedSongId: 'three' });
    hook.unmount();
    advance(2000);
    expect(root.scrollTo).not.toHaveBeenCalled();
    expect(options.onSelectSong).not.toHaveBeenCalled();
  });
});
