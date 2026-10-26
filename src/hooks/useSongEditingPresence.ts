import { useEffect, useRef, useState } from 'react';
import { subscribeToSongEditors, type SongEditorPresence } from '../lib/songEditingPresence';

interface Options {
  libraryId: string | null;
  user: { id: string; name: string } | null;
  enabled: boolean;
  editingSongId: string | null;
}

export const useSongEditingPresence = ({ libraryId, user, enabled, editingSongId }: Options) => {
  const [editors, setEditors] = useState<SongEditorPresence[]>([]);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ user, editingSongId });
  latest.current = { user, editingSongId };
  const session = useRef<ReturnType<typeof subscribeToSongEditors> | null>(null);
  const userId = user?.id;
  useEffect(() => {
    setEditors([]);
    setFailed(false);
    if (!enabled || !libraryId || !latest.current.user) return;
    const connection = subscribeToSongEditors(libraryId, latest.current.user, setEditors, setFailed);
    session.current = connection;
    const publish = () => connection.setSong(document.visibilityState === 'hidden' || navigator.onLine === false
      ? null : latest.current.editingSongId);
    publish();
    document.addEventListener('visibilitychange', publish);
    window.addEventListener('online', publish);
    window.addEventListener('offline', publish);
    return () => {
      session.current = null;
      connection.dispose();
      document.removeEventListener('visibilitychange', publish);
      window.removeEventListener('online', publish);
      window.removeEventListener('offline', publish);
    };
  }, [enabled, libraryId, userId]);
  useEffect(() => {
    session.current?.setSong(document.visibilityState === 'hidden' || navigator.onLine === false ? null : editingSongId);
  }, [editingSongId]);
  return { editors, failed };
};
