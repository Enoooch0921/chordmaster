import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileText, Share2, X } from 'lucide-react';
import type { AppLanguage } from '../types';
import AnimatedNativeDialog from './ui/AnimatedNativeDialog';

interface Props {
  file: File;
  language: AppLanguage;
  standalone: boolean;
  onClose: () => void;
}

export default function PdfShareDialog({ file, language, standalone, onClose }: Props) {
  const zh = language === 'zh';
  const titleId = useId();
  const [urls, setUrls] = useState<{ preview: string; download: string } | null>(null);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const sharing = useRef(false);
  const canShare = typeof navigator.share === 'function'
    && (!navigator.canShare || navigator.canShare({ files: [file] }));

  useEffect(() => {
    const preview = URL.createObjectURL(file);
    // Safari can display a PDF-typed blob inline even with a download attribute.
    // Keep its original bytes and filename, and request a binary download.
    const download = URL.createObjectURL(new File([file], file.name, { type: 'application/octet-stream' }));
    setUrls({ preview, download });
    return () => {
      URL.revokeObjectURL(preview);
      URL.revokeObjectURL(download);
    };
  }, [file]);

  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setShareFailed(false);
    try {
      // Keep this inside the click and send a single PDF attachment.
      await navigator.share({ files: [file] });
      onClose();
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setShareFailed(true);
    } finally {
      sharing.current = false;
    }
  };

  const fileAction = standalone
    ? (zh ? '開啟或下載 PDF' : 'Open or download PDF')
    : (zh ? '下載 PDF 檔案' : 'Download PDF file');
  const fileHint = standalone
    ? (zh ? '看到檔名後，點下方的「更多⋯」選擇 LINE 或其他 App。若系統提示下載，請下載後到「檔案」長按 PDF，選擇「分享」。'
      : 'If a file card appears, tap More below the filename to choose LINE or another app. If prompted to download, save the PDF, then press and hold it in Files and tap Share.')
    : (zh ? '要傳到 LINE 或其他 App，下載後到「檔案」長按這份 PDF，再點「分享」。'
      : 'To send the attachment to LINE or another app, download it, then press and hold the PDF in your files and tap Share.');
  const focus = 'touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
  return <AnimatedNativeDialog kind="modal" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm overscroll-contain rounded-3xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl backdrop:bg-stone-950/40">
    <header className="pe-10">
      <h2 id={titleId} className="text-lg font-bold">{zh ? 'PDF 已準備好' : 'PDF ready'}</h2>
      <p dir="auto" className="mt-1 text-sm text-gray-600 [overflow-wrap:anywhere]">{file.name}</p>
    </header>
    <div className="mt-5 grid gap-2">
      {urls && <a href={urls.download} download={file.name} onClick={() => setDownloadRequested(true)}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 font-semibold text-white hover:bg-gray-800 active:bg-gray-700 ${focus}`}>
        <Download aria-hidden="true" size={18} />{fileAction}
      </a>}
      {canShare && <button type="button" onClick={share}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 font-semibold text-gray-800 hover:bg-gray-200 active:bg-gray-300 ${focus}`}>
        <Share2 aria-hidden="true" size={18} />{zh ? '分享 PDF' : 'Share PDF'}
      </button>}
      {urls && <a href={urls.preview} target="_blank" rel="noopener" download={standalone ? file.name : undefined}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold text-gray-700 hover:bg-gray-100 ${focus}`}>
        <FileText aria-hidden="true" size={18} />{zh ? '開啟 PDF 預覽' : 'Open PDF preview'}
      </a>}
    </div>
    <p aria-live="polite" className="mt-3 text-sm leading-5 text-gray-600">
      {shareFailed && (zh ? '無法開啟分享選單。' : 'The share sheet could not open. ')}
      {fileHint}
    </p>
    {downloadRequested && <div className="mt-3 border-t border-gray-200 pt-3">
      <a href="https://line.me/R/nv/chat" target="_blank" rel="noopener noreferrer"
        className={`inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-gray-900 underline underline-offset-4 ${focus}`}>
        {zh ? '開啟 LINE 聊天室' : 'Open LINE chats'}
      </a>
      <p className="text-sm leading-5 text-gray-600">{zh ? '在聊天室點「＋」→「檔案」，選擇剛儲存的 PDF。'
        : 'In the chat, tap +, choose File, then select the saved PDF.'}</p>
    </div>}
    <button type="button" aria-label={zh ? '關閉' : 'Close'} onClick={onClose}
      className={`absolute end-4 top-4 flex size-11 items-center justify-center rounded-full hover:bg-gray-100 ${focus}`}>
      <X aria-hidden="true" size={20} />
    </button>
  </AnimatedNativeDialog>;
}
