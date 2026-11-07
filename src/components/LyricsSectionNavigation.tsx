import React from 'react';
import type { AppLanguage } from '../types';
import type { ReadingSection } from '../utils/lyricsReading';
import { songMapDisplayCode } from '../lib/songMap';
import MeasuredSlidingSelection from './ui/MeasuredSlidingSelection';

export default function LyricsSectionNavigation({ sections, visibleIds, onSelect, page, pages, language }: {
  sections: ReadingSection[];
  visibleIds: string[];
  onSelect: (id: string) => void;
  page: number;
  pages: number;
  language: AppLanguage;
}) {
  const viewport = React.useRef<HTMLDivElement>(null);
  const zh = language === 'zh';
  const visible = new Set(visibleIds);
  const selectionKey = JSON.stringify(visibleIds);
  // Scroll only this rail, never the document or the reading canvas.
  React.useLayoutEffect(() => {
    const area = viewport.current;
    if (!area) return;
    const reveal = () => {
      const selected = Array.from(area.querySelectorAll<HTMLButtonElement>('[aria-pressed="true"]'));
      if (!selected.length) return;
      const first = selected[0], last = selected[selected.length - 1];
      const left = first.offsetLeft, right = last.offsetLeft + last.offsetWidth;
      // Reveal the whole page's group when it fits; otherwise start at its first tag.
      if (right - left > area.clientWidth) { area.scrollLeft = left; return; }
      if (left < area.scrollLeft) area.scrollLeft = left;
      else if (right > area.scrollLeft + area.clientWidth) area.scrollLeft = right - area.clientWidth;
    };
    reveal();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    observer?.observe(area);
    if (area.firstElementChild) observer?.observe(area.firstElementChild);
    return () => observer?.disconnect();
  }, [selectionKey, sections]);

  return <footer className="alr-footer" data-lyrics-navigation>
    {sections.length > 0 && <nav className="alr-section-scroll" ref={viewport} aria-label={zh ? '歌詞段落' : 'Lyrics sections'} aria-description={zh ? '亮起的標籤為當頁所有段落；點按可跳到該段落所在頁' : 'Highlighted tags show all sections on this page; press to go to a section’s page'}>
      <div className="alr-section-tabs">
        <MeasuredSlidingSelection value={selectionKey} selection="range" layoutKey={`${language}:${sections.map(section => section.id).join(',')}`}/>
        {sections.map((section, index) => {
          const label = section.label || `${zh ? '段落' : 'Section'} ${index + 1}`;
          return <button type="button" key={section.id} className="alr-section-button ui-press" data-lyrics-section-target={section.id}
            aria-label={zh ? `跳到 ${label}` : `Go to ${label}`} title={label} aria-pressed={visible.has(section.id)}
            onClick={() => onSelect(section.id)}><span>{songMapDisplayCode(section.label) || String(index + 1)}</span></button>;
        })}
      </div>
    </nav>}
    <span className="alr-page-count" role="status" aria-live="polite" aria-label={zh ? `第 ${page} 頁，共 ${pages} 頁` : `Page ${page} of ${pages}`}>{page} / {pages}</span>
  </footer>;
}
