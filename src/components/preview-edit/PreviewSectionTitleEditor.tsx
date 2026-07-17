import React from 'react';
import { X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import type { PreviewEditSession } from '../../lib/previewEditSession';

interface PreviewSectionTitleEditorProps {
  session: PreviewEditSession;
  language: AppLanguage;
  isMobile: boolean;
  onChange: (title: string) => void;
  onDone: (title: string) => void;
  onCancel: () => void;
}

const PreviewSectionTitleEditor: React.FC<PreviewSectionTitleEditorProps> = ({
  session,
  language,
  onChange,
  onDone,
  onCancel
}) => {
  const section = session.draftSong.sections.find((candidate) => candidate.id === session.target.sectionId);
  const [draft, setDraft] = React.useState(section?.title ?? '');
  const shellRef = React.useRef<HTMLDivElement>(null);
  const finishedRef = React.useRef(false);

  React.useEffect(() => {
    setDraft(section?.title ?? '');
    finishedRef.current = false;
  }, [section?.title, session.target.sectionId]);

  React.useEffect(() => {
    const focus = () => {
      const input = shellRef.current?.querySelector<HTMLTextAreaElement>('textarea');
      input?.focus({ preventScroll: true });
      input?.select();
    };
    focus();
    const frame = window.requestAnimationFrame(focus);
    const timeout = window.setTimeout(focus, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [session.target.anchorKey]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDone(draft);
  };

  const cancel = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onCancel();
  };

  const anchor = session.target.anchorRect;
  const width = Math.min(Math.max(56, anchor.width), Math.max(56, window.innerWidth - 24));
  const left = Math.min(Math.max(12, anchor.left), Math.max(12, window.innerWidth - width - 12));
  const top = Math.min(Math.max(12, anchor.top), Math.max(12, window.innerHeight - Math.max(32, anchor.height) - 12));

  return (
    <div
      ref={shellRef}
      data-preview-section-title-editor
      className="fixed z-[5200] flex items-stretch rounded-sm bg-white/98 shadow-[0_0_0_2px_rgba(79,70,229,0.55),0_12px_28px_rgba(15,23,42,0.2)] backdrop-blur"
      style={{ left, top, width, height: Math.max(28, anchor.height) }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) finish();
      }}
    >
      <textarea
        value={draft}
        rows={1}
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={language === 'zh' ? '段落名稱' : 'Section title'}
        placeholder={language === 'zh' ? '輸入段落名稱' : 'Section title'}
        className="min-w-0 flex-1 resize-none overflow-hidden rounded-sm border-0 bg-transparent px-1 py-1 text-center text-[11px] font-black leading-tight text-slate-900 outline-none"
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
            return;
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            finish();
          }
        }}
      />
      <button
        type="button"
        className="absolute -right-7 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow hover:text-slate-700"
        aria-label={language === 'zh' ? '取消段落名稱編輯' : 'Cancel section title edit'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={cancel}
      >
        <X size={15} />
      </button>
    </div>
  );
};

export default PreviewSectionTitleEditor;
