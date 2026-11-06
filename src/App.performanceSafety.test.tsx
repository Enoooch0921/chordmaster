import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { Setlist, StoredSong, WorkspaceSnapshot } from './types';
const sync = vi.hoisted(() => ({ owned: vi.fn(() => false), joined: vi.fn(() => false) }));
let fixture: WorkspaceSnapshot;
const restoreFullscreen: Array<() => void> = [];
const browserFullscreen = (prefixed: boolean) => {
  let current: Element | null = null;
  const set = (value: Element | null) => {
    current = value;
    document.dispatchEvent(new Event(prefixed ? 'webkitfullscreenchange' : 'fullscreenchange'));
  };
  const define = (target: object, key: string, descriptor: PropertyDescriptor) => {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    restoreFullscreen.push(() => { if (previous) Object.defineProperty(target, key, previous); else Reflect.deleteProperty(target, key); });
    Object.defineProperty(target, key, { configurable: true, ...descriptor });
  };
  define(document, 'fullscreenElement', { get: () => prefixed ? null : current });
  define(document, 'webkitFullscreenElement', { get: () => prefixed ? current : null });
  define(document, 'fullscreenEnabled', { value: !prefixed });
  define(document, 'webkitFullscreenEnabled', { value: prefixed });
  define(document.documentElement, prefixed ? 'webkitRequestFullscreen' : 'requestFullscreen', {
    value: vi.fn(async () => set(document.documentElement))
  });
  const exit = vi.fn(async () => set(null));
  define(document, prefixed ? 'webkitExitFullscreen' : 'exitFullscreen', { value: exit });
  return { set, exit };
};
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: sync.owned }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: sync.joined }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); });
afterEach(() => { localStorage.clear(); vi.useRealTimers(); restoreFullscreen.splice(0).reverse().forEach(restore => restore()); });
const stageSong = (id: string): StoredSong => ({ id, updatedAt: 1, title: `Stage ${id}`, originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: `${id}-verse`, title: 'Verse', bars: Array.from({ length: 96 }, (_, i) => ({ id: `${id}-${i}`, chords: ['C'] })) }] });
const start = async (shared = false) => {
  const songs = [stageSong('one'), stageSong('two')];
  const setlist: Setlist = { id: 'stage-list', name: '離線演出', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: songs.map((song, i) => ({ id: `entry-${i}`, songId: song.id, setlistId: 'stage-list', order: i, sectionOrder: [song.sections[0].id!], songData: song })) };
  fixture = { songs, setlists: shared ? [] : [setlist], joinedSetlists: shared ? [{ ...setlist, isJoined: true }] : [], projects: [], joinedProjects: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.workspace-mode.v1', 'setlists'); localStorage.setItem('chordmaster.selected-setlist-id.v1', setlist.id); localStorage.setItem('chordmaster.selected-setlist-song-id.v1', 'entry-0');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  fireEvent.click((await screen.findAllByRole('button', { name: /^演出模式$/ }))[0]);
  await waitFor(() => expect(document.querySelector('[data-performance-overlay]')).not.toBeNull());
  await waitFor(() => expect(Number(document.querySelector('[data-performance-pages]')!.getAttribute('data-performance-pages'))).toBeGreaterThan(2));
};
const page = () => Number(document.querySelector('[data-performance-page]')!.getAttribute('data-performance-page'));
const pedal = (type: 'keydown' | 'keyup', key = 'PageDown', repeat = false) => fireEvent(window, new KeyboardEvent(type, { key, code: key, repeat, bubbles: true, cancelable: true }));

describe('on-stage offline and page-turner stability', () => {
  it.each([false, true])('returns to the workspace after browser exit or pressing Exit before click (prefixed: %s)', async prefixed => {
    const browser = browserFullscreen(prefixed);
    await start();
    act(() => browser.set(null));
    await waitFor(() => expect(document.querySelector('[data-performance-overlay]')).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
    await waitFor(() => expect(document.querySelector('[data-performance-overlay]')).not.toBeNull());
    fireEvent.pointerDown(screen.getByRole('button', { name: '退出' }), { button: 0, isPrimary: true });
    expect(document.querySelector('[data-performance-overlay]')).toBeNull();
    expect(browser.exit).toHaveBeenCalledOnce();
  }, 15000);

  it('exits windowed performance by click when the device has no fullscreen API', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: '退出' }));
    expect(document.querySelector('[data-performance-overlay]')).toBeNull();
  }, 15000);

  it('turns pages and reveals/hides chrome without re-rendering the score workspace', async () => {
    await start();
    const overlay=document.querySelector<HTMLElement>('[data-performance-overlay]')!;
    const before=sync.owned.mock.calls.length;
    act(()=>{pedal('keydown');pedal('keyup');});expect(page()).toBe(2);
    fireEvent.click(screen.getByRole('button',{name:'Previous page'}));expect(page()).toBe(1);
    expect(sync.owned.mock.calls.length).toBe(before);
    vi.useFakeTimers();
    fireEvent.mouseMove(overlay);
    act(()=>vi.advanceTimersByTime(2100));expect(overlay.dataset.performanceChrome).toBe('hidden');
    fireEvent.click(screen.getByRole('button',{name:'Next page'}));expect(page()).toBe(2);
    expect(overlay.dataset.performanceChrome).toBe('visible');
    expect(sync.owned.mock.calls.length).toBe(before);
    // An unrelated App update must retain the page selected by direct input.
    act(()=>window.dispatchEvent(new Event('offline')));expect(page()).toBe(2);
  },15000);

  it('crosses song boundaries in both directions and returns to the previous song final page', async () => {
    await start();
    const total=Number(document.querySelector('[data-performance-pages]')!.getAttribute('data-performance-pages'));
    for(let i=1;i<total;i++)fireEvent.click(screen.getByRole('button',{name:'Next page'}));
    expect(page()).toBe(total);
    fireEvent.click(screen.getByRole('button',{name:'Next page'}));
    await waitFor(()=>expect(document.querySelector('[data-performance-overlay] h1')).toHaveTextContent('Stage two'));
    expect(page()).toBe(1);
    fireEvent.click(screen.getByRole('button',{name:'Previous page'}));
    await waitFor(()=>expect(document.querySelector('[data-performance-overlay] h1')).toHaveTextContent('Stage one'));
    expect(page()).toBe(total);
  },15000);
  it('keeps live updates and keyboard/manual turns through disconnect and reconnect', async () => {
    await start();
    expect((sync.owned.mock.calls.at(-1) as unknown as [{ paused: boolean }])[0].paused).toBe(false);
    expect((sync.joined.mock.calls.at(-1) as unknown as [{ paused: boolean }])[0].paused).toBe(false);
    act(() => { pedal('keydown'); pedal('keyup'); }); expect(page()).toBe(2);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    act(() => { pedal('keydown'); pedal('keydown', 'PageDown', true); pedal('keyup'); }); expect(page()).toBe(3);
    const at = page();
    const overlay = document.querySelector('[data-performance-overlay]');
    const remote = structuredClone(fixture);
    remote.setlists[0].songs[0].overrideKey = 'D';
    const owned = (sync.owned.mock.calls.at(-1) as unknown as [Parameters<typeof import('./hooks/useLibraryWorkspaceRefresh').useLibraryWorkspaceRefresh>[0]])[0];
    act(() => owned.onUpdate(remote));
    expect(page()).toBe(at);
    expect(document.querySelector('[data-performance-overlay]')).toBe(overlay);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(page()).toBe(at);
    act(() => { pedal('keyup', 'PageUp'); }); expect(page()).toBe(at - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(page()).toBe(at);
  }, 15000);
  it('does not count a synthesized click after a swipe as a second page turn', async () => {
    await start(); const overlay = document.querySelector('[data-performance-overlay]')!;
    fireEvent.touchStart(overlay, { touches: [{ clientX: 700, clientY: 300 }] });
    const before = sync.owned.mock.calls.length;
    fireEvent.touchMove(overlay, { touches: [{ clientX: 580, clientY: 300 }] });
    await act(() => new Promise(resolve => setTimeout(resolve, 25)));
    expect(document.querySelector<HTMLElement>('[data-performance-swipe-surface]')!.style.transform).toBe('');
    expect(document.querySelector<HTMLElement>('[data-performance-touch-feedback]')!.dataset.direction).toBe('next');
    expect(document.querySelector<HTMLElement>('[data-performance-touch-feedback]')!.dataset.active).toBe('true');
    expect(page()).toBe(1);
    fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 400, clientY: 300 }] });
    expect(page()).toBe(2);
    expect(sync.owned.mock.calls.length).toBe(before);
    expect(document.querySelector<HTMLElement>('[data-performance-navigation-hint]')!.hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }), { detail: 1 }); expect(page()).toBe(2);
    fireEvent.touchStart(overlay, { touches: [{ clientX: 700, clientY: 300 }] });
    fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 700, clientY: 300 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(page()).toBe(3);
  }, 15000);
});


it('keeps all performance chart pages inside a light paper scope while the app is dark', async () => {
  localStorage.setItem('chordmaster.theme-mode.v1', 'dark');
  await start();
  expect(document.documentElement).toHaveClass('dark');
  const paper = document.querySelector('[data-performance-overlay] .performance-sheet')!;
  const pages = [...paper.querySelectorAll('[data-print-page]')];
  expect(pages.length).toBeGreaterThan(1);
  for (const page of pages) expect(page.closest('[data-print-preview]')).toBe(paper);
  expect(paper).toHaveStyle({ colorScheme: 'light' });
});

it('restores app and windowed performance bounds after fullscreen exit with a stale visual viewport', async () => {
  const oldHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  const oldViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const viewport = Object.assign(new EventTarget(), { height: 1210, offsetTop: 0, scale: 1 });
  const setHeight = (height: number) => Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  try {
    setHeight(1210);
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    await start();
    const root = document.querySelector<HTMLElement>('[data-app-root]')!;
    const overlay = document.querySelector<HTMLElement>('[data-performance-overlay]')!;
    expect(root.style.height).toBe('100dvh');
    expect(overlay.style.height).toBe('100dvh');
    // Native fullscreen has ended, but the performance view is still open.
    setHeight(1078);
    fireEvent(document, new Event('webkitfullscreenchange'));
    await waitFor(() => expect(overlay.style.height).toBe('100dvh'));
    expect(root.style.height).toBe('100dvh');
    fireEvent.click(screen.getByRole('button', { name: '退出' }));
    await waitFor(() => expect(document.querySelector('[data-performance-overlay]')).toBeNull());
    expect(root.style.height).toBe('100dvh');
  } finally {
    if (oldHeight) Object.defineProperty(window, 'innerHeight', oldHeight);
    if (oldViewport) Object.defineProperty(window, 'visualViewport', oldViewport);
    else Reflect.deleteProperty(window, 'visualViewport');
  }
}, 15000);


it('keeps first-use navigation help visible through idle and remembers acknowledgement on reentry', async () => {
  await start();
  const hint = () => document.querySelector<HTMLElement>('[data-performance-navigation-hint]')!;
  expect(hint().hidden).toBe(false);
  expect(hint()).toHaveTextContent('左右滑動翻頁，也可輕點畫面左右兩側');
  vi.useFakeTimers();
  fireEvent.mouseMove(document.querySelector('[data-performance-overlay]')!);
  act(() => vi.advanceTimersByTime(2100));
  expect(document.querySelector<HTMLElement>('[data-performance-overlay]')!.dataset.performanceChrome).toBe('hidden');
  expect(hint().hidden).toBe(false);
  const before = sync.owned.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '知道了' }));
  expect(hint().hidden).toBe(true);
  expect(sync.owned.mock.calls.length).toBe(before);
  vi.useRealTimers();
  fireEvent.click(screen.getByRole('button', { name: '退出' }));
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  await waitFor(() => expect(document.querySelector('[data-performance-overlay]')).not.toBeNull());
  expect(hint().hidden).toBe(true);
}, 15000);

it('turns immediately on a tap with local feedback and lets a pedal clear it', async () => {
  await start();
  const surface = document.querySelector<HTMLElement>('[data-performance-swipe-surface]')!;
  const feedback = document.querySelector<HTMLElement>('[data-performance-touch-feedback]')!;
  const before = sync.owned.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }), { detail: 1, clientX: 700, clientY: 300 });
  expect(page()).toBe(2);
  expect(feedback.dataset.active).toBe('true');
  expect(feedback.dataset.direction).toBe('next');
  expect(surface.style.transform).toBe(''); expect(surface.style.opacity).toBe('');
  act(() => { pedal('keydown', 'PageUp'); pedal('keyup', 'PageUp'); });
  expect(page()).toBe(1); expect(feedback.dataset.active).toBeUndefined();
  expect(feedback.style.transition).toBe('none');
  expect(sync.owned.mock.calls.length).toBe(before);
}, 15000);

it('keeps paper still on a short or cancelled swipe and lets hardware input interrupt without a workspace render', async () => {
  await start();
  const overlay = document.querySelector('[data-performance-overlay]')!;
  const surface = document.querySelector<HTMLElement>('[data-performance-swipe-surface]')!;
  const before = sync.owned.mock.calls.length;
  fireEvent.touchStart(overlay, { touches: [{ clientX: 700, clientY: 300 }] });
  fireEvent.touchMove(overlay, { touches: [{ clientX: 680, clientY: 300 }] });
  await act(() => new Promise(resolve => setTimeout(resolve, 25)));
  expect(surface.style.transform).toBe('');
  expect(surface.style.opacity).toBe('');
  expect(document.querySelector<HTMLElement>('[data-performance-touch-feedback]')!.dataset.active).toBe('true');
  fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 680, clientY: 300 }] });
  expect(page()).toBe(1); expect(surface.style.transform).toBe('');
  fireEvent.touchStart(overlay, { touches: [{ clientX: 700, clientY: 300 }] });
  fireEvent.touchMove(overlay, { touches: [{ clientX: 600, clientY: 300 }] });
  fireEvent.touchCancel(overlay);
  expect(page()).toBe(1); expect(surface.style.transform).toBe('');
  fireEvent.touchStart(overlay, { touches: [{ clientX: 700, clientY: 300 }] });
  fireEvent.touchMove(overlay, { touches: [{ clientX: 600, clientY: 300 }] });
  act(() => { pedal('keydown'); pedal('keyup'); });
  expect(page()).toBe(2); expect(surface.style.transform).toBe('');
  fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 500, clientY: 300 }] });
  expect(page()).toBe(2);
  expect(sync.owned.mock.calls.length).toBe(before);
}, 15000);
