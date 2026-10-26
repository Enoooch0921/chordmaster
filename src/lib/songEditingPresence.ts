import { supabase } from './supabase';

export interface SongEditorPresence {
  sessionId: string;
  userId: string;
  name: string;
  songId: string;
  updatedAt: number;
}

const LEASE_MS = 75000;
const HEARTBEAT_MS = 20000;

// Advisory status only. Names and song ids never grant permissions or lock a score.
export const subscribeToSongEditors = (
  libraryId: string,
  user: { id: string; name: string },
  onUpdate: (editors: SongEditorPresence[]) => void,
  onConnectionChange: (failed: boolean) => void
) => {
  const client = supabase;
  if (!client) return { setSong: (_songId: string | null) => {}, dispose: () => {} };
  const sessionId = crypto.randomUUID();
  let active = true;
  let ready = false;
  let songId: string | null = null;
  let publishQueue = Promise.resolve();
  let lastVisibleState = '';
  const channel = client.channel(`song-editors:${libraryId}`, {
    config: { private: true, presence: { key: sessionId } }
  });
  const read = () => {
    if (!active || !ready) return;
    const editors = new Map<string, SongEditorPresence>();
    for (const entries of Object.values(channel.presenceState())) {
      for (const entry of entries) {
        const value = entry as unknown as Partial<SongEditorPresence>;
        if (typeof value.sessionId !== 'string' || value.sessionId === sessionId
            || typeof value.userId !== 'string' || typeof value.songId !== 'string' || !value.songId
            || typeof value.updatedAt !== 'number' || value.updatedAt < Date.now() - LEASE_MS
            || value.updatedAt > Date.now() + LEASE_MS) continue;
        const editor = { sessionId: value.sessionId, userId: value.userId, songId: value.songId,
          name: typeof value.name === 'string' ? value.name.slice(0, 80) : '', updatedAt: value.updatedAt };
        const key = `${editor.songId}:${editor.userId}`;
        if (!editors.has(key) || editors.get(key)!.updatedAt < editor.updatedAt) editors.set(key, editor);
      }
    }
    const visible = [...editors.values()].sort((a, b) => a.songId.localeCompare(b.songId) || a.userId.localeCompare(b.userId));
    const signature = JSON.stringify(visible.map(({ userId, name, songId }) => ({ userId, name, songId })));
    if (signature !== lastVisibleState) { lastVisibleState = signature; onUpdate(visible); }
  };
  const publish = () => {
    // Serialize track/untrack so a slow previous request cannot resurrect a song
    // after switching songs or leaving the editor.
    publishQueue = publishQueue.then(async () => {
      if (!active || !ready) return;
      const result = songId
        ? await channel.track({ sessionId, userId: user.id, name: user.name.slice(0, 80), songId, updatedAt: Date.now() })
        : await channel.untrack();
      if (active) onConnectionChange(result !== 'ok');
    }).catch(() => { if (active) onConnectionChange(true); });
  };
  channel.on('presence', { event: 'sync' }, read).subscribe((status) => {
    if (!active) return;
    ready = status === 'SUBSCRIBED';
    onConnectionChange(!ready);
    if (ready) { read(); if (songId) publish(); }
    else { lastVisibleState = ''; onUpdate([]); }
  });
  const heartbeat = setInterval(() => { read(); if (songId) publish(); }, HEARTBEAT_MS);
  return {
    setSong(nextSongId: string | null) {
      if (songId === nextSongId) return;
      songId = nextSongId;
      publish();
    },
    dispose() {
      if (!active) return;
      active = false;
      clearInterval(heartbeat);
      void client.removeChannel(channel);
    }
  };
};
