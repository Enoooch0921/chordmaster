import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Song } from '../types';
const mocks = vi.hoisted(() => ({ preview: vi.fn(), sync: vi.fn() }));
vi.mock('../lib/setlistSourceSync', async original => ({ ...await original<typeof import('../lib/setlistSourceSync')>(),
  previewSetlistSourceSync: mocks.preview, reconcileSetlistSource: mocks.sync }));
import SetlistSourceSyncControl from './SetlistSourceSyncControl';
const song: Song = { title: 'Song', currentKey: 'C', originalKey: 'C', timeSignature: '4/4', sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'] }] }] };
const edited = structuredClone(song); edited.sections[0].bars[0].chords = ['G'];
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; HTMLDialogElement.prototype.close = function () { this.open = false; }; });
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
  fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  await screen.findByRole('dialog');
  await screen.findByRole('row', { name: 'Verse · 第 1 小節 · 和弦' });
  expect(prepare).toHaveBeenCalledOnce();
  expect(mocks.sync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '用歌單版本更新歌曲庫' }));
  await waitFor(() => expect(onSynced).toHaveBeenCalledOnce());
  expect(screen.getByRole('status')).toHaveTextContent('已用「聚會一」的版本更新歌曲庫');
});
it('shows both modification dates before choosing a direction and reloads them on comparison refresh', async () => {
  const value = await mocks.preview();
  mocks.preview.mockResolvedValue({ ...value, status: 'conflict', setlistScoreUpdatedAt: '2026-10-28T03:11:12Z' });
  mount();
  fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  const dates = await screen.findByRole('row', { name: '最後修改時間' });
  expect(dates.closest('details')).toBeNull();
  expect(within(dates).getAllByRole('cell')[0].querySelector('time')).toHaveAttribute('datetime', '2026-10-26T00:00:00.000Z');
  expect(within(dates).getAllByRole('cell')[1].querySelector('time')).toHaveAttribute('datetime', '2026-10-28T03:11:12.000Z');
  expect(screen.getByRole('button', { name: '請先選擇更新方向' })).toBeDisabled();
  mocks.preview.mockResolvedValue({ ...value, status: 'conflict', setlistScoreUpdatedAt: '2026-10-28T04:00:00Z' });
  fireEvent.click(screen.getByRole('button', { name: '重新比對' }));
  await waitFor(() => expect(within(dates).getAllByRole('cell')[1].querySelector('time')).toHaveAttribute('datetime', '2026-10-28T04:00:00.000Z'));
  expect(mocks.sync).not.toHaveBeenCalled();
});
it.each([null, 'invalid-date'])('does not invent dates for missing or invalid timestamps (%s)', async timestamp => {
  const value = await mocks.preview();
  mocks.preview.mockResolvedValue({ ...value, setlistScoreUpdatedAt: timestamp });
  mount();
  fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  const dates = await screen.findByRole('row', { name: '最後修改時間' });
  expect(within(dates).getAllByRole('cell')[1]).toHaveTextContent('尚無修改時間紀錄');
  expect(dates).not.toHaveTextContent('Invalid Date');
});
it('offers only the refresh direction for an unchanged stale copy', async () => {
  const value = await mocks.preview();
  mocks.preview.mockResolvedValue({ ...value, status: 'source-newer' });
  mount();
  fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  await screen.findByRole('button', { name: '從歌曲庫更新此歌單' });
  expect(screen.queryByRole('button', { name: '用歌單版本更新歌曲庫' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '從歌曲庫更新此歌單' }));
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ status: 'source-newer' }), 'to-setlist'));
});
it.each(['conflict','unknown'])('requires choosing a version explicitly for %s', async status => {
  const value = await mocks.preview();
  mocks.preview.mockResolvedValue({ ...value, status });
  mount();
  fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  expect(await screen.findByRole('button', { name: '請先選擇更新方向' })).toBeDisabled();
  expect(mocks.sync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: /取用歌曲庫版本，更新這份歌單/ }));
  fireEvent.click(screen.getByRole('button', { name: '從歌曲庫更新此歌單' }));
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ status }), 'to-setlist'));
});
it('blocks another upload after a conflict until a fresh preview is loaded', async () => {
  const { onSynced } = mount();
  fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  await screen.findByRole('dialog');
  await screen.findByRole('row', { name: 'Verse · 第 1 小節 · 和弦' });
  mocks.sync.mockRejectedValueOnce({ message: '歌曲庫已被其他人修改' });
  fireEvent.click(screen.getByRole('button', { name: '用歌單版本更新歌曲庫' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: '用歌單版本更新歌曲庫' })).toBeDisabled();
  expect(onSynced).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '重新比對' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '用歌單版本更新歌曲庫' })).toBeEnabled());
});
it('cancels without changing the source', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  await screen.findByRole('dialog');
  await screen.findByRole('row', { name: 'Verse · 第 1 小節 · 和弦' });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('saves the reviewed setlist version under a new name without reconciling the source', async () => {
  const onSaveAs = vi.fn().mockResolvedValue(undefined), onReconciled = vi.fn();
  render(<SetlistSourceSyncControl libraryId="team" entryId="entry" language="zh" status="setlist-changed" prepare={vi.fn()} onReconciled={onReconciled} onSaveAs={onSaveAs} />);
  fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('想保留兩份？另存新歌曲'));
  fireEvent.click(screen.getByRole('radio', { name: '另存成新歌曲，保留原曲' }));
  const input = screen.getByRole('textbox', { name: '新歌曲名稱' });
  fireEvent.change(input, { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: '確認另存新歌曲' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '  Song 新編版  ' } });
  fireEvent.click(screen.getByRole('button', { name: '確認另存新歌曲' }));
  await screen.findByText('已另存成新歌曲，原曲與目前歌單保持不變。');
  expect(onSaveAs).toHaveBeenCalledWith(expect.objectContaining({ overrideJson: { songData: edited } }), 'Song 新編版', expect.any(String));
  expect(onSaveAs.mock.calls[0][2]).not.toBe('song');
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(onReconciled).not.toHaveBeenCalled();
});
it('retains the chosen name and new identity when refreshing after a failed save-as', async () => {
  const onSaveAs = vi.fn().mockRejectedValueOnce(new Error('連線中斷')).mockResolvedValue(undefined);
  render(<SetlistSourceSyncControl libraryId="team" entryId="entry" language="zh" status="setlist-changed" prepare={vi.fn()} onReconciled={vi.fn()} onSaveAs={onSaveAs} />);
  fireEvent.click(screen.getByRole('button', { name: '預覽歌單 → 歌曲庫' }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('想保留兩份？另存新歌曲'));
  fireEvent.click(screen.getByRole('radio', { name: '另存成新歌曲，保留原曲' }));
  fireEvent.change(screen.getByRole('textbox', { name: '新歌曲名稱' }), { target: { value: '保留的歌名' } });
  fireEvent.click(screen.getByRole('button', { name: '確認另存新歌曲' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '重新比對' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '用歌單版本更新歌曲庫' })).toBeEnabled());
  if (!screen.queryByRole('radio', { name: '另存成新歌曲，保留原曲' })) fireEvent.click(screen.getByText('想保留兩份？另存新歌曲'));
  fireEvent.click(screen.getByRole('radio', { name: '另存成新歌曲，保留原曲' }));
  expect(screen.getByRole('textbox', { name: '新歌曲名稱' })).toHaveValue('保留的歌名');
  fireEvent.click(screen.getByRole('button', { name: '確認另存新歌曲' }));
  await waitFor(() => expect(onSaveAs).toHaveBeenCalledTimes(2));
  expect(onSaveAs.mock.calls[1][2]).toBe(onSaveAs.mock.calls[0][2]);
  expect(mocks.sync).not.toHaveBeenCalled();
});
it('keeps current versions in named columns and makes the chosen source and affected scope explicit',async()=>{
 const value=await mocks.preview(); mocks.preview.mockResolvedValue({...value,status:'conflict'});
 mount(); fireEvent.click(screen.getByRole('button',{name:'預覽歌單 → 歌曲庫'}));
 await screen.findByRole('dialog');
 expect(screen.getByRole('columnheader',{name:'歌曲庫版本'})).toBeInTheDocument();
 expect(screen.getByRole('columnheader',{name:'歌單 · 聚會一'})).toBeInTheDocument();
 const row=screen.getByRole('row',{name:'Verse · 第 1 小節 · 和弦'});
 expect(row.children[0]).toHaveTextContent('C'); expect(row.children[1]).toHaveTextContent('G');
 expect(screen.getAllByRole('radio').every(r=>!(r as HTMLInputElement).checked)).toBe(true);
 fireEvent.click(screen.getByRole('radio',{name:/取用歌曲庫版本，更新這份歌單/}));
 expect(screen.getByRole('columnheader',{name:'歌曲庫版本 將採用此版本'})).toBeInTheDocument();
 expect(screen.getByRole('columnheader',{name:'歌單 · 聚會一 將被更新'})).toBeInTheDocument();
 expect(screen.getByText('只更新「聚會一」中的這首歌。歌曲庫與其他歌單保持不變。')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('radio',{name:/取用歌單版本，更新歌曲庫原曲/}));
 expect(screen.getByRole('columnheader',{name:'歌曲庫版本 將被更新'})).toBeInTheDocument();
 expect(screen.getByRole('columnheader',{name:'歌單 · 聚會一 將採用此版本'})).toBeInTheDocument();
 expect(row.children[0]).toHaveTextContent('C');expect(row.children[1]).toHaveTextContent('G');
 expect(mocks.sync).not.toHaveBeenCalled();
});

it('states that lyrics text matches when only the translation language setting differs', async () => {
 const value = await mocks.preview();
 const lyricsDoc = {chinese:'相同的中文歌詞',english:'Same words'};
 mocks.preview.mockResolvedValue({...value,source:{...value.source,lyricsDoc},overrideJson:{songData:{...edited,lyricsDoc:{...lyricsDoc,translationLanguage:'ko'}}}});
 mount();
 fireEvent.click(screen.getByRole('button',{name:'預覽歌單 → 歌曲庫'}));
 expect(await screen.findByText('歌詞文字相同；語言或段落設定的差異會另行列出。')).toBeInTheDocument();
 await screen.findByRole('row',{name:'歌詞 · 翻譯語言設定'});
 expect(screen.queryByText('相同的中文歌詞')).toBeNull();
 expect(screen.queryByText('Same words')).toBeNull();
 expect(mocks.sync).not.toHaveBeenCalled();
});

it('disables an outdated update action when a fresh preview differs only in chord notation', async () => {
 const value=await mocks.preview();
 const source={...song,originalKey:'A',currentKey:'A',sections:[{id:'verse',title:'Verse',bars:[{id:'bar',chords:['5','','','']}]}]};
 const entry={...source,sections:[{id:'verse',title:'Verse',bars:[{id:'bar',chords:['E']}]}]};
 mocks.preview.mockResolvedValue({...value,source,overrideJson:{songData:entry},status:'source-newer'});
 mount();fireEvent.click(screen.getByRole('button',{name:'預覽歌單 → 歌曲庫'}));
 expect(await screen.findByRole('heading',{name:'譜面內容相同'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'無須更新'})).toBeDisabled();
 expect(screen.queryByText(/這份歌單尚未修改/)).toBeNull();
 expect(mocks.sync).not.toHaveBeenCalled();
});

it('explains pickup removal with presence and duration rather than a bare time signature', async () => {
 const value=await mocks.preview();
 mocks.preview.mockResolvedValue({...value,source:{...value.source,pickup:{id:'pickup',timeSignature:'1/4'}},overrideJson:{songData:song}});
 mount();fireEvent.click(screen.getByRole('button',{name:'預覽歌單 → 歌曲庫'}));
 const difference=await screen.findByRole('row',{name:'弱起拍'});
 const cells=within(difference).getAllByRole('cell');
 expect(cells[0]).toHaveTextContent('有弱起拍');expect(cells[0]).toHaveTextContent('長度：1 拍（四分音符）');
 expect(cells[0]).toHaveTextContent('未填入旋律或節奏');
 expect(cells[1]).toHaveTextContent('無弱起拍');expect(difference).not.toHaveTextContent('拍號：1/4');
 expect(mocks.sync).not.toHaveBeenCalled();
});

it('shows aligned miniature measures for added continuation marks without initiating a sync', async () => {
 const value=await mocks.preview();
 const library={...song,sections:[{id:'verse',title:'Verse',bars:[{id:'bar',chords:['D','D/E']}]}]};
 const entry={...song,sections:[{id:'verse',title:'Verse',bars:[{id:'bar',chords:['D','/','D/E','/']}]}]};
 mocks.preview.mockResolvedValue({...value,source:library,overrideJson:{songData:entry}});
 mount();fireEvent.click(screen.getByRole('button',{name:'預覽歌單 → 歌曲庫'}));
 const difference=await screen.findByRole('row',{name:'Verse · 第 1 小節 · 延續拍標示'});
 expect(within(difference).getAllByRole('img')).toHaveLength(2);
 expect(within(difference).getByText('第 2、4 拍標示延續（/）')).toBeInTheDocument();
 expect([...difference.querySelectorAll('[data-changed]')].map(element=>element.textContent)).toEqual(['/','/']);
 expect(screen.getByRole('button',{name:'用歌單版本更新歌曲庫'})).toBeEnabled();
 expect(mocks.sync).not.toHaveBeenCalled();
});
