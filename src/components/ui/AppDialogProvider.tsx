import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, useIsPresent } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { useUiMotion } from '../../hooks/useUiMotion';
import { useModalFocus } from '../../hooks/useModalFocus';
import { backdropVariants, modalVariants } from '../../lib/uiMotion';
import { PresenceSurface } from './InteractionMotion';

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export interface PromptDialogOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  allowEmpty?: boolean;
}

export interface AppDialogApi {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
}

type DialogRequest =
  | { kind: 'confirm'; id: number; options: ConfirmDialogOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; id: number; options: PromptDialogOptions; resolve: (value: string | null) => void };

const AppDialogContext = createContext<AppDialogApi | null>(null);

const fallbackApi: AppDialogApi = {
  confirm: async (options) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(options.message) : false),
  prompt: async (options) => (typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(options.title, options.defaultValue ?? '') : null),
};

export function useAppDialog(): AppDialogApi {
  return useContext(AppDialogContext) ?? fallbackApi;
}

function DialogModal({
  request,
  onResolve,
}: {
  request: DialogRequest;
  onResolve: (id: number, result: boolean | string | null) => void;
}) {
  const present = useIsPresent();
  const preference = useUiMotion();
  const [needsTopLayer] = useState(() => typeof document !== 'undefined'
    && typeof HTMLDialogElement.prototype.showModal === 'function'
    && Boolean(document.querySelector('dialog[open]')));
  const nativeHostRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [closing, setClosing] = useState(false);
  const [value, setValue] = useState(request.kind === 'prompt' ? (request.options.defaultValue ?? '') : '');
  const active = present && !closing;

  const finish = useCallback((result: boolean | string | null) => {
    if (!active) return;
    setClosing(true);
    onResolve(request.id, result);
  }, [active, onResolve, request.id]);

  useLayoutEffect(() => {
    const host = nativeHostRef.current;
    if (!host) return;
    host.showModal();
    return () => { if (host.open) host.close(); };
  }, []);

  useModalFocus(active, panelRef, request.kind === 'confirm');

  useEffect(() => {
    if (!active || request.kind !== 'prompt') return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, request]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      finish(request.kind === 'confirm' ? false : null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, finish, request.kind]);

  const isConfirm = request.kind === 'confirm';
  const isDanger = isConfirm && request.options.tone === 'danger';
  const title = request.options.title;
  const message = request.options.message;
  const cancelLabel = request.options.cancelLabel ?? '取消';
  const confirmLabel = request.options.confirmLabel ?? (isConfirm ? '確認' : '儲存');
  const canSubmitPrompt = request.kind === 'prompt' && (request.options.allowEmpty || value.trim().length > 0);
  const dialogAttributes = {
    role: isConfirm ? 'alertdialog' : 'dialog',
    'aria-modal': true,
    'aria-labelledby': title ? titleId : undefined,
    'aria-label': title ? undefined : confirmLabel,
    'aria-describedby': message ? descriptionId : undefined,
  } as const;

  const overlay = (
    <PresenceSurface
      custom={preference}
      variants={backdropVariants}
      initial={preference.instant ? false : 'hidden'}
      animate="visible"
      exit="exit"
      inert={!active ? true : undefined}
      className="fixed inset-0 z-[7000] flex items-center justify-center bg-stone-950/42 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          finish(isConfirm ? false : null);
        }
      }}
    >
      <PresenceSurface
        ref={panelRef}
        custom={preference}
        variants={modalVariants}
        initial={preference.instant ? false : 'hidden'}
        animate="visible"
        exit="exit"
        {...(needsTopLayer ? {} : dialogAttributes)}
        onKeyDown={(event) => event.stopPropagation()}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl"
      >
        {isConfirm ? (
          <>
            <div className="flex items-start gap-3">
              {isDanger ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                  <AlertTriangle size={20} aria-hidden="true" />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                {title ? (
                  <h2 id={titleId} className="text-lg font-bold tracking-tight text-gray-900">
                    {title}
                  </h2>
                ) : null}
                <p
                  id={descriptionId}
                  className={`${title ? 'mt-2' : ''} whitespace-pre-line break-words text-sm leading-6 text-gray-600`}
                >
                  {message}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => finish(false)}
                className="ui-press inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                className={`ui-press inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
                  isDanger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmitPrompt) finish(value);
            }}
          >
            <h2 id={titleId} className="text-lg font-bold tracking-tight text-gray-900">
              {title}
            </h2>
            {message ? (
              <p id={descriptionId} className="mt-1.5 whitespace-pre-line text-sm leading-6 text-gray-600">
                {message}
              </p>
            ) : null}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={request.options.placeholder}
              aria-labelledby={titleId}
              className="mt-4 h-11 w-full rounded-xl border border-gray-300 bg-gray-50 px-3 text-base font-medium text-gray-900 outline-none transition-colors focus:border-indigo-500 focus:bg-white"
            />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => finish(null)}
                className="ui-press inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                {cancelLabel}
              </button>
              <button
                type="submit"
                disabled={!canSubmitPrompt}
                className="ui-press inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {confirmLabel}
              </button>
            </div>
          </form>
        )}
      </PresenceSurface>
    </PresenceSurface>
  );

  if (!needsTopLayer) return overlay;
  // A body portal cannot paint above a dialog opened with showModal().
  return (
    <dialog
      ref={nativeHostRef}
      {...dialogAttributes}
      aria-hidden={!active || undefined}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-transparent"
      onCancel={(event) => {
        event.preventDefault();
        finish(isConfirm ? false : null);
      }}
    >
      {overlay}
    </dialog>
  );
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const parent = useContext(AppDialogContext);
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const nextIdRef = useRef(1);
  const queueRef = useRef<DialogRequest[]>([]);
  const resolvedIdsRef = useRef(new Set<number>());
  queueRef.current = queue;

  useEffect(() => () => {
    queueRef.current.forEach((item) => {
      if (resolvedIdsRef.current.has(item.id)) return;
      resolvedIdsRef.current.add(item.id);
      if (item.kind === 'confirm') item.resolve(false);
      else item.resolve(null);
    });
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    setQueue((current) => [...current, { kind: 'confirm', id: nextIdRef.current++, options, resolve }]);
  }), []);

  const prompt = useCallback((options: PromptDialogOptions) => new Promise<string | null>((resolve) => {
    setQueue((current) => [...current, { kind: 'prompt', id: nextIdRef.current++, options, resolve }]);
  }), []);

  const resolveCurrent = useCallback((id: number, result: boolean | string | null) => {
    if (resolvedIdsRef.current.has(id)) return;
    resolvedIdsRef.current.add(id);
    const active = queueRef.current.find((item) => item.id === id);
    setQueue((current) => current.filter((item) => item.id !== id));
    if (active) {
      if (active.kind === 'confirm') active.resolve(Boolean(result));
      else active.resolve(typeof result === 'string' ? result : null);
    }
  }, []);

  const api = React.useMemo<AppDialogApi>(() => ({ confirm, prompt }), [confirm, prompt]);
  const active = queue[0] ?? null;

  if (parent) {
    return <>{children}</>;
  }

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence initial={false}>
          {active ? (
            <DialogModal key={active.id} request={active} onResolve={resolveCurrent} />
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </AppDialogContext.Provider>
  );
}
