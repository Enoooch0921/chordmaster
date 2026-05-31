import { useState } from 'react';
import { Bell, ListMusic, FolderTree } from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationBellProps {
  notifications: AppNotification[];
  labels: {
    title: string;
    empty: string;
    markAllRead: string;
    open: string;
    sharedSetlist: string;
    sharedProject: string;
  };
  onOpen: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
}

// Header inbox: a bell with an unread badge and a dropdown listing
// "X shared a setlist/project with you" notifications. Opening one navigates to
// the resource (handled by the parent) and the unread state clears.
export const NotificationBell = ({ notifications, labels, onOpen, onMarkAllRead }: NotificationBellProps) => {
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
        aria-label={labels.title}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">{labels.title}</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-[11px] font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
                >
                  {labels.markAllRead}
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs font-medium text-gray-400">{labels.empty}</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((item) => {
                  const isSetlist = item.resourceType === 'setlist';
                  const message = isSetlist ? labels.sharedSetlist : labels.sharedProject;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onOpen(item);
                        setOpen(false);
                      }}
                      className={`flex w-full items-start gap-2.5 border-b border-gray-50 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                        item.readAt ? '' : 'bg-indigo-50/40'
                      }`}
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                        {isSetlist ? <ListMusic size={14} /> : <FolderTree size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs leading-snug text-gray-800">
                          <span className="font-bold">{item.actorName || item.actorEmail}</span>{' '}
                          <span className="text-gray-600">{message}</span>
                        </div>
                        {item.resourceName && (
                          <div className="mt-0.5 truncate text-[11px] font-semibold text-gray-900">{item.resourceName}</div>
                        )}
                        <div className="mt-1 text-[11px] font-semibold text-indigo-600">{labels.open}</div>
                      </div>
                      {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
