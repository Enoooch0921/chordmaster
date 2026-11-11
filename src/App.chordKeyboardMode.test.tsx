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
it.each(['songs', 'setlists'])('uses Tab for individual beats and Enter for bars, retains edits and crosses bar boundaries in %s', async mode => {
  localStorage.setItem('chordmaster.workspace-mode.v1', mode);
  fixture.songs[0].sections = [
    { id: 'verse', title: 'Verse', bars: [
      { id: 'bar', chords: ['C', 'Dm', 'Em', 'F'] }, { id: 'bar-2', chords: ['G', 'Am', 'Bm', 'C'] },
      { id: 'bar-3', chords: ['F'] }, { id: 'bar-4', chords: ['Am'] }
    ] },
    { id: 'chorus', title: 'Chorus', bars: [{ id: 'bar-5', chords: ['Dm'] }] }
  ];
  const before = JSON.stringify(fixture);
  mount();
  await openKeyboard();
  expect(screen.getAllByText(mode === 'setlists' ? '服事歌單模式' : '歌曲庫模式')[0]).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '切換為字母和弦' }));
  const capture = () => screen.getByRole('textbox', { name: '和弦直接輸入' });
  const activeBar = () => document.querySelector('[data-preview-active-bar="true"]')?.getAttribute('data-preview-clipboard-bar');
  fireEvent.keyDown(capture(), { key: 'Tab', shiftKey: true });
  expect(activeBar()).toBe('bar');
  fireEvent.change(capture(), { target: { value: 'Cmaj7' } });
  fireEvent.keyDown(capture(), { key: 'Tab' });
  expect(activeBar()).toBe('bar');
  expect(capture()).toHaveValue('Dm');
  fireEvent.change(capture(), { target: { value: 'Dm7' } });
  fireEvent.keyDown(capture(), { key: 'Tab', shiftKey: true });
  expect(activeBar()).toBe('bar');
  expect(capture()).toHaveValue('Cmaj7');
  for (const chord of ['Dm7', 'Em', 'F']) {
    fireEvent.keyDown(capture(), { key: 'Tab' });
    expect(activeBar()).toBe('bar');
    expect(capture()).toHaveValue(chord);
    expect(capture()).toHaveFocus();
  }
  fireEvent.keyDown(capture(), { key: 'Tab' });
  await waitFor(() => expect(activeBar()).toBe('bar-2'));
  expect(capture()).toHaveValue('G');
  fireEvent.keyDown(capture(), { key: 'Tab', shiftKey: true });
  await waitFor(() => expect(activeBar()).toBe('bar'));
  expect(capture()).toHaveValue('F');
  fireEvent.keyDown(capture(), { key: 'Tab' });
  for (const [id, chord] of [['bar-3', 'F'], ['bar-4', 'Am'], ['bar-5', 'Dm']]) {
    fireEvent.keyDown(capture(), { key: 'Enter' });
    await waitFor(() => expect(activeBar()).toBe(id));
    expect(capture()).toHaveValue(chord);
  }
  for (let beat = 1; beat <= 3; beat++) {
    fireEvent.keyDown(capture(), { key: 'Tab' });
    expect(activeBar()).toBe('bar-5');
    expect(capture()).toHaveValue('');
  }
  fireEvent.keyDown(capture(), { key: 'Tab' });
  await waitFor(() => {
    expect(activeBar()).toBeTruthy();
    expect(activeBar()).not.toBe('bar-5');
  });
  expect(capture()).toHaveValue('');
  expect(capture()).toHaveFocus();
  fireEvent.keyDown(capture(), { key: 'Tab', shiftKey: true });
  await waitFor(() => expect(activeBar()).toBe('bar-5'));
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  expect(await openKeyboard()).toHaveValue('Cmaj7');
  fireEvent.keyDown(capture(), { key: 'Tab' });
  expect(activeBar()).toBe('bar');
  expect(capture()).toHaveValue('Dm7');
  expect(JSON.stringify(fixture)).toBe(before);
}, 20000);
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
