import React from 'react';
import { Check } from 'lucide-react';
import type { AppLanguage, Song } from '../types';
import type { LyricsBookSettings } from '../utils/lyricsBook';
import { LYRICS_BOOK_FONT } from '../utils/lyricsBook';
import { getLyricsBlocks } from '../utils/lyricsDocument';
import { paginateReadingColumns, readingColumnCandidates, readingPhrases, readingPhraseTail, prepareReadingSections, type ReadingAnchor, type ReadingPage, type ReadingSection, type MeasuredReadingSection } from '../utils/lyricsReading';
import SongTitle from './SongTitle';
import { useLyricsPageGestures } from '../hooks/useLyricsPageGestures';
import LyricsSectionNavigation from './LyricsSectionNavigation';
import './AdaptiveLyricsReader.css';

export interface LyricsReaderHandle { next: () => boolean; previous: () => boolean }
interface Props {
  song: Song; identity: string; language: AppLanguage; settings: LyricsBookSettings;
  number?: number; songPicker?: React.ReactNode;
  initialAnchor?: ReadingAnchor | 'last';
  onAnchorChange?: (anchor: ReadingAnchor) => void;
  onNextSong?: () => void; onPreviousSong?: () => void;
  onFontSize?: (size: number) => void;
  keyboard?: boolean;
  hideHeading?: boolean;
  gestures?: boolean;
}
interface Layout { pages: ReadingPage[]; columns: number; widths: number[]; fontSize: number; sections: ReadingSection[]; splits: number; wraps: number; imbalance: number }

function ReadingSentence({ text }: { text: string }) {
  return readingPhrases(text).map((part, index) => {
    if (!/\S/u.test(part)) return part;
    const [body, tail] = readingPhraseTail(part);
    return <span className="alr-phrase" key={index}>{/\p{Script=Han}/u.test(tail)
      ? <>{body}<span className="alr-phrase-tail">{tail}</span></> : part}</span>;
  });
}

function Rows({ section, start = 0, end = section.rows.length }: { section: ReadingSection; start?: number; end?: number }) {
  return section.rows.slice(start, end).map((row, index) => <div className={`alr-row${section.paired ? ' alr-pair' : ''}`} key={start + index} data-reading-row={start + index}>
    {row.map(line => <p key={line.field} className="alr-line" data-source-line={`${section.id}:${line.field}:${line.index}`} data-lyrics-language={line.field}><ReadingSentence text={line.text || '\u00a0'}/></p>)}
  </div>);
}

const AdaptiveLyricsReader = React.forwardRef<LyricsReaderHandle, Props>(function AdaptiveLyricsReader({ song, identity, language, settings, number, songPicker, initialAnchor, onAnchorChange, onNextSong, onPreviousSong, onFontSize, keyboard = true, hideHeading = false, gestures = true }, ref) {
  const zh = language === 'zh';
  const sections = React.useMemo(() => prepareReadingSections(getLyricsBlocks(song.lyricsDoc), settings.language), [song.lyricsDoc, settings.language]);
  const [layout, setLayout] = React.useState<Layout>({ pages: [], columns: 1, widths: [1], fontSize: settings.fontSize, sections, splits: 0, wraps: 0, imbalance: 0 });
  const [page, setPage] = React.useState(0);
  const [selectedSection, setSelectedSection] = React.useState<string>();
  const canvas = React.useRef<HTMLDivElement>(null), measure = React.useRef<HTMLDivElement>(null);
  const position = React.useRef<{ identity: string; anchor?: ReadingAnchor | 'last' }>({ identity, anchor: initialAnchor });
  const latest = React.useRef({ onAnchorChange, onFontSize });
  latest.current = { onAnchorChange, onFontSize };
  const fontFamily = settings.font === 'kaiti' ? LYRICS_BOOK_FONT : 'Inter, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif';
  const remember = (next: Layout, index: number, preferred?: ReadingAnchor) => {
    const first = next.pages[index]?.flat()[0];
    const retained = preferred && next.pages[index]?.flat().find(part => next.sections[part.section].id === preferred.blockId && part.start <= preferred.line && part.end > preferred.line);
    const segment = retained ?? first;
    const section = segment && next.sections[segment.section];
    if (section && segment) {
      const anchor = retained && preferred ? preferred : { blockId: section.id, line: segment.start };
      position.current = { identity, anchor };
      setSelectedSection(section.id);
      latest.current.onAnchorChange?.(anchor);
    }
  };
  React.useLayoutEffect(() => {
    const area = canvas.current, ruler = measure.current;
    if (!area || !ruler) return;
    let frame = 0, disposed = false;
    const calculate = () => {
      if (disposed) return;
      const width = area.clientWidth, height = Math.floor(area.clientHeight) - 3;
      if (width < 100 || height < 40) return;
      const bilingual = settings.language === 'bilingual';
      const maxColumns = bilingual ? (width >= 1100 ? 2 : 1) : width >= 1100 ? 3 : width >= 640 ? 2 : 1;
      const fontSize = settings.fontSize;
      ruler.style.fontSize = `${fontSize}px`;
      const blocks = Array.from(ruler.querySelectorAll<HTMLElement>('.alr-block')).map(node => ({
        heading: node.querySelector('h2'),
        rows: Array.from(node.querySelectorAll<HTMLElement>('.alr-row')).map(row => ({ node: row, lines: Array.from(row.querySelectorAll('.alr-line')) })),
      }));
      type Metrics = { sections: MeasuredReadingSection[]; wraps: number[][] };
      const cache = new Map<number, Metrics>();
      const measureColumn = (columnWidth: number): Metrics => {
        const cached = cache.get(columnWidth);
        if (cached) return cached;
        ruler.style.width = `${columnWidth}px`;
        const metrics: Metrics = {
          sections: blocks.map((block, index) => ({
            index, pageBreakBefore: sections[index].pageBreakBefore,
            header: block.heading ? block.heading.getBoundingClientRect().height + 6 : 0,
            lines: block.rows.map(row => row.node.getBoundingClientRect().height),
          })),
          wraps: blocks.map(block => block.rows.map(row => row.lines.reduce((sum, line) => sum + Math.max(0,
            Math.round(line.getBoundingClientRect().height / (fontSize * settings.lineHeight)) - 1), 0))),
        };
        cache.set(columnWidth, metrics);
        return metrics;
      };
      let best: Layout | undefined;
      // Font size is a setlist preference, never a fitting variable. Compare
      // column widths using their real sentence/pair heights, then minimize
      // pages first, keeping sections together and avoiding unnecessary wraps
      // whenever those choices do not add a page.
      for (const widths of readingColumnCandidates(width, maxColumns)) {
        const metrics = widths.map(measureColumn);
        const measurements = metrics.map(value => value.sections);
        let pages = paginateReadingColumns(measurements, height);
        // Relax section grouping only when it actually saves a page. Source
        // rows/pairs and authored breaks are indivisible in either layout.
        if (pages.length > 1) {
          const packed = paginateReadingColumns(measurements, height, 16, false);
          if (packed.length < pages.length) pages = packed;
        }
        const wraps = pages.reduce((sum, p) => sum + p.reduce((total, col, c) => total + col.reduce((count, part) =>
          count + metrics[c].wraps[part.section].slice(part.start, part.end).reduce((a, b) => a + b, 0), 0), 0), 0);
        const splits = pages.flat(2).filter(part => part.continued).length;
        const average = widths.reduce((a, b) => a + b, 0) / widths.length;
        const imbalance = widths.reduce((sum, value) => sum + Math.abs(value - average), 0);
        if (!best || pages.length < best.pages.length || (pages.length === best.pages.length && (
          splits < best.splits || (splits === best.splits && (wraps < best.wraps || (wraps === best.wraps && imbalance < best.imbalance)))
        ))) best = { pages, columns: widths.length, widths, fontSize, sections, splits, wraps, imbalance };
        if (pages.length === 1 && wraps === 0 && imbalance === 0) break;
      }
      if (!best) return;
      const anchor = position.current.identity === identity ? position.current.anchor : initialAnchor;
      const next = anchor === 'last' ? best.pages.length - 1 : anchor ? best.pages.findIndex(p => p.some(col => col.some(segment => sections[segment.section].id === anchor.blockId && segment.start <= anchor.line && segment.end > anchor.line))) : 0;
      const index = Math.max(0, next);
      setLayout(best); setPage(index); remember(best, index, anchor === 'last' ? undefined : anchor);
      latest.current.onFontSize?.(best.fontSize);
    };
    const schedule = () => { if (!disposed) { cancelAnimationFrame(frame); frame = requestAnimationFrame(calculate); } };
    calculate();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(area);
    document.fonts?.ready.then(schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    return () => { disposed = true; observer?.disconnect(); cancelAnimationFrame(frame); document.fonts?.removeEventListener('loadingdone', schedule); };
  }, [sections, settings.fontSize, settings.lineHeight, fontFamily, identity]);

  const active = Math.min(page, Math.max(0, layout.pages.length - 1));
  const turn = (index: number, anchor?: ReadingAnchor) => {
    setPage(index); remember(layout, index, anchor);
    canvas.current?.querySelectorAll('.alr-column').forEach(node => { node.scrollTop = 0; });
  };
  const next = () => {
    if (active < layout.pages.length - 1) { turn(active + 1); return true; }
    if (onNextSong) { onNextSong(); return true; } return false;
  };
  const previous = () => {
    if (active > 0) { turn(active - 1); return true; }
    if (onPreviousSong) { onPreviousSong(); return true; } return false;
  };
  React.useImperativeHandle(ref, () => ({ next, previous }));
  useLyricsPageGestures({ canvas, enabled: gestures && sections.length > 0, scope: identity, onNext: next, onPrevious: previous });
  return <section className="adaptive-lyrics-reader" aria-label={zh ? '整首優先歌詞' : 'Whole-song lyrics'} data-reading-song={identity} data-font-size={layout.fontSize} data-column-count={layout.columns} data-column-widths={layout.widths.map(width => Math.round(width)).join(",")} data-page-count={layout.pages.length} data-reading-page={active + 1}
    style={{ '--lyrics-reading-font': fontFamily, '--lyrics-reading-leading': settings.lineHeight } as React.CSSProperties}
    onKeyDown={event => {
      if (!keyboard || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest('input,select,textarea,button,[contenteditable]')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previous(); }
    }}>
    {!hideHeading && <header className="alr-heading"><div>{songPicker ?? <>{number && <span className="alr-song-number">{String(number).padStart(2, '0')}</span>}<h1><SongTitle title={song.title}/></h1></>}</div>
      <span className="alr-page-note">{sections.length > 0 && layout.pages.length === 1 ? <><Check size={13}/>{zh ? '整首一頁' : 'One page'}</> : `${sections.length} ${zh ? '個段落' : 'sections'}`}</span></header>}
    <div className="alr-canvas" ref={canvas} tabIndex={0} aria-label={zh ? '當頁歌詞' : 'Current lyrics page'} aria-description={zh ? '左右滑動，或輕點左半邊往前、右半邊往後翻頁' : 'Swipe, or tap the left half to go back and the right half to go forward'}>
      {!sections.length ? <div className="alr-empty">{zh ? '尚無此語言的歌詞，可在閱讀設定切換語言。' : 'No lyrics in this language. Choose another language in reading settings.'}</div> : <div className="alr-columns" style={{ gridTemplateColumns: layout.widths.map(width => `minmax(0, ${width}fr)`).join(" "), fontSize: layout.fontSize }}>
        {(layout.sections === sections ? layout.pages[active] ?? [] : []).map((column, c) => <div className="alr-column" key={`${active}-${c}`}>{column.map(segment => {
          const section = sections[segment.section];
          return <section className="alr-block" key={`${section.id}:${segment.start}`} data-reading-section={section.id}>{section.label && <h2>{section.label}{segment.continued && <small>(cont.)</small>}</h2>}<Rows section={section} start={segment.start} end={segment.end}/></section>;
        })}</div>)}
      </div>}
    </div>
    <LyricsSectionNavigation sections={sections} selectedId={selectedSection} page={active + 1} pages={Math.max(1, layout.pages.length)} language={language} onSelect={id => {
      const target = layout.pages.findIndex(p => p.some(col => col.some(segment => sections[segment.section].id === id)));
      if (target >= 0) turn(target, { blockId: id, line: 0 });
    }}/>
    <div className="alr-measure" ref={measure} aria-hidden="true" inert>{sections.map(section => <section className="alr-block" key={section.id}>{section.label && <h2>{section.label}</h2>}<Rows section={section}/></section>)}</div>
  </section>;
});
export default AdaptiveLyricsReader;
