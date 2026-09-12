import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ResponsiveDialogProps {
  title: string;
  subtitle?: string;
  closeLabel: string;
  busy?: boolean;
  children: ReactNode;
  onClose: () => void;
}

/** Full viewport on phones; a bounded, independently scrolling desktop dialog. */
export default function ResponsiveDialog({ title, subtitle, closeLabel, busy = false, children, onClose }: ResponsiveDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <dialog ref={ref} aria-labelledby={titleId} aria-modal="true" aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
      className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-full max-w-none overflow-hidden border-0 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-stone-950/40 backdrop:backdrop-blur-sm sm:h-[min(680px,90dvh)] sm:max-w-lg sm:rounded-3xl sm:border sm:border-gray-200">
      <div className="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            {subtitle ? <p className="mb-1 text-xs font-medium text-gray-500">{subtitle}</p> : null}
            <h2 id={titleId} className="break-words text-lg font-bold tracking-tight">{title}</h2>
          </div>
          <button type="button" autoFocus onClick={onClose} disabled={busy} aria-label={closeLabel} className="flex size-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-40"><X size={21} /></button>
        </header>
        {children}
      </div>
    </dialog>, document.body,
  );
}
