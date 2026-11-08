import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { PersonalNotesStore } from './personalNotesStore';
import { readNoteRecords, writeNoteRecords } from './personalNotesDatabase';
import { noteId, type NoteStroke } from './personalNotes';

const server = vi.hoisted(() => ({ owner: 'user-a', rows: new Map<string, any>(), offline: false }));
vi.mock('./supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: server.owner } } } }) },
  from: () => {
    const filters: Record<string, string> = {};
    const builder = {
      upsert: async (rows: any[]) => {
        if (server.offline) return { error: new Error('offline') };
        if (rows.some(row => row.owner_id !== server.owner)) return { error: new Error('RLS') };
        for (const row of rows) server.rows.set(JSON.stringify([row.owner_id, row.song_id, row.id]), row);
        return { error: null };
      },
      select: () => builder,
      eq: (key: string, value: string) => { filters[key] = value; return builder; },
      order: () => builder, limit: () => builder,
      gt: (_key: string, value: string) => { filters.cursor = value; return builder; },
      then: (resolve: (value: unknown) => void) => resolve({ error: server.offline ? new Error('offline') : null,
        data: [...server.rows.values()].filter(r => r.owner_id === server.owner && r.owner_id === filters.owner_id && r.song_id === filters.song_id && (!filters.cursor || r.id > filters.cursor)).sort((a,b) => a.id.localeCompare(b.id)).slice(0,500) })
    };
    return builder;
  }
} }));
const stroke = (): NoteStroke => ({ id: noteId(), anchor: { kind: 'page', page: 0 }, points: [[.1, .2], [.2, .3]], color: '#1e293b', width: 2.5, tool: 'pen' });
beforeEach(() => { server.owner = 'user-a'; server.offline = false; server.rows.clear(); });
describe('personal note persistence and synchronization', () => {
  it('partitions the same song by account in both local storage and remote reads', async () => {
    const song = noteId(), a = new PersonalNotesStore('user-a', song);
    await a.start(); a.edit({ add: [stroke()], remove: [] });
    await waitFor(() => expect(server.rows.size).toBe(1));
    await a.sync();
    expect((await readNoteRecords('user-a', song))).toHaveLength(1);
    server.owner = 'user-b';
    const b = new PersonalNotesStore('user-b', song); await b.start();
    expect(b.getSnapshot().strokes).toHaveLength(0);
    expect(await readNoteRecords('user-b', song)).toHaveLength(0);
    // A late account-A write cannot upload using account B's token.
    a.edit({ add: [stroke()], remove: [] }); await a.sync();
    expect(server.rows.size).toBe(1);
  });
  it('recovers pending offline edits after a reload, and merges a second device before undo/redo', async () => {
    const song = noteId(), a = new PersonalNotesStore('user-a', song);
    server.offline = true; await a.start(); a.edit({ add: [stroke()], remove: [] });
    await waitFor(async () => expect((await readNoteRecords('user-a', song)).filter(r => r.pending)).toHaveLength(1));
    const remoteInk = stroke(), op = { id: noteId(), strokes: [remoteInk], removed: [] };
    server.rows.set('second-device', { owner_id: 'user-a', song_id: song, id: op.id, operation: op });
    server.offline = false;
    const restored = new PersonalNotesStore('user-a', song); await restored.start();
    expect(restored.getSnapshot().strokes).toHaveLength(2);
    const ids = restored.getSnapshot().strokes.map(s => s.id);
    restored.edit({ add: [], remove: ids }); expect(restored.getSnapshot().strokes).toHaveLength(0);
    restored.undo(); expect(restored.getSnapshot().strokes).toHaveLength(2);
    expect(restored.getSnapshot().strokes.every(s => !ids.includes(s.id))).toBe(true);
    restored.redo(); expect(restored.getSnapshot().strokes).toHaveLength(0);
    await restored.sync();
    await waitFor(() => expect(restored.getSnapshot().status).toBe('synced'));
    const reloaded = new PersonalNotesStore('user-a', song); await reloaded.start();
    expect(reloaded.getSnapshot().strokes).toHaveLength(0);
  });
  it('keeps concurrent tab records instead of replacing an entire cached song', async () => {
    const song = noteId(), operations = [1,2].map(() => ({ id: noteId(), strokes: [stroke()], removed: [] }));
    await Promise.all(operations.map(op => writeNoteRecords('user-a', song, [op], true)));
    expect(await readNoteRecords('user-a', song)).toHaveLength(2);
  });
});

it('keeps score and lyric undo histories independent while syncing both as personal notes on the source song', async () => {
  const song = noteId(), store = new PersonalNotesStore('user-a', song);
  await store.start();
  store.edit({ add: [stroke()], remove: [] });
  const lyric: NoteStroke = { ...stroke(), anchor: { kind: 'lyric', sourceLine: 'verse:chinese:0', offset: 0, fontSize: 28 } };
  store.edit({ add: [lyric], remove: [] }, 'lyrics');
  store.undo();
  expect(store.getSnapshot().strokes.map(s => s.anchor.kind)).toEqual(['lyric']);
  store.undo('lyrics');
  store.redo();
  expect(store.getSnapshot().strokes.map(s => s.anchor.kind)).toEqual(['page']);
  store.redo('lyrics');
  await waitFor(() => expect(store.getSnapshot().status).toBe('synced'));
  const reopened = new PersonalNotesStore('user-a', song); await reopened.start();
  expect(reopened.getSnapshot().strokes.map(s => s.anchor.kind).sort()).toEqual(['lyric', 'page']);
});
