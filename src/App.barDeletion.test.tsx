import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { StoredSong, WorkspaceSnapshot } from './types';

let fixture: WorkspaceSnapshot;

vi.mock('./lib/auth', () => ({
  useSupabaseAuth: () => ({
    user: null, session: null, status: 'signed-out', isConfigured: false,
    signInWithGoogle: vi.fn(), signOut: vi.fn()
  })
}));
vi.mock('./lib/workspace', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/workspace')>(),
  loadPersistentWorkspaceSnapshot: async () => fixture
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => localStorage.clear());

it.each(['songs', 'setlists'])('deletes bars from the %s preview without crashing', async (mode) => {
  localStorage.clear();
  const song: StoredSong = {
    id: 'test-song', updatedAt: 1, title: '新歌 1',
    originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
    sections: [{
      id: 'section-1', title: 'Verse',
      bars: Array.from({ length: 4 }, (_, i) => ({ id: `bar-${i}`, chords: ['C'] }))
    }]
  };
  fixture = {
    songs: [song], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1,
    setlists: [{
      id: 'setlist-1', name: '測試歌單', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
      songs: [{
        id: 'entry-1', setlistId: 'setlist-1', songId: song.id, order: 0,
        sectionOrder: ['section-1'], songData: song
      }]
    }]
  };
  localStorage.setItem('chordmaster.workspace-mode.v1', mode);
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'setlist-1');
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findAllByText('新歌 1');

  for (let i = 0; i < 4; i++) {
    const bar = document.querySelector('[data-preview-slot-index="0"]');
    expect(bar).not.toBeNull();
    fireEvent.click(bar!);
    fireEvent.click(await screen.findByRole('button', { name: '小節操作' }));
    const remove = await screen.findByRole('button', { name: '刪除' });
    fireEvent.click(remove);
    expect(document.querySelectorAll('[data-preview-clipboard-bar^="bar-"]')).toHaveLength(3 - i);
    expect(screen.queryByText('畫面暫時無法顯示')).not.toBeInTheDocument();
  }

  expect(screen.getByText('小節已刪除，可復原或完成這次編輯')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.queryByText('小節已刪除，可復原或完成這次編輯')).not.toBeInTheDocument();
  expect(document.querySelector('[data-preview-slot-index="0"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(screen.getByText('小節已刪除，可復原或完成這次編輯')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  expect(screen.queryByText('小節已刪除，可復原或完成這次編輯')).not.toBeInTheDocument();
  expect(song.sections[0].bars).toHaveLength(4);
});
