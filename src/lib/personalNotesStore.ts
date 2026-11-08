import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { readNoteRecords, writeNoteRecords } from './personalNotesDatabase';
import { mergeNoteOperations, noteId, validNoteOperation, type NoteOperation, type NoteStroke, type NoteSurface } from './personalNotes';

type Status = 'loading' | 'saving' | 'synced' | 'offline' | 'local' | 'error';
interface Snapshot { strokes: NoteStroke[]; ready: boolean; status: Status; undo: Record<NoteSurface, boolean>; redo: Record<NoteSurface, boolean> }
type Edit = { add: NoteStroke[]; remove: string[] };
export class PersonalNotesStore {
  private operations = new Map<string, NoteOperation>();
  private pending = new Set<string>();
  private listeners = new Set<() => void>();
  private past: Record<NoteSurface, Edit[]> = { score: [], lyrics: [] };
  private future: Record<NoteSurface, Edit[]> = { score: [], lyrics: [] };
  private ready = false;
  private busy: Promise<void> | null = null;
  private loading: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private localError = false;
  private broadcast: BroadcastChannel | null = null;
  private snapshot: Snapshot = { strokes: [], ready: false, status: 'loading', undo: { score: false, lyrics: false }, redo: { score: false, lyrics: false } };
  constructor(readonly owner: string, readonly song: string) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => {
    this.listeners.delete(listener);
    if (!this.listeners.size) { this.broadcast?.close(); this.broadcast = null; }
  }; };
  private publish(status = this.snapshot.status) {
    this.snapshot = { strokes: mergeNoteOperations(this.operations.values()), ready: this.ready,
      status: this.localError ? 'error' : status, undo: { score: !!this.past.score.length, lyrics: !!this.past.lyrics.length },
      redo: { score: !!this.future.score.length, lyrics: !!this.future.lyrics.length } };
    this.listeners.forEach(fn => fn());
  }
  start = () => {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        for (const row of await readNoteRecords(this.owner, this.song)) {
          this.operations.set(row.id, row.operation);
          if (row.pending) this.pending.add(row.id);
        }
      } catch { this.localError = true; }
      this.ready = true;
      this.publish('local');
      await this.sync();
    })();
    return this.loading;
  };
  private persist(operations: NoteOperation[], pending: boolean) {
    this.writes = this.writes.then(async () => {
      try { await writeNoteRecords(this.owner, this.song, operations, pending); this.localError = false; }
      catch { this.localError = true; this.publish(); }
    });
    return this.writes;
  }
  private apply(edit: Edit): Edit {
    const removed = this.snapshot.strokes.filter(s => edit.remove.includes(s.id));
    const added = edit.add.map(s => ({ ...s, id: noteId() }));
    const ops: NoteOperation[] = [];
    // Keep a long eraser/undo gesture below the per-operation payload limit.
    for (let i = 0; i < Math.max(Math.ceil(added.length / 4), Math.ceil(edit.remove.length / 1000)); i++) {
      ops.push({ id: noteId(), strokes: added.slice(i * 4, i * 4 + 4), removed: edit.remove.slice(i * 1000, i * 1000 + 1000) });
    }
    if (!ops.every(validNoteOperation)) throw new Error('Invalid personal note');
    for (const op of ops) { this.operations.set(op.id, op); this.pending.add(op.id); }
    this.publish('saving');
    void this.persist(ops, true).then(() => {
      for (const op of ops) this.broadcast?.postMessage(op);
      return this.sync();
    });
    return { add: removed, remove: added.map(s => s.id) };
  }
  edit = (edit: Edit, surface: NoteSurface = 'score') => {
    if (!this.ready || (!edit.add.length && !edit.remove.length)) return;
    this.past[surface].push(this.apply(edit)); this.future[surface] = []; this.publish();
  };
  undo = (surface: NoteSurface = 'score') => { const edit = this.past[surface].pop(); if (edit) { this.future[surface].push(this.apply(edit)); this.publish(); } };
  redo = (surface: NoteSurface = 'score') => { const edit = this.future[surface].pop(); if (edit) { this.past[surface].push(this.apply(edit)); this.publish(); } };
  connect() {
    if (typeof BroadcastChannel !== 'undefined' && !this.broadcast) {
      this.broadcast = new BroadcastChannel(`chordmaster-notes:${this.owner}:${this.song}`);
      this.broadcast.onmessage = ({ data }) => {
        if (!validNoteOperation(data) || this.operations.has(data.id)) return;
        this.operations.set(data.id, data); this.pending.add(data.id); this.publish();
        void this.sync();
      };
    }
  }
  sync = (): Promise<void> => {
    if (!this.ready) return Promise.resolve();
    if (this.busy) return this.busy;
    let completed = false;
    this.busy = (async () => {
      if (!supabase) { this.publish('local'); return; }
      if (navigator.onLine === false) { this.publish('offline'); return; }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user.id !== this.owner) { this.publish('offline'); return; }
        this.publish('saving');
        while (this.pending.size) {
          const ops = [...this.pending].slice(0, 25).map(id => this.operations.get(id)!);
          const { error } = await supabase.from('personal_score_notes').upsert(ops.map(operation => ({ owner_id: this.owner, song_id: this.song, id: operation.id, operation })),
            { onConflict: 'owner_id,song_id,id', ignoreDuplicates: true });
          if (error) throw error;
          await this.persist(ops, false);
          for (const op of ops) this.pending.delete(op.id);
        }
        let cursor = '';
        for (;;) {
          let request = supabase.from('personal_score_notes').select('id,operation').eq('owner_id', this.owner).eq('song_id', this.song).order('id').limit(500);
          if (cursor) request = request.gt('id', cursor);
          const { data, error } = await request;
          if (error) throw error;
          const incoming = (data ?? []).map(r => r.operation).filter(validNoteOperation) as NoteOperation[];
          for (const op of incoming) this.operations.set(op.id, op);
          if (incoming.length) await this.persist(incoming, false);
          if (!data || data.length < 500) break;
          cursor = data[data.length - 1].id;
        }
        completed = true;
        this.publish('synced');
      } catch { this.publish(!navigator.onLine ? 'offline' : 'error'); }
    })().finally(() => {
      this.busy = null;
      if (completed && this.pending.size) void this.sync();
    });
    return this.busy;
  };
}
const stores = new Map<string, PersonalNotesStore>();
export function usePersonalNotes(owner: string, song: string) {
  const store = useMemo(() => {
    const key = JSON.stringify([owner, song]);
    let value = stores.get(key);
    if (!value) { value = new PersonalNotesStore(owner, song); stores.set(key, value); }
    return value;
  }, [owner, song]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.start(); store.connect();
    const refresh = () => { void store.sync(); };
    window.addEventListener('online', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); };
  }, [store]);
  return { store, state };
}
