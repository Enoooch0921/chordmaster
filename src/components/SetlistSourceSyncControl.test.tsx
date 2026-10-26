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
  await screen.findByText('Verse · 第 1 小節：和弦 (C → G)');
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
