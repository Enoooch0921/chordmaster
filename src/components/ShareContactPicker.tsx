import { useState } from 'react';
import { Send, Check, Search, LoaderCircle } from 'lucide-react';
import type { AppLanguage, ShareContact } from '../types';

interface ShareContactPickerProps {
  language: AppLanguage;
  contacts: ShareContact[];
  loading: boolean;
  sharing: boolean;
  labels: { title: string; empty: string; button: string; syncing: string };
  onShare: (userIds: string[]) => void | number | Promise<void | number>;
}

export const ShareContactPicker = ({ language, contacts, loading, sharing, labels, onShare }: ShareContactPickerProps) => {
  const zh = language === 'zh';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = sharing || submitting;
  const selectedIds = contacts.filter((contact) => selected.has(contact.userId)).map((contact) => contact.userId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleContacts = contacts.filter((contact) => `${contact.name} ${contact.email}`.toLocaleLowerCase().includes(normalizedQuery));

  const toggle = (userId: string) => {
    setMessage(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };
  const handleShare = async () => {
    if (selectedIds.length === 0 || busy) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await onShare(selectedIds);
      const count = typeof result === 'number' ? result : selectedIds.length;
      setMessage(zh ? `已分享給 ${count} 人` : `Shared with ${count} ${count === 1 ? 'person' : 'people'}`);
      setSelected(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (zh ? '分享失敗，請再試一次。' : 'Sharing failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-label={labels.title} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-3 pt-4">
        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 focus-within:border-indigo-500">
          <Search size={17} className="shrink-0 text-gray-400" />
          <input aria-label={zh ? '搜尋聯絡人' : 'Search contacts'} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜尋姓名或信箱' : 'Search name or email'} className="min-w-0 flex-1 bg-transparent text-base outline-none" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
        {loading ? <p role="status" className="py-8 text-center text-sm text-gray-500">{labels.syncing}</p> : contacts.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{labels.empty}</p> : visibleContacts.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{zh ? '沒有符合的聯絡人' : 'No matching contacts'}</p> : (
          <div className="divide-y divide-gray-100">
            {visibleContacts.map((contact) => {
              const isSelected = selected.has(contact.userId);
              return (
                <button key={contact.userId} type="button" onClick={() => toggle(contact.userId)} disabled={busy} aria-pressed={isSelected} className={`flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors disabled:opacity-50 ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{(contact.name || contact.email || '?').slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-gray-900">{contact.name || contact.email}</span><span className="mt-0.5 block break-all text-xs leading-5 text-gray-500">{contact.email}</span></span>
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 text-transparent'}`}><Check size={13} strokeWidth={3} /></span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <footer className="shrink-0 border-t border-gray-100 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {message ? <p role="status" className="mb-2 text-sm text-indigo-700">{message}</p> : null}
        {error ? <p role="alert" className="mb-2 max-h-24 overflow-y-auto whitespace-pre-line break-words text-sm text-rose-700">{error}</p> : null}
        <button type="button" onClick={() => void handleShare()} disabled={selectedIds.length === 0 || busy || loading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400">
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
          {labels.button}{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
        </button>
      </footer>
    </section>
  );
};
