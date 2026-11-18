import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useAuditionPreferences } from './useAuditionPreferences';

it('shares explicit playback settings across entry points while isolating listeners', () => {
  localStorage.clear();
  const { result, rerender } = renderHook(({ userId, editor }) => useAuditionPreferences(userId, editor ? 'chord' : 'song'), {
    initialProps: { userId: 'singer', editor: false }
  });
  expect(result.current.scope).toBe('song');
  act(() => result.current.setMetronome(false));
  rerender({ userId: 'singer', editor: true });
  expect(result.current).toMatchObject({ scope: 'chord', metronome: false });
  act(() => { result.current.setScope('bar'); result.current.setMelody(false); });
  rerender({ userId: 'another', editor: false });
  expect(result.current).toMatchObject({ scope: 'song', metronome: true, melody: true });
  rerender({ userId: 'singer', editor: false });
  expect(result.current).toMatchObject({ scope: 'bar', metronome: false, melody: false });
});

it('remembers visual delay on this device and migrates the old chart practice range', () => {
  localStorage.clear();
  localStorage.setItem('chordmaster.audition.v1.guest.scope', 'practice');
  const {result, rerender} = renderHook(({userId}) => useAuditionPreferences(userId, 'song'), {
    initialProps: {userId: null as string | null}
  });
  expect(result.current.scope).toBe('map');
  act(() => result.current.setVisualDelayMs(175));
  rerender({userId: 'singer'});
  expect(result.current.visualDelayMs).toBe(175);
});
