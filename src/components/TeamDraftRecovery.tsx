import { useEffect, useRef, useState } from 'react';
import { downloadRecoveryData, getRecoverySnapshot } from '../lib/recovery';
import type { TeamDraft } from '../lib/teamDrafts';

export default function TeamDraftRecovery({ draft, onRestore, onDiscard, error }: {
  draft: TeamDraft | null; onRestore: () => void; onDiscard: () => void; error: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [downloadError, setDownloadError] = useState(false);
  const download = async (data: unknown) => {
    try { await downloadRecoveryData(data, 'ChordMaster-team-draft.json'); }
    catch { setDownloadError(true); }
  };
  useEffect(() => {
    if (draft && !dialog.current?.open) dialog.current?.showModal();
    if (!draft && dialog.current?.open) dialog.current.close();
  }, [draft]);
  return <>
    {error && <div role="alert" className="fixed inset-x-4 top-4 z-[100] rounded-xl border border-red-200 bg-white p-4 text-sm text-red-800">團隊草稿尚未安全保存：{error}<button type="button" className="ml-3 underline" onClick={() => void download(getRecoverySnapshot())}>下載目前修改</button></div>}
    <dialog ref={dialog} aria-labelledby="team-draft-title" onCancel={(event) => event.preventDefault()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-6 text-gray-900 shadow-xl backdrop:bg-black/40">
      <h2 id="team-draft-title" className="text-lg font-bold">找到尚未同步的團隊草稿</h2>
      <p className="mt-2 text-sm">這台裝置保留了 {draft ? new Date(draft.savedAt).toLocaleString() : ''} 的修改。恢復時會保留雲端新增內容；若同一項目也被其他人修改，會再請你確認。</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={onRestore}>恢復草稿</button>
        <button type="button" className="rounded-lg border px-4 py-2" onClick={() => void download(draft)}>下載草稿備份</button>
        <button type="button" className="rounded-lg border px-4 py-2" onClick={() => {
          if (window.confirm('確定捨棄這份本機草稿，使用雲端版本？')) onDiscard();
        }}>捨棄草稿</button>
      </div>
      {downloadError && <p role="alert" className="mt-3 text-sm text-red-700">下載失敗，請保留此頁面並重試。</p>}
    </dialog>
  </>;
}
