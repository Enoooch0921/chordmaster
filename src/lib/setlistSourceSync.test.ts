import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: mocks }));
import { classifySetlistSource, describeSetlistSourceChanges, hasSetlistSourceScoreChange, previewSetlistSourceSync, syncSetlistSource, reconcileSetlistSource } from './setlistSourceSync';
const song: Song = { title: 'Song', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'], riff: '1' }] }] };
const row = { id: 'song', library_id: 'team', content_json: song, created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-26T00:00:00.123456Z', archived_at: null };
const payload = () => ({ source: row, entry: { id: 'entry', song_id: 'song', override_json: { overrideKey: 'D', sectionOrder: ['verse','verse'], songData: song } }, setlistName: '聚會一' });
beforeEach(() => vi.clearAllMocks());
const baseline = { songId: 'song', sourceContent: song, entryContent: song, sourceRevision: row.updated_at, capturedAt: row.updated_at };
const withChord = (chord: string) => { const result = structuredClone(song); result.sections[0].bars[0].chords = [chord]; return result; };
describe('per-setlist source provenance', () => {
  it('distinguishes local edits, unchanged old copies, conflicts, convergence and unknown legacy snapshots', () => {
    expect(classifySetlistSource(song, withChord('G'), baseline)).toBe('setlist-changed');
    expect(classifySetlistSource(withChord('G'), song, baseline)).toBe('source-newer');
    expect(classifySetlistSource(withChord('G'), withChord('F'), baseline)).toBe('conflict');
    expect(classifySetlistSource(withChord('G'), withChord('G'), baseline)).toBe('aligned');
    expect(classifySetlistSource(song, withChord('G'), null)).toBe('unknown');
    expect(classifySetlistSource(song, song, null)).toBe('aligned');
  });
  it('keeps Key and Capo independent of whether a copy is stale or edited', () => {
    expect(classifySetlistSource(withChord('G'), { ...song, currentKey: 'D', capo: 5 }, baseline)).toBe('source-newer');
    expect(classifySetlistSource({ ...song, currentKey: 'D', capo: 5 }, song, baseline)).toBe('aligned');
  });
  it('blocks a stale copy upload before making an RPC call', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...payload(), syncStatus: 'source-newer' }, error: null });
    const preview = await previewSetlistSourceSync('team','entry');
    mocks.rpc.mockClear();
    await expect(reconcileSetlistSource(preview, 'to-library')).rejects.toThrow('unchanged old copy');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('sends the original baseline and exact revisions when explicitly resolving a conflict', async () => {
    const snapshot = { ...payload(), syncStatus: 'conflict', entry: { ...payload().entry, setlist_id: 'list', order_index: 0, source_baseline: baseline } };
    mocks.rpc.mockResolvedValueOnce({ data: snapshot, error: null });
    const preview = await previewSetlistSourceSync('team','entry');
    mocks.rpc.mockResolvedValueOnce({ data: { source: row, entry: snapshot.entry, setlistUpdatedAt: row.updated_at }, error: null });
    const result = await reconcileSetlistSource(preview, 'to-setlist');
    expect(mocks.rpc).toHaveBeenLastCalledWith('reconcile_setlist_source', expect.objectContaining({
      p_expected_baseline: baseline, p_expected_source_content: song, p_expected_override_json: payload().entry.override_json,
      p_direction: 'to-setlist', p_resolve_conflict: true
    }));
    expect(result.entry).toMatchObject({ sourceBaseline: baseline, songData: song, id: 'entry', setlistId: 'list' });
  });
});
describe('manual source sync', () => {
  it('compares source content without treating performance settings or metadata as score edits', () => {
    expect(hasSetlistSourceScoreChange(song, { ...song, currentKey: 'D', currentKeyMode: 'minor', capo: 4, showAbsoluteJianpu: true })).toBe(false);
    const changed = structuredClone(song); changed.sections[0].bars[0].chords = ['G'];
    expect(hasSetlistSourceScoreChange(song, changed)).toBe(true);
    expect(describeSetlistSourceChanges(song, changed, 'zh')).toEqual(['Verse · 第 1 小節：和弦 (C → G)']);
  });
  it('hides the sync action for matching normalized scores, including differently ordered JSON fields', () => {
    const reordered = { ...song, sections: [{ bars: [{ riff: '1', chords: ['C'], id: 'bar' }], title: 'Verse', id: 'verse' }] };
    expect(hasSetlistSourceScoreChange(song, reordered)).toBe(false);
    expect(hasSetlistSourceScoreChange(undefined, song)).toBe(false);
    const changed = structuredClone(song); changed.sections[0].bars[0].riff = '2';
    expect(hasSetlistSourceScoreChange(song, changed)).toBe(true);
  });
  it('does not treat lyric display settings as source changes', () => {
    const before = { ...song, lyricsDoc: { chinese: '第一句', fontSize: 14, displayLanguage: 'chinese' as const } };
    expect(hasSetlistSourceScoreChange(before, { ...before, lyricsDoc: { ...before.lyricsDoc, fontSize: 18, displayLanguage: 'english' } })).toBe(false);
    expect(hasSetlistSourceScoreChange(before, { ...before, lyricsDoc: { ...before.lyricsDoc, chinese: '修正歌詞' } })).toBe(true);
  });
  it('reads the server snapshot and passes exact entry JSON plus the unrounded source revision to the explicit write', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: payload(), error: null });
    const preview = await previewSetlistSourceSync('team','entry');
    expect(mocks.rpc).toHaveBeenCalledOnce();
    mocks.rpc.mockResolvedValueOnce({ data: row, error: null });
    await syncSetlistSource(preview);
    expect(mocks.rpc).toHaveBeenLastCalledWith('sync_setlist_song_to_library', {
      p_library_id: 'team', p_entry_id: 'entry', p_expected_source_updated_at: row.updated_at,
      p_expected_override_json: payload().entry.override_json, p_expected_source_content: song
    });
  });
  it('rejects a preview from another library and surfaces server conflicts', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...payload(), source: { ...row, library_id: 'other' } }, error: null });
    await expect(previewSetlistSourceSync('team','entry')).rejects.toThrow('identity changed');
    mocks.rpc.mockResolvedValueOnce({ data: payload(), error: null });
    const preview = await previewSetlistSourceSync('team','entry');
    const conflict = { message: '歌曲庫已被其他人修改' };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: conflict });
    await expect(syncSetlistSource(preview)).rejects.toEqual(conflict);
  });
});
