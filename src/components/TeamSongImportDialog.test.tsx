import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StoredSong, TeamSongImportInspection } from '../types';
import TeamSongImportDialog from './TeamSongImportDialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

type ImportDetailStoredSong = StoredSong & { version?: string | number };

const makeSong = (
  overrides: Partial<ImportDetailStoredSong> & Pick<StoredSong, 'id' | 'title'>
): StoredSong => ({
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [],
  updatedAt: 1,
  ...overrides
});

const personalSongs: StoredSong[] = [
  makeSong({
    id: 'source-grace',
    title: '恩典之路',
    currentKey: 'G',
    version: '青年版',
    lyricist: '恩典詞人',
    composer: '小明'
  }),
  makeSong({ id: 'source-love', title: '活出愛', version: '原版', composer: '天韻' }),
  makeSong({ id: 'source-archived', title: '已封存歌曲', archivedAt: 99 })
];

describe('TeamSongImportDialog', () => {
  it('可以搜尋、跨搜尋結果多選，並以原歌名建立團隊歌曲', async () => {
    const inspection: TeamSongImportInspection = {
      songs: [
        {
          sourceSongId: 'source-grace',
          title: '恩典之路',
          existingSongId: null,
          existingTitle: null,
          possibleMatches: []
        },
        {
          sourceSongId: 'source-love',
          title: '活出愛',
          existingSongId: null,
          existingTitle: null,
          possibleMatches: []
        }
      ]
    };
    const inspectSongs = vi.fn(async () => inspection);
    const importSongs = vi.fn(async () => ({
      createdCount: 2,
      overwrittenCount: 0,
      duplicateCount: 0,
      songs: []
    }));
    const onClose = vi.fn();

    render(
      <TeamSongImportDialog
        open
        language="zh"
        personalSongs={personalSongs}
        loadingSongs={false}
        onClose={onClose}
        inspectSongs={inspectSongs}
        importSongs={importSongs}
      />
    );

    expect(screen.queryByText('已封存歌曲')).not.toBeInTheDocument();

    const search = screen.getByPlaceholderText('搜尋個人歌曲');
    fireEvent.change(search, { target: { value: '小明' } });
    expect(screen.getByText('恩典之路')).toBeInTheDocument();
    expect(screen.getByText(/Key G · 版本 青年版 · 詞 恩典詞人 · 曲 小明 · 來源歌曲 ID source-grace/)).toBeInTheDocument();
    expect(screen.queryByText('活出愛')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全選目前結果' }));

    fireEvent.change(search, { target: { value: '天韻' } });
    expect(screen.getByText('活出愛')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全選目前結果' }));
    expect(screen.getByText('已選 2 首')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    await waitFor(() => {
      expect(inspectSongs).toHaveBeenCalledWith(['source-grace', 'source-love']);
    });
    expect(await screen.findAllByText('建立團隊歌曲', { selector: 'div' })).toHaveLength(2);
    expect(screen.getByText('恩典之路')).toBeInTheDocument();
    expect(screen.getByText('活出愛')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '匯入 2 首' }));

    await waitFor(() => {
      expect(importSongs).toHaveBeenCalledWith([
        { sourceSongId: 'source-grace', resolution: 'create' },
        { sourceSongId: 'source-love', resolution: 'create' }
      ]);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('已有來源映射只能覆蓋 primary，無映射的舊同名才能選擇連結目標', async () => {
    const inspection: TeamSongImportInspection = {
      songs: [
        {
          sourceSongId: 'source-grace',
          title: '恩典之路',
          existingSongId: 'team-primary',
          existingTitle: '恩典之路',
          existingSong: {
            songId: 'team-primary',
            title: '恩典之路',
            currentKey: 'D',
            version: '主版本',
            lyricist: '主要詞人',
            composer: '主要作曲'
          },
          possibleMatches: [{
            songId: 'team-unrelated',
            title: '恩典之路',
            currentKey: 'F',
            version: '不應可選'
          }]
        },
        {
          sourceSongId: 'source-love',
          title: '活出愛',
          existingSongId: null,
          existingTitle: null,
          possibleMatches: [
            {
              songId: 'team-legacy-a',
              title: '活出愛',
              currentKey: 'E',
              version: '木吉他版',
              lyricist: '詞人 A',
              composer: '作曲 A'
            },
            {
              songId: 'team-legacy-b',
              title: '活出愛',
              currentKey: 'F',
              version: '現場版',
              lyricist: '詞人 B',
              composer: '作曲 B'
            }
          ]
        }
      ]
    };
    const importSongs = vi.fn(async () => ({
      createdCount: 0,
      overwrittenCount: 2,
      duplicateCount: 0,
      songs: []
    }));

    render(
      <TeamSongImportDialog
        open
        language="zh"
        personalSongs={personalSongs}
        loadingSongs={false}
        onClose={vi.fn()}
        inspectSongs={vi.fn(async () => inspection)}
        importSongs={importSongs}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '全選目前結果' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    const mappedOverwriteButton = await screen.findByRole('button', { name: '覆蓋團隊版' });
    const legacyOverwriteButton = screen.getByRole('button', { name: '連結並覆蓋' });
    const duplicateButtons = screen.getAllByRole('button', { name: '建立同名副本' });

    expect(mappedOverwriteButton).toHaveAttribute('aria-pressed', 'true');
    expect(legacyOverwriteButton).toHaveAttribute('aria-pressed', 'false');
    expect(duplicateButtons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(duplicateButtons[1]).toHaveAttribute('aria-pressed', 'true');

    const primaryCandidate = screen.getByTitle('team-primary');
    expect(primaryCandidate).toBeDisabled();
    expect(primaryCandidate).toHaveTextContent('Key D');
    expect(primaryCandidate).toHaveTextContent('版本 主版本');
    expect(primaryCandidate).toHaveTextContent('詞 主要詞人');
    expect(primaryCandidate).toHaveTextContent('曲 主要作曲');
    expect(primaryCandidate).toHaveTextContent('團隊歌曲 ID team-primary');
    expect(screen.queryByTitle('team-unrelated')).not.toBeInTheDocument();
    expect(screen.queryByText('不應可選')).not.toBeInTheDocument();

    const legacyCandidateA = screen.getByTitle('team-legacy-a');
    const legacyCandidateB = screen.getByTitle('team-legacy-b');
    expect(legacyCandidateA).toBeDisabled();
    expect(legacyCandidateB).toBeDisabled();
    expect(legacyCandidateA).toHaveTextContent('Key E');
    expect(legacyCandidateA).toHaveTextContent('版本 木吉他版');
    expect(legacyCandidateA).toHaveTextContent('詞 詞人 A');
    expect(legacyCandidateA).toHaveTextContent('曲 作曲 A');
    expect(legacyCandidateA).toHaveTextContent('團隊歌曲 ID team-legacy-a');
    expect(legacyCandidateB).toHaveTextContent('版本 現場版');

    fireEvent.click(legacyOverwriteButton);
    expect(legacyCandidateA).toBeEnabled();
    expect(legacyCandidateB).toBeEnabled();
    fireEvent.click(legacyCandidateB);
    fireEvent.click(screen.getByRole('button', { name: '匯入 2 首' }));

    await waitFor(() => {
      expect(importSongs).toHaveBeenCalledWith([
        {
          sourceSongId: 'source-grace',
          resolution: 'overwrite',
          targetSongId: 'team-primary'
        },
        {
          sourceSongId: 'source-love',
          resolution: 'overwrite',
          targetSongId: 'team-legacy-b'
        }
      ]);
    });
  });
});

describe('從個人區複製到團隊', () => {
  const teams = [{ id: 'team-a', name: '團隊甲' }, { id: 'team-b', name: '團隊乙' }];
  const inspection: TeamSongImportInspection = { songs: [{ sourceSongId: 'source-grace', title: '恩典之路', existingSongId: 'team-existing', existingTitle: '團隊原譜', possibleMatches: [] }] };
  const base = () => ({ open: true, language: 'zh' as const, personalSongs, loadingSongs: false, copyOnly: true, destinationTeams: teams, destinationId: 'team-a', initialSelectedIds: ['source-grace', 'source-archived'], onDestinationChange: vi.fn(), onClose: vi.fn(), inspectSongs: vi.fn(async () => inspection), importSongs: vi.fn(async () => ({ createdCount: 0, overwrittenCount: 0, duplicateCount: 1, songs: [] })) });
  it('preselects the active songs and creates a copy rather than overwriting an existing team song', async () => {
    const props = base(); render(<TeamSongImportDialog {...props} />);
    expect(screen.getByText('已選 1 首')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    const confirm = await screen.findByRole('button', { name: '複製 1 首' });
    expect(props.inspectSongs).toHaveBeenCalledWith(['source-grace']);
    expect(screen.queryByRole('button', { name: '覆蓋團隊版' })).toBeNull();
    expect(screen.getByRole('combobox', { name: '目標團隊' })).toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(props.importSongs).toHaveBeenCalledWith([{ sourceSongId: 'source-grace', resolution: 'duplicate' }]));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it('discards a late inspection for the previous destination and keeps the source selection', async () => {
    let finish!: (value: TeamSongImportInspection) => void;
    const props = base(); props.inspectSongs.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<TeamSongImportDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByRole('button', { name: /^恩典之路/ })).toBeDisabled();
    view.rerender(<TeamSongImportDialog {...props} destinationId="team-b" />);
    finish(inspection);
    await waitFor(() => expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: '複製 1 首' })).toBeNull();
    expect(screen.getByText('已選 1 首')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByRole('button', { name: '複製 1 首' })).toBeEnabled();
  });
  it('retains the review and lets the user retry after a failed copy', async () => {
    const props = base(); props.importSongs.mockRejectedValueOnce(new Error('連線中斷'));
    render(<TeamSongImportDialog {...props} />);fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(await screen.findByRole('button', { name: '複製 1 首' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('連線中斷');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '複製 1 首' })).toBeEnabled();
  });
  it('blocks batches above the server limit before sending an inspection', () => {
    const props = base();const songs = Array.from({ length: 501 }, (_, i) => makeSong({ id: `batch-${i}`, title: `歌曲${i}` }));
    render(<TeamSongImportDialog {...props} personalSongs={songs} initialSelectedIds={songs.map(song => song.id)} />);
    expect(screen.getByRole('alert')).toHaveTextContent('每次最多 500 首');
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();expect(props.inspectSongs).not.toHaveBeenCalled();
  });
});

it('rejects an inspection that does not match the selected source songs', async () => {
 const inspectSongs = vi.fn(async () => ({songs:[]}));const importSongs=vi.fn();
 render(<TeamSongImportDialog open language="zh" personalSongs={personalSongs} loadingSongs={false} initialSelectedIds={['source-grace']} inspectSongs={inspectSongs} importSongs={importSongs} onClose={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'下一步'}));expect(await screen.findByRole('alert')).toHaveTextContent('部分歌曲已變更或無法讀取');expect(importSongs).not.toHaveBeenCalled();
});
