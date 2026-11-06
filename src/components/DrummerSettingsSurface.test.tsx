import { StrictMode, useRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnimatePresence } from 'motion/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DrummerSettingsSurface from './DrummerSettingsSurface';

let motions: { node: Element; cancel: ReturnType<typeof vi.fn>; finish: () => void; frames: Keyframe[]; options: KeyframeAnimationOptions }[];
const originalAnimate = Element.prototype.animate;
beforeEach(() => {
  motions = [];
  Element.prototype.animate = function(frames, options) {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const cancel = vi.fn();
    motions.push({ node: this, cancel, finish, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions });
    return { finished, cancel } as unknown as Animation;
  };
});
afterEach(() => { Element.prototype.animate = originalAnimate; vi.unstubAllGlobals(); });
function Harness({ open }: { open: boolean }) {
  const panelRef = useRef<HTMLElement>(null);
  return <AnimatePresence>{open && <DrummerSettingsSurface key="settings" titleId="test-title" panelRef={panelRef} onClose={vi.fn()}>
    <h2 id="test-title">Settings</h2><button>Close settings</button>
  </DrummerSettingsSurface>}</AnimatePresence>;
}
it('keeps an exiting panel inert, reverses a rapid reopen and ignores stale completion', async () => {
  const view = render(<Harness open/>);
  fireEvent.pointerDown(document.body);
  view.rerender(<Harness open={false}/>);
  const exit = [...motions];
  const backdrop = document.querySelector('[data-settings-presence]')!;
  expect(backdrop).toHaveAttribute('inert');
  expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  expect(exit.at(-2)?.options.duration).toBe(160);
  view.rerender(<Harness open/>);
  expect(screen.getByRole('button', { name: 'Close settings' })).toHaveFocus();
  expect(backdrop).not.toHaveAttribute('inert');
  await act(async () => exit.forEach(animation => animation.finish()));
  expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  view.rerender(<Harness open={false}/>);
  await act(async () => motions.slice(-2).forEach(animation => animation.finish()));
  await waitFor(() => expect(document.querySelector('[data-settings-presence]')).toBeNull());
});
it('completes an exit immediately when keyboard input interrupts it', async () => {
  const view = render(<Harness open/>);
  fireEvent.pointerDown(document.body);
  view.rerender(<Harness open={false}/>);
  fireEvent.keyDown(document, { key: 'Tab' });
  await waitFor(() => expect(document.querySelector('[data-settings-presence]')).toBeNull());
  expect(motions.at(-1)?.cancel).toHaveBeenCalled();
});
it('removes movement and shortens the fade when reduced motion is enabled during exit', async () => {
  let reduced = false; const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, cb: () => void) => listeners.add(cb), removeEventListener: (_: string, cb: () => void) => listeners.delete(cb) }));
  const view = render(<Harness open/>);
  fireEvent.pointerDown(document.body);
  view.rerender(<Harness open={false}/>);
  act(() => { reduced = true; listeners.forEach(cb => cb()); });
  const panelMotion = motions.at(-2)!;
  expect(panelMotion.frames.every(frame => frame.transform === 'none')).toBe(true);
  expect(panelMotion.options.duration).toBe(80);
  await act(async () => motions.slice(-2).forEach(animation => animation.finish()));
  await waitFor(() => expect(document.querySelector('[data-settings-presence]')).toBeNull());
});

it('restarts the actual entry after a Strict Mode effect cleanup', () => {
  render(<StrictMode><Harness open/></StrictMode>);
  expect(motions.at(-2)?.frames[0]).toEqual({ opacity: 0, transform: 'translateX(8%)' });
  expect(screen.getByRole('button', { name: 'Close settings' })).toHaveFocus();
});
