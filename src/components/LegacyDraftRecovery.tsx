import { useState } from 'react';
import { loadPendingSync, savePendingSync } from '../lib/workspace';
import { mergeWorkspaceByUpdatedAt } from '../lib/workspaceMerge';
import { downloadRecoveryData } from '../lib/recovery';

export default function LegacyDraftRecovery({ userId, libraryId, account, enabled }: {
  userId?: string; libraryId: string | null; account?: string; enabled: boolean;
}) {
  const [legacy, setLegacy] = useState(() => loadPendingSync());
  const [error, setError] = useState<string | null>(null);
  if (!legacy || !enabled || !userId || !libraryId) return null;
  return <aside role="status" className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-xl rounded-xl border border-amber-200 bg-white p-4 text-sm text-gray-900 shadow-lg">
    <p>找到舊版尚未同步的備份。請確認它屬於目前帳號（{account || userId}），再恢復到個人區。</p>
    <div className="mt-3 flex flex-wrap gap-3">
      <button type="button" className="font-bold text-indigo-700" onClick={() => {
        if (!window.confirm(`確定將這份舊版備份恢復到目前帳號 ${account || userId} 的個人區？`)) return;
        try {
          const scope = { userId, libraryId };
          const queued = loadPendingSync(scope);
          const merged = queued ? mergeWorkspaceByUpdatedAt(queued, legacy) : legacy;
          savePendingSync({ ...merged, ...scope, savedAt: Date.now(), deletions: queued?.deletions });
          savePendingSync(null);
          window.location.reload();
        } catch (cause) { setError(String(cause)); }
      }}>確認帳號並恢復</button>
      <button type="button" className="underline" onClick={async () => {
        try { await downloadRecoveryData(legacy, 'ChordMaster-legacy-draft.json'); }
        catch (cause) { setError(String(cause)); }
      }}>下載備份</button>
      <button type="button" onClick={() => setLegacy(null)}>稍後處理</button>
    </div>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </aside>;
}
