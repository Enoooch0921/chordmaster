import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { WorkspaceSnapshot } from './types';

let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({
  user: null, session: null, status: 'signed-out', isConfigured: false,
  signInWithGoogle: vi.fn(), signOut: vi.fn()
}) }));
vi.mock('./lib/workspace', async original => ({
  ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  const song = { id: 'gesture-song', updatedAt: 1, title: '手勢測試', originalKey: 'C' as const, currentKey: 'C' as const,
    timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
  fixture = { songs: [song], setlists: [{ id: 'set', name: '測試歌單', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', setlistId: 'set', songId: song.id, order: 0, sectionOrder: ['verse'], songData: song }] }],
    projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'set');
});
afterEach(() => localStorage.clear());

function touch(root: HTMLElement, type: string, coordinates: number[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: coordinates.map((clientX, identifier) => ({ identifier, clientX, clientY: 250 })) });
  fireEvent(root, event);
  return event;
}

async function expectPinchToWork() {
  const root = document.querySelector<HTMLDivElement>('[data-print-preview-container]')!;
  const sheet = root.querySelector<HTMLDivElement>('[data-print-preview]')!;
  Object.defineProperty(sheet, 'offsetWidth', { configurable: true, value: 794 });
  sheet.getBoundingClientRect = () => ({ left: 20, top: 100, width: 794, height: 1123 }) as DOMRect;
  expect(touch(root, 'touchstart', [200, 400]).defaultPrevented).toBe(true);
  touch(root, 'touchmove', [150, 450]);
  await waitFor(() => expect(sheet.style.transform).toContain('scale(1.5)'));
  touch(root, 'touchend', []);
  expect(Number(sheet.style.transform.match(/scale\(([^)]+)\)/)?.[1])).toBeCloseTo(1.5);
  return root;
}

it.each(['songs', 'setlists'])('keeps pinch zoom working after About and Help in %s', async mode => {
  localStorage.setItem('chordmaster.workspace-mode.v1', mode);
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findAllByText('手勢測試');
  let previousRoot = await expectPinchToWork();
  for (const page of ['關於', '說明']) {
    fireEvent.click(screen.getByRole('button', { name: page }));
    expect(document.querySelector('[data-print-preview-container]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '返回預覽' }));
    const nextRoot = document.querySelector('[data-print-preview-container]');
    expect(nextRoot).not.toBe(previousRoot);
    expect(touch(previousRoot, 'touchstart', [200, 400]).defaultPrevented).toBe(false);
    previousRoot = await expectPinchToWork();
  }
}, 15000);
