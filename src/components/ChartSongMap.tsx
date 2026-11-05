import { type CSSProperties, useState } from 'react';
import { Pencil, SlidersHorizontal, ChevronDown } from 'lucide-react';
import type { AppLanguage, SongMapStep } from '../types';
import SongMapToken from './SongMapToken';
import MapEditor, { type SongMapEditorOptions } from './SongMapEditor';
export type { SongMapEditorOptions } from './SongMapEditor';

export default function ChartSongMap({ steps, editor, language, title, inline, firstPage, onInfo, infoAnchor, visible = true }: {
  steps: SongMapStep[]; editor?: SongMapEditorOptions; language: AppLanguage; title: string; inline: boolean; firstPage?: boolean;
  onInfo?: (element: HTMLElement) => void; infoAnchor?: string; visible?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const zh = language === 'zh';
  if ((!visible || !steps.length) && !editor && !onInfo) return null;
  const dense = steps.length > 20;
  const columns = dense ? Math.ceil(steps.length / 2) : steps.length;
  return <div className={visible ? "chart-map" : "chart-map-hidden-settings"} data-dense={dense || undefined} data-inline={!firstPage && inline || undefined}
    data-heading-map={firstPage || undefined}
    style={{ '--map-columns': Math.max(1, columns) } as CSSProperties}
    data-chart-song-map={visible || undefined} aria-label={zh ? '曲序' : 'Song map'}>
    {visible && <div className="chart-map-steps">{steps.map((step, index) => <SongMapToken key={index} step={step} zh={zh}/>)}</div>}
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
