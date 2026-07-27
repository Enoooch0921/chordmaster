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

const COMMON_SECTION_TITLES = [
  'Intro',
  'Intro 2',
  'Count-In',
  'Verse',
  'Verse 1',
  'Verse 2',
  'Verse 3',
  'Verse 4',
  'Pre-Chorus',
  'Pre-Chorus 1',
  'Pre-Chorus 2',
  'Chorus',
  'Chorus 1',
  'Chorus 2',
  'Post-Chorus',
  'Refrain',
  'Turnaround',
  'Breakdown',
  'Bridge',
  'Bridge 1',
  'Bridge 2',
  'Interlude',
  'Instrumental',
  'Instrumental Break',
  'Solo',
  'Build',
  'Tag',
  'Vamp',
  'Rap',
  'Outro',
  'Ending'
] as const;

const normalizeSectionTitleSearch = (value: string) => value
  .trim()
  .toLocaleLowerCase()
  .replace(/[\s_-]+/g, '');

const isFuzzySectionTitleSearchMatch = (query: string, title: string) => {
  if (!query) return true;
  let queryIndex = 0;
  for (const char of title) {
    if (char === query[queryIndex]) queryIndex += 1;
    if (queryIndex >= query.length) return true;
  }
  return false;
};

const getSectionTitleSearchScore = (title: string, query: string) => {
  if (!query) return 0;
  const normalizedTitle = normalizeSectionTitleSearch(title);
  if (normalizedTitle === query) return 1000;
  if (normalizedTitle.startsWith(query)) return 900;
  if (normalizedTitle.includes(query)) return 700;
  if (isFuzzySectionTitleSearchMatch(query, normalizedTitle)) return 520;
  return -1;
};

const PreviewSectionTitleEditor: React.FC<PreviewSectionTitleEditorProps> = ({
  session,
  language,
  isMobile,
  onChange,
  onDone,
  onCancel
}) => {
  const section = session.draftSong.sections.find((candidate) => candidate.id === session.target.sectionId);
  const [draft, setDraft] = React.useState(section?.title ?? '');
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(0);
  const shellRef = React.useRef<HTMLDivElement>(null);
  const finishedRef = React.useRef(false);
  const suggestionListId = React.useId();

  const suggestions = React.useMemo(() => {
    const query = normalizeSectionTitleSearch(draft);
    const songTitles = session.draftSong.sections
      .filter((candidate) => candidate.id !== session.target.sectionId)
      .map((candidate) => candidate.title?.trim() ?? '')
      .filter(Boolean);
    const seen = new Set<string>();
    const candidates = [...songTitles, ...COMMON_SECTION_TITLES]
      .filter((title) => {
        const key = title.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return getSectionTitleSearchScore(title, query) >= 0;
      })
      .sort((a, b) => {
        if (!query) return 0;
        const scoreDifference = getSectionTitleSearchScore(b, query) - getSectionTitleSearchScore(a, query);
        if (scoreDifference !== 0) return scoreDifference;
        return normalizeSectionTitleSearch(a).length - normalizeSectionTitleSearch(b).length;
      });
    return query ? candidates.slice(0, 8) : candidates;
  }, [draft, session.draftSong.sections, session.target.sectionId]);

  React.useEffect(() => {
    setDraft(section?.title ?? '');
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    finishedRef.current = false;
  }, [session.target.sectionId]);

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

  const finish = (title = draft) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDone(title);
  };

  const chooseSuggestion = (title: string) => {
    setDraft(title);
    setSuggestionsOpen(false);
    onChange(title);
    finish(title);
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
  const dropdownWidth = Math.max(width, Math.min(isMobile ? 240 : 220, window.innerWidth - left - 12));
  const estimatedDropdownHeight = Math.min(suggestions.length, 6) * (isMobile ? 42 : 34) + 30;
  const openSuggestionsAbove = top + Math.max(28, anchor.height) + estimatedDropdownHeight + 12 > window.innerHeight
    && top > estimatedDropdownHeight + 12;
  const showSuggestions = suggestionsOpen && suggestions.length > 0;

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
          setSuggestionsOpen(true);
          setActiveSuggestionIndex(0);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
            return;
          }
          if (event.key === 'ArrowDown' && suggestions.length > 0) {
            event.preventDefault();
            if (!suggestionsOpen) {
              setSuggestionsOpen(true);
              setActiveSuggestionIndex(0);
            } else {
              setActiveSuggestionIndex((index) => (index + 1) % suggestions.length);
            }
            return;
          }
          if (event.key === 'ArrowUp' && suggestions.length > 0) {
            event.preventDefault();
            if (!suggestionsOpen) {
              setSuggestionsOpen(true);
              setActiveSuggestionIndex(suggestions.length - 1);
            } else {
              setActiveSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
            }
            return;
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            const suggestion = showSuggestions ? suggestions[activeSuggestionIndex] : null;
            if (suggestion) chooseSuggestion(suggestion); else finish();
          }
        }}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={showSuggestions}
        aria-controls={showSuggestions ? suggestionListId : undefined}
        aria-activedescendant={showSuggestions ? `${suggestionListId}-${activeSuggestionIndex}` : undefined}
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
      {showSuggestions && (
        <div
          id={suggestionListId}
          role="listbox"
          aria-label={language === 'zh' ? '段落名稱建議' : 'Section title suggestions'}
          className="absolute z-[5210] overflow-y-auto rounded-xl border border-slate-200 bg-white/98 p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.24)] backdrop-blur"
          style={{
            left: 0,
            top: openSuggestionsAbove ? undefined : 'calc(100% + 6px)',
            bottom: openSuggestionsAbove ? 'calc(100% + 6px)' : undefined,
            width: dropdownWidth,
            maxHeight: isMobile ? 240 : 210
          }}
        >
          <div className="px-2 pb-1 pt-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
            {language === 'zh' ? '段落名稱' : 'Section titles'}
          </div>
          {suggestions.map((title, index) => (
            <button
              key={title.toLocaleLowerCase()}
              id={`${suggestionListId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeSuggestionIndex}
              className={`flex w-full items-center rounded-lg px-2.5 text-left font-bold transition-colors ${isMobile ? 'min-h-10 text-sm' : 'min-h-8 text-xs'} ${index === activeSuggestionIndex ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-800'}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveSuggestionIndex(index)}
              onClick={() => chooseSuggestion(title)}
            >
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PreviewSectionTitleEditor;
