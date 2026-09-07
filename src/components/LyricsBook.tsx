import { formatLyricsForDisplay } from '../utils/lyricsDisplay';
import React from 'react';
import type { AppLanguage, LyricsBlock, Song } from '../types';
import { getLyricsBlocks, newLyricsBlock, updateLyricsBlocks, type LyricsFragment, type LyricsPage } from '../utils/lyricsDocument';
import { measureLyricsText, type LyricsTextRow } from '../utils/lyricsMeasurement';
import { lyricsSectionLabel } from '../utils/lyricsSections';
import { getSectionColor } from '../utils/musicUtils';
import { getSectionBadgeStyle } from '../utils/sectionBadgeStyle';
import { LYRICS_BOOK_FONT, paginateLyricsBook, type LyricsBookSettings } from '../utils/lyricsBook';
import { InlineLyrics } from './LyricsSheet';

export interface LyricsBookEntry { id: string; song: Song }
interface BookBlock {
  id: string;
  entry: LyricsBookEntry;
  block: LyricsBlock;
  first: boolean;
  bookStart: boolean;
  missing: boolean;
  formatted: Record<'chinese' | 'english', ReturnType<typeof formatLyricsForDisplay>>;
}
interface Props {
  title: string;
  entries: LyricsBookEntry[];
  language: AppLanguage;
  settings: LyricsBookSettings;
  onSettingsChange?: (settings: LyricsBookSettings) => void;
  onSongChange?: (id: string, lyrics: Song['lyricsDoc']) => void;
  onSelectSong?: (id: string) => void;
  onEditSong?: (id: string) => void;
  reading?: boolean;
  onReadingChange?: (value: boolean) => void;
  exportMode?: boolean;
}

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_PADDING = 48;
const GAP = 28;
const COLUMN_WIDTH = (PAGE_WIDTH - 2 * PAGE_PADDING - GAP) / 2;
const BOOK_SECTION_HEADING_HEIGHT = 30; // 12 px above the badge, no gap below it.
const CAPACITY = PAGE_HEIGHT - 2 * PAGE_PADDING - 24;
const indentFor = (block: LyricsBlock, fontSize: number) => block.marker && !/^Verse(?:\s|$)/i.test(lyricsSectionLabel(block.marker)) ? fontSize : 0;

export default function LyricsBook({ title, entries, language, settings, onSettingsChange, onSongChange, onSelectSong, onEditSong, reading = false, onReadingChange, exportMode = false }: Props) {
  const zh = language === 'zh';
  const isReading = reading && !exportMode;
  const fontSize = settings.fontSize;
  const lineHeight = fontSize * settings.lineHeight;
  const fontFamily = settings.font === 'kaiti' ? LYRICS_BOOK_FONT : 'Arial, sans-serif';
  const fields: ('chinese' | 'english')[] = settings.language === 'bilingual' ? ['english', 'chinese'] : [settings.language];
  const editable = Boolean(onSongChange) && !exportMode;
  const blocks = React.useMemo<BookBlock[]>(() => entries.flatMap((entry, entryIndex) => {
    const source = getLyricsBlocks(entry.song.lyricsDoc);
    const visible = source.filter(block => fields.some(field => block[field].trim()));
    const content = visible.length ? visible : [{ ...newLyricsBlock(), id: 'missing' }];
    return content.map((block, index) => ({ id: JSON.stringify([entry.id, block.id]), entry, block, first: index === 0, bookStart: entryIndex === 0 && index === 0, missing: !visible.length, formatted: { chinese: formatLyricsForDisplay(block.chinese), english: formatLyricsForDisplay(block.english) } }));
  }), [entries, settings.language]);
  const blockMap = React.useMemo(() => new Map(blocks.map(block => [block.id, block])), [blocks]);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [editing, setEditing] = React.useState(false);
  const [rows, setRows] = React.useState<Record<string, Partial<Record<'chinese' | 'english', LyricsTextRow[]>>>>({});
  const [pages, setPages] = React.useState<LyricsPage[]>([{ columns: [[], []] }]);
  const missingCount = blocks.filter(block => block.missing).length;
  const bookTitleHeight = (node?: Element | null) => node?.querySelector<HTMLElement>('[data-book-title]')?.offsetHeight ?? 40;
  const songTitleHeight = (node?: Element | null) => node?.querySelector<HTMLElement>('[data-book-song-title]')?.offsetHeight ?? lineHeight;

  React.useLayoutEffect(() => {
    if (editing || isReading) return;
    let disposed = false;
    const measure = () => {
      if (disposed || !measureRef.current) return;
      const nextRows: typeof rows = {};
      const nodes = new Map(Array.from(measureRef.current.children).map(child => [(child as HTMLElement).dataset.bookMeasure, child]));
      const measured = blocks.map(item => {
        const node = nodes.get(item.id);
        nextRows[item.id] = Object.fromEntries(fields.map(field => [field, measureLyricsText(node?.querySelector(`[data-field="${field}"]`), item.formatted[field].text, lineHeight)]));
        return {
          id: item.id,
          rowCount: Math.max(1, ...fields.map(field => nextRows[item.id][field]?.length ?? 1)),
          lineHeight,
          titleHeight: (item.first ? songTitleHeight(node) : 0) + (item.bookStart && title ? bookTitleHeight(node) : 0),
          headingHeight: item.block.marker ? BOOK_SECTION_HEADING_HEIGHT : 0,
          pageBreakBefore: item.block.pageBreakBefore,
        };
      });
      setRows(current => JSON.stringify(current) === JSON.stringify(nextRows) ? current : nextRows);
      const nextPages = paginateLyricsBook(measured, CAPACITY, settings.language === 'bilingual' ? 1 : 2);
      setPages(current => JSON.stringify(current) === JSON.stringify(nextPages) ? current : nextPages);
    };
    measure();
    document.fonts?.ready.then(measure);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (measureRef.current) observer?.observe(measureRef.current);
    return () => { disposed = true; observer?.disconnect(); };
  }, [blocks, title, settings, editing, isReading]);

  const gatheringTitle = () => title ? <div data-book-title style={{ fontWeight: 700, fontSize: 24, lineHeight: '32px', paddingBottom: 8 }}><span style={{ background: '#e7e7e7', border: '1px solid #333', boxDecorationBreak: 'clone' }}>{title}</span></div> : null;
  const songTitle = (item: BookBlock, measuring = false) => <div data-book-song-title style={{ fontWeight: 700, lineHeight: `${lineHeight}px` }}>
    {editable && !measuring ? <button type="button" title={zh ? '編輯這首歌的段落' : 'Edit this song’s sections'} onClick={() => onEditSong?.(item.entry.id)} className="text-left" style={{ font: 'inherit', background: '#d9d9d9', padding: '0 4px' }}>《{item.entry.song.title}》</button> : <span style={{ background: '#d9d9d9', boxDecorationBreak: 'clone', padding: '0 4px' }}>《{item.entry.song.title}》</span>}
  </div>;
  const renderFragment = (fragment: LyricsFragment) => {
    const item = blockMap.get(fragment.blockId);
    if (!item) return null;
    const { block, entry } = item;
    const label = lyricsSectionLabel(block.marker);
    return <div key={`${item.id}-${fragment.start}`} data-book-block={item.id}>
      {item.bookStart && !fragment.continued && gatheringTitle()}
      {item.first && !fragment.continued && <div data-setlist-preview-song-id={entry.id}>{songTitle(item)}</div>}
      {label && <h3 style={{ height: BOOK_SECTION_HEADING_HEIGHT, font: 'bold 14px/18px Arial, sans-serif', margin: 0, paddingTop: 12 }}><span className="inline-flex h-[18px] items-center rounded-sm border px-1.5" style={getSectionBadgeStyle(getSectionColor(label).accent)}>{label}{fragment.continued ? ' (cont.)' : ''}</span></h3>}
      {item.missing ? <div style={{ height: lineHeight, fontFamily: 'Arial, sans-serif', fontSize: 14 }} className="text-stone-500">{zh ? '尚無此語言歌詞' : 'No lyrics in this language'}{editable && <button type="button" data-preview-only-control className="ml-2 underline" onClick={() => onEditSong?.(entry.id)}>{zh ? '添加歌詞' : 'Add lyrics'}</button>}</div> : <div className="lyrics-book-languages grid" style={{ gridTemplateColumns: fields.length === 2 ? '1fr 1fr' : '1fr', gap: GAP }}>
        {fields.map(field => {
          const formatted = item.formatted[field];
          const fieldRows = rows[item.id]?.[field] ?? [];
          const start = isReading ? 0 : fieldRows[fragment.start]?.start ?? formatted.text.length;
          const end = isReading ? formatted.text.length : fieldRows[Math.min(fragment.end, fieldRows.length) - 1]?.end ?? formatted.text.length;
          const raw = formatted.text.slice(start, end);
          const separator = !isReading && raw.endsWith('\n') && end < formatted.text.length ? '\n' : '';
          const value = separator ? raw.slice(0, -1) : raw;
          return <div key={field} className="min-w-0" style={{ paddingLeft: indentFor(block, fontSize) }}>
            <InlineLyrics value={value} label={`${entry.song.title} · ${label || (zh ? '歌詞' : 'Lyrics')} · ${field === 'chinese' ? '中文' : 'English'}`} editable={editable}
              onFocus={() => { setEditing(true); onSelectSong?.(entry.id); }}
              onFinish={text => {
                setEditing(false);
                if (text === value) return;
                const updated = block[field].slice(0, formatted.offsets[start]) + text.replace(/\r\n?/g, '\n') + separator + block[field].slice(formatted.offsets[end]);
                const next = getLyricsBlocks(entry.song.lyricsDoc).map(candidate => candidate.id === block.id ? { ...candidate, [field]: updated } : candidate);
                onSongChange?.(entry.id, updateLyricsBlocks(entry.song.lyricsDoc, next));
              }} />
          </div>;
        })}
      </div>}
    </div>;
  };
  const readingPages: LyricsPage[] = [{ columns: [blocks.map(item => ({ blockId: item.id, start: 0, end: 0, continued: false }))] }];
  const displayedPages = isReading ? readingPages : pages;

  return <div className="lyrics-sheet lyrics-book flex flex-col gap-6 text-stone-900" data-preview-suppress-pan="true" style={{ fontFamily }}>
    {!exportMode && <div data-preview-only-control className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 text-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
      <span className="font-bold">{zh ? '連續歌詞' : 'Continuous lyrics'}</span>
      <button type="button" className="rounded border px-3 py-2" onClick={() => onReadingChange?.(!isReading)}>{isReading ? (zh ? 'A4 排版' : 'A4 layout') : (zh ? '大字閱讀' : 'Reading view')}</button>
      <select aria-label={zh ? '歌單歌詞字體' : 'Setlist lyrics font'} value={settings.font} onChange={e => onSettingsChange?.({ ...settings, font: e.target.value as LyricsBookSettings['font'] })}><option value="kaiti">{zh ? '楷體（聚會樣式）' : 'KaiTi (gathering)'}</option><option value="sans">{zh ? '黑體' : 'Sans serif'}</option></select>
      <select aria-label={zh ? '歌單歌詞字級' : 'Setlist lyrics size'} value={fontSize} onChange={e => onSettingsChange?.({ ...settings, fontSize: Number(e.target.value) })}>{[14, 16, 18, 20, 24].map(pt => <option key={pt} value={pt * 4 / 3}>{pt} pt</option>)}</select>
      <select aria-label={zh ? '歌單歌詞行距' : 'Setlist lyrics spacing'} value={settings.lineHeight} onChange={e => onSettingsChange?.({ ...settings, lineHeight: Number(e.target.value) })}>{[1.5, 1.875, 2].map(value => <option key={value} value={value}>{Number((fontSize * value * .75).toFixed(1))} pt {zh ? '行距' : 'leading'}</option>)}</select>
      <select aria-label={zh ? '歌單歌詞語言' : 'Setlist lyrics language'} value={settings.language} onChange={e => onSettingsChange?.({ ...settings, language: e.target.value as LyricsBookSettings['language'] })}><option value="chinese">中文</option><option value="english">English</option><option value="bilingual">{zh ? '中英對照' : 'Bilingual'}</option></select>
      <p className="w-full text-xs text-stone-500">{zh ? '按歌單順序接續排版，填滿左欄後接右欄及下一頁。點歌詞直接編輯，點歌名整理段落。' : 'Songs flow down the left column, then the right and subsequent pages. Click lyrics to edit, or a title to manage sections.'}{missingCount > 0 && ` ${zh ? `${missingCount} 首尚無所選語言歌詞。` : `${missingCount} songs have no lyrics in the selected language.`}`}</p>
    </div>}
    {!isReading && <div ref={measureRef} aria-hidden="true" data-preview-only-control style={{ position: 'absolute', visibility: 'hidden', left: -10000, top: 0, width: settings.language === 'bilingual' ? 2 * COLUMN_WIDTH + GAP : COLUMN_WIDTH, height: 0, overflow: 'hidden', fontSize, lineHeight: `${lineHeight}px` }}>
      {blocks.map(item => <div key={item.id} data-book-measure={item.id}>
        {item.bookStart && gatheringTitle()}{item.first && songTitle(item, true)}
        {fields.map(field => <div key={field} data-field={field} style={{ width: COLUMN_WIDTH - indentFor(item.block, fontSize) }}>{item.formatted[field].text.split('\n').map((line, index) => <div key={index} data-line={index} className="lyrics-text">{line || '\u00a0'}</div>)}</div>)}
      </div>)}
    </div>}
    {displayedPages.map((page, index) => <div key={index} data-print-page={isReading ? undefined : true} data-lyrics-reading={isReading || undefined} data-export-page-index={index + 1} data-export-page-total={displayedPages.length} data-export-song-title={title}
      className="lyrics-page relative mx-auto bg-white shadow-sm" style={{ width: isReading ? '100%' : PAGE_WIDTH, maxWidth: '100%', minHeight: isReading ? undefined : PAGE_HEIGHT, padding: isReading ? 24 : PAGE_PADDING, fontSize, lineHeight: `${lineHeight}px` }}>
      <div className="grid content-start" style={{ gridTemplateColumns: `repeat(${isReading || settings.language === 'bilingual' ? 1 : 2}, minmax(0, 1fr))`, columnGap: GAP }}>{page.columns.map((column, columnIndex) => <div key={columnIndex}>{column.map(renderFragment)}</div>)}</div>
      {!isReading && <div className="absolute bottom-6 right-12 text-xs text-stone-400" style={{ fontFamily: 'Arial, sans-serif' }}>{index + 1} / {displayedPages.length}</div>}
    </div>)}
  </div>;
}
