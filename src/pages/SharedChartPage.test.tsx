import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedResourcePayload } from '../types';
import SharedChartPage from './SharedChartPage';

const mocks = vi.hoisted(() => ({
  resolveShareLink: vi.fn(),
  inspectSharedSongImport: vi.fn(),
  importSharedSongs: vi.fn(),
  signInWithGoogleRedirect: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn()
}));

vi.mock('../lib/sharing', () => ({
  resolveShareLink: mocks.resolveShareLink,
  inspectSharedSongImport: mocks.inspectSharedSongImport,
  importSharedSongs: mocks.importSharedSongs
}));

vi.mock('../lib/auth', () => ({
  signInWithGoogleRedirect: mocks.signInWithGoogleRedirect
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange
    },
    from: mocks.from,
    rpc: mocks.rpc
  }
}));

vi.mock('../components/ChordSheet', () => ({
  default: ({ song: sharedSong }: { song: { title: string } }) => <div data-testid="shared-chart">{sharedSong.title}</div>
}));

vi.mock('../components/LyricsSheet', () => ({
  default: ({ song: sharedSong }: { song: { title: string } }) => <div data-testid="shared-lyrics">{sharedSong.title}</div>
}));

const song = (title: string) => ({
  title,
  originalKey: 'C' as const,
  currentKey: 'C' as const,
  timeSignature: '4/4',
  sections: [{ id: `section-${title}`, title: 'Verse', bars: [{ id: `bar-${title}`, chords: ['C'] }] }]
});

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
};

const installLocalStorageMock = () => {
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, String(value));
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      })
    }
  });
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/share/test-token']}>
    <Routes>
      <Route path="/share/:token" element={<SharedChartPage />} />
      <Route path="/" element={<LocationDisplay />} />
    </Routes>
  </MemoryRouter>
);

describe('SharedChartPage song imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorageMock();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null })
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('imports a shared single song into the personal library', async () => {
    const payload: SharedResourcePayload = {
      resourceType: 'song',
      song: { id: 'song-1', title: 'Amazing Grace', song: song('Amazing Grace') }
    };
    mocks.resolveShareLink.mockResolvedValue(payload);
    mocks.inspectSharedSongImport.mockResolvedValue({ songs: [{ sourceSongId: 'song-1', title: 'Amazing Grace', existingSongId: null, existingTitle: null }], conflictCount: 0 });
    mocks.importSharedSongs.mockResolvedValue({ createdCount: 1, duplicatedCount: 0, overwrittenCount: 0, songs: [{ sourceSongId: 'song-1', songId: 'imported-1', action: 'created' }] });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '導入到我的個人歌庫' }));

    expect(await screen.findByText('歌曲已導入個人歌庫')).toBeInTheDocument();
    expect(mocks.importSharedSongs).toHaveBeenCalledWith('test-token', 'duplicate', {});
  });

  it('keeps bundle order and allows per-song conflict resolution', async () => {
    const payload: SharedResourcePayload = {
      resourceType: 'song_bundle',
      songBundle: {
        id: 'bundle-1',
        songs: [
          { id: 'song-a', title: 'Alpha', song: song('Alpha') },
          { id: 'song-b', title: 'Beta', song: song('Beta') }
        ]
      }
    };
    mocks.resolveShareLink.mockResolvedValue(payload);
    mocks.inspectSharedSongImport.mockResolvedValue({
      songs: [
        { sourceSongId: 'song-a', title: 'Alpha', existingSongId: 'existing-a', existingTitle: 'Alpha' },
        { sourceSongId: 'song-b', title: 'Beta', existingSongId: 'existing-b', existingTitle: 'Beta' }
      ],
      conflictCount: 2
    });
    mocks.importSharedSongs.mockResolvedValue({ createdCount: 0, duplicatedCount: 1, overwrittenCount: 1, songs: [] });

    renderPage();
    const alphaButton = await screen.findByRole('button', { name: /Alpha/ });
    const betaButton = screen.getByRole('button', { name: /Beta/ });
    expect(alphaButton.compareDocumentPosition(betaButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '導入到我的個人歌庫' }));
    expect(await screen.findByText('發現 2 首已導入歌曲')).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'overwrite' } });
    fireEvent.click(screen.getByRole('button', { name: '確認並導入' }));

    await waitFor(() => expect(mocks.importSharedSongs).toHaveBeenCalledWith(
      'test-token',
      'duplicate',
      { 'song-b': 'overwrite' }
    ));
  });

  it('opens the imported setlist directly after joining a shared setlist', async () => {
    const payload: SharedResourcePayload = {
      resourceType: 'setlist',
      setlist: {
        id: 'shared-setlist-1',
        name: 'Sunday Setlist',
        displayMode: 'chord-movable-key',
        songs: [
          { id: 'setlist-song-1', title: 'Alpha', song: song('Alpha') },
          { id: 'setlist-song-2', title: 'Beta', song: song('Beta') }
        ]
      }
    };
    mocks.resolveShareLink.mockResolvedValue(payload);
    mocks.rpc.mockResolvedValue({ data: 'shared-setlist-1', error: null });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '導入到我的帳號' }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('join_shared_setlist', { p_token: 'test-token' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/?setlist=shared-setlist-1');
    expect(window.localStorage.getItem('chordmaster.workspace-mode.v1')).toBe('setlists');
    expect(window.localStorage.getItem('chordmaster.selected-setlist-id.v1')).toBe('shared-setlist-1');
    expect(window.localStorage.getItem('chordmaster.selected-setlist-song-id.v1')).toBe('setlist-song-1');
  });
});
