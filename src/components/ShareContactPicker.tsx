import { useState } from 'react';
import { Send, Check } from 'lucide-react';
import { ShareContact } from '../types';

interface ShareContactPickerProps {
  contacts: ShareContact[];
  loading: boolean;
  sharing: boolean;
  labels: {
    title: string;
    empty: string;
    button: string;
    syncing: string;
  };
  onShare: (userIds: string[]) => void | Promise<void>;
}

// Lets an owner re-share the current setlist/project to people who have joined
// their libraries before, granting access + an in-app notification without
// sending a fresh link. Selection state is local; it clears once a share is
// dispatched so the same people aren't accidentally re-sent.
export const ShareContactPicker = ({ contacts, loading, sharing, labels, onShare }: ShareContactPickerProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (userId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleShare = async () => {
    if (selected.size === 0 || sharing) return;
    await onShare(Array.from(selected));
    setSelected(new Set());
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
        {labels.title}
      </div>

      {loading ? (
        <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
          {labels.syncing}
        </div>
      ) : contacts.length === 0 ? (
        <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
          {labels.empty}
        </div>
      ) : (
        <>
          <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
            {contacts.map((contact) => {
              const isSelected = selected.has(contact.userId);
              return (
                <button
                  key={contact.userId}
                  type="button"
                  onClick={() => toggle(contact.userId)}
                  className={`flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    isSelected ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {contact.picture ? (
                    <img src={contact.picture} alt={contact.name} className="h-7 w-7 rounded-full border border-gray-200 object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                      {(contact.name || contact.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-gray-900">{contact.name || contact.email}</div>
                    <div className="truncate text-[11px] text-gray-500">{contact.email}</div>
                  </div>
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300 bg-white text-transparent'
                  }`}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={selected.size === 0 || sharing}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={13} />
            <span>{labels.button}{selected.size > 0 ? ` (${selected.size})` : ''}</span>
          </button>
        </>
      )}
    </div>
  );
};
