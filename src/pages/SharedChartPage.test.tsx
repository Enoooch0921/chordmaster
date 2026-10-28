import { useLayoutEffect } from 'react';
import { InvitationTransitionProvider, useInvitationTransition } from '../components/InvitationTransition';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('../lib/sharing', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/sharing')>(),
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
  tempo: 96,
  timeSignature: '4/4',
  sections: [{ id: `section-${title}`, title: 'Verse', bars: [{ id: `bar-${title}`, chords: ['C'] }] }]
});

const LocationDisplay = () => {
  const location = useLocation();
  const { ready } = useInvitationTransition();
  useLayoutEffect(() => {
    const params = new URLSearchParams(location.search);
    const kind = params.has('project') ? 'project' : 'setlist';
    ready(`${kind}:${params.get(kind)}`);
  }, [location.search, ready]);
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
    <InvitationTransitionProvider><Routes>
      <Route path="/share/:token" element={<SharedChartPage />} />
      <Route path="/" element={<LocationDisplay />} />
    </Routes></InvitationTransitionProvider>
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

  afterEach(() => vi.useRealTimers());

  it('updates an open public setlist after the owner changes a key and adds a song', async () => {
    vi.useFakeTimers();
    const source: SharedResourcePayload = { resourceType: 'setlist', setlist: {
      id: 'sl', name: 'Live Sunday', displayMode: 'chord-movable-key',
      songs: [{ id: 'a', title: 'Alpha', overrideKey: 'C', song: song('Alpha') }]
    } };
    mocks.resolveShareLink.mockResolvedValue(source);
    renderPage();
    await act(async () => { await Promise.resolve(); });
    const title = screen.getByRole('heading', { name: 'Live Sunday' });
    expect(screen.getByText('C · 96 BPM')).toBeInTheDocument();
    mocks.resolveShareLink.mockResolvedValue({ ...source, setlist: { ...source.setlist!, songs: [
      { ...source.setlist!.songs[0], overrideKey: 'D' },
      { id: 'b', title: 'Beta', song: song('Beta') }
    ] } });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText('D · 96 BPM')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live Sunday' })).toBe(title);
    expect(screen.queryByText('載入中...')).not.toBeInTheDocument();
  });

  it('preserves the selected bundle song and lyrics mode during updates', async () => {
    vi.useFakeTimers();
    const source: SharedResourcePayload = { resourceType: 'song_bundle', songBundle: { id: 'bundle', songs: [
      { id: 'a', title: 'Alpha', song: song('Alpha') },
      { id: 'b', title: 'Beta', song: { ...song('Beta'), lyricsDoc: { chinese: 'Lyrics' } } }
    ] } };
    mocks.resolveShareLink.mockResolvedValue(source);
    renderPage();
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));
    fireEvent.click(screen.getByRole('button', { name: '歌詞' }));
    mocks.resolveShareLink.mockResolvedValue({ ...source, songBundle: { ...source.songBundle!, songs: [
      source.songBundle!.songs[0],
      { ...source.songBundle!.songs[1], song: { ...source.songBundle!.songs[1].song, title: 'Updated Beta' } }
    ] } });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByTestId('shared-lyrics')).toHaveTextContent('Updated Beta');
    expect(screen.queryByTestId('shared-chart')).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: '加入並開啟歌單' }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('join_shared_setlist', { p_token: 'test-token' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/?setlist=shared-setlist-1');
    expect(window.localStorage.getItem('chordmaster.workspace-mode.v1')).toBe('setlists');
    expect(window.localStorage.getItem('chordmaster.selected-setlist-id.v1')).toBe('shared-setlist-1');
    expect(window.localStorage.getItem('chordmaster.selected-setlist-song-id.v1')).toBe('setlist-song-1');
  });

  it('shows each shared setlist song with its setlist key and BPM', async () => {
    const payload: SharedResourcePayload = {
      resourceType: 'setlist',
      setlist: {
        id: 'shared-setlist-1',
        name: 'Sunday Setlist',
        displayMode: 'chord-movable-key',
        songs: [
          { id: 'setlist-song-1', title: 'Alpha', overrideKey: 'D', song: { ...song('Alpha'), tempo: 128 } },
          { id: 'setlist-song-2', title: 'Beta', song: song('Beta') }
        ]
      }
    };
    mocks.resolveShareLink.mockResolvedValue(payload);

    renderPage();

    expect(await screen.findByText('D · 128 BPM')).toBeInTheDocument();
    expect(screen.getByText('C · 96 BPM')).toBeInTheDocument();
  });

  it('ignores a previous account’s membership response after switching accounts', async () => {
    const payload: SharedResourcePayload = { resourceType: 'setlist', setlist: {
      id: 'shared-1', name: 'Sunday', displayMode: 'chord-movable-key', songs: []
    } };
    mocks.resolveShareLink.mockResolvedValue(payload);
    let resolvePrevious!: (value: { data: { setlist_id: string } }) => void;
    const maybeSingle = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { resolvePrevious = resolve; }))
      .mockResolvedValue({ data: null });
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle });
    renderPage();
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(1));
    const authChanged = mocks.onAuthStateChange.mock.calls[0][0];
    await act(async () => authChanged('SIGNED_IN', { user: { id: 'user-2' } }));
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(2));
    await act(async () => resolvePrevious({ data: { setlist_id: 'shared-1' } }));
    expect(screen.getByRole('button', { name: '加入並開啟歌單' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '開啟歌單' })).not.toBeInTheDocument();
  });

  it('clears a joined project membership when signing into a different account', async () => {
    mocks.resolveShareLink.mockResolvedValue({ resourceType: 'project', project: {
      id: 'project-1', name: 'Sunday', setlists: []
    } });
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { project_id: 'project-1' } })
      .mockReturnValue(new Promise(() => undefined));
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle });
    renderPage();
    expect(await screen.findByRole('button', { name: '開啟專案' })).toBeInTheDocument();
    const authChanged = mocks.onAuthStateChange.mock.calls[0][0];
    await act(async () => authChanged('SIGNED_IN', { user: { id: 'user-2' } }));
    expect(screen.getByRole('button', { name: '正在確認帳號…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '開啟專案' })).not.toBeInTheDocument();
  });
  it.each(['setlist', 'project'] as const)('covers joining and directly opening a %s invitation, without duplicate joins', async kind => {
    const resource = kind === 'setlist' ? { resourceType: 'setlist', setlist: { id: 'target', name: 'Invitation', displayMode: 'chord-movable-key', songs: [] } }
      : { resourceType: 'project', project: { id: 'target', name: 'Invitation', setlists: [] } };
    mocks.resolveShareLink.mockResolvedValue(resource); mocks.rpc.mockResolvedValue({ data: 'target', error: null });
    const page = renderPage();
    const button = await screen.findByRole('button', { name: kind === 'setlist' ? '加入並開啟歌單' : '加入並開啟專案' });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('location')).toHaveTextContent(`/?${kind}=target`);
    await waitFor(() => expect(document.querySelector('.invitation-gate')).toBeNull());
    page.unmount(); mocks.rpc.mockClear();
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({data:{id:'member'}}) });
    renderPage(); fireEvent.click(await screen.findByRole('button', { name: kind === 'setlist' ? '開啟歌單' : '開啟專案' }));
    expect(await screen.findByTestId('location')).toHaveTextContent(`/?${kind}=target`);
    await waitFor(() => expect(document.querySelector('.invitation-gate')).toBeNull());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns to an actionable invitation when joining fails', async () => {
    mocks.resolveShareLink.mockResolvedValue({resourceType:'project',project:{id:'target',name:'Invitation',setlists:[]}});
    mocks.rpc.mockResolvedValue({data:null,error:new Error('Unavailable')});
    renderPage(); fireEvent.click(await screen.findByRole('button',{name:'加入並開啟專案'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法加入專案');
    expect(document.querySelector('.invitation-gate')).toBeNull();
    expect(screen.getByRole('button',{name:'加入並開啟專案'})).toBeEnabled();
  });
  it('passes invitation context to Google sign-in only for setlist/project invitations', async () => {
    mocks.getSession.mockResolvedValue({data:{session:null},error:null});
    mocks.resolveShareLink.mockResolvedValue({resourceType:'setlist',setlist:{id:'target',name:'Invitation',displayMode:'chord-movable-key',songs:[]}});
    renderPage(); fireEvent.click(await screen.findByRole('button',{name:'使用 Google 登入'}));
    await waitFor(()=>expect(mocks.signInWithGoogleRedirect).toHaveBeenCalledWith('/share/test-token',expect.objectContaining({kind:'setlist',id:'target',token:'test-token'})));
  });

});
