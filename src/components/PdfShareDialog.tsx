import { useEffect, useId, useRef, useState } from 'react';
import { FileText, Share2, X } from 'lucide-react';
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
  const [previewUrl, setPreviewUrl] = useState('');
  const [shareFailed, setShareFailed] = useState(false);
  const sharing = useRef(false);
  const canShare = typeof navigator.share === 'function'
    && (!navigator.canShare || navigator.canShare({ files: [file] }));

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
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

  const previewHint = zh
    ? '在預覽中點「分享」。若看到「選項」，可將傳送格式設為 PDF。'
    : 'In the preview, tap Share. If Options appears, choose PDF.';
  const focus = 'touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
  return <AnimatedNativeDialog kind="modal" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm overscroll-contain rounded-3xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl backdrop:bg-stone-950/40">
    <header className="pe-10">
      <h2 id={titleId} className="text-lg font-bold">{zh ? 'PDF 已準備好' : 'PDF ready'}</h2>
      <p dir="auto" className="mt-1 text-sm text-gray-600 [overflow-wrap:anywhere]">{file.name}</p>
    </header>
    <div className="mt-5 grid gap-2">
      {canShare && <button type="button" onClick={share}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 font-semibold text-white hover:bg-gray-800 active:bg-gray-700 ${focus}`}>
        <Share2 aria-hidden="true" size={18} />{zh ? '分享 PDF' : 'Share PDF'}
      </button>}
      {previewUrl && <a href={previewUrl} target="_blank" rel="noopener" download={standalone ? file.name : undefined}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 font-semibold text-gray-800 hover:bg-gray-200 active:bg-gray-300 ${focus}`}>
        <FileText aria-hidden="true" size={18} />{zh ? '開啟 PDF 預覽' : 'Open PDF preview'}
      </a>}
    </div>
    <p aria-live="polite" className="mt-3 text-sm leading-5 text-gray-600">
      {shareFailed
        ? (zh ? '無法開啟分享選單。' : 'The share sheet could not open. ')
        : canShare && (zh ? '找不到 LINE？' : 'Can’t find your app? ')}
      {previewHint}
    </p>
    <button type="button" aria-label={zh ? '關閉' : 'Close'} onClick={onClose}
      className={`absolute end-4 top-4 flex size-11 items-center justify-center rounded-full hover:bg-gray-100 ${focus}`}>
      <X aria-hidden="true" size={20} />
    </button>
  </AnimatedNativeDialog>;
}
