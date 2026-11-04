import { useRef, useState, useSyncExternalStore } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { AppLanguage } from '../types';
import { appUpdates } from '../lib/appUpdates';
import './AppUpdateNotice.css';

export default function AppUpdateNotice({ language, hidden, blockedReason, prepare, onUpdatingChange, updates = appUpdates }: {
  language: AppLanguage;
  hidden?: boolean;
  blockedReason?: string;
  prepare: () => Promise<void>;
  onUpdatingChange: (updating: boolean) => void;
  updates?: typeof appUpdates;
}) {
  const ready = useSyncExternalStore(updates.subscribe, updates.getSnapshot, () => false);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const zh = language === 'zh';
  if (!ready || hidden) return null;
  const update = async () => {
    if (busyRef.current || blockedReason) return;
    busyRef.current = true; setBusy(true); setError(''); onUpdatingChange(true);
    try { await updates.apply(prepare); }
    catch (reason) { setError(reason instanceof Error ? reason.message : zh ? '更新失敗，請再試一次。' : 'Update failed. Please try again.'); }
    finally { busyRef.current = false; setBusy(false); onUpdatingChange(false); }
  };
  return <aside className={`app-update-notice${collapsed ? ' app-update-notice--collapsed' : ''}`} data-app-update-notice aria-label={zh ? '版本更新' : 'App update'}>
    {collapsed ? <button type="button" className="app-update-reopen" onClick={() => setCollapsed(false)}><Download size={16} aria-hidden="true" />{zh ? '新版本可更新' : 'Update available'}</button> : <>
      <p className="app-update-title" role="status">{zh ? '有新版本可以使用' : 'A new version is ready'}</p>
      <p className="app-update-description">{busy ? (zh ? '正在儲存並更新，請稍候…' : 'Saving and updating…') : blockedReason || (zh ? '儲存目前內容後，重新載入此分頁。' : 'Save your changes and reload this tab.')}</p>
      {error && <p className="app-update-error" role="alert">{error}</p>}
      <div className="app-update-actions">
        <button type="button" disabled={busy} onClick={() => setCollapsed(true)}>{zh ? '稍後' : 'Later'}</button>
        <button type="button" className="app-update-primary" disabled={busy || Boolean(blockedReason)} onClick={() => { void update(); }}>
          {busy ? <LoaderCircle size={16} className="app-update-spinner" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
          {busy ? (zh ? '更新中…' : 'Updating…') : (zh ? '立即更新' : 'Update now')}
        </button>
      </div>
    </>}
  </aside>;
}
