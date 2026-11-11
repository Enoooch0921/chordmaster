import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type TouchEvent } from 'react';
import { ArrowLeft, ArrowRight, Copy, Minus, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import type { AppLanguage, SongMapStep } from '../types';
import { expandSongMapSectionLabel, songMapDisplayParts, songMapLabel, songMapSuggestions } from '../lib/songMap';
import ResponsiveDialog from './ResponsiveDialog';
import './SongMapEditor.css';
import { isKeyboardInteraction, useKeyboardMotionInterrupt, useUiMotion } from '../hooks/useUiMotion';
import { UI_EASE_OUT } from '../lib/uiMotion';

export interface SongMapEditorOptions {
  scope: 'library' | 'setlist';
  fallback: SongMapStep[];
  sections?: SongMapStep[];
  setlistName?: string;
  onSave: (steps: SongMapStep[] | undefined) => void;
}
type Row = { id: number; label: string; repeats: string };
type Draft = { rows: Row[]; selected?: number; inherited: boolean };
const makeRow = (step: SongMapStep, id: number): Row => ({ id, label: step.label, repeats: String(step.repeats) });
const blockFamily = (label: string) => {
  const name = songMapLabel(label).name;
  return /^Verse\b/.test(name) ? 'verse' : /Chorus\b/.test(name) ? 'chorus' : /^Bridge\b/.test(name) ? 'bridge' : 'other';
};

export default function SongMapEditor({ steps, options, language, title, close }: {
  steps: SongMapStep[]; options: SongMapEditorOptions; language: AppLanguage; title: string; close: () => void;
}) {
  const zh = language === 'zh', listId = useId(), sequence = useRef(steps.length);
  const [draft, setDraft] = useState<Draft>(() => ({ rows: steps.map(makeRow), selected: steps.length ? 0 : undefined, inherited: false }));
  const [history, setHistory] = useState<Draft[]>([]);
  const [custom, setCustom] = useState('');
  const [insert, setInsert] = useState<'end' | 'before' | 'after'>('end');
  const [message, setMessage] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [dragging, setDragging] = useState<number>();
  const [drop, setDrop] = useState<{ id: number; after: boolean }>();
  const drag = useRef<{ id: number; pointer: number; x: number; y: number; moved: boolean; target?: { id: number; after: boolean } } | null>(null);
  const suppressClick = useRef(false), body = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ id: number; pointer: number; x: number; y: number; active: boolean } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollFrame = useRef<number | null>(null), scrollTime = useRef<number | null>(null);
  const scrollRemainder = useRef(0);
  const preference = useUiMotion();
  const previewLayer = useRef<HTMLDivElement>(null);
  const preview = useRef<{ node: HTMLElement; offsetX: number; offsetY: number; left: number; top: number; width: number; blockWidth: number } | null>(null);
  const previewExit = useRef<Animation | null>(null);
  function clearPreview() {
    previewExit.current?.cancel(); previewExit.current = null;
    preview.current?.node.remove(); preview.current = null;
  }
  function positionPreview(x: number, y: number) {
    const current = preview.current;
    if (!current) return;
    const left = Math.max(0, Math.min(current.width - current.blockWidth, x - current.left - current.offsetX));
    current.node.style.transform = `translate3d(${left}px, ${Math.max(0, y - current.top - current.offsetY)}px, 0)`;
  }
  function showPreview(id: number, x: number, y: number, touch = false) {
    const layer = previewLayer.current;
    const source = body.current?.querySelector<HTMLElement>(`[data-map-step-id="${id}"]`);
    if (!layer || !source) return;
    clearPreview();
    const rect = source.getBoundingClientRect(), bounds = layer.getBoundingClientRect();
    const node = source.cloneNode(true) as HTMLElement;
    node.removeAttribute('data-map-step-id'); node.removeAttribute('data-dragging'); node.removeAttribute('aria-label');
    node.className = 'map-drag-preview'; node.tabIndex = -1; node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true');
    node.style.width = `${rect.width}px`; node.style.height = `${rect.height}px`;
    // The dialog's general button press transition must not trail the pointer.
    node.style.transition = 'none';
    layer.appendChild(node);
    preview.current = { node, offsetX: x - rect.left, offsetY: touch ? rect.height + 12 : y - rect.top, left: bounds.left, top: bounds.top, width: bounds.width, blockWidth: rect.width };
    positionPreview(x, y);
  }
  function releasePreview() {
    const node = preview.current?.node;
    if (!node) return;
    if (isKeyboardInteraction() || typeof node.animate !== 'function') { clearPreview(); return; }
    const animation = node.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: preference.reduced ? 80 : 125, easing: `cubic-bezier(${UI_EASE_OUT.join(',')})`, fill: 'forwards'
    });
    previewExit.current = animation;
    void animation.finished?.then(() => { if (previewExit.current === animation) clearPreview(); }).catch(() => {});
  }
  useKeyboardMotionInterrupt(() => {
    endTouch(true);
    if (drag.current) finishDrag({ pointerId: drag.current.pointer }, true);
    clearPreview();
  });
  useLayoutEffect(() => { if (preference.reduced && previewExit.current) clearPreview(); }, [preference.reduced]);
  const dragPoint = useRef<{ x: number; y: number } | null>(null);
  function stopAutoScroll() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
    scrollTime.current = null;
    scrollRemainder.current = 0;
    dragPoint.current = null;
  }
  useEffect(() => {
    const element = body.current;
    // React's delegated touch listeners are passive. Cancel native panning only
    // after a deliberate hold; an ordinary swipe keeps the browser's scroll.
    const preventDragScroll = (event: globalThis.TouchEvent) => {
      if (touchStart.current?.active && event.touches.length === 1 && event.cancelable) event.preventDefault();
    };
    element?.addEventListener('touchmove', preventDragScroll, { passive: false });
    return () => { element?.removeEventListener('touchmove', preventDragScroll); clearTimeout(holdTimer.current); stopAutoScroll(); clearPreview(); };
  }, []);
  const { rows } = draft, selectedIndex = rows.findIndex(r => r.id === draft.selected), selected = rows[selectedIndex];
  const choices = [...new Set([...(options.sections ?? options.fallback), ...options.fallback, ...steps].flatMap(s => expandSongMapSectionLabel(s.label)))];
  const suggestions = [...new Set([...choices, ...rows.map(r => r.label), ...songMapSuggestions])];
  const valid = rows.length > 0 && rows.every(r => r.label.trim() && Number.isSafeInteger(Number(r.repeats)) && Number(r.repeats) > 0);
  const commit = (next: Draft) => { setHistory(h => [...h.slice(-49), draft]); setDraft(next); };
  const updateRows = (next: Row[], selectedId = draft.selected) => commit({ rows: next, selected: selectedId, inherited: false });
  function add(label: string) {
    const name = songMapLabel(label).name;
    if (!name) return;
    const row = makeRow({ label: name, repeats: 1 }, sequence.current++), next = [...rows];
    const at = insert === 'end' || selectedIndex < 0 ? rows.length : selectedIndex + (insert === 'after' ? 1 : 0);
    next.splice(at, 0, row); updateRows(next, row.id);
    if (insert !== 'end') setInsert('after');
    setMessage(zh ? `已加入 ${name}，第 ${at + 1} 段` : `Added ${name} at position ${at + 1}`);
  }
  function update(field: 'label' | 'repeats', value: string) {
    updateRows(rows.map(r => r.id === draft.selected ? { ...r, [field]: value } : r));
  }
  function move(id: number, index: number) {
    const row = rows.find(r => r.id === id);
    if (!row || index < 0 || index >= rows.length || rows.indexOf(row) === index) return;
    const next = rows.filter(r => r.id !== id); next.splice(index, 0, row); updateRows(next, id);
    setMessage(zh ? `${row.label} 已移至第 ${index + 1} 段` : `${row.label} moved to position ${index + 1}`);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'touch') return;
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8) return;
    event.preventDefault();
    if (!current.moved) { showPreview(current.id, current.x, current.y); current.moved = true; setDragging(current.id); }
    updateDrop(event.clientX, event.clientY);
  }
  function measureDrop(x: number, y: number) {
    const current = drag.current;
    if (!current) return;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-map-step-id]');
    if (hit && body.current?.contains(hit) && Number(hit.dataset.mapStepId) !== current.id) {
      const rect = hit.getBoundingClientRect();
      current.target = { id: Number(hit.dataset.mapStepId), after: x > rect.left + rect.width / 2 };
    } else current.target = undefined;
    const target = current.target;
    setDrop(previous => previous?.id === target?.id && previous?.after === target?.after ? previous : target);
  }
  function autoScroll(time: number) {
    scrollFrame.current = null;
    const element = body.current, point = dragPoint.current;
    if (!element || !point || !drag.current?.moved) return;
    const bounds = element.getBoundingClientRect();
    const velocity = point.y < bounds.top + 32 ? -600 * Math.min(1, (bounds.top + 32 - point.y) / 32) ** 2
      : point.y > bounds.bottom - 32 ? 600 * Math.min(1, (point.y - bounds.bottom + 32) / 32) ** 2 : 0;
    if (!velocity || point.x < bounds.left || point.x > bounds.right) { scrollTime.current = null; scrollRemainder.current = 0; return; }
    const elapsed = Math.min(32, Math.max(0, time - (scrollTime.current ?? time)));
    scrollTime.current = time;
    const before = element.scrollTop, limit = Math.max(0, element.scrollHeight - element.clientHeight);
    const desired = Math.max(0, Math.min(limit, before + velocity * elapsed / 1000 + scrollRemainder.current));
    element.scrollTop = desired;
    // WebKit can quantize scrollTop. Carry fractional pixels instead of losing
    // more distance per second on displays that deliver more frames.
    scrollRemainder.current = desired - element.scrollTop;
    if (element.scrollTop === before && (desired <= 0 || desired >= limit)) return;
    if (element.scrollTop !== before) measureDrop(point.x, point.y);
    scrollFrame.current = requestAnimationFrame(autoScroll);
  }
  function updateDrop(x: number, y: number) {
    dragPoint.current = { x, y };
    positionPreview(x, y);
    measureDrop(x, y);
    if (scrollFrame.current === null) {
      scrollTime.current = performance.now();
      scrollRemainder.current = 0;
      scrollFrame.current = requestAnimationFrame(autoScroll);
    }
  }
  function finishDrag(event: { pointerId: number }, cancel = false) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    stopAutoScroll();
    suppressClick.current = current.moved;
    if (!cancel && current.moved && current.target) {
      const remaining = rows.filter(r => r.id !== current.id), targetIndex = remaining.findIndex(r => r.id === current.target!.id);
      if (targetIndex >= 0) move(current.id, targetIndex + (current.target.after ? 1 : 0));
    }
    drag.current = null; setDragging(undefined); setDrop(undefined);
    releasePreview();
  }
  function beginTouch(event: TouchEvent<HTMLButtonElement>, id: number) {
    clearTimeout(holdTimer.current);
    if (event.touches.length !== 1) { endTouch(true); return; }
    suppressClick.current = false;
    const finger = event.touches[0];
    touchStart.current = { id, pointer: finger.identifier, x: finger.clientX, y: finger.clientY, active: false };
    holdTimer.current = setTimeout(() => {
      const current = touchStart.current;
      if (!current) return;
      current.active = true;
      showPreview(current.id, current.x, current.y, true);
      drag.current = { ...current, moved: true };
      setDragging(current.id);
      setDraft(d => ({ ...d, selected: current.id }));
      setRenaming(false);
      setMessage(zh ? '可以拖動段落了' : 'Ready to move the section');
    }, 350);
  }
  function moveTouch(event: TouchEvent<HTMLButtonElement>) {
    const current = touchStart.current;
    if (!current) return;
    const finger = Array.from(event.touches).find(t => t.identifier === current.pointer);
    if (!finger || event.touches.length !== 1) { endTouch(true); return; }
    if (current.active) updateDrop(finger.clientX, finger.clientY);
    else if (Math.hypot(finger.clientX - current.x, finger.clientY - current.y) > 8) endTouch(true);
  }
  function endTouch(cancel = false) {
    clearTimeout(holdTimer.current);
    const current = touchStart.current;
    touchStart.current = null;
    if (current?.active) finishDrag({ pointerId: current.pointer }, cancel);
  }
  const resetLabel = options.scope === 'setlist' ? (zh ? '沿用預設曲序' : 'Use default map') : (zh ? '依譜面產生' : 'Use chart sections');
  return <ResponsiveDialog wide subtitleBelow title={options.scope === 'library' ? (zh ? '預設曲序' : 'Default song map') : (zh ? '本場曲序' : 'Service song map')}
    subtitle={[options.setlistName, title].filter(Boolean).join(' · ')} closeLabel={zh ? '取消' : 'Cancel'} onClose={close}>
    <div ref={previewLayer} className="map-drag-layer" aria-hidden="true" inert />
    <div ref={body} className="map-editor-body">
      <div className="map-editor-heading map-sequence-heading"><h3>{zh ? '演奏順序' : 'Performance order'}</h3>
        <div className="map-editor-small-actions">
          <span>{zh ? '按住積木拖動' : 'Hold a block to move'}</span>
          <button type="button" disabled={!history.length} aria-label={zh ? '復原曲序變更' : 'Undo map change'} title={zh ? '復原' : 'Undo'} onClick={() => { setDraft(history.at(-1)!); setHistory(history.slice(0, -1)); setMessage(zh ? '已復原曲序' : 'Map change undone'); }}><Undo2 size={17}/></button>
        </div>
      </div>
      {!rows.length ? <p className="map-editor-empty">{zh ? '點選下方段落，開始排列曲序。' : 'Tap a section below to start arranging.'}</p> :
        <ol className="map-edit-sequence" aria-label={zh ? '目前曲序' : 'Current sequence'}>{rows.map((row, index) => <li key={row.id}
          data-drop={drop?.id === row.id ? drop.after ? 'after' : 'before' : undefined}>
          <button type="button" data-map-step-id={row.id} data-family={blockFamily(row.label)} data-dragging={dragging === row.id || undefined} aria-pressed={row.id === draft.selected}
            aria-label={zh ? `第 ${index + 1} 段 ${row.label}，共 ${row.repeats} 遍` : `Section ${index + 1}, ${row.label}, ${row.repeats} times`}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" title={row.label}
            onContextMenu={event => event.preventDefault()}
            onClick={() => { if (!suppressClick.current) { setDraft({ ...draft, selected: row.id }); setRenaming(false); } suppressClick.current = false; }}
            onKeyDown={e => { if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); move(row.id, index + (e.key === 'ArrowLeft' ? -1 : 1)); } }}
            onPointerDown={e => { if (e.pointerType === 'touch' || e.button !== 0) return; suppressClick.current = false; drag.current = { id: row.id, pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
            onPointerMove={pointerMove} onPointerUp={e => { if (e.pointerType !== 'touch') finishDrag(e); }} onPointerCancel={e => { if (e.pointerType !== 'touch') finishDrag(e, true); }} onLostPointerCapture={e => { if (e.pointerType !== 'touch') finishDrag(e, true); }}
            onTouchStart={e => beginTouch(e, row.id)} onTouchMove={moveTouch} onTouchEnd={() => endTouch()} onTouchCancel={() => endTouch(true)}>
            {Number(row.repeats) > 1 && <span className="map-block-repeats" aria-hidden="true">×{row.repeats}</span>}
            <span className="map-block-code" data-wide={songMapDisplayParts(row.label).code.length > 4 || undefined} data-custom={(songMapLabel(row.label).code !== 'Tag' && songMapLabel(row.label).code === songMapLabel(row.label).name) || undefined} aria-hidden="true">{songMapDisplayParts(row.label).code}</span>
            <span className="map-block-name" aria-hidden="true">{songMapLabel(row.label).name}</span>
          </button>
        </li>)}</ol>}
    <div className="map-selection-editor">
      {selected ? <>
        <div className="map-selected-name">
          {renaming ? <input autoFocus list={listId} value={selected.label} aria-label={zh ? '選取段落名稱' : 'Selected section name'} onChange={e => update('label', e.target.value)} /> :
            <button type="button" className="map-rename" aria-label={zh ? '修改選取段落名稱' : 'Rename selected section'} onClick={() => setRenaming(true)}>{selected.label}<Pencil size={13}/></button>}
          <span>{zh ? `第 ${selectedIndex + 1} 段` : `Section ${selectedIndex + 1}`}</span>
        </div>
        <div className="map-selected-controls">
          <div className="map-repeat-control">
            <button type="button" aria-label={zh ? '減少遍數' : 'Fewer repeats'} disabled={Number(selected.repeats) <= 1} onClick={() => update('repeats', String(Math.max(1, Number(selected.repeats) - 1)))}><Minus size={17}/></button>
            <input type="number" inputMode="numeric" min={1} step={1} aria-label={zh ? '總遍數' : 'Repeat count'} value={selected.repeats} onChange={e => update('repeats', e.target.value)} />
            <span>{zh ? '遍' : '×'}</span>
            <button type="button" aria-label={zh ? '增加遍數' : 'More repeats'} onClick={() => update('repeats', String(Math.max(1, Number(selected.repeats) || 0) + 1))}><Plus size={17}/></button>
          </div>
          <div className="map-selected-actions">
            <button type="button" disabled={selectedIndex === 0} aria-label={zh ? '向前移動' : 'Move earlier'} title={zh ? '向前移動' : 'Move earlier'} onClick={() => move(selected.id, selectedIndex - 1)}><ArrowLeft size={17}/></button>
            <button type="button" disabled={selectedIndex === rows.length - 1} aria-label={zh ? '向後移動' : 'Move later'} title={zh ? '向後移動' : 'Move later'} onClick={() => move(selected.id, selectedIndex + 1)}><ArrowRight size={17}/></button>
            <button type="button" aria-label={zh ? '複製選取段落' : 'Duplicate section'} title={zh ? '複製' : 'Duplicate'} onClick={() => { const row = { ...selected, id: sequence.current++ }, next = [...rows]; next.splice(selectedIndex + 1, 0, row); updateRows(next, row.id); }}><Copy size={17}/></button>
            <button type="button" aria-label={zh ? '刪除選取段落' : 'Remove section'} title={zh ? '刪除' : 'Remove'} onClick={() => { const next = rows.filter(r => r.id !== selected.id); updateRows(next, next[Math.min(selectedIndex, next.length - 1)]?.id); }}><Trash2 size={17}/></button>
          </div>
        </div>
      </> : <p className="map-editor-help">{zh ? '加入段落後，可在這裡調整。' : 'Add a section to adjust it here.'}</p>}
      <datalist id={listId}>{suggestions.map(label => <option key={label} value={label}/>)}</datalist>
      {!valid && rows.length > 0 && <p className="map-editor-error" role="alert">{zh ? '請填寫段落名稱，遍數須為 1 以上的整數。' : 'Enter a section name and a whole repeat count of at least 1.'}</p>}
      <span className="sr-only" role="status">{message}</span>
    </div>
      <div className="map-editor-heading map-source-heading"><h3>{zh ? '加入段落' : 'Add a section'}</h3>
        <select aria-label={zh ? '新增段落位置' : 'Insert position'} value={selected ? insert : 'end'} onChange={e => setInsert(e.target.value as typeof insert)}>
          <option value="end">{zh ? '點一下，接到後面' : 'Append to the end'}</option>
          {selected && <><option value="before">{zh ? `第 ${selectedIndex + 1} 段之前` : `Before section ${selectedIndex + 1}`}</option>
            <option value="after">{zh ? `第 ${selectedIndex + 1} 段之後` : `After section ${selectedIndex + 1}`}</option></>}
        </select>
      </div>
      <div className="map-section-picker" aria-label={zh ? '可加入的段落' : 'Available sections'}>
        {(choices.length ? choices : songMapSuggestions).map(label => <button key={label} type="button" title={label}
          aria-label={zh ? `加入 ${label}` : `Add ${label}`} onClick={() => add(label)}>
          <strong>{songMapDisplayParts(label).code}</strong><span className="map-picker-name">{label}</span>
        </button>)}
      </div>
      <div className="map-extra-actions">
        <details className="map-custom-section"><summary>{zh ? '其他／自訂段落' : 'Other / custom section'}</summary>
          <form onSubmit={e => { e.preventDefault(); add(custom); setCustom(''); }}>
            <input list={listId} aria-label={zh ? '自訂段落名稱' : 'Custom section name'} value={custom} onChange={e => setCustom(e.target.value)} placeholder={zh ? '選擇或輸入段落名稱' : 'Choose or enter a section'} />
            <button type="submit" disabled={!custom.trim()}><Plus size={17}/>{zh ? '加入' : 'Add'}</button>
          </form>
        </details>
        <button className="map-clear" type="button" disabled={!rows.length} onClick={() => { updateRows([], undefined); setInsert('end'); setMessage(zh ? '已清空，可按復原恢復' : 'Cleared; use Undo to restore'); }}>{zh ? '清空重排' : 'Clear'}</button>
      </div>
    </div>
    <footer className="map-editor-footer">
      <button type="button" onClick={() => { const next = options.fallback.map(s => makeRow(s, sequence.current++)); commit({ rows: next, selected: next[0]?.id, inherited: true }); setInsert('end'); }}>{resetLabel}</button>
      <button type="button" className="map-editor-save" disabled={!draft.inherited && !valid} onClick={() => { options.onSave(draft.inherited ? undefined : rows.map(r => ({ label: songMapLabel(r.label).name, repeats: Number(r.repeats) }))); close(); }}>{zh ? '儲存曲序' : 'Save map'}</button>
    </footer>
  </ResponsiveDialog>;
}
