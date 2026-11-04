import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { WorkspaceSnapshot } from './types';
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  const source = { id: 'keyboard-song', updatedAt: 1, title: 'Keyboard regression', originalKey: 'C' as const, currentKey: 'C' as const,
    showNashvilleNumbers: true, timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
  fixture = { songs: [source], setlists: [{ id: 'set', name: 'Keyboard setlist', displayMode: 'nashville-number-system', createdAt: 1, updatedAt: 1,
    songs: [{ id: 'entry', songId: source.id, setlistId: 'set', order: 0, sectionOrder: ['verse'], songData: source }] }], projects: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'set');
});
afterEach(() => localStorage.clear());
const mount = () => render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
async function openKeyboard() {
  await waitFor(() => expect(document.querySelector('[data-preview-slot-index="0"]')).not.toBeNull());
  fireEvent.click(document.querySelector('[data-preview-slot-index="0"]')!);
  return screen.findByRole('textbox', { name: '和弦直接輸入' });
}
it.each(['songs', 'setlists'])('remembers an explicit letter keyboard across close, performance mode and reload in %s', async mode => {
  localStorage.setItem('chordmaster.workspace-mode.v1', mode);
  let app = mount();
  const before = JSON.stringify(fixture);
  expect(await openKeyboard()).toHaveValue('1');
  fireEvent.click(screen.getByRole('button', { name: '切換為字母和弦' }));
  expect(screen.getByRole('textbox', { name: '和弦直接輸入' })).toHaveValue('C');
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  expect(await openKeyboard()).toHaveValue('C');
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  await screen.findByRole('button', { name: '退出' });
  fireEvent.click(screen.getByRole('button', { name: '退出' }));
  expect(await openKeyboard()).toHaveValue('C');
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  app.unmount(); app = mount();
  expect(await openKeyboard()).toHaveValue('C');
  expect(JSON.stringify(fixture)).toBe(before);
  app.unmount();
}, 20000);
