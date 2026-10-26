import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: mocks }));
import { describeSetlistSourceChanges, hasSetlistSourceScoreChange, previewSetlistSourceSync, syncSetlistSource } from './setlistSourceSync';
const song: Song = { title: 'Song', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['C'], riff: '1' }] }] };
const row = { id: 'song', library_id: 'team', content_json: song, created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-26T00:00:00.123456Z', archived_at: null };
const payload = () => ({ source: row, entry: { id: 'entry', song_id: 'song', override_json: { overrideKey: 'D', sectionOrder: ['verse','verse'], songData: song } }, setlistName: '聚會一' });
beforeEach(() => vi.clearAllMocks());
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
