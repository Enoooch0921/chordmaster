import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: state.from } }));
import { createCloudRepository } from './repository';
const row = { id: 'song', library_id: 'team', title: 'Source', archived_at: null, created_by: 'owner', updated_by: 'owner',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-28T00:00:00.123456Z',
  content_json: { title: 'Source', originalKey: 'C', currentKey: 'D', capo: 3, timeSignature: '4/4', references: { band: { youtubeUrl: 'https://example.invalid' } },
    sections: [{ id: 'v', title: 'Verse', bars: [{ id: 'b', chords: ['Dm7'], annotation: 'Keep this' }] }], opaqueFutureField: { untouched: true } } };
const query = (data: unknown, error: unknown = null) => {
  const builder = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), update: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  for (const method of ['select', 'eq', 'is', 'update'] as const) builder[method].mockReturnValue(builder);
  return builder;
};
const repository = () => createCloudRepository({ userId: 'editor', email: 'editor@example.invalid', name: 'Editor' });
beforeEach(() => vi.clearAllMocks());
it('changes only tempo on the fresh complete source and guards the write by exact revision, scope and active status', async () => {
  const source = structuredClone(row), saved = { ...source, content_json: { ...source.content_json, tempo: 92.5 }, updated_at: '2026-10-28T01:00:00Z' };
  const read = query(source), write = query(saved);
  state.from.mockReturnValueOnce(read).mockReturnValueOnce(write);
  const result = await repository().setOriginalTempoIfUnset('song', 92.5, 'team');
  expect(write.update).toHaveBeenCalledWith({ content_json: { ...row.content_json, tempo: 92.5 }, updated_by: 'editor' });
  expect(write.eq.mock.calls).toEqual([['id', 'song'], ['library_id', 'team'], ['updated_at', row.updated_at]]);
  expect(write.is).toHaveBeenCalledWith('archived_at', null);
  expect(write.select).toHaveBeenCalledWith('*');
  expect(result.before.tempo).toBeUndefined(); expect(result.after.tempo).toBe(92.5);
  expect(source).toEqual(row);
});
it.each([92, 120])('refuses to replace a tempo already set to %s', async tempo => {
  state.from.mockReturnValue(query({ ...row, content_json: { ...row.content_json, tempo } }));
  await expect(repository().setOriginalTempoIfUnset('song', 100, 'team')).rejects.toThrow('already has a tempo');
  expect(state.from).toHaveBeenCalledTimes(1);
});
it.each([null, { ...row, library_id: 'other' }, { ...row, archived_at: '2026-10-28' }])('rejects unavailable, cross-workspace or archived sources', async source => {
  state.from.mockReturnValue(query(source));
  await expect(repository().setOriginalTempoIfUnset('song', 92, 'team')).rejects.toThrow('unavailable');
  expect(state.from).toHaveBeenCalledTimes(1);
});
it.each([null, { message: 'permission denied' }])('does not fall back to upsert when a concurrent change or permission check rejects the write', async error => {
  const write = query(null, error);
  state.from.mockReturnValueOnce(query(row)).mockReturnValueOnce(write);
  await expect(repository().setOriginalTempoIfUnset('song', 92, 'team')).rejects.toBeTruthy();
  expect(state.from).toHaveBeenCalledTimes(2);
});
it.each([undefined, 0, 19, 401, NaN, 92.123])('rejects invalid tempo %s before reading or writing', async tempo => {
  await expect(repository().setOriginalTempoIfUnset('song', tempo as number, 'team')).rejects.toThrow('20 and 400');
  expect(state.from).not.toHaveBeenCalled();
});
