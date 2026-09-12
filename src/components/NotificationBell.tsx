import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPortalPanel } from './useAnchoredPortalPanel';
import { Bell, ListMusic, FolderTree, Users, X } from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationBellProps {
  notifications: AppNotification[];
  labels: {
    title: string;
    close: string;
    empty: string;
    markAllRead: string;
    open: string;
    sharedSetlist: string;
    sharedProject: string;
    promoted: string;
    demoted: string;
    removedSetlist: string;
    removedProject: string;
    teamInvite: string;
    reviewInvite: string;
  };
  onOpen: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
}

// Header inbox: a bell with an unread badge and a dropdown listing
// "X shared a setlist/project with you" notifications. Opening one navigates to
// the resource (handled by the parent) and the unread state clears.
export const NotificationBell = ({ notifications, labels, onOpen, onMarkAllRead }: NotificationBellProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTriggerFocus = useRef(false);
  const close = useCallback(() => { restoreTriggerFocus.current = true; setOpen(false); }, []);
  useLayoutEffect(() => {
    // Restore focus after the portal is removed, so a pending positioning effect cannot steal it.
    if (!open && restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);
  const { panelStyle, isPositioned } = useAnchoredPortalPanel({ isOpen: open, align: 'right', triggerRef, panelRef, onRequestClose: close, zIndex: 300 });
  useEffect(() => {
    if (open && isPositioned) panelRef.current?.focus({ preventScroll: true });
  }, [open, isPositioned]);
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, close]);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
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

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[299]" onClick={close} />
          <div ref={panelRef} tabIndex={-1} role="dialog" aria-label={labels.title} style={panelStyle} className="flex max-h-[min(560px,calc(100dvh-2rem))] w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
              <span className="min-w-0 flex-1 text-base font-semibold text-gray-900">{labels.title}</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="min-h-11 rounded-lg px-2 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
                >
                  {labels.markAllRead}
                </button>
              )}
              <button type="button" onClick={close} aria-label={labels.close} className="flex size-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X size={19} /></button>
            </div>

            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs font-medium text-gray-400">{labels.empty}</div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {notifications.map((item) => {
                  const isSetlist = item.resourceType === 'setlist';
                  const isTeam = item.resourceType === 'team';
                  const isRemoval = item.type === 'access_removed';
                  const message = item.type === 'team_invite'
                    ? labels.teamInvite
                    : item.type === 'member_promoted'
                    ? labels.promoted
                    : item.type === 'member_demoted'
                      ? labels.demoted
                      : isRemoval
                        ? (isSetlist ? labels.removedSetlist : labels.removedProject)
                        : (isSetlist ? labels.sharedSetlist : labels.sharedProject);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onOpen(item);
                        setOpen(false);
                      }}
                      className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-4 text-left transition-colors hover:bg-gray-50 ${
                        item.readAt ? '' : 'bg-indigo-50/40'
                      }`}
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                        {isTeam ? <Users size={14} /> : isSetlist ? <ListMusic size={14} /> : <FolderTree size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm leading-6 text-gray-800 [overflow-wrap:anywhere]">
                          <span className="font-bold">{item.actorName || item.actorEmail}</span>{' '}
                          <span className="text-gray-600">{message}</span>
                        </div>
                        {item.resourceName && (
                          <div className="mt-1 break-words text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">{item.resourceName}</div>
                        )}
                        {!isRemoval && (
                          <div className="mt-1 text-[11px] font-semibold text-indigo-600">
                            {isTeam ? labels.reviewInvite : labels.open}
                          </div>
                        )}
                      </div>
                      {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>, document.body
      )}
    </div>
  );
};
