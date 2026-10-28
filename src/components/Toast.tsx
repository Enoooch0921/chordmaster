import { useUiMotion } from '../hooks/useUiMotion';
import { notificationVariants, UI_EASE_OUT, type UiMotionPreference } from '../lib/uiMotion';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'loading' | 'info';

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  description?: string;
  action?: { label: string; run: () => void };
  placement?: 'default' | 'history';
};

type ShowOptions = {
  id?: string;
  description?: string;
  duration?: number;
  action?: ToastItem['action'];
  placement?: ToastItem['placement'];
};

type ToastApi = {
  show: (variant: ToastVariant, message: string, options?: ShowOptions) => string;
  success: (message: string, options?: ShowOptions) => string;
  error: (message: string, options?: ShowOptions) => string;
  loading: (message: string, options?: ShowOptions) => string;
  info: (message: string, options?: ShowOptions) => string;
  dismiss: (id: string) => void;
  promise: <T>(
    task: Promise<T>,
    messages: { loading: string; success: string | ((value: T) => string); error: string | ((err: unknown) => string) }
  ) => Promise<T>;
};

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 3200;
const MAX_VISIBLE = 3;

let nextId = 0;
const generateId = () => `toast-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef(new Map<string, number>());

  const clearTimeoutFor = useCallback((id: string) => {
    const handle = timeoutsRef.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    clearTimeoutFor(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, [clearTimeoutFor]);

  const upsert = useCallback((item: ToastItem, duration: number | null) => {
    setItems((current) => {
      const without = current.filter((existing) => existing.id !== item.id);
      const next = [...without, item];
      // Keep newest MAX_VISIBLE; older toasts get dismissed silently.
      if (next.length > MAX_VISIBLE) {
        const overflow = next.slice(0, next.length - MAX_VISIBLE);
        overflow.forEach((stale) => clearTimeoutFor(stale.id));
        return next.slice(-MAX_VISIBLE);
      }
      return next;
    });
    clearTimeoutFor(item.id);
    if (duration !== null) {
      const handle = window.setTimeout(() => dismiss(item.id), duration);
      timeoutsRef.current.set(item.id, handle);
    }
  }, [clearTimeoutFor, dismiss]);

  useEffect(() => () => {
    timeoutsRef.current.forEach((handle) => window.clearTimeout(handle));
    timeoutsRef.current.clear();
  }, []);

  const show = useCallback((variant: ToastVariant, message: string, options?: ShowOptions): string => {
    const id = options?.id ?? generateId();
    const duration = variant === 'loading'
      ? null
      : (options?.duration ?? DEFAULT_DURATION_MS);
    upsert({ id, message, variant, description: options?.description, action: options?.action, placement: options?.placement }, duration);
    return id;
  }, [upsert]);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (message, options) => show('success', message, options),
    error: (message, options) => show('error', message, options),
    loading: (message, options) => show('loading', message, options),
    info: (message, options) => show('info', message, options),
    dismiss,
    promise: async (task, messages) => {
      const id = show('loading', messages.loading);
      try {
        const value = await task;
        const successMessage = typeof messages.success === 'function'
          ? messages.success(value)
          : messages.success;
        show('success', successMessage, { id });
        return value;
      } catch (err) {
        const errorMessage = typeof messages.error === 'function'
          ? messages.error(err)
          : messages.error;
        show('error', errorMessage, { id });
        throw err;
      }
    }
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items.filter(item => item.placement !== 'history')} onDismiss={dismiss} />
      <ToastViewport items={items.filter(item => item.placement === 'history')} onDismiss={dismiss} placement="history" />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

const variantStyles: Record<ToastVariant, { icon: typeof CheckCircle2; iconClass: string; ringClass: string }> = {
  success: {
    icon: CheckCircle2,
    iconClass: 'text-[color:var(--color-success)]',
    ringClass: 'ring-[color:var(--color-success-soft)]'
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-[color:var(--color-danger)]',
    ringClass: 'ring-[color:var(--color-danger-soft)]'
  },
  loading: {
    icon: Loader2,
    iconClass: 'text-[color:var(--color-indigo-600)] animate-spin motion-reduce:animate-none',
    ringClass: 'ring-[color:var(--color-indigo-100)] dark:ring-[color:var(--color-indigo-900)]'
  },
  info: {
    icon: AlertCircle,
    iconClass: 'text-[color:var(--color-text-muted)]',
    ringClass: 'ring-[color:var(--color-border)]'
  }
};

const ToastViewport = ({ items, onDismiss, placement = 'default' }: { items: ToastItem[]; onDismiss: (id: string) => void; placement?: ToastItem['placement'] }) => {
  const preference = useUiMotion();
  return <div data-toast-viewport={placement} aria-live="polite" aria-atomic="false"
    className={`pointer-events-none fixed z-[100] flex w-[min(92vw,360px)] flex-col gap-2 ${placement === 'history'
      ? 'left-1/2 -translate-x-1/2'
      : 'bottom-4 right-4'}`}
    style={placement === 'history' ? { top: 'calc(env(safe-area-inset-top, 0px) + 16px)' } : undefined}>
    <AnimatePresence initial={false} custom={preference}>
      {items.map(item => <ToastCard key={item.id} item={item} onDismiss={onDismiss} preference={preference} />)}
    </AnimatePresence>
  </div>;
};

function ToastCard({ item, onDismiss, preference }: { item: ToastItem; onDismiss: (id: string) => void; preference: UiMotionPreference }) {
  const present = useIsPresent();
  const styles = variantStyles[item.variant];
  const Icon = styles.icon;
  return <motion.div layout={preference.instant || preference.reduced ? false : 'position'}
    transition={{ layout: { duration: 0.16, ease: UI_EASE_OUT } }} inert={!present ? true : undefined} aria-hidden={!present ? true : undefined}>
    <motion.div data-ui-toast data-toast-id={item.id} custom={preference} variants={notificationVariants} initial="hidden" animate="visible" exit="exit"
      className={`${item.placement === 'history' ? 'pointer-events-none' : 'pointer-events-auto'} flex items-start gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-3.5 py-3 shadow-lg shadow-black/5 ring-1 ${styles.ringClass}`}
      role={item.variant === 'error' ? 'alert' : 'status'}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${styles.iconClass}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-[color:var(--color-text)]">{item.message}</p>
        {item.description ? <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--color-text-muted)]">{item.description}</p> : null}
        {item.action && <button type="button" className="ui-press pointer-events-auto mt-1 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950"
          onClick={() => { item.action?.run(); onDismiss(item.id); }}>{item.action.label}</button>}
      </div>
      {item.variant !== 'loading' ? <button type="button" onClick={() => onDismiss(item.id)}
        className="ui-press pointer-events-auto -m-1 shrink-0 rounded-full p-1 text-[color:var(--color-text-faint)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text)]"
        aria-label="Dismiss notification"><X size={14} /></button> : null}
    </motion.div>
  </motion.div>;
}
