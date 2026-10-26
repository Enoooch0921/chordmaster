import { useEffect, useId, useRef, useState } from 'react';
import type { AppLanguage } from '../types';
import { describeSetlistSourceChanges, previewSetlistSourceSync, reconcileSetlistSource,
  type SetlistSourceDirection, type SetlistSourceReconciliation, type SetlistSourceStatus, type SetlistSourceSyncPreview } from '../lib/setlistSourceSync';

export default function SetlistSourceSyncControl({ libraryId, entryId, language, status, prepare, onReconciled }: {
  libraryId: string; entryId: string; language: AppLanguage; status: SetlistSourceStatus;
  prepare: () => Promise<unknown>; onReconciled: (result: SetlistSourceReconciliation) => void;
}) {
  const zh = language === 'zh', titleId = useId();
  const [preview, setPreview] = useState<SetlistSourceSyncPreview | null>(null);
  const [direction, setDirection] = useState<SetlistSourceDirection | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [invalidated, setInvalidated] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (preview && !dialog.current?.open) dialog.current?.showModal(); }, [preview]);
  const statusLabel = (state: SetlistSourceStatus) => ({
    aligned: zh ? '譜面相同，無須同步。' : 'Scores match. No sync needed.',
    'setlist-changed': zh ? '這份歌單有新的譜面修改，曲庫尚未更新。' : 'This setlist has new score edits. The library source is unchanged.',
    'source-newer': zh ? '曲庫有新版，這份歌單尚未修改。可更新歌單副本。' : 'The library has a newer score. This setlist copy has not been edited.',
    conflict: zh ? '歌單與曲庫各有修改，請比對後選擇保留版本。' : 'Both versions changed. Compare them and choose which version to keep.',
    unknown: zh ? '缺少來源版本紀錄，請先比對，不能直接覆蓋。' : 'The source baseline is unknown. Review both versions before replacing either.'
  }[state]);
  const actionLabel = status === 'source-newer' ? (zh ? '更新歌單副本' : 'Update setlist copy')
    : status === 'setlist-changed' ? (zh ? '同步回歌曲庫' : 'Sync to song library')
    : status === 'conflict' ? (zh ? '比對衝突' : 'Review conflict') : (zh ? '比對版本' : 'Compare versions');
  const needsChoice = preview?.status === 'conflict' || preview?.status === 'unknown';
  const changes = preview ? direction === 'to-setlist'
    ? describeSetlistSourceChanges(preview.overrideJson.songData, preview.source, language)
    : describeSetlistSourceChanges(preview.source, preview.overrideJson.songData, language) : [];
  const showPreview = async () => {
    setBusy(true); setError(''); setMessage(''); setInvalidated(true); setDirection('');
    try {
      await prepare();
      if (!mounted.current) return;
      const next = await previewSetlistSourceSync(libraryId, entryId);
      if (mounted.current) {
        setPreview(next); setInvalidated(false);
        setDirection(next.status === 'setlist-changed' ? 'to-library' : next.status === 'source-newer' ? 'to-setlist' : '');
      }
    } catch (error) {
      if (mounted.current) setError(String((error as { message?: string })?.message ?? error));
    } finally { if (mounted.current) setBusy(false); }
  };
  const confirm = async () => {
    if (!preview || !direction || busy || invalidated || !changes.length) return;
    setBusy(true); setError('');
    try {
      const result = await reconcileSetlistSource(preview, direction);
      if (!mounted.current) return;
      onReconciled(result); setPreview(null);
      setMessage(zh ? '已更新譜面與來源基準，更新前的內容已備份。' : 'Score and baseline updated. The previous version was backed up.');
    } catch (error) {
      if (mounted.current) { setError(String((error as { message?: string })?.message ?? error)); setInvalidated(true); }
    } finally { if (mounted.current) setBusy(false); }
  };
  return <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:px-6" data-setlist-source-sync data-source-sync-status={status}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1">{statusLabel(status)}</span>
      <button type="button" disabled={busy} onClick={() => void showPreview()} className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 font-semibold disabled:opacity-50">{busy && !preview ? (zh ? '讀取差異…' : 'Loading changes…') : actionLabel}</button>
    </div>
    {message && <p role="status" className="mt-1 text-emerald-800">{message}</p>}
    {!preview && error && <p role="alert" className="mt-1 text-rose-800">{error}</p>}
    {preview && <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else setPreview(null); }} className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-stone-200 bg-white p-5 text-stone-900 shadow-xl backdrop:bg-black/40">
      <h2 id={titleId} className="text-lg font-bold">{zh ? '比對歌單與歌曲庫譜面' : 'Compare setlist and library scores'}</h2>
      <p className="mt-2 text-sm font-semibold">{preview.setlistName} · {preview.overrideJson.songData.title}</p>
      <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{statusLabel(preview.status)}</p>
      <p className="mt-2 text-sm">{zh ? 'Key、個人 Capo、顯示偏好及其他歌單副本各自保留。更新歌單時保留可用的演出段落順序；已從原曲刪除的段落會移出順序。更新前完整備份，確認期間若有人修改就停止更新。' : 'Key, personal Capo, display preferences and other setlist copies are preserved. Updating this copy keeps valid performance section order and removes deleted sections. Previous versions are backed up; concurrent edits stop the update.'}</p>
      <p className="mt-2 text-xs text-stone-600">{zh ? '曲庫最後更新：' : 'Source last updated: '}{new Date(preview.sourceRevision).toLocaleString(zh ? 'zh-TW' : 'en')}</p>
      {needsChoice && preview.baseline && <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><h3 className="font-semibold">{zh ? '歌單從來源基準起的修改' : 'Setlist changes since baseline'}</h3><ul className="max-h-32 overflow-y-auto">{describeSetlistSourceChanges(preview.baseline.entryContent, preview.overrideJson.songData, language).map((s,i)=><li key={i}>{s}</li>)}</ul></div>
        <div><h3 className="font-semibold">{zh ? '曲庫從來源基準起的修改' : 'Library changes since baseline'}</h3><ul className="max-h-32 overflow-y-auto">{describeSetlistSourceChanges(preview.baseline.sourceContent, preview.source, language).map((s,i)=><li key={i}>{s}</li>)}</ul></div>
      </div>}
      {needsChoice && <fieldset className="mt-3 space-y-2 rounded-lg border border-amber-300 p-3 text-sm">
        <legend className="font-semibold">{zh ? '請明確選擇保留版本' : 'Choose which version to keep'}</legend>
        <label className="flex min-h-10 items-center gap-2"><input type="radio" name={titleId} checked={direction==='to-library'} onChange={()=>setDirection('to-library')} disabled={busy}/>{zh ? '保留歌單版本，更新歌曲庫' : 'Keep setlist version and update library'}</label>
        <label className="flex min-h-10 items-center gap-2"><input type="radio" name={titleId} checked={direction==='to-setlist'} onChange={()=>setDirection('to-setlist')} disabled={busy}/>{zh ? '保留歌曲庫版本，更新這份歌單' : 'Keep library version and update this setlist'}</label>
      </fieldset>}
      <h3 className="mt-3 text-sm font-semibold">{direction==='to-setlist' ? (zh?'預計更新這份歌單':'Changes to this setlist') : direction==='to-library' ? (zh?'預計更新歌曲庫原曲':'Changes to library source') : (zh?'曲庫與歌單的差異':'Differences between versions')}</h3>
      <ul className="my-3 max-h-[30dvh] space-y-2 overflow-y-auto rounded-lg bg-stone-50 p-3 text-sm">{changes.length ? changes.map((change,index)=><li key={index}>{change}</li>) : <li>{zh?'譜面內容相同，無須同步。':'The scores match. No sync is needed.'}</li>}</ul>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={()=>setPreview(null)} className="min-h-10 rounded-lg border px-3">{zh?'取消':'Cancel'}</button>
        <button type="button" disabled={busy} onClick={()=>void showPreview()} className="min-h-10 rounded-lg border px-3">{zh?'重新預覽':'Refresh preview'}</button>
        <button type="button" disabled={busy || invalidated || !direction || !changes.length} onClick={()=>void confirm()} className="min-h-10 rounded-lg bg-indigo-600 px-3 font-semibold text-white disabled:opacity-40">{busy ? (zh?'更新中…':'Updating…') : direction==='to-setlist' ? (zh?'確認更新歌單副本':'Confirm setlist update') : direction==='to-library' ? (zh?'確認更新歌曲庫':'Confirm source update') : (zh?'請先選擇版本':'Choose a version first')}</button>
      </div>
    </dialog>}
  </div>;
}
