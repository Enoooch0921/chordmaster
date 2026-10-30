import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKeyboardRestingRect, usePreviewKeyboardVisibility } from './usePreviewKeyboardVisibility';
import { PREVIEW_KEYBOARD_LAYOUT_EVENT } from './usePreviewKeyboardPosition';

const state = vi.hoisted(() => ({ preference: { instant: false, reduced: false }, runs: [] as { from: number; to: number; options: { onUpdate: (v: number) => void; onComplete: () => void }; stop: ReturnType<typeof vi.fn> }[] }));
vi.mock('./useUiMotion', () => ({ useUiMotion: () => state.preference }));
vi.mock('motion', () => ({ animate: (from: number, to: number, options: typeof state.runs[number]['options']) => {
  const run = { from, to, options, stop: vi.fn() }; state.runs.push(run); return { stop: run.stop };
} }));
const rect = (top: number, height: number, width = 400) => new DOMRect(0, top, width, height);
beforeEach(() => {
  vi.useFakeTimers(); state.runs = []; state.preference = { instant: false, reduced: false };
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => window.setTimeout(() => fn(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
function setup(atBottom = false, baseTop = atBottom ? 1130 : 520) {
  const preview = document.createElement('div'), canvas = document.createElement('div'), sheet = document.createElement('div'), bar = document.createElement('div'), panel = document.createElement('div');
  bar.className = 'sheet-bar'; bar.dataset.previewEditAnchor = 'bar'; panel.dataset.keyboardPositionShell = ''; panel.dataset.keyboardDocked = '';
  preview.style.paddingBottom = '12px'; preview.append(canvas); canvas.append(sheet); sheet.append(bar); document.body.append(preview, panel);
  Object.defineProperty(preview, 'clientHeight', { value: 600 });
  Object.defineProperty(preview, 'scrollHeight', { get: () => 1200 + (parseFloat(preview.style.paddingBottom) || 0) + (parseFloat(preview.querySelector<HTMLElement>('[data-keyboard-leading-space]')?.style.height ?? '') || 0) });
  preview.getBoundingClientRect = () => rect(0, 600);
  panel.getBoundingClientRect = () => rect(300, 300);
  bar.getBoundingClientRect = () => rect(baseTop - preview.scrollTop + (parseFloat(preview.querySelector<HTMLElement>('[data-keyboard-leading-space]')?.style.height ?? '') || 0), 60);
  preview.scrollTop = atBottom ? 612 : 0;
  const onReveal = vi.fn();
  const hook = renderHook(({ anchor }) => usePreviewKeyboardVisibility(anchor, { current: preview }, { current: canvas }, { current: sheet }, onReveal), { initialProps: { anchor: 'bar' as string | null } });
  const frame = () => act(() => vi.advanceTimersByTime(20));
  const run = () => state.runs.at(-1)!;
  const advance = (progress: number) => act(() => { const r = run(); r.options.onUpdate(r.from + (r.to - r.from) * progress); });
  const finish = () => act(() => { const r = run(); r.options.onUpdate(r.to); r.options.onComplete(); });
  return { preview, canvas, panel, bar, hook, frame, run, advance, finish, onReveal };
}
describe('preview keyboard motion coordination', () => {
  it('reserves final space first and scrolls progressively to reveal the whole bar', () => {
    const t = setup(); t.frame();
    expect(t.preview.style.paddingBottom).toBe('316px');
    expect(t.preview.scrollTop).toBe(0); expect(t.run().to).toBe(296);
    t.advance(0.5); expect(t.preview.scrollTop).toBe(148);
    t.finish(); expect(t.preview.scrollTop).toBe(296); expect(t.onReveal).toHaveBeenCalledOnce();
  });
  it('does not restart an in-flight scroll on repeated layout measurements', () => {
    const t = setup(); t.frame(); t.advance(0.5);
    fireEvent(window, new Event(PREVIEW_KEYBOARD_LAYOUT_EVENT)); t.frame();
    expect(state.runs).toHaveLength(1); expect(t.preview.scrollTop).toBe(148);
    t.finish(); expect(t.preview.scrollTop).toBe(296);
  });
  it('cancels queued reveals and ignores late layout frames once the user starts panning', () => {
    const t = setup();
    fireEvent.wheel(t.preview); t.frame();
    fireEvent(window, new Event(PREVIEW_KEYBOARD_LAYOUT_EVENT)); t.frame();
    expect(state.runs).toHaveLength(0); expect(t.preview.scrollTop).toBe(0);
  });
  it.each(['pointerdown', 'touchstart', 'wheel'])('lets a user %s interrupt at the current position', type => {
    const t = setup(); t.frame(); t.advance(0.5);
    fireEvent(t.preview, new Event(type));
    expect(t.run().stop).toHaveBeenCalledOnce(); expect(t.preview.scrollTop).toBe(148);
    t.preview.scrollTop = 120; fireEvent.scroll(t.preview); t.frame();
    expect(t.preview.scrollTop).toBe(120); expect(state.runs).toHaveLength(1);
  });
  it('keeps trailing space during dismissal to prevent the browser clamping the bottom rows', () => {
    const t = setup(true); t.frame(); t.finish(); expect(t.preview.scrollTop).toBe(906);
    t.hook.rerender({ anchor: null });
    expect(t.preview.style.paddingBottom).toBe('316px'); expect(t.preview.scrollTop).toBe(906); expect(t.run().to).toBe(612);
    t.advance(0.5); expect(t.preview.scrollTop).toBe(759);
    t.finish(); expect(t.preview.style.paddingBottom).toBe('12px'); expect(t.preview.scrollTop).toBe(612);
  });
  it('reverses an interrupted dismissal without releasing the new keyboard space', () => {
    const t = setup(true); t.frame(); t.finish(); t.hook.rerender({ anchor: null }); t.advance(0.5);
    const closing = t.run(); t.hook.rerender({ anchor: 'bar' }); t.frame();
    expect(closing.stop).toHaveBeenCalled(); expect(t.run().from).toBe(759); expect(t.run().to).toBe(906);
    t.finish(); expect(t.preview.style.paddingBottom).toBe('316px');
  });
  it('folds temporary leading space away instead of snapping the first row upward', () => {
    const t = setup(false, 0); t.panel.getBoundingClientRect = () => rect(0, 300); t.frame(); t.finish();
    expect(t.bar.getBoundingClientRect().top).toBe(316);
    t.hook.rerender({ anchor: null });
    expect(t.bar.getBoundingClientRect().top).toBe(316);
    t.advance(0.5); expect(t.bar.getBoundingClientRect().top).toBe(158);
    t.finish(); expect(t.bar.getBoundingClientRect().top).toBe(0);
    expect(t.preview.querySelector('[data-keyboard-leading-space]')).toBeNull();
  });
  it.each(['instant', 'reduced'] as const)('reveals immediately for %s motion preferences', key => {
    state.preference[key] = true; const t = setup(); t.frame();
    expect(state.runs).toHaveLength(0); expect(t.preview.scrollTop).toBe(296);
    t.hook.rerender({ anchor: null }); expect(t.preview.style.paddingBottom).toBe('12px');
  });
  it('restores original inline styles on unmount', () => {
    const t = setup(); t.frame(); const running = t.run(); t.hook.unmount();
    expect(running.stop).toHaveBeenCalled(); expect(t.preview.style.paddingBottom).toBe('12px'); expect(t.preview.style.scrollPaddingBottom).toBe('');
  });
});
describe('resting keyboard bounds', () => {
  it('predicts expanded height without measuring the sliding visual surface', () => {
    const panel = document.createElement('div'), disclosure = document.createElement('div'), content = document.createElement('div');
    panel.dataset.keyboardDocked = ''; disclosure.dataset.keyboardDisclosure = ''; disclosure.dataset.collapsed = 'false'; content.dataset.keyboardContent = '';
    panel.append(disclosure); disclosure.append(content); panel.getBoundingClientRect = () => rect(450, 150);
    Object.defineProperty(panel, 'offsetHeight', { value: 150 }); Object.defineProperty(disclosure, 'offsetHeight', { value: 50 }); Object.defineProperty(content, 'offsetHeight', { value: 250 });
    expect(getKeyboardRestingRect(panel)).toMatchObject({ top: 250, bottom: 600, height: 350 });
    disclosure.dataset.collapsed = 'true'; expect(getKeyboardRestingRect(panel)).toMatchObject({ top: 500, bottom: 600, height: 100 });
  });
  it('respects desktop scale and a stationary top edge', () => {
    const panel = document.createElement('div'), disclosure = document.createElement('div'), content = document.createElement('div');
    disclosure.dataset.keyboardDisclosure = ''; disclosure.dataset.collapsed = 'false'; content.dataset.keyboardContent = '';
    panel.append(disclosure); disclosure.append(content); panel.getBoundingClientRect = () => rect(100, 120);
    Object.defineProperty(panel, 'offsetHeight', { value: 150 }); Object.defineProperty(disclosure, 'offsetHeight', { value: 50 }); Object.defineProperty(content, 'offsetHeight', { value: 250 });
    expect(getKeyboardRestingRect(panel)).toMatchObject({ top: 100, bottom: 380, height: 280 });
  });
});
