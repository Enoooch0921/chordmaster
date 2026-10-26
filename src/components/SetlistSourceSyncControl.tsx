import { useEffect, useRef, useState } from 'react';
import type { AppLanguage, StoredSong } from '../types';
import { describeSetlistSourceChanges, previewSetlistSourceSync, syncSetlistSource, type SetlistSourceSyncPreview } from '../lib/setlistSourceSync';

export default function SetlistSourceSyncControl({ libraryId, entryId, language, prepare, onSynced }: {
  libraryId: string; entryId: string; language: AppLanguage;
  prepare: () => Promise<unknown>; onSynced: (song: StoredSong) => void;
}) {
  const zh = language === 'zh';
  const [preview, setPreview] = useState<SetlistSourceSyncPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [invalidated, setInvalidated] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal();
  }, [preview]);
  const changes = preview ? describeSetlistSourceChanges(preview.source, preview.overrideJson.songData, language) : [];
  const showPreview = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      await prepare();
      if (!mounted.current) return;
      const next = await previewSetlistSourceSync(libraryId, entryId);
      if (mounted.current) { setPreview(next); setInvalidated(false); }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error));
    } finally { if (mounted.current) setBusy(false); }
  };
  const confirm = async () => {
    if (!preview || busy || invalidated || !changes.length) return;
    setBusy(true); setError('');
    try {
      const song = await syncSetlistSource(preview);
      if (!mounted.current) return;
      onSynced(song); setPreview(null);
      setMessage(zh ? '已同步回歌曲庫，原曲備份已保存。' : 'Updated the song library. The previous source was backed up.');
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error));
        setInvalidated(true);
      }
    } finally { if (mounted.current) setBusy(false); }
  };
  return <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:px-6" data-setlist-source-sync>
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1">{zh ? '歌單修改只保存在此歌單。要更新原曲，請另外同步回歌曲庫。' : 'Setlist edits stay in this setlist. Sync separately to update the source song.'}</span>
      <button type="button" disabled={busy} onClick={() => void showPreview()} className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 font-semibold disabled:opacity-50">{busy && !preview ? (zh ? '讀取差異…' : 'Loading changes…') : (zh ? '同步回歌曲庫' : 'Sync to song library')}</button>
    </div>
    {message && <p role="status" className="mt-1 text-emerald-800">{message}</p>}
    {!preview && error && <p role="alert" className="mt-1 text-rose-800">{error}</p>}
    {preview && <dialog ref={dialog} aria-labelledby="source-sync-title" onCancel={event => { if (busy) event.preventDefault(); else setPreview(null); }} className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-stone-200 bg-white p-5 text-stone-900 shadow-xl backdrop:bg-black/40">
      <h2 id="source-sync-title" className="text-lg font-bold">{zh ? '重要：更新歌曲庫原曲' : 'Important: update the source song'}</h2>
      <p className="mt-2 text-sm font-semibold">{preview.setlistName} · {preview.overrideJson.songData.title}</p>
      <p className="mt-2 text-sm">{zh ? '以下譜面差異會更新歌曲庫，之後新增的歌單會使用更新後的原曲。現有其他歌單副本、演出 Key、個人 Capo 與歌單段落演出順序不會被改動。' : 'These score changes update the library source used by new setlists. Existing setlist snapshots, performance key, personal Capo and setlist section order are preserved.'}</p>
      <p className="mt-2 text-xs text-stone-600">{zh ? '曲庫最後更新：' : 'Source last updated: '}{new Date(preview.sourceRevision).toLocaleString(zh ? 'zh-TW' : 'en')}</p>
      {Number((preview.overrideJson.songData as StoredSong).updatedAt) > 0 && preview.source.updatedAt > Number((preview.overrideJson.songData as StoredSong).updatedAt) && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{zh ? '曲庫版本較新，請確認要以這份歌單譜面更新原曲。' : 'The source is newer. Check the changes before replacing it with this setlist score.'}</p>}
      <ul className="my-4 max-h-[40dvh] space-y-2 overflow-y-auto rounded-lg bg-stone-50 p-3 text-sm">{changes.length ? changes.map((change, index) => <li key={index}>{change}</li>) : <li>{zh ? '譜面內容相同，無須同步。' : 'The scores match. No sync is needed.'}</li>}</ul>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => setPreview(null)} className="min-h-10 rounded-lg border px-3">{zh ? '取消' : 'Cancel'}</button>
        <button type="button" disabled={busy} onClick={() => void showPreview()} className="min-h-10 rounded-lg border px-3">{zh ? '重新預覽' : 'Refresh preview'}</button>
        <button type="button" disabled={busy || invalidated || !changes.length} onClick={() => void confirm()} className="min-h-10 rounded-lg bg-indigo-600 px-3 font-semibold text-white disabled:opacity-40">{busy ? (zh ? '同步中…' : 'Syncing…') : (zh ? '確認更新歌曲庫' : 'Confirm source update')}</button>
      </div>
    </dialog>}
  </div>;
}
