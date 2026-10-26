import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Song } from '../types';
const mocks = vi.hoisted(() => ({ preview: vi.fn(), sync: vi.fn() }));
vi.mock('../lib/setlistSourceSync', async original => ({ ...await original<typeof import('../lib/setlistSourceSync')>(),
  previewSetlistSourceSync: mocks.preview, reconcileSetlistSource: mocks.sync }));
import SetlistSourceSyncControl from './SetlistSourceSyncControl';
const song: Song = { title: 'Song', currentKey: 'C', originalKey: 'C', timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
const edited = structuredClone(song); edited.sections[0].bars[0].chords = ['G'];
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue({ libraryId: 'team', entryId: 'entry', source: { ...song, id: 'song', updatedAt: 1 }, sourceRevision: '2026-10-26T00:00:00Z', overrideJson: { songData: edited }, setlistName: '聚會一', status: 'setlist-changed', baseline: null });
  mocks.sync.mockResolvedValue({ source: { ...edited, id: 'song', updatedAt: 2 }, entry: {}, direction: 'to-library', setlistUpdatedAt: 2 });
});
const mount = () => {
  const prepare = vi.fn().mockResolvedValue(undefined), onSynced = vi.fn();
  const view = render(<SetlistSourceSyncControl libraryId="team" entryId="entry" language="zh" status="setlist-changed" prepare={prepare} onReconciled={onSynced} />);
  return { prepare, onSynced, ...view };
};
it('requires an explicit preview and confirmation before uploading', async () => {
  const { prepare, onSynced } = mount();
  expect(mocks.sync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '同步回歌曲庫' }));
  await screen.findByRole('dialog');
  await screen.findByText('Verse · 第 1 小節：和弦 (C → G)');
  expect(prepare).toHaveBeenCalledOnce();
  expect(mocks.sync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '確認更新歌曲庫' }));
  await waitFor(() => expect(onSynced).toHaveBeenCalledOnce());
  expect(screen.getByRole('status')).toHaveTextContent('已更新譜面與來源基準');
});
it('offers only the refresh direction for an unchanged stale copy', async () => {
  const value = await mocks.preview();
  mocks.preview.mockResolvedValue({ ...value, status: 'source-newer' });
  mount();
  fireEvent.click(screen.getByRole('button', { name: '同步回歌曲庫' }));
  await screen.findByRole('button', { name: '確認更新歌單副本' });
  expect(screen.queryByRole('button', { name: '確認更新歌曲庫' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '確認更新歌單副本' }));
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ status: 'source-newer' }), 'to-setlist'));
});
it.each(['conflict','unknown'])('requires choosing a version explicitly for %s', async status => {
  const value = await mocks.preview();
  mocks.preview.mockResolvedValue({ ...value, status });
  mount();
  fireEvent.click(screen.getByRole('button', { name: '同步回歌曲庫' }));
  expect(await screen.findByRole('button', { name: '請先選擇版本' })).toBeDisabled();
  expect(mocks.sync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: '保留歌曲庫版本，更新這份歌單' }));
  fireEvent.click(screen.getByRole('button', { name: '確認更新歌單副本' }));
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ status }), 'to-setlist'));
});
it('blocks another upload after a conflict until a fresh preview is loaded', async () => {
  const { onSynced } = mount();
  fireEvent.click(screen.getByRole('button', { name: '同步回歌曲庫' }));
  await screen.findByRole('dialog');
  await screen.findByText('Verse · 第 1 小節：和弦 (C → G)');
  mocks.sync.mockRejectedValueOnce({ message: '歌曲庫已被其他人修改' });
  fireEvent.click(screen.getByRole('button', { name: '確認更新歌曲庫' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: '確認更新歌曲庫' })).toBeDisabled();
  expect(onSynced).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '重新預覽' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '確認更新歌曲庫' })).toBeEnabled());
});
it('cancels without changing the source', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: '同步回歌曲庫' }));
  await screen.findByRole('dialog');
  await screen.findByText('Verse · 第 1 小節：和弦 (C → G)');
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('saves the reviewed setlist version under a new name without reconciling the source', async () => {
  const onSaveAs = vi.fn().mockResolvedValue(undefined), onReconciled = vi.fn();
  render(<SetlistSourceSyncControl libraryId="team" entryId="entry" language="zh" status="setlist-changed" prepare={vi.fn()} onReconciled={onReconciled} onSaveAs={onSaveAs} />);
  fireEvent.click(screen.getByRole('button', { name: '同步回歌曲庫' }));
  fireEvent.click(await screen.findByRole('radio', { name: '另存成新歌曲，保留原曲' }));
  const input = screen.getByRole('textbox', { name: '新歌曲名稱' });
  fireEvent.change(input, { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: '確認另存新檔' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '  Song 新編版  ' } });
  fireEvent.click(screen.getByRole('button', { name: '確認另存新檔' }));
  await screen.findByText('已另存成新歌曲，原曲與目前歌單保持不變。');
  expect(onSaveAs).toHaveBeenCalledWith(expect.objectContaining({ overrideJson: { songData: edited } }), 'Song 新編版', expect.any(String));
  expect(onSaveAs.mock.calls[0][2]).not.toBe('song');
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(onReconciled).not.toHaveBeenCalled();
});
it('retains the chosen name and new identity when refreshing after a failed save-as', async () => {
  const onSaveAs = vi.fn().mockRejectedValueOnce(new Error('連線中斷')).mockResolvedValue(undefined);
  render(<SetlistSourceSyncControl libraryId="team" entryId="entry" language="zh" status="setlist-changed" prepare={vi.fn()} onReconciled={vi.fn()} onSaveAs={onSaveAs} />);
  fireEvent.click(screen.getByRole('button', { name: '同步回歌曲庫' }));
  fireEvent.click(await screen.findByRole('radio', { name: '另存成新歌曲，保留原曲' }));
  fireEvent.change(screen.getByRole('textbox', { name: '新歌曲名稱' }), { target: { value: '保留的歌名' } });
  fireEvent.click(screen.getByRole('button', { name: '確認另存新檔' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '重新預覽' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '確認更新歌曲庫' })).toBeEnabled());
  fireEvent.click(screen.getByRole('radio', { name: '另存成新歌曲，保留原曲' }));
  expect(screen.getByRole('textbox', { name: '新歌曲名稱' })).toHaveValue('保留的歌名');
  fireEvent.click(screen.getByRole('button', { name: '確認另存新檔' }));
  await waitFor(() => expect(onSaveAs).toHaveBeenCalledTimes(2));
  expect(onSaveAs.mock.calls[1][2]).toBe(onSaveAs.mock.calls[0][2]);
  expect(mocks.sync).not.toHaveBeenCalled();
});
