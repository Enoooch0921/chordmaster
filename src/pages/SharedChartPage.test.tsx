import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedResourcePayload } from '../types';
import SharedChartPage from './SharedChartPage';

const mocks = vi.hoisted(() => ({
  resolveShareLink: vi.fn(),
  inspectSharedSongImport: vi.fn(),
  importSharedSongs: vi.fn(),
  signInWithGoogleRedirect: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn()
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
    from: vi.fn(),
    rpc: vi.fn()
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

const renderPage = () => render(
  <MemoryRouter initialEntries={['/share/test-token']}>
    <Routes>
      <Route path="/share/:token" element={<SharedChartPage />} />
      <Route path="/" element={<div>Library</div>} />
    </Routes>
  </MemoryRouter>
);

describe('SharedChartPage song imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
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
});
