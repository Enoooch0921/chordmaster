import { ArrowLeftRight, ArrowRight, Check, X } from 'lucide-react';
import { compareSetlistSourceScores } from '../lib/setlistSourceComparison';
import './SetlistSourceSyncControl.css';
import { useEffect, useId, useRef, useState } from 'react';
import type { AppLanguage } from '../types';
import { describeSetlistSourceChanges, previewSetlistSourceSync, reconcileSetlistSource,
  type SetlistSourceDirection, type SetlistSourceReconciliation, type SetlistSourceStatus, type SetlistSourceSyncPreview } from '../lib/setlistSourceSync';

export default function SetlistSourceSyncControl({ libraryId, entryId, language, status, prepare, onReconciled, onSaveAs, compact = false }: {
  libraryId: string; entryId: string; language: AppLanguage; status: SetlistSourceStatus; compact?: boolean;
  prepare: () => Promise<unknown>; onReconciled: (result: SetlistSourceReconciliation) => void;
  onSaveAs?: (preview: SetlistSourceSyncPreview, title: string, id: string) => Promise<void>;
}) {
  const zh = language === 'zh', titleId = useId();
  const [preview, setPreview] = useState<SetlistSourceSyncPreview | null>(null);
  const [direction, setDirection] = useState<SetlistSourceDirection | 'save-as' | ''>('');
  const [newTitle, setNewTitle] = useState('');
  const copyId = useRef<string | null>(null);
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
  const actionLabel = status === 'source-newer' ? (zh ? '預覽歌曲庫 → 此歌單' : 'Preview library → setlist')
    : status === 'setlist-changed' ? (zh ? '預覽歌單 → 歌曲庫' : 'Preview setlist → library')
    : (zh ? '比對差異與方向' : 'Compare versions and direction');
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
        copyId.current ??= crypto.randomUUID();
        setNewTitle(current => current || `${next.overrideJson.songData.title}${zh ? '（歌單版）' : ' (Setlist version)'}`);
        setDirection(next.status === 'setlist-changed' ? 'to-library' : next.status === 'source-newer' ? 'to-setlist' : '');
      }
    } catch (error) {
      if (mounted.current) setError(String((error as { message?: string })?.message ?? error));
    } finally { if (mounted.current) setBusy(false); }
  };
  const confirm = async () => {
    if (!preview || !direction || busy || invalidated || (direction === 'save-as' ? !newTitle.trim() || !onSaveAs : !changes.length)) return;
    setBusy(true); setError('');
    try {
      if (direction === 'save-as' && onSaveAs) {
        copyId.current ??= crypto.randomUUID();
        await onSaveAs(preview, newTitle.trim(), copyId.current);
        if (!mounted.current) return;
        setPreview(null); copyId.current = null;
        setMessage(zh ? '已另存成新歌曲，原曲與目前歌單保持不變。' : 'Saved as a new song. The source and setlist are unchanged.');
        return;
      }
      if (direction === 'save-as') return;
      const result = await reconcileSetlistSource(preview, direction);
      if (!mounted.current) return;
      onReconciled(result); setPreview(null);
      setMessage(direction === 'to-setlist'
        ? (zh ? `已從歌曲庫更新「${preview.setlistName}」的譜面。歌曲庫保持不變。` : `Updated “${preview.setlistName}” from the library. The library is unchanged.`)
        : (zh ? `已用「${preview.setlistName}」的版本更新歌曲庫。其他歌單保持不變。` : `Updated the library from “${preview.setlistName}”. Other setlists are unchanged.`));
    } catch (error) {
      if (mounted.current) { setError(String((error as { message?: string })?.message ?? error)); setInvalidated(true); }
    } finally { if (mounted.current) setBusy(false); }
  };
  const rows = preview ? compareSetlistSourceScores(preview.source, preview.overrideJson.songData, language) : [];
  const confirmLabel = direction === 'to-setlist' ? (zh ? '從歌曲庫更新此歌單' : 'Update this setlist from library')
    : direction === 'to-library' ? (zh ? '用歌單版本更新歌曲庫' : 'Update library from this setlist')
    : direction === 'save-as' ? (zh ? '確認另存新歌曲' : 'Save as a new song')
    : (zh ? '請先選擇更新方向' : 'Choose an update direction');
  const scope = direction === 'to-setlist'
    ? (zh ? `只更新「${preview?.setlistName}」中的這首歌。歌曲庫與其他歌單保持不變。` : `Only this song in “${preview?.setlistName}” changes. The library and other setlists stay unchanged.`)
    : direction === 'to-library'
      ? (zh ? `取用「${preview?.setlistName}」的譜面更新歌曲庫原曲。其他歌單仍保留各自的版本。` : `Use the score in “${preview?.setlistName}” to update the library source. Other setlists retain their versions.`)
      : (zh ? '以這份歌單的譜面建立新歌曲，原曲與目前歌單的連結不變。' : 'Create a new song from this setlist score. The source and current setlist link stay unchanged.');
  const close = () => { if (!busy) setPreview(null); };
  const compactLabel = status === 'source-newer' ? (zh ? '歌曲庫 → 此歌單' : 'Library → setlist')
    : status === 'setlist-changed' ? (zh ? '此歌單 → 歌曲庫' : 'Setlist → library')
    : (zh ? '比對兩份修改' : 'Compare score edits');
  return <div className={compact ? 'max-w-full text-xs text-amber-950' : 'shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:px-6'} data-setlist-source-sync data-source-sync-status={status}>
    <div className="flex flex-wrap items-center gap-2">
      <span id={`${titleId}-status`} className={compact ? 'sr-only' : 'min-w-0 flex-1'}>{statusLabel(status)}</span>
      <button type="button" disabled={busy} onClick={() => void showPreview()} aria-label={compact ? actionLabel : undefined} aria-describedby={compact ? `${titleId}-status` : undefined} title={compact ? statusLabel(status) : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-300 px-3 font-semibold disabled:opacity-50 ${compact ? 'bg-amber-50 shadow-sm' : 'bg-white'}`}>{compact && <ArrowLeftRight size={16} aria-hidden="true" />}{busy && !preview ? (zh ? '讀取差異…' : 'Loading changes…') : compact ? compactLabel : actionLabel}</button>
    </div>
    {message && <p role="status" className="mt-1 text-emerald-800">{message}</p>}
    {!preview && error && <p role="alert" className="mt-1 text-rose-800">{error}</p>}
    {preview && <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else close(); }} className="source-sync-dialog">
      <div className="source-sync-layout">
        <header className="source-sync-heading"><div>
          <h2 id={titleId}>{needsChoice ? (zh ? '比對兩份譜面' : 'Compare the two scores') : preview.status === 'source-newer' ? (zh ? '從歌曲庫更新此歌單' : 'Update this setlist from library') : (zh ? '用歌單版本更新歌曲庫' : 'Update library from this setlist')}</h2>
          <p>{preview.overrideJson.songData.title} · {preview.setlistName}</p>
        </div><button type="button" disabled={busy} onClick={close} aria-label={zh ? '關閉比對' : 'Close comparison'} className="source-sync-close"><X size={20} /></button></header>
        <div className="source-sync-body">
          <p className="source-sync-state">{needsChoice
            ? (zh ? '先比較目前兩份版本，再決定取用哪一份。系統不會自動合併兩邊的修改。' : 'Compare the current versions, then choose which to use. Changes from both sides are not merged automatically.')
            : statusLabel(preview.status)}</p>
          {!needsChoice && direction && direction !== 'save-as' && <div className="source-sync-route" aria-label={zh ? '更新方向' : 'Update direction'}><span>{direction === 'to-setlist' ? (zh ? '歌曲庫' : 'Library') : preview.setlistName}</span><ArrowRight size={18} aria-hidden="true" /><span>{direction === 'to-setlist' ? preview.setlistName : (zh ? '歌曲庫' : 'Library')}</span></div>}
          <h3 className="source-sync-difference-title">{zh ? '兩份版本的差異' : 'Differences between versions'}<span>{rows.length} {zh ? '項' : 'changes'}</span></h3>
          <div className="source-comparison" role="table" aria-label={zh ? '歌曲庫與歌單目前的譜面差異' : 'Current library and setlist differences'}>
            <div className="source-comparison-header" role="row"><div role="columnheader">{zh ? '歌曲庫版本' : 'Library version'}{' '}{direction === 'to-setlist' ? <small>{zh ? '將採用此版本' : 'Version to use'}</small> : direction === 'to-library' ? <small>{zh ? '將被更新' : 'Will be updated'}</small> : null}</div><div role="columnheader">{zh ? `歌單 · ${preview.setlistName}` : `Setlist · ${preview.setlistName}`}{' '}{direction === 'to-library' || direction === 'save-as' ? <small>{zh ? '將採用此版本' : 'Version to use'}</small> : direction === 'to-setlist' ? <small>{zh ? '將被更新' : 'Will be updated'}</small> : null}</div></div>
            {rows.map((row,index) => <div key={index} className="source-comparison-row" role="rowgroup"><div className="source-comparison-label" aria-hidden="true">{row.label}</div><div className="source-comparison-values" role="row" aria-label={row.label}><div role="cell" className={direction === 'to-setlist' ? 'adopted' : undefined}>{row.library}</div><div role="cell" className={direction === 'to-library' || direction === 'save-as' ? 'adopted' : undefined}>{row.setlist}</div></div></div>)}
            {!rows.length && <p className="p-4 text-sm text-gray-500">{changes.length ? (zh ? '目前顯示的譜面內容相同，但編排記錄不同。' : 'The displayed scores match, but their arrangement records differ.') : (zh ? '譜面內容相同，無須更新。' : 'The scores match. No update is needed.')}</p>}
          </div>
          {needsChoice && <fieldset className="source-sync-options"><legend>{zh ? '選擇更新方向' : 'Choose an update direction'}</legend>
            <label className="source-sync-option"><input type="radio" name={titleId} checked={direction === 'to-setlist'} disabled={busy} onChange={() => setDirection('to-setlist')} /><span><strong>{zh ? '歌曲庫' : 'Library'}<ArrowRight size={16} aria-hidden="true" />{preview.setlistName}</strong><small>{zh ? '取用歌曲庫版本，更新這份歌單' : 'Use the library version to update this setlist'}</small></span></label>
            <label className="source-sync-option"><input type="radio" name={titleId} checked={direction === 'to-library'} disabled={busy} onChange={() => setDirection('to-library')} /><span><strong>{preview.setlistName}<ArrowRight size={16} aria-hidden="true" />{zh ? '歌曲庫' : 'Library'}</strong><small>{zh ? '取用歌單版本，更新歌曲庫原曲' : 'Use this setlist version to update the library source'}</small></span></label>
          </fieldset>}
          {onSaveAs && <details className="source-sync-extra" open={direction === 'save-as' ? true : undefined}><summary>{zh ? '想保留兩份？另存新歌曲' : 'Keep both versions? Save as a new song'}</summary>
            <label className="source-sync-option"><input type="radio" name={titleId} checked={direction === 'save-as'} disabled={busy} onChange={() => setDirection('save-as')} /><span>{zh ? '另存成新歌曲，保留原曲' : 'Save as a new song and keep the source'}</span></label>
            {direction === 'save-as' && <label className="source-sync-copy-title">{zh ? '新歌曲名稱' : 'New song name'}<input aria-label={zh ? '新歌曲名稱' : 'New song name'} value={newTitle} onChange={event => setNewTitle(event.target.value)} disabled={busy} /><span className="mt-1 block text-xs font-normal text-gray-500">{zh ? '使用這份歌單的譜面建立新歌曲，不更動歌單連結。' : 'Creates a new song from this setlist score without changing its link.'}</span></label>}
          </details>}
          <details className="source-sync-extra"><summary>{zh ? '更新範圍、備份與版本紀錄' : 'Update scope, backup and version history'}</summary>
            <p>{zh ? '保留 Key、個人 Capo 與顯示偏好。更新這份歌單時，保留仍有效的演出段落順序；已刪除的段落會移出順序。更新前完整備份，確認期間若有人修改，會停止更新並要求重新比對。' : 'Key, personal Capo and display preferences stay unchanged. Updating this setlist keeps valid performance section order and removes deleted sections. Previous versions are backed up; concurrent edits stop the update and require a fresh comparison.'}</p>
            <p>{zh ? '歌曲庫最後更新：' : 'Library last updated: '}{new Date(preview.sourceRevision).toLocaleString(zh ? 'zh-TW' : 'en')}</p>
            {needsChoice && preview.baseline && <div className="source-sync-history"><div><h4>{zh ? '這份歌單曾修改' : 'Changes made in this setlist'}</h4><ul>{describeSetlistSourceChanges(preview.baseline.entryContent, preview.overrideJson.songData, language).map((change,index)=><li key={index}>{change}</li>)}</ul></div><div><h4>{zh ? '歌曲庫曾修改' : 'Changes made in the library'}</h4><ul>{describeSetlistSourceChanges(preview.baseline.sourceContent, preview.source, language).map((change,index)=><li key={index}>{change}</li>)}</ul></div></div>}
          </details>
          {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
        </div>
        <footer className="source-sync-footer">{direction && <p className="source-sync-scope" aria-live="polite"><Check size={17} aria-hidden="true" /><span>{scope}</span></p>}<button type="button" disabled={busy} onClick={() => void showPreview()} className="source-sync-button">{zh ? '重新比對' : 'Refresh comparison'}</button><div><button type="button" disabled={busy} onClick={close} className="source-sync-button">{zh ? '取消' : 'Cancel'}</button><button type="button" disabled={busy || invalidated || !direction || (direction === 'save-as' ? !newTitle.trim() : !changes.length)} onClick={() => void confirm()} className="source-sync-button primary">{busy ? (zh ? '正在更新…' : 'Updating…') : confirmLabel}</button></div></footer>
      </div>
    </dialog>}
  </div>;
}
