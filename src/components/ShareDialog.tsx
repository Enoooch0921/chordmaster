import { useState, type ReactNode } from 'react';
import { Check, Copy, Link, Share2, Users } from 'lucide-react';
import ResponsiveDialog from './ResponsiveDialog';
import type { AppLanguage } from '../types';

interface ShareDialogProps {
  language: AppLanguage;
  title: string;
  url: string;
  contacts?: ReactNode;
  sharing: boolean;
  onClose: () => void;
  onCopy: () => Promise<boolean>;
  onSystemShare?: () => Promise<boolean>;
}

export default function ShareDialog({ language, title, url, contacts, sharing, onClose, onCopy, onSystemShare }: ShareDialogProps) {
  const zh = language === 'zh';
  const [view, setView] = useState<'link' | 'contacts'>('link');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = async () => {
    setError(null);
    setCopied(false);
    try {
      if (await onCopy()) setCopied(true);
      else setError(zh ? '無法自動複製，請選取上方連結後手動複製。' : 'Select the link above and copy it manually.');
    } catch {
      setError(zh ? '無法複製連結，請再試一次。' : 'Unable to copy the link. Please try again.');
    }
  };

  return (
    <ResponsiveDialog title={title} closeLabel={zh ? '關閉分享' : 'Close sharing'} busy={sharing} onClose={onClose}>
      {contacts ? (
        <nav aria-label={zh ? '分享方式' : 'Sharing method'} className="flex shrink-0 gap-1 border-b border-gray-100 px-5 py-3">
          {(['link', 'contacts'] as const).map((tab) => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ${view === tab ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>{tab === 'link' ? <Link size={16} /> : <Users size={16} />}{tab === 'link' ? (zh ? '分享連結' : 'Link') : (zh ? '邀請聯絡人' : 'Contacts')}</button>)}
        </nav>
      ) : null}
      <div className={`${view === 'link' ? 'block' : 'hidden'} min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]`}>
        <p className="mb-5 text-sm leading-6 text-gray-500">{zh ? '複製連結，或使用系統分享傳給對方。' : 'Copy the link or share it using another app.'}</p>
        <label className="block text-xs font-semibold text-gray-600">
          {zh ? '分享連結' : 'Share link'}
          <input type="text" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-base font-normal text-gray-800 outline-none focus:border-indigo-500" />
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => void copy()} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500">{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? (zh ? '已複製' : 'Copied') : (zh ? '複製連結' : 'Copy link')}</button>
          {onSystemShare ? <button type="button" onClick={() => void onSystemShare().catch(() => setError(zh ? '無法開啟系統分享。' : 'Unable to open sharing.'))} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"><Share2 size={17} />{zh ? '系統分享' : 'Share'}</button> : null}
        </div>
        {copied ? <p role="status" className="mt-3 text-sm text-indigo-700">{zh ? '連結已複製，可以貼到訊息中傳送。' : 'Link copied. Paste it into a message to share.'}</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm leading-6 text-rose-700">{error}</p> : null}
      </div>
      {contacts ? <div className={`${view === 'contacts' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>{contacts}</div> : null}
    </ResponsiveDialog>
  );
}
