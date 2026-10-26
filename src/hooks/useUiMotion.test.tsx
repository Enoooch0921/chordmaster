import { fireEvent, render, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isKeyboardInteraction, useUiMotion } from './useUiMotion';
const media = vi.hoisted(() => ({ reduced: false }));
vi.mock('./useReducedMotionPreference', () => ({ useReducedMotionPreference: () => media.reduced }));
beforeEach(() => { media.reduced = false; });

describe('interaction motion input gate', () => {
  it('tracks keyboard and pointer input without rerendering the score on each event', () => {
    const renders = vi.fn();
    function Probe() {
      const preference = useUiMotion();
      const [version, update] = useState(0);
      renders();
      return <button onClick={() => update(version + 1)}>{preference.instant ? 'instant' : 'pointer'} {version}</button>;
    }
    const view = render(<Probe />);
    const count = renders.mock.calls.length;
    for (let i = 0; i < 20; i++) fireEvent.keyDown(document, { key: 'a' });
    expect(renders).toHaveBeenCalledTimes(count);
    fireEvent.click(view.getByRole('button'));
    expect(view.getByRole('button')).toHaveTextContent('instant 1');
    fireEvent.pointerDown(document);
    expect(document.documentElement.dataset.uiInput).toBe('pointer');
    fireEvent.click(view.getByRole('button'));
    expect(view.getByRole('button')).toHaveTextContent('pointer 2');
  });

  it('keeps the shared observer until its last consumer unmounts', () => {
    const first = renderHook(useUiMotion), second = renderHook(useUiMotion);
    first.unmount();
    fireEvent.keyDown(document, { key: 'Enter' }); second.rerender();
    expect(second.result.current.instant).toBe(true);
    second.unmount();
    expect(document.documentElement.dataset.uiInput).toBeUndefined();
    expect(isKeyboardInteraction()).toBe(false);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(isKeyboardInteraction()).toBe(false);
  });

  it('combines system reduced motion with immediate keyboard interaction', () => {
    media.reduced = true;
    const hook = renderHook(useUiMotion);
    expect(hook.result.current).toEqual({ reduced: true, instant: false });
    fireEvent.keyDown(document, { key: 'Enter' }); hook.rerender();
    expect(hook.result.current).toEqual({ reduced: true, instant: true });
  });
});
