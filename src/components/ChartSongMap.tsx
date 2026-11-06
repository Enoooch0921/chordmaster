import { useLayoutEffect, useRef, useState } from 'react';
import { Pencil, SlidersHorizontal, ChevronDown } from 'lucide-react';
import type { AppLanguage, SongMapStep } from '../types';
import SongMapToken from './SongMapToken';
import MapEditor, { type SongMapEditorOptions } from './SongMapEditor';
import { songMapDisplayCode } from '../lib/songMap';
export type { SongMapEditorOptions } from './SongMapEditor';

// Estimates cover the first render; layout measurement then uses the actual font.
const estimateLabelWidth = (step: SongMapStep) => Array.from(songMapDisplayCode(step.label))
  .reduce((sum, char) => sum + (/[^\x00-\x7F]/.test(char) ? 13 : 7.5), 0)
  + (step.repeats > 1 ? String(step.repeats).length * 7 + 17 : 0);
const rowWidth = (widths: number[], gap: number) => widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;

export default function ChartSongMap({ steps, editor, language, title, inline, firstPage, onInfo, infoAnchor, visible = true }: {
  steps: SongMapStep[]; editor?: SongMapEditorOptions; language: AppLanguage; title: string; inline: boolean; firstPage?: boolean;
  onInfo?: (element: HTMLElement) => void; infoAnchor?: string; visible?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(650);
  const [labelWidths, setLabelWidths] = useState<number[]>([]);
  const stepsRef = useRef<HTMLDivElement>(null);
  const widths = steps.map((step, index) => labelWidths[index] ?? estimateLabelWidth(step));
  const normalWidths = widths.map(width => Math.max(29, width + 16));
  const compactWidths = widths.map(width => Math.max(24, width + 8));
  // Use the available line before shrinking text or wrapping: long labels often
  // fit at full size once the spaces around the blocks are tightened.
  const compact = rowWidth(normalWidths, 4) > availableWidth;
  const dense = compact && rowWidth(compactWidths, 2) > availableWidth;
  const tokenWidths = dense ? widths.map(width => Math.max(24, width * 11 / 13 + 8)) : compact ? compactWidths : normalWidths;
  const gap = compact ? 2 : 4;
  let split = steps.length;
  if (dense && rowWidth(tokenWidths, gap) > availableWidth && steps.length > 1) {
    // Balance by rendered width, so Intro / Inter / Outro and custom cues get room.
    let best = Infinity;
    for (let index = 1; index < steps.length; index++) {
      const widest = Math.max(rowWidth(tokenWidths.slice(0, index), gap), rowWidth(tokenWidths.slice(index), gap));
      if (widest < best) { best = widest; split = index; }
    }
  }
  const rows = split < steps.length ? [steps.slice(0, split), steps.slice(split)] : [steps];
  useLayoutEffect(() => {
    const container = stepsRef.current;
    if (!container) return;
    let disposed = false, frame = 0;
    const fitLabels = () => {
      // Read natural, untransformed widths together before applying the fits.
      // This also handles custom labels and Safari's fractional font metrics.
      if (container.clientWidth > 0) setAvailableWidth(width => width === container.clientWidth ? width : container.clientWidth);
      const labels = Array.from(container.querySelectorAll<HTMLElement>('[data-map-fit-label]'));
      const measured = labels.map(label => label.scrollWidth);
      if (measured.every(width => width > 0)) setLabelWidths(previous => previous.length === measured.length
        && previous.every((width, index) => width === measured[index]) ? previous : measured);
      const fits = labels.map(label => ({ label,
        scale: Math.min(dense ? 11 / 13 : 1, Math.max(0, label.parentElement!.clientWidth - (compact ? 8 : 16)) / Math.max(1, label.scrollWidth)),
      }));
      fits.forEach(({ label, scale }) => label.style.setProperty('--map-label-scale', String(scale)));
    };
    const scheduleFit = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitLabels);
    };
    fitLabels();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleFit) : null;
    observer?.observe(container);
    void document.fonts?.ready.then(scheduleFit);
    document.fonts?.addEventListener('loadingdone', scheduleFit);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.fonts?.removeEventListener('loadingdone', scheduleFit);
    };
  }, [steps, visible, availableWidth, labelWidths, compact, dense]);
  const zh = language === 'zh';
  if ((!visible || !steps.length) && !editor && !onInfo) return null;
  return <div className={visible ? "chart-map" : "chart-map-hidden-settings"} data-compact={compact || undefined} data-dense={dense || undefined} data-wrapped={split < steps.length || undefined} data-inline={!firstPage && inline || undefined}
    data-heading-map={firstPage || undefined}
    data-chart-song-map={visible || undefined} aria-label={zh ? '曲序' : 'Song map'}>
    {visible && <div ref={stepsRef} className="chart-map-steps">{rows.map((row, rowIndex) => {
      const start = rowIndex === 0 ? 0 : split;
      const rowWidths = tokenWidths.slice(start, start + row.length);
      const scale = Math.min(1, Math.max(0, availableWidth - Math.max(0, row.length - 1) * gap)
        / Math.max(1, rowWidths.reduce((sum, width) => sum + width, 0)));
      return <div className="chart-map-row" key={rowIndex} style={{ gridTemplateColumns: rowWidths.map(width => `${width * scale}px`).join(' ') }}>
        {row.map((step, index) => <SongMapToken key={start + index} step={step} zh={zh}/>)}
      </div>;
    })}</div>}
    {editor && onInfo ? (
      <label className="chart-map-settings" data-preview-only-control data-preview-edit-ui onClick={e => e.stopPropagation()}>
        <SlidersHorizontal size={13} aria-hidden="true"/>{zh ? '歌曲設定' : 'Song settings'}<ChevronDown size={11} aria-hidden="true"/>
        <select value="" aria-label={zh ? '歌曲設定' : 'Song settings'} data-preview-edit-anchor={infoAnchor}
          onChange={e => { if (e.target.value === 'map') setEditing(true); else if (e.target.value === 'info') onInfo(e.currentTarget); }}>
          <option value="" disabled>{zh ? '歌曲設定' : 'Song settings'}</option>
          <option value="info">{zh ? '歌曲資訊' : 'Song information'}</option>
          <option value="map">{zh ? '編輯曲序' : 'Edit song map'}</option>
        </select>
      </label>
    ) : onInfo ? (
      <button type="button" className="chart-map-settings" data-preview-only-control data-preview-edit-ui data-preview-edit-anchor={infoAnchor}
        aria-label={zh ? '編輯歌曲資訊' : 'Edit song information'} onClick={e => { e.stopPropagation(); onInfo(e.currentTarget); }}>
        <SlidersHorizontal size={13}/>{zh ? '歌曲資訊' : 'Song information'}
      </button>
    ) : editor && (
      <button type="button" data-preview-edit-ui className="chart-map-edit" aria-label={zh ? '編輯曲序' : 'Edit song map'} onClick={e => { e.stopPropagation(); setEditing(true); }}>
        <Pencil size={12}/>{zh ? '曲序' : 'Map'}
      </button>
    )}
    {editing && editor && <MapEditor steps={steps} options={editor} title={title} language={language} close={() => setEditing(false)}/>}
  </div>;
}
