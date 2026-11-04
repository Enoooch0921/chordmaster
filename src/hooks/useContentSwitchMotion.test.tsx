import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useContentSwitchMotion } from './useContentSwitchMotion';
const preference = vi.hoisted(() => ({ instant: false, reduced: false }));
vi.mock('./useUiMotion', () => ({ useUiMotion: () => preference }));
beforeEach(() => { preference.instant = false; preference.reduced = false; });
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
function setup() {
  const node = document.createElement('div'); document.body.append(node);
  const cancel = vi.fn(), animate = vi.fn(() => ({ playState: 'running', cancel }) as unknown as Animation);
  node.animate = animate;
  const ref = { current: node };
  const hook = renderHook(({ value, enabled }) => useContentSwitchMotion(ref, value, enabled), { initialProps: { value: 'songs', enabled: true } });
  return { node, animate, cancel, hook };
}
it('fades a switched view without animating its first mount', () => {
  const t = setup(); expect(t.animate).not.toHaveBeenCalled();
  t.hook.rerender({ value: 'setlists', enabled: true });
  expect(t.animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: 125 }));
});
it('retargets a rapid switch from its current opacity', () => {
  const t = setup(); t.hook.rerender({ value: 'setlists', enabled: true }); t.node.style.opacity = '0.4';
  t.hook.rerender({ value: 'songs', enabled: true });
  expect(t.cancel).toHaveBeenCalled(); expect(t.animate).toHaveBeenLastCalledWith([{ opacity: 0.4 }, { opacity: 1 }], expect.anything());
});
it('keeps keyboard navigation immediate', () => {
  const t = setup(); preference.instant = true; t.hook.rerender({ value: 'setlists', enabled: true });
  expect(t.animate).not.toHaveBeenCalled();
});
it('does not animate a hidden panel or replay its first opening', () => {
  const t = setup(); t.hook.rerender({ value: 'setlists', enabled: false }); t.hook.rerender({ value: 'setlists', enabled: true });
  expect(t.animate).not.toHaveBeenCalled();
});
it('cancels the visual animation when its owner unmounts', () => {
  const t = setup(); t.hook.rerender({ value: 'setlists', enabled: true }); t.hook.unmount(); expect(t.cancel).toHaveBeenCalled();
});
