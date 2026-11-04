import { AnimatePresence } from 'motion/react';
import AnimatedNativeDialog from './ui/AnimatedNativeDialog';
import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, Download, X } from 'lucide-react';
import { compareSetlistSourceScores, hasLyricsTextChange } from '../lib/setlistSourceComparison';
import './SetlistSourceSyncControl.css';
import SourceScoreComparison, { SourceScoreHistory } from './SourceScoreComparison';
import { downloadRecoveryData } from '../lib/recovery';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AppLanguage } from '../types';
import { hasSetlistSourceScoreChange, describeSetlistSourceChanges, previewSetlistSourceSync, reconcileSetlistSource,
  type SetlistSourceDirection, type SetlistSourceReconciliation, type SetlistSourceStatus, type SetlistSourceSyncPreview } from '../lib/setlistSourceSync';

export default function SetlistSourceSyncControl({ libraryId, entryId, language, status, prepare, onReconciled, onSaveAs, loadPreview, reconcile, compact = false }: {
  libraryId: string; entryId: string; language: AppLanguage; status: SetlistSourceStatus; compact?: boolean;
  prepare: () => Promise<unknown>; onReconciled: (result: SetlistSourceReconciliation) => void;
  onSaveAs?: (preview: SetlistSourceSyncPreview, title: string, id: string) => Promise<void>;
  loadPreview?: () => Promise<SetlistSourceSyncPreview>;
  reconcile?: (preview: SetlistSourceSyncPreview, direction: SetlistSourceDirection) => Promise<SetlistSourceReconciliation>;
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
  const [downloading, setDownloading] = useState(false);
  const [backupError, setBackupError] = useState('');
  const backupDetails = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
  const previewStatus = preview && !hasSetlistSourceScoreChange(preview.source, preview.overrideJson.songData) ? 'aligned' : preview?.status;
  const needsChoice = previewStatus === 'conflict' || previewStatus === 'unknown';
  const changes = preview && previewStatus !== 'aligned' ? direction === 'to-setlist'
    ? describeSetlistSourceChanges(preview.overrideJson.songData, preview.source, language)
    : describeSetlistSourceChanges(preview.source, preview.overrideJson.songData, language) : [];
  const showPreview = async () => {
    setBusy(true); setError(''); setBackupError(''); setMessage(''); setInvalidated(true); setDirection('');
    try {
      await prepare();
      if (!mounted.current) return;
      const next = await (loadPreview ? loadPreview() : previewSetlistSourceSync(libraryId, entryId));
      if (mounted.current) {
        setPreview(next); setInvalidated(false);
        copyId.current ??= crypto.randomUUID();
        setNewTitle(current => current || `${next.overrideJson.songData.title}${zh ? '（歌單版）' : ' (Setlist version)'}`);
        setDirection(!hasSetlistSourceScoreChange(next.source, next.overrideJson.songData) ? '' : next.status === 'setlist-changed' ? 'to-library' : next.status === 'source-newer' ? 'to-setlist' : '');
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
      const result = await (reconcile ?? reconcileSetlistSource)(preview, direction);
      if (!mounted.current) return;
      onReconciled(result); setPreview(null);
      setMessage(direction === 'to-setlist'
        ? (zh ? `已從歌曲庫更新「${preview.setlistName}」的譜面。歌曲庫保持不變。` : `Updated “${preview.setlistName}” from the library. The library is unchanged.`)
        : (zh ? `已用「${preview.setlistName}」的版本更新歌曲庫。其他歌單保持不變。` : `Updated the library from “${preview.setlistName}”. Other setlists are unchanged.`));
    } catch (error) {
      if (mounted.current) { setError(String((error as { message?: string })?.message ?? error)); setInvalidated(true); }
    } finally { if (mounted.current) setBusy(false); }
  };
  const rows = useMemo(() => preview ? compareSetlistSourceScores(preview.source, preview.overrideJson.songData, language, true) : [], [preview, language]);
  const renderModifiedTime = (value: string | null | undefined) => {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime())
      ? <time dateTime={date.toISOString()}>{date.toLocaleString(zh ? 'zh-TW' : 'en', {
          year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
          hourCycle: 'h23', timeZoneName: 'short'
        })}</time>
      : <span>{zh ? '尚無修改時間紀錄' : 'Modification time not recorded'}</span>;
  };
  const replacing = !invalidated && (direction === 'to-setlist' || direction === 'to-library');
  const versionRole = (side: 'library' | 'setlist') => {
    if (invalidated) return zh ? '待重新比對' : 'Refresh comparison';
    if (previewStatus === 'aligned') return zh ? '內容相同' : 'Scores match';
    if (direction === 'save-as') return side === 'library' ? (zh ? '保留原曲' : 'Original kept') : (zh ? '另存為新歌曲' : 'Save as a new song');
    if (!direction) return zh ? '尚未選擇' : 'Not selected';
    const adopted = side === 'library' ? direction === 'to-setlist' : direction === 'to-library';
    return adopted ? (zh ? '取用這份譜面' : 'Use this score') : (zh ? '這份譜面將被覆蓋' : 'This score will be replaced');
  };
  const routeLabel = invalidated ? (zh ? '請重新比對後再選擇更新方向' : 'Refresh before choosing a direction')
    : replacing ? (direction === 'to-setlist' ? (zh ? '歌曲庫 → 歌單' : 'Library → Setlist') : (zh ? '歌曲庫 ← 歌單' : 'Library ← Setlist'))
    : direction === 'save-as' ? (zh ? '另存新歌曲，保留兩份原版本' : 'Save a new song; keep both originals')
    : previewStatus === 'aligned' ? (zh ? '譜面內容相同' : 'Scores match') : (zh ? '請在下方選擇更新方向' : 'Choose an update direction below');
  const confirmLabel = previewStatus === 'aligned' ? (zh ? '無須更新' : 'No update needed') : direction === 'to-setlist' ? (zh ? '用歌曲庫版本覆蓋此歌單' : 'Replace setlist score with library version')
    : direction === 'to-library' ? (zh ? '用歌單版本覆蓋歌曲庫' : 'Replace library score with setlist version')
    : direction === 'save-as' ? (zh ? '確認另存新歌曲' : 'Save as a new song')
    : (zh ? '請先選擇更新方向' : 'Choose an update direction');
  const scope = invalidated ? (zh ? '比對已失效，請重新比對後再確認。' : 'This comparison is out of date. Refresh before confirming.')
    : direction === 'to-setlist'
      ? (zh ? `將用歌曲庫版本，覆蓋「${preview?.setlistName}」中這首歌的譜面。` : `Replace this song’s score in “${preview?.setlistName}” with the library version.`)
      : direction === 'to-library'
        ? (zh ? `將用「${preview?.setlistName}」的譜面，覆蓋歌曲庫中的這首歌。` : `Replace this song’s library score with the version from “${preview?.setlistName}”.`)
        : (zh ? '以這份歌單的譜面建立新歌曲，保留兩份原版本。' : 'Create a new song from this setlist score and keep both originals.');
  const openBackups = () => {
    const details = backupDetails.current;
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ block: 'start' });
    details.querySelector('summary')?.focus({ preventScroll: true });
  };
  const downloadBackup = async (side: 'library' | 'setlist') => {
    if (!preview || downloading) return;
    setDownloading(true); setBackupError('');
    const original = side === 'library' ? preview.source : preview.overrideJson.songData;
    const label = side === 'library' ? (zh ? '歌曲庫備份' : 'Library backup') : (zh ? `歌單備份 · ${preview.setlistName}` : `Setlist backup · ${preview.setlistName}`);
    try {
      // One song per file uses the existing append-single import path. A fresh
      // identity prevents importing a backup from replacing the current source.
      await downloadRecoveryData({ version: 1, exportedAt: Date.now(),
        songs: [{ ...original, id: crypto.randomUUID(), title: `${original.title}（${label}）` }],
        comparison: { side, sourceSongId: preview.source.id, entryId: preview.entryId, setlistName: preview.setlistName, originalTitle: original.title }
      }, `ChordMaster-${side}-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    } catch { if (mounted.current) setBackupError(zh ? '備份下載失敗，請再試一次。' : 'Backup download failed. Please try again.'); }
    finally { if (mounted.current) setDownloading(false); }
  };
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
    <AnimatePresence initial={false}>{preview && <AnimatedNativeDialog key="comparison" kind="modal" ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) close(); }} className="source-sync-dialog">
      <div className="source-sync-layout">
        <header className="source-sync-heading"><div>
          <h2 id={titleId}>{previewStatus === 'aligned' ? (zh ? '譜面內容相同' : 'Scores match') : needsChoice ? (zh ? '比對兩份譜面' : 'Compare the two scores') : preview.status === 'source-newer' ? (zh ? '從歌曲庫更新此歌單' : 'Update this setlist from library') : (zh ? '用歌單版本更新歌曲庫' : 'Update library from this setlist')}</h2>
          <p title={`${preview.overrideJson.songData.title} · ${preview.setlistName}`}>{preview.overrideJson.songData.title} · {preview.setlistName}</p>
        </div><button type="button" disabled={busy} onClick={close} aria-label={zh ? '關閉比對' : 'Close comparison'} className="source-sync-close"><X size={20} /></button></header>
        <div className="source-sync-pinned" data-sync-direction={invalidated ? 'invalidated' : direction || 'unselected'} role="group" aria-label={routeLabel}>
          <div className="source-sync-version" data-sync-version="library" data-adopted={replacing && direction === 'to-setlist' || undefined}>
            <strong>{zh ? '歌曲庫' : 'Library'}</strong><span>{versionRole('library')}</span>
          </div>
          {replacing && <span className="source-sync-direction-arrow" aria-hidden="true">{direction === 'to-setlist' ? <ArrowRight size={30} /> : <ArrowLeft size={30} />}</span>}
          <div className="source-sync-version" data-sync-version="setlist" data-adopted={replacing && direction === 'to-library' || undefined}>
            <strong title={preview.setlistName}>{zh ? '歌單' : 'Setlist'} · {preview.setlistName}</strong><span>{versionRole('setlist')}</span>
          </div>
          <span className="sr-only" role="status">{routeLabel}</span>
        </div>
        <div className="source-sync-body">
          <p className="source-sync-state">{needsChoice
            ? (zh ? '先比較目前兩份版本，再決定取用哪一份。系統不會自動合併兩邊的修改。' : 'Compare the current versions, then choose which to use. Changes from both sides are not merged automatically.')
            : statusLabel(previewStatus ?? preview.status)}</p>
          {preview.source.lyricsDoc || preview.overrideJson.songData.lyricsDoc ? <p className="source-sync-record-note mb-3" data-source-lyrics-summary>{hasLyricsTextChange(preview.source, preview.overrideJson.songData)
            ? (zh ? '歌詞文字有變更，下方僅列出改動的行。' : 'Lyrics text changed. Only changed lines are listed below.')
            : (zh ? '歌詞文字相同；語言或段落設定的差異會另行列出。' : 'Lyrics text matches. Language or section settings are listed separately.')}</p> : null}
          <h3 className="source-sync-difference-title">{zh ? '兩份版本的差異' : 'Differences between versions'}<span>{rows.length} {zh ? '項' : 'changes'}</span></h3>
          <div className="source-comparison-legend" aria-label={zh ? '差異標記' : 'Difference colors'}><span data-diff-side="library">{zh ? '歌曲庫差異' : 'Library differences'}</span><span data-diff-side="setlist">{zh ? '歌單差異' : 'Setlist differences'}</span></div>
          <div className="source-comparison" role="table" aria-label={zh ? '歌曲庫與歌單目前的譜面差異' : 'Current library and setlist differences'}>
            <div className="sr-only" role="row"><div role="columnheader">{zh ? '歌曲庫版本' : 'Library version'} {versionRole('library')}</div><div role="columnheader">{zh ? `歌單 · ${preview.setlistName}` : `Setlist · ${preview.setlistName}`} {versionRole('setlist')}</div></div>
            <div className="source-comparison-row source-comparison-modified" role="rowgroup">
              <div className="source-comparison-label" aria-hidden="true">{zh ? '最後修改時間' : 'Last modified'}</div>
              <div className="source-comparison-values" role="row" aria-label={zh ? '最後修改時間' : 'Last modified'}>
                <div role="cell">{renderModifiedTime(preview.sourceRevision)}</div>
                <div role="cell">{renderModifiedTime(preview.setlistScoreUpdatedAt)}</div>
              </div>
            </div>
            {rows.map((row,index) => <div key={index} className="source-comparison-row" role="rowgroup"><div className="source-comparison-label" aria-hidden="true">{row.label}</div><div className="source-comparison-values" role="row" aria-label={row.label}><div role="cell" className={replacing && direction === 'to-setlist' ? 'adopted' : undefined}><SourceScoreComparison row={row} side="library" language={language} /></div><div role="cell" className={!invalidated && (direction === 'to-library' || direction === 'save-as') ? 'adopted' : undefined}><SourceScoreComparison row={row} side="setlist" language={language} /></div></div></div>)}
            {!rows.length && <p className="p-4 text-sm text-gray-500">{changes.length ? (zh ? '目前顯示的譜面內容相同，但編排記錄不同。' : 'The displayed scores match, but their arrangement records differ.') : (zh ? '譜面內容相同，無須更新。' : 'The scores match. No update is needed.')}</p>}
          </div>
          {!preview.setlistScoreUpdatedAt && <p className="source-sync-record-note">{zh ? '舊版歌單未記錄這首歌的修改時間；之後修改譜面時會自動記錄。' : 'Older setlists did not record this song’s modification time. Future score edits will record it automatically.'}</p>}
          {needsChoice && <fieldset className="source-sync-options"><legend>{zh ? '選擇更新方向' : 'Choose an update direction'}</legend>
            <label className="source-sync-option"><input type="radio" name={titleId} checked={direction === 'to-setlist'} disabled={busy} onChange={() => setDirection('to-setlist')} /><span><strong>{zh ? '歌曲庫' : 'Library'}<ArrowRight size={16} aria-hidden="true" />{preview.setlistName}</strong><small>{zh ? '取用歌曲庫版本，更新這份歌單' : 'Use the library version to update this setlist'}</small></span></label>
            <label className="source-sync-option"><input type="radio" name={titleId} checked={direction === 'to-library'} disabled={busy} onChange={() => setDirection('to-library')} /><span><strong>{preview.setlistName}<ArrowRight size={16} aria-hidden="true" />{zh ? '歌曲庫' : 'Library'}</strong><small>{zh ? '取用歌單版本，更新歌曲庫原曲' : 'Use this setlist version to update the library source'}</small></span></label>
          </fieldset>}
          {onSaveAs && <details className="source-sync-extra" open={direction === 'save-as' ? true : undefined}><summary>{zh ? '想保留兩份？另存新歌曲' : 'Keep both versions? Save as a new song'}</summary>
            <label className="source-sync-option"><input type="radio" name={titleId} checked={direction === 'save-as'} disabled={busy} onChange={() => setDirection('save-as')} /><span>{zh ? '另存成新歌曲，保留原曲' : 'Save as a new song and keep the source'}</span></label>
            {direction === 'save-as' && <label className="source-sync-copy-title">{zh ? '新歌曲名稱' : 'New song name'}<input aria-label={zh ? '新歌曲名稱' : 'New song name'} value={newTitle} onChange={event => setNewTitle(event.target.value)} disabled={busy} /><span className="mt-1 block text-xs font-normal text-gray-500">{zh ? '使用這份歌單的譜面建立新歌曲，不更動歌單連結。' : 'Creates a new song from this setlist score without changing its link.'}</span></label>}
          </details>}
          <details ref={backupDetails} className="source-sync-extra"><summary>{zh ? '更新範圍、備份與版本紀錄' : 'Update scope, backup and version history'}</summary>
            <p>{zh ? '保留 Key、個人 Capo 與顯示偏好。更新這份歌單時，保留仍有效的演出段落順序；已刪除的段落會移出順序。更新前完整備份，確認期間若有人修改，會停止更新並要求重新比對。' : 'Key, personal Capo and display preferences stay unchanged. Updating this setlist keeps valid performance section order and removes deleted sections. Previous versions are backed up; concurrent edits stop the update and require a fresh comparison.'}</p>
            <p>{zh ? '也可下載目前比對的版本，之後從個人曲庫匯入成新歌曲。' : 'You can also download either reviewed version and import it into your personal library as a new song.'}</p>
            <div className="source-sync-backup-actions">
              <button type="button" className="source-sync-button" disabled={busy || downloading} onClick={() => void downloadBackup('library')}><Download size={16} aria-hidden="true" />{zh ? '下載歌曲庫備份' : 'Download library backup'}</button>
              <button type="button" className="source-sync-button" disabled={busy || downloading} onClick={() => void downloadBackup('setlist')}><Download size={16} aria-hidden="true" />{zh ? '下載歌單備份' : 'Download setlist backup'}</button>
            </div>
            {backupError && <p role="alert">{backupError}</p>}
            {needsChoice && preview.baseline && <div className="source-sync-history"><div><h4>{zh ? '這份歌單曾修改' : 'Changes made in this setlist'}</h4><SourceScoreHistory before={preview.baseline.entryContent} after={preview.overrideJson.songData} language={language} /></div><div><h4>{zh ? '歌曲庫曾修改' : 'Changes made in the library'}</h4><SourceScoreHistory before={preview.baseline.sourceContent} after={preview.source} language={language} /></div></div>}
          </details>
          {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
        </div>
        <footer className="source-sync-footer">
          {(direction || invalidated) && <p className="source-sync-scope" aria-live="polite">{replacing && <Check size={17} aria-hidden="true" />}<span>{scope}</span></p>}
          <div className="source-sync-backup-note"><span>{replacing ? (zh ? '更新前會保留版本備份' : 'Previous versions are backed up before updating') : (zh ? '可先另存目前的兩份版本' : 'You can save copies of both current versions')}</span><button type="button" onClick={openBackups}>{zh ? '備份選項' : 'Backup options'}</button></div>
          <div className="source-sync-confirm-actions"><button type="button" disabled={busy} onClick={() => void showPreview()} className="source-sync-button">{zh ? '重新比對' : 'Refresh comparison'}</button><button type="button" disabled={busy} onClick={close} className="source-sync-button">{zh ? '取消' : 'Cancel'}</button><button type="button" disabled={busy || invalidated || !direction || (direction === 'save-as' ? !newTitle.trim() : !changes.length)} onClick={() => void confirm()} className="source-sync-button primary">{busy ? (zh ? '正在更新…' : 'Updating…') : confirmLabel}</button></div>
        </footer>
      </div>
    </AnimatedNativeDialog>}</AnimatePresence>
  </div>;
}
