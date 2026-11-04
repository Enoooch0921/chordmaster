import { afterEach, expect, it, vi } from 'vitest';
const input = vi.hoisted(() => ({ keyboard: false }));
vi.mock('../hooks/useUiMotion', () => ({ isKeyboardInteraction: () => input.keyboard }));
import { transitionDrummerWorkspace } from './drummerTransition';

const originalMatchMedia = window.matchMedia;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => {
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  else Reflect.deleteProperty(window, 'matchMedia');
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-drummer-transition');
  Reflect.deleteProperty(document, 'startViewTransition');
  input.keyboard = false;
  vi.restoreAllMocks();
});

const normal = '<div data-app-root><aside data-sidebar><button data-drummer-trigger></button></aside><main></main></div>';
const drummer = normal + '<div data-drummer-mode><div class="drummer-left-panel"><header class="drummer-header"></header><section class="drummer-song-list"></section><section class="drummer-controls"></section></div><section class="drummer-score"></section></div>';
it.each(['enter', 'exit'])('slides only left regions on %s, keeping the right preview unanimated', async direction => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return (this.tagName === 'BUTTON' ? {width:44,height:44,left:18,top:260,right:62,bottom:304} : {width:440,height:800,left:0,top:0,right:440,bottom:800}) as DOMRect; });
  document.body.innerHTML = direction === 'exit' ? drummer : normal;
  const update = vi.fn(() => { document.body.innerHTML = direction === 'exit' ? normal : drummer; });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (commit: () => void) => {
    expect(document.documentElement.dataset.drummerTransition).toBe(direction);
    expect(document.querySelector<HTMLElement>('main, .drummer-score')!.style.viewTransitionName).toBe('');
    commit(); return { finished: Promise.resolve(), skipTransition: vi.fn() };
  } });
  transitionDrummerWorkspace(update);
  expect(update).toHaveBeenCalledOnce();
  expect(document.documentElement.style.getPropertyValue('--drummer-source-transform')).toContain('scale(0.1, 0.055)');
  expect(document.querySelector<HTMLElement>('main, .drummer-score')!.style.viewTransitionName).toBe('');
  expect(document.querySelectorAll('[style*="view-transition-name"]').length).toBe(1);
  await settle();
  expect(document.documentElement.dataset.drummerTransition).toBeUndefined();
  expect(document.querySelectorAll('[style*="view-transition-name"]').length).toBe(0);
  expect(document.documentElement.style.getPropertyValue('--drummer-source-transform')).toBe('');
});
it('still commits exactly once if the browser throws after committing', () => {
  const update = vi.fn();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (commit: () => void) => { commit(); throw new Error('cancelled'); } });
  transitionDrummerWorkspace(update);
  expect(update).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.drummerTransition).toBeUndefined();
});
it.each(['reduced motion', 'keyboard', 'explicit instant'])('updates immediately for %s', reason => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => ({ matches: reason === 'reduced motion' })) });
  input.keyboard = reason === 'keyboard';
  const update = vi.fn(), start = vi.fn();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  transitionDrummerWorkspace(update, reason === 'explicit instant');
  expect(update).toHaveBeenCalledOnce();
  expect(start).not.toHaveBeenCalled();
});
it('commits normally without browser transition support', () => {
  const update = vi.fn();
  transitionDrummerWorkspace(update);
  expect(update).toHaveBeenCalledOnce();
});
it('finishes a pending update before reversing, without applying it twice', async () => {
  const commits: (() => void)[] = [];
  const skip = vi.fn();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (commit: () => void) => {
    commits.push(commit); return { finished: Promise.resolve(), skipTransition: skip };
  } });
  const enter = vi.fn(() => { document.body.innerHTML = '<div data-drummer-mode></div>'; });
  const exit = vi.fn(() => { document.body.innerHTML = ''; });
  transitionDrummerWorkspace(enter);
  transitionDrummerWorkspace(exit);
  expect(skip).toHaveBeenCalledOnce();
  expect(enter).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.drummerTransition).toBe('exit');
  commits[0](); commits[1]();
  expect(enter).toHaveBeenCalledOnce();
  expect(exit).toHaveBeenCalledOnce();
  await settle();
  expect(document.documentElement.dataset.drummerTransition).toBeUndefined();
});
