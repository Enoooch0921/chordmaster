import React from 'react';
import type { AppLanguage } from '../types';
import type { ReadingSection } from '../utils/lyricsReading';
import { songMapDisplayCode } from '../lib/songMap';
import MeasuredSlidingSelection from './ui/MeasuredSlidingSelection';

export default function LyricsSectionNavigation({ sections, selectedId, onSelect, page, pages, language }: {
  sections: ReadingSection[];
  selectedId?: string;
  onSelect: (id: string) => void;
  page: number;
  pages: number;
  language: AppLanguage;
}) {
  const viewport = React.useRef<HTMLDivElement>(null);
  const zh = language === 'zh';
  // Scroll only this rail, never the document or the reading canvas.
  React.useLayoutEffect(() => {
    const area = viewport.current;
    if (!area) return;
    const reveal = () => {
      const selected = area.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!selected) return;
      const left = selected.offsetLeft, right = left + selected.offsetWidth;
      if (left < area.scrollLeft) area.scrollLeft = left;
      else if (right > area.scrollLeft + area.clientWidth) area.scrollLeft = right - area.clientWidth;
    };
    reveal();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    observer?.observe(area);
    if (area.firstElementChild) observer?.observe(area.firstElementChild);
    return () => observer?.disconnect();
  }, [selectedId, sections]);

  return <footer className="alr-footer" data-lyrics-navigation>
    {sections.length > 0 && <nav className="alr-section-scroll" ref={viewport} aria-label={zh ? '歌詞段落' : 'Lyrics sections'}>
      <div className="alr-section-tabs">
        <MeasuredSlidingSelection value={selectedId ?? ''} layoutKey={`${language}:${sections.map(section => section.id).join(',')}`}/>
        {sections.map((section, index) => {
          const label = section.label || `${zh ? '段落' : 'Section'} ${index + 1}`;
          return <button type="button" key={section.id} className="alr-section-button ui-press" data-lyrics-section-target={section.id}
            aria-label={zh ? `跳到 ${label}` : `Go to ${label}`} title={label} aria-pressed={selectedId === section.id}
            onClick={() => onSelect(section.id)}><span>{songMapDisplayCode(section.label) || String(index + 1)}</span></button>;
        })}
      </div>
    </nav>}
    <span className="alr-page-count" role="status" aria-live="polite" aria-label={zh ? `第 ${page} 頁，共 ${pages} 頁` : `Page ${page} of ${pages}`}>{page} / {pages}</span>
  </footer>;
}
