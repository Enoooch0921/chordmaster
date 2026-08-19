import React from 'react';
import { Keyboard, X } from 'lucide-react';
import type { AppLanguage } from '../types';
import { KEYBOARD_SHORTCUT_SECTIONS } from '../constants/keyboardShortcuts';

interface KeyboardShortcutsDialogProps {
  language: AppLanguage;
  onClose: () => void;
}

const keyClassName = 'inline-flex min-h-6 items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-black leading-none text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.08)]';

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({ language, onClose }) => {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const title = language === 'zh' ? '快捷鍵' : 'Keyboard Shortcuts';
  const subtitle = language === 'zh'
    ? '整理目前可用的鍵盤操作；按 ? 或 Ctrl/Cmd + / 可重新開啟。'
    : 'A map of the keyboard actions currently available. Press ? or Ctrl/Cmd + / to reopen it.';

  return (
    <div
      data-keyboard-shortcuts-dialog
      className="fixed inset-0 z-[6200] flex items-center justify-center bg-slate-950/45 px-3 py-5 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[min(860px,calc(100dvh-2.5rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.32)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500">
              <Keyboard size={15} />
              <span>{language === 'zh' ? '操作速查' : 'Reference'}</span>
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
            aria-label={language === 'zh' ? '關閉快捷鍵' : 'Close shortcuts'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {KEYBOARD_SHORTCUT_SECTIONS.map((section) => (
              <section key={section.id} className="min-w-0">
                <h3 className="text-sm font-black tracking-tight text-slate-950">{section.title[language]}</h3>
                {section.description ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">{section.description[language]}</p>
                ) : null}
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                  {section.shortcuts.map((shortcut, index) => (
                    <div
                      key={`${section.id}-${shortcut.keys.join('-')}-${shortcut.action.en}`}
                      className={`grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] ${index === 0 ? '' : 'border-t border-slate-100'}`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {shortcut.keys.map((key) => (
                          <kbd key={key} className={keyClassName}>{key}</kbd>
                        ))}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold leading-5 text-slate-800">{shortcut.action[language]}</div>
                        {shortcut.context ? (
                          <div className="mt-0.5 text-xs leading-5 text-slate-500">{shortcut.context[language]}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default KeyboardShortcutsDialog;
