import { LYRICS_BOOK_FONT } from '../utils/lyricsBook';
import { formatLyricsForDisplay } from '../utils/lyricsDisplay';
import { getSectionColor } from '../utils/musicUtils';
import { getSectionBadgeStyle } from '../utils/sectionBadgeStyle';
import React from 'react';
import type { Song, AppLanguage, LyricsBlock } from '../types';
import { getLyricsBlocks, getLyricsLanguage, newLyricsBlock, paginateLyrics, updateLyricsBlocks, type LyricsFragment, type LyricsLanguage, type LyricsPage } from '../utils/lyricsDocument';
import LyricsDocEditor from './LyricsDocEditor';
import { measureLyricsText, type LyricsTextRow } from '../utils/lyricsMeasurement';
import { lyricsSectionLabel, LYRICS_SECTION_NAMES, DEFAULT_LYRICS_FONT_SIZE, DEFAULT_LYRICS_LINE_HEIGHT, LYRICS_SECTION_HEADING_HEIGHT } from '../utils/lyricsSections';

interface LyricsSheetProps {
  song: Song;
  language: AppLanguage;
  onChange?: (song: Song) => void;
  reading?: boolean;
  onReadingChange?: (reading: boolean) => void;
  exportMode?: boolean;
}
const buttonClass = 'rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-indigo-50 disabled:opacity-35';
const fieldsFor = (display: LyricsLanguage): ('chinese' | 'english')[] => display === 'bilingual' ? ['english', 'chinese'] : [display];
// One full-width character; keep Verse and unlabelled lyrics flush left.
const lyricsIndent = (marker: string, fontSize: number) => {
  const label = lyricsSectionLabel(marker);
  return label && !/^Verse(?:\s|$)/i.test(label) ? fontSize : 0;
};

export function InlineLyrics({ value, label, editable, onFocus, onFinish }: {
  value: string; label: string; editable: boolean;
  onFocus: () => void; onFinish: (value: string) => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = React.useState<string | null>(null);
  const initialCaret = React.useRef<number | null>(null);
  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = '0px';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  };
  React.useLayoutEffect(() => {
    resize();
    if (draft !== null && initialCaret.current !== null && ref.current) {
      ref.current.setSelectionRange(initialCaret.current, initialCaret.current);
      initialCaret.current = null;
    }
  }, [draft]);
  if (!editable) return <div className="lyrics-text">{value || '\u00a0'}</div>;
  return <div className="relative min-w-0">
    {draft === null ? (
      <button type="button" aria-label={label}
        onPointerDown={event => {
          const browserDocument = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
          const caret = browserDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
          if (caret && event.currentTarget.contains(caret.startContainer)) {
            const prefix = document.createRange();
            prefix.selectNodeContents(event.currentTarget);
            prefix.setEnd(caret.startContainer, caret.startOffset);
            initialCaret.current = Math.min(value.length, prefix.toString().length);
          } else initialCaret.current = value.length;
        }}
        onClick={() => { onFocus(); setDraft(value); }}
        className="lyrics-text block w-full cursor-text rounded text-left outline-none hover:bg-indigo-50/60 focus-visible:ring-2 focus-visible:ring-indigo-400">
        {value || <span data-preview-only-control className="text-stone-400">{label}</span>}
      </button>
    ) : (
      <textarea ref={ref} autoFocus aria-label={label} value={draft} rows={1}
        className="lyrics-text block w-full resize-none overflow-hidden rounded bg-indigo-50/40 outline-none ring-2 ring-indigo-300"
        onChange={e => setDraft(e.target.value)}
        onBlur={e => { onFinish(e.currentTarget.value); setDraft(null); }}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') { e.preventDefault(); setDraft(null); onFinish(value); }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    )}
  </div>;
}

export default function LyricsSheet({ song, language, onChange, reading: controlledReading, onReadingChange, exportMode = false }: LyricsSheetProps) {
  const zh = language === 'zh';
  const doc = song.lyricsDoc;
  const blocks = React.useMemo(() => getLyricsBlocks(doc), [doc]);
  const formattedBlocks = React.useMemo(() => Object.fromEntries(blocks.map(block => [block.id, { chinese: formatLyricsForDisplay(block.chinese), english: formatLyricsForDisplay(block.english) }])), [blocks]);
  const [localReading, setLocalReading] = React.useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const reading = !exportMode && (controlledReading ?? localReading);
  const [displayOverride, setDisplayOverride] = React.useState<LyricsLanguage>();
  const display = displayOverride ?? getLyricsLanguage(doc);
  const fields = fieldsFor(display);
  const [fontOverride, setFontOverride] = React.useState<number>();
  const [lineOverride, setLineOverride] = React.useState<number>();
  const [readingFontSize, setReadingFontSize] = React.useState(24);
  const [readingLineHeight, setReadingLineHeight] = React.useState(DEFAULT_LYRICS_LINE_HEIGHT);
  const fontSize = reading ? readingFontSize : (fontOverride ?? doc?.fontSize ?? DEFAULT_LYRICS_FONT_SIZE);
  const lineHeight = reading ? readingLineHeight : (lineOverride ?? doc?.lineHeight ?? DEFAULT_LYRICS_LINE_HEIGHT);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [pairTarget, setPairTarget] = React.useState('');
  const measureRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const [pages, setPages] = React.useState<LyricsPage[]>([{ columns: [[]] }]);
  const [textRows, setTextRows] = React.useState<Record<string, Partial<Record<'chinese' | 'english', LyricsTextRow[]>>>>({});
  const selected = blocks.find(block => block.id === selectedId);
  const selectedLabel = lyricsSectionLabel(selected?.marker ?? '');
  const selectedType = selectedLabel.replace(/ \d+$/, '');
  const nextVerse = Math.max(0, ...blocks.map(block => Number(lyricsSectionLabel(block.marker).match(/^Verse (\d+)$/)?.[1]) || 0)) + 1;
  const columnCount = display === 'bilingual' ? 1 : 2;
  const textWidth = (728 - 32) / 2;
  const visibleBlocks = blocks.filter(block => onChange || fields.some(field => block[field].trim()));
  const source = Array.from(new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))).join(' / ');

  const save = (next: LyricsBlock[]) => onChange?.({ ...song, lyricsDoc: updateLyricsBlocks(doc, next) });
  const patchSelected = (patch: Partial<LyricsBlock>) => save(blocks.map(block => block.id === selectedId ? { ...block, ...patch } : block));
  const selectBlock = (id: string) => { setSelectedId(id); setPairTarget(''); };
  const setDisplay = (value: LyricsLanguage) => {
    if (onChange) onChange({ ...song, lyricsDoc: { ...doc, chinese: doc?.chinese ?? '', displayLanguage: value } });
    else setDisplayOverride(value);
  };
  const setSetting = (field: 'fontSize' | 'lineHeight', value: number) => {
    if (reading) {
      if (field === 'fontSize') setReadingFontSize(value); else setReadingLineHeight(value);
      return;
    }
    if (onChange) onChange({ ...song, lyricsDoc: { ...doc, chinese: doc?.chinese ?? '', [field]: value } });
    else if (field === 'fontSize') setFontOverride(value);
    else setLineOverride(value);
  };

  React.useLayoutEffect(() => {
    if (reading || editing) return;
    const measure = () => {
      const root = measureRef.current;
      if (!root) return;
      const nextRows: typeof textRows = {};
      const measured = visibleBlocks.map(block => {
        const node = Array.from(root.children).find(child => (child as HTMLElement).dataset.measureBlock === block.id);
        const rows = Object.fromEntries(fields.map(field => [field, measureLyricsText(node?.querySelector(`[data-field="${field}"]`), formattedBlocks[block.id][field].text, fontSize * lineHeight)])) as Partial<Record<'chinese' | 'english', LyricsTextRow[]>>;
        nextRows[block.id] = rows;
        const lineCount = Math.max(...fields.map(field => rows[field]?.length ?? 1));
        return { id: block.id, heights: Array(lineCount).fill(fontSize * lineHeight), pageBreakBefore: block.pageBreakBefore, headingHeight: block.marker ? LYRICS_SECTION_HEADING_HEIGHT : 0 };
      });
      setTextRows(current => JSON.stringify(current) === JSON.stringify(nextRows) ? current : nextRows);
      const capacity = 1123 - 64 - (headerRef.current?.offsetHeight || 85) - 52;
      const next = paginateLyrics(measured, Math.max(100, capacity), columnCount);
      setPages(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    measure();
    let disposed = false;
    document.fonts?.ready.then(() => { if (!disposed) measure(); });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (measureRef.current) observer?.observe(measureRef.current);
    return () => { disposed = true; observer?.disconnect(); };
  }, [blocks, display, fontSize, lineHeight, reading, editing, song.title, source, song.translator, Boolean(onChange)]);

  const header = (measure = false) => <div ref={measure ? headerRef : undefined} className="mb-5 border-b-2 border-stone-800 pb-3">
    <h1 className="break-words text-3xl font-bold tracking-tight">《{song.title}》</h1>
    {(source || song.translator) && <div className="mt-2 text-sm leading-5 text-stone-500">
      {source && <div>{zh ? '出處' : 'Source'}：{source}</div>}
      {song.translator && <div>{zh ? '翻譯' : 'Translation'}：{song.translator}</div>}
    </div>}
  </div>;

  const renderFragment = (fragment: LyricsFragment) => {
    const block = blocks.find(candidate => candidate.id === fragment.blockId);
    if (!block) return null;
    const headingLabel = lyricsSectionLabel(block.marker);
    const headingStyle = getSectionBadgeStyle(getSectionColor(headingLabel).accent);
    const headingClass = "inline-flex h-[18px] items-center rounded-sm border px-1.5 text-left leading-4";
    return <div key={`${block.id}-${fragment.start}`} data-lyrics-block={block.id}
      className={`lyrics-section relative mb-4 ${selectedId === block.id && onChange && !exportMode ? 'rounded outline outline-1 outline-offset-4 outline-indigo-200' : ''}`}
      style={{ display: 'grid', gridTemplateColumns: display === 'bilingual' ? '1fr 1fr' : '1fr', columnGap: 32, rowGap: 0 }}>
      {headingLabel && <h2 className="col-span-full mb-1 flex items-start text-sm font-bold leading-[18px] tracking-wide">
        {onChange && !exportMode ? <button type="button" aria-label={`${zh ? '段落操作' : 'Section actions'} ${headingLabel}`} onClick={() => selectBlock(block.id)} className={`${headingClass} hover:brightness-95 focus-visible:outline-indigo-500`} style={headingStyle}>{headingLabel}{fragment.continued ? ' (cont.)' : ''}</button> : <span className={headingClass} style={headingStyle}>{headingLabel}{fragment.continued ? ' (cont.)' : ''}</span>}
      </h2>}
      {onChange && !exportMode && block.needsPairingReview && !fragment.continued && <button type="button" data-preview-only-control onClick={() => selectBlock(block.id)} className="absolute -top-3 right-0 rounded bg-amber-100 px-1.5 text-[10px] leading-4 text-amber-900">{zh ? '待配對' : 'Review pairing'}</button>}
      {fields.map(field => {
        const formatted = formattedBlocks[block.id][field];
        const rows = textRows[block.id]?.[field] ?? [];
        const startOffset = reading ? 0 : (rows[fragment.start]?.start ?? formatted.text.length);
        const endOffset = reading ? formatted.text.length : (rows[Math.min(fragment.end, rows.length) - 1]?.end ?? formatted.text.length);
        const raw = formatted.text.slice(startOffset, endOffset);
        const trailingSeparator = !reading && raw.endsWith('\n') && endOffset < formatted.text.length ? '\n' : '';
        const value = trailingSeparator ? raw.slice(0, -1) : raw;
        const label = zh ? `${field === 'chinese' ? '中文' : '英文'}歌詞${headingLabel ? ` ${headingLabel}` : ''}` : `${field === 'chinese' ? 'Chinese' : 'English'} lyrics ${headingLabel}`;
        return <div key={field} className="min-w-0" style={{ paddingLeft: lyricsIndent(block.marker, fontSize) }}>
          <div className="min-w-0">
            <InlineLyrics value={value} label={label} editable={Boolean(onChange) && !exportMode}
              onFocus={() => { selectBlock(block.id); setEditing(true); }}
              onFinish={text => {
                setEditing(false);
                if (text === value) return;
                const nextText = block[field].slice(0, formatted.offsets[startOffset]) + text.replace(/\r\n?/g, '\n') + trailingSeparator + block[field].slice(formatted.offsets[endOffset]);
                save(blocks.map(candidate => candidate.id === block.id ? { ...candidate, [field]: nextText } : candidate));
              }} />
          </div>
        </div>;
      })}
    </div>;
  };

  const readingPages: LyricsPage[] = [{ columns: [visibleBlocks.map(block => ({ blockId: block.id, start: 0, end: Math.max(block.chinese.split('\n').length, block.english.split('\n').length), continued: false }))] }];

  return <div className="lyrics-sheet flex flex-col gap-6 text-stone-900" data-preview-suppress-pan="true" style={{ fontFamily: LYRICS_BOOK_FONT }}>
    {!exportMode && <div data-preview-only-control className="z-20 space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm font-semibold">{zh ? '歌詞' : 'Lyrics'}</span>
        <button type="button" className={buttonClass} aria-pressed={reading} onClick={() => {
          const next = !reading;
          if (onReadingChange) onReadingChange(next); else setLocalReading(next);
        }}>{reading ? (zh ? '切換 A4 排版' : 'A4 layout') : (zh ? '大字閱讀' : 'Reading view')}</button>
        <select aria-label={zh ? '歌詞語言' : 'Lyrics language'} value={display} onChange={e => setDisplay(e.target.value as LyricsLanguage)} className={buttonClass}>
          <option value="chinese">{zh ? '中文' : 'Chinese'}</option><option value="english">English</option><option value="bilingual">{zh ? '中英對照' : 'Bilingual'}</option>
        </select>
        <label className="flex items-center gap-2 text-sm">{zh ? '字級' : 'Size'}<select aria-label={zh ? '歌詞字級' : 'Lyrics font size'} value={fontSize} onChange={e => setSetting('fontSize', Number(e.target.value))} className={buttonClass}>
          {Array.from(new Set([14, 16, 18, DEFAULT_LYRICS_FONT_SIZE, 20, 24, 28, 32, fontSize])).sort((a, b) => a - b).map(size => <option key={size} value={size}>{reading ? `${Math.round(size * 10) / 10} px` : `${Math.round(size * 0.75 * 10) / 10} pt`}</option>)}
        </select></label>
        <label className="flex items-center gap-2 text-sm">{zh ? '行距' : 'Spacing'}<select aria-label={zh ? '歌詞行距' : 'Lyrics line spacing'} value={lineHeight} onChange={e => setSetting('lineHeight', Number(e.target.value))} className={buttonClass}>
          {Array.from(new Set([1.4, DEFAULT_LYRICS_LINE_HEIGHT, 1.65, 2, lineHeight])).sort((a, b) => a - b).map(size => <option key={size} value={size}>{Math.round(size * 100) / 100}</option>)}
        </select></label>
      </div>
      {onChange && <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} onClick={() => { const block = { ...newLyricsBlock(), marker: `Verse ${nextVerse}` }; save([...blocks, block]); selectBlock(block.id); }}>{zh ? '＋ 新增段落' : '+ Add section'}</button>
        <button type="button" className={buttonClass} onClick={() => setDisplay('bilingual')}>{zh ? '添加英文對照' : 'Add English translation'}</button>
        <button type="button" className={buttonClass} aria-expanded={showImport} onClick={() => setShowImport(!showImport)}>{zh ? '整首貼上' : 'Paste whole song'}</button>
        <p className="text-xs text-stone-500">{zh ? '點選歌詞直接編輯 · 點外面完成 · Esc 取消' : 'Click lyrics to edit · Click outside to finish · Esc to cancel'}</p>
      </div>}
      {showImport && onChange && <LyricsDocEditor key={`${song.title}-${showImport}`} song={song} language={language} onChange={next => { onChange(next); setShowImport(false); }} />}
      {onChange && selected && <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3" role="toolbar" aria-label={zh ? '段落操作' : 'Section actions'}>
        <select aria-label={zh ? '段落類型' : 'Section type'} className={buttonClass} value={selectedType} onChange={e => {
          const marker = e.target.value === 'Verse' ? `Verse ${nextVerse}` : e.target.value;
          patchSelected({ marker });
        }}>
          <option value="">{zh ? '無標題' : 'No heading'}</option>
          {LYRICS_SECTION_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
          {selectedType && !LYRICS_SECTION_NAMES.some(name => name === selectedType) && <option value={selectedType}>{selectedType}</option>}
        </select>
        <input aria-label={zh ? '段落名稱' : 'Section heading'} value={selectedLabel} onChange={e => patchSelected({ marker: e.target.value })} className="w-40 rounded-lg border border-stone-200 px-2 py-2 text-sm" />
        {([-1, 1] as const).map(direction => <button key={direction} type="button" className={buttonClass} disabled={blocks.indexOf(selected) + direction < 0 || blocks.indexOf(selected) + direction >= blocks.length} onClick={() => {
          const next = [...blocks]; const index = next.indexOf(selected); [next[index], next[index + direction]] = [next[index + direction], next[index]]; save(next);
        }}>{direction < 0 ? (zh ? '上移' : 'Move up') : (zh ? '下移' : 'Move down')}</button>)}
        <button type="button" className={buttonClass} onClick={() => { const copy = { ...selected, id: crypto.randomUUID(), pageBreakBefore: false }; const next = [...blocks]; next.splice(next.indexOf(selected) + 1, 0, copy); save(next); selectBlock(copy.id); }}>{zh ? '複製段落' : 'Duplicate'}</button>
        <button type="button" className={buttonClass} aria-pressed={Boolean(selected.pageBreakBefore)} onClick={() => patchSelected({ pageBreakBefore: !selected.pageBreakBefore })}>{selected.pageBreakBefore ? (zh ? '取消分頁' : 'Remove page break') : (zh ? '段前分頁' : 'Page break before')}</button>
        <button type="button" className={buttonClass} onClick={() => { save(blocks.filter(block => block.id !== selected.id)); setSelectedId(null); }}>{zh ? '刪除段落' : 'Delete section'}</button>
      </div>}
      {onChange && (blocks.some(block => block.needsPairingReview) || (selected && display === 'bilingual')) && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
        <p>{blocks.some(block => block.needsPairingReview) ? (zh ? '標示「待配對」的段落需要確認。選擇對應中文段落即可移動英文；若已有英文，會互換並保留兩份內容。' : 'Sections marked for review need pairing. Choose the matching Chinese section to move its English. Existing translations will be swapped without losing text.') : (zh ? '中英文已按段落配對。需要調整時可在此交換英文。' : 'Translations are paired by section. You can swap them here.')}</p>
        {selected && <div className="mt-2 flex flex-wrap gap-2">
          {selected.english && <><select aria-label={zh ? '英文配對至' : 'Pair English with'} className={buttonClass} value={pairTarget} onChange={e => setPairTarget(e.target.value)}>
            <option value="">{zh ? '選擇對應中文段落' : 'Choose Chinese section'}</option>
            {blocks.filter(block => block.id !== selected.id && block.chinese).map((block, index) => <option key={block.id} value={block.id}>{block.marker || index + 1} {block.chinese.slice(0, 24)}</option>)}
          </select><button type="button" className={buttonClass} disabled={!pairTarget} onClick={() => {
            save(blocks.map(block => block.id === pairTarget ? { ...block, english: selected.english, needsPairingReview: false } : block.id === selected.id ? { ...block, english: blocks.find(candidate => candidate.id === pairTarget)?.english ?? '', needsPairingReview: Boolean(block.chinese) } : block).filter(block => block.id !== selected.id || Boolean(block.chinese || block.english)));
            selectBlock(pairTarget);
          }}>{zh ? '配對／交換英文' : 'Pair / swap English'}</button></>}
          <button type="button" className={buttonClass} onClick={() => patchSelected({ needsPairingReview: false })}>{zh ? '確認此段配對' : 'Confirm section pairing'}</button>
        </div>}
      </div>}
    </div>}

    {!reading && <div ref={measureRef} aria-hidden="true" data-preview-only-control style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: 728, height: 0, overflow: 'hidden', fontSize, lineHeight, left: -10000, top: 0 }}>
      {header(true)}
      {visibleBlocks.map(block => <div key={block.id} data-measure-block={block.id}>
        {fields.map(field => <div key={field} data-field={field} style={{ width: textWidth - lyricsIndent(block.marker, fontSize) }}>
          {formattedBlocks[block.id][field].text.split('\n').map((line, index) => <div key={index} data-line={index} className="lyrics-text">{line || '\u00a0'}</div>)}
        </div>)}
      </div>)}
    </div>}

    {(reading ? readingPages : pages).map((page, index, all) => <div key={index}
      data-lyrics-reading={reading ? true : undefined} data-print-page={!reading ? true : undefined} data-export-page-index={index + 1} data-export-page-total={all.length} data-export-song-title={song.title}
      className={`lyrics-page relative mx-auto flex w-full flex-col border border-stone-100 bg-white text-stone-900 shadow-sm ${reading ? 'rounded-xl p-5 sm:p-8' : 'p-8'}`}
      style={{ minHeight: reading ? undefined : 1123, width: reading ? '100%' : 794, maxWidth: '100%', fontSize, lineHeight }}>
      {header()}
      {visibleBlocks.length === 0 ? <div className="py-20 text-center text-base text-stone-400">{onChange ? (zh ? '新增段落或整首貼上，開始編輯歌詞。' : 'Add a section or paste a song to begin.') : (zh ? '尚無此語言的歌詞。' : 'No lyrics in this language yet.')}</div> :
        <div className="grid flex-1 content-start gap-x-8" style={{ gridTemplateColumns: `repeat(${reading ? 1 : columnCount}, minmax(0, 1fr))` }}>
          {page.columns.map((column, columnIndex) => <div key={columnIndex}>{column.map(renderFragment)}</div>)}
        </div>}
      {!reading && <div className="mt-4 text-right text-xs text-stone-400">{index + 1} / {all.length}</div>}
    </div>)}
  </div>;
}
