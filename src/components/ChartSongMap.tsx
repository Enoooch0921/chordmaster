import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { Pencil, SlidersHorizontal, ChevronDown } from 'lucide-react';
import type { AppLanguage, SongMapStep } from '../types';
import SongMapToken from './SongMapToken';
import MapEditor, { type SongMapEditorOptions } from './SongMapEditor';
import { songMapLabel } from '../lib/songMap';
export type { SongMapEditorOptions } from './SongMapEditor';

/** Reserve readable room for numbered cues instead of shrinking them into a circle. */
const tokenWidth = (step: SongMapStep, dense: boolean) => {
  const code = songMapLabel(step.label).code;
  const numbered = /^(I|V|Pc|C|Po|R|B|T|Ta|It|Is|Vp|Bd|E|O)(\d+(?:[/&,、]\d+)*)$/.exec(code);
  const repeatSpace = step.repeats > 1 ? 10 : 0;
  if (!numbered || (numbered[1].length === 1 && numbered[2].length === 1)) return (dense ? 20 : 27) + repeatSpace;
  return Math.max(dense ? 40 : 48, numbered[1].length * (dense ? 7 : 8) + numbered[2].length * (dense ? 6.5 : 7) + 16) + repeatSpace;
};

export default function ChartSongMap({ steps, editor, language, title, inline, firstPage, onInfo, infoAnchor, visible = true }: {
  steps: SongMapStep[]; editor?: SongMapEditorOptions; language: AppLanguage; title: string; inline: boolean; firstPage?: boolean;
  onInfo?: (element: HTMLElement) => void; infoAnchor?: string; visible?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(650);
  const stepsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = stepsRef.current;
    if (!container) return;
    let disposed = false, frame = 0;
    const fitLabels = () => {
      // Read natural, untransformed widths together before applying the fits.
      // This also handles custom labels and Safari's fractional font metrics.
      if (container.clientWidth > 0) setAvailableWidth(width => width === container.clientWidth ? width : container.clientWidth);
      const fits = Array.from(container.querySelectorAll<HTMLElement>('[data-map-fit-label]')).map(label => ({
        label, scale: Math.min(1, Math.max(0, label.parentElement!.clientWidth - (label.parentElement!.hasAttribute('data-wide') ? 10 : 2)) / Math.max(1, label.scrollWidth)),
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
  }, [steps, visible, availableWidth]);
  const zh = language === 'zh';
  if ((!visible || !steps.length) && !editor && !onInfo) return null;
  const normalWidths = steps.map(step => tokenWidth(step, false));
  const dense = steps.length > 20 || normalWidths.reduce((sum, width) => sum + width + 3, -3) > availableWidth;
  const columns = dense ? Math.ceil(steps.length / 2) : steps.length;
  const columnWidths = Array.from({ length: columns }, (_, index) => Math.max(tokenWidth(steps[index], dense),
    dense && steps[index + columns] ? tokenWidth(steps[index + columns], dense) : 0));
  const widthScale = Math.min(1, Math.max(0, availableWidth - Math.max(0, columns - 1) * (dense ? 2 : 3)) / Math.max(1, columnWidths.reduce((sum, width) => sum + width, 0)));
  return <div className={visible ? "chart-map" : "chart-map-hidden-settings"} data-dense={dense || undefined} data-inline={!firstPage && inline || undefined}
    data-heading-map={firstPage || undefined}
    style={{ '--map-columns': Math.max(1, columns) } as CSSProperties}
    data-chart-song-map={visible || undefined} aria-label={zh ? '曲序' : 'Song map'}>
    {visible && <div ref={stepsRef} className="chart-map-steps" style={{ gridTemplateColumns: columnWidths.map(width => `${width * widthScale}px`).join(' ') }}>{steps.map((step, index) => <SongMapToken key={index} step={step} zh={zh}/>)}</div>}
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
