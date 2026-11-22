import { useCallback, useId } from 'react';
import { Download, X } from 'lucide-react';
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
  const attachDownload = useCallback((link: HTMLAnchorElement | null) => {
    if (!link) return;
    // A binary download lets iOS hand the named PDF to other apps.
    // A PDF-typed blob can open inline in Safari instead.
    const attachment = new File([file], file.name, { type: 'application/octet-stream' });
    const url = URL.createObjectURL(attachment);
    link.href = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fileHint = standalone
    ? (zh ? '點檔名下方的「更多⋯」可選擇 LINE 或其他 App。若系統提示下載，可儲存後從「檔案」分享。'
      : 'Tap More below the filename to choose LINE or another app. If prompted to download, save the PDF and share it from Files.')
    : (zh ? '下載後，可從「檔案」將 PDF 分享給 LINE 或其他 App。'
      : 'After downloading, share the PDF from Files to LINE or another app.');
  const focus = 'touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
  return <AnimatedNativeDialog kind="modal" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm overscroll-contain rounded-3xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl backdrop:bg-stone-950/40">
    <header className="pe-10">
      <h2 id={titleId} className="text-lg font-bold">{zh ? 'PDF 已準備好' : 'PDF ready'}</h2>
      <p dir="auto" className="mt-1 text-sm text-gray-600 [overflow-wrap:anywhere]">{file.name}</p>
    </header>
    <a ref={attachDownload} download={file.name}
      className={`mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 font-semibold text-white hover:bg-gray-800 active:bg-gray-700 ${focus}`}>
      <Download aria-hidden="true" size={18} />{zh ? '開啟或下載 PDF' : 'Open or download PDF'}
    </a>
    <p className="mt-3 text-sm leading-5 text-gray-600">{fileHint}</p>
    <button type="button" aria-label={zh ? '關閉' : 'Close'} onClick={onClose}
      className={`absolute end-4 top-4 flex size-11 items-center justify-center rounded-full hover:bg-gray-100 ${focus}`}>
      <X aria-hidden="true" size={20} />
    </button>
  </AnimatedNativeDialog>;
}
