import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'loading' | 'info';

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  description?: string;
};

type ShowOptions = {
  id?: string;
  description?: string;
  duration?: number;
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
    upsert({ id, message, variant, description: options?.description }, duration);
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
      <ToastViewport items={items} onDismiss={dismiss} />
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
    iconClass: 'text-[color:var(--color-indigo-600)] animate-spin',
    ringClass: 'ring-[color:var(--color-indigo-100)] dark:ring-[color:var(--color-indigo-900)]'
  },
  info: {
    icon: AlertCircle,
    iconClass: 'text-[color:var(--color-text-muted)]',
    ringClass: 'ring-[color:var(--color-border)]'
  }
};

const ToastViewport = ({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) => (
  <div
    aria-live="polite"
    aria-atomic="false"
    className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
  >
    <AnimatePresence initial={false}>
      {items.map((item) => {
        const styles = variantStyles[item.variant];
        const Icon = styles.icon;
        return (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', bounce: 0.18, duration: 0.28 }}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-3.5 py-3 shadow-lg shadow-black/5 ring-1 ${styles.ringClass}`}
            role={item.variant === 'error' ? 'alert' : 'status'}
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${styles.iconClass}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-[color:var(--color-text)]">{item.message}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--color-text-muted)]">{item.description}</p>
              ) : null}
            </div>
            {item.variant !== 'loading' ? (
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                className="-m-1 shrink-0 rounded-full p-1 text-[color:var(--color-text-faint)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text)]"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            ) : null}
          </motion.div>
        );
      })}
    </AnimatePresence>
  </div>
);
