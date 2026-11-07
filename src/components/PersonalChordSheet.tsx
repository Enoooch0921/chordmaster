import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Eraser, Eye, EyeOff, Highlighter, LockKeyhole, Pencil, Redo2, Undo2 } from 'lucide-react';
import ChordSheet from './ChordSheet';
import PersonalNotesPage from './PersonalNotesPage';
import { NOTE_COLORS, type NoteTool } from '../lib/personalNotes';
import { usePersonalNotes } from '../lib/personalNotesStore';
import type { NoteShapeFeedback } from '../lib/noteShapes';
import './PersonalNotes.css';
const MemoChordSheet = memo(ChordSheet);

type Props = ComponentProps<typeof ChordSheet> & { noteOwner?: string; noteSongId?: string; notesActive?: boolean; notesPerformance?: boolean; notesOpen?: boolean; onNotesOpenChange?: (open: boolean) => void };
export default function PersonalChordSheet(props: Props) {
  const { noteOwner, noteSongId, notesActive, notesPerformance, notesOpen, onNotesOpenChange, ...sheetProps } = props;
  const root = useRef<HTMLDivElement>(null);
  if (!noteOwner || !noteSongId) return <ChordSheet {...sheetProps} />;
  return <>
    <div ref={root} className="personal-notes-sheet" data-personal-notes-owner={noteOwner}>
      <MemoChordSheet {...sheetProps} />
    </div>
    {(!notesPerformance || notesActive !== false) && <PersonalNotes key={JSON.stringify([noteOwner, noteSongId])}
      root={root} noteOwner={noteOwner} noteSongId={noteSongId} language={sheetProps.language}
      notesActive={notesActive} notesPerformance={notesPerformance} notesOpen={notesOpen} onNotesOpenChange={onNotesOpenChange} />}
  </>;
}
function PersonalNotes({ root, noteOwner, noteSongId, notesActive = true, notesPerformance = false, notesOpen, onNotesOpenChange, language }:
  Pick<Props, 'notesActive' | 'notesPerformance' | 'notesOpen' | 'onNotesOpenChange' | 'language'> & {
    root: RefObject<HTMLDivElement | null>; noteOwner: string; noteSongId: string;
  }) {
  const { store, state } = usePersonalNotes(noteOwner, noteSongId);
  const [pages, setPages] = useState<HTMLElement[]>([]);
  const [localOpen, setLocalOpen] = useState(false);
  const open = notesOpen ?? localOpen;
  const setOpen = onNotesOpenChange ?? setLocalOpen;
  const [visible, setVisible] = useState(true);
  const [tool, setTool] = useState<NoteTool>('pen');
  const [color, setColor] = useState<string>(NOTE_COLORS[0]);
  const [width, setWidth] = useState(2.5);
  const [options, setOptions] = useState(false);
  const [available, setAvailable] = useState(false);
  const [shapeEnabled, setShapeEnabled] = useState(true);
  const [shape, setShape] = useState<NoteShapeFeedback>(null);
  const zh = language === 'zh';
  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const appRoot = container.closest('[data-app-root]');
    const updateAvailability = () => setAvailable(!appRoot?.hasAttribute('inert') && appRoot?.getAttribute('aria-hidden') !== 'true');
    updateAvailability();
    const availability = new MutationObserver(updateAvailability);
    if (appRoot) availability.observe(appRoot, { attributes: true, attributeFilter: ['inert', 'aria-hidden'] });
    const collect = () => {
      const next = [...container.querySelectorAll<HTMLElement>('[data-print-page]')];
      setPages(old => old.length === next.length && old.every((p, i) => p === next[i]) ? old : next);
    };
    collect();
    const observer = new MutationObserver(records => {
      if (records.some(r => !(r.target as Element).closest?.('[data-personal-notes-layer]'))) collect();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => { observer.disconnect(); availability.disconnect(); };
  }, [root]);
  useLayoutEffect(() => { if (!notesActive && notesOpen === undefined) setLocalOpen(false); }, [notesActive, notesOpen]);
  useEffect(() => { if (open) setVisible(true); }, [open]);
  useEffect(() => {
    if (!open || !notesActive) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.shiftKey) store.redo(); else store.undo();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open, notesActive, store]);
  const drawing = open && notesActive && available && visible && state.ready;
  const status = { loading: zh ? '載入筆記…' : 'Loading notes…', saving: zh ? '儲存中…' : 'Saving…',
    synced: zh ? '已儲存' : 'Saved', offline: zh ? '已存此裝置，連線後同步' : 'Saved here · sync when online',
    local: zh ? '已存此裝置' : 'Saved on this device', error: zh ? '儲存／同步失敗，點此重試' : 'Save/sync failed · retry' }[state.status];
  const button = (label: string, content: React.ReactNode, action: () => void, pressed?: boolean, disabled?: boolean) =>
    <button key={label} type="button" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={action}>{content}</button>;
  return <>
    {pages.map((page, index) => createPortal(<PersonalNotesPage page={page} pageIndex={index} strokes={state.strokes} drawing={drawing}
      visible={visible} performance={notesPerformance} tool={tool} color={color} width={width} onEdit={store.edit}
      shapeEnabled={shapeEnabled} onShape={setShape} />, page, String(index)))}
    {notesActive && available && (open || notesPerformance || notesOpen === undefined) && createPortal(<div className="personal-notes-tools" data-personal-notes-tools data-preview-edit-ui data-preview-only-control
      data-notes-open={open || undefined} onPointerDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()}>
      {!open ? <button type="button" className="personal-notes-launch" onClick={() => { setVisible(true); setOpen(true); }}>
        <Pencil size={17} /><span>{zh ? '個人筆記' : 'My notes'}</span>{state.strokes.length > 0 && <span className="personal-notes-dot" />}
      </button> : <>
        <div className="personal-notes-caption"><span><LockKeyhole size={12} />{zh ? '僅自己可見' : 'Only you'}</span>
          <button type="button" className="personal-notes-status" onClick={() => { void store.sync(); }} data-error={state.status === 'error' || undefined}>{status}</button></div>
        <div role="toolbar" aria-label={zh ? '個人手寫筆記' : 'Personal handwriting'} className="personal-notes-actions">
          {button(zh ? '畫筆' : 'Pen', <Pencil size={19} />, () => { setTool('pen'); setVisible(true); }, tool === 'pen')}
          {button(zh ? '螢光筆' : 'Highlighter', <Highlighter size={19} />, () => { setTool('highlighter'); setColor('#d97706'); setVisible(true); }, tool === 'highlighter')}
          {button(zh ? '橡皮擦' : 'Eraser', <Eraser size={19} />, () => { setTool('eraser'); setVisible(true); }, tool === 'eraser')}
          {button(zh ? '筆色與粗細' : 'Ink and width', <><i style={{ background: color }} /><ChevronDown size={12} /></>, () => setOptions(!options), options)}
          <span className="personal-notes-separator" />
          {button(zh ? '復原筆記' : 'Undo note', <Undo2 size={19} />, store.undo, undefined, !state.undo)}
          {button(zh ? '重做筆記' : 'Redo note', <Redo2 size={19} />, store.redo, undefined, !state.redo)}
          {button(visible ? (zh ? '隱藏筆記' : 'Hide notes') : (zh ? '顯示筆記' : 'Show notes'), visible ? <Eye size={19} /> : <EyeOff size={19} />, () => setVisible(!visible), !visible)}
          {button(zh ? '完成筆記' : 'Done', <Check size={19} />, () => { setOpen(false); setOptions(false); })}
        </div>
        {options && <><div className="personal-notes-options">
          <div aria-label={zh ? '筆色' : 'Ink color'}>{NOTE_COLORS.map((value, index) => button(
            (zh ? ['黑色', '紅色', '藍色', '綠色', '橙色'] : ['Black', 'Red', 'Blue', 'Green', 'Orange'])[index],
            <i style={{ background: value }} />, () => setColor(value), color === value))}</div>
          <div aria-label={zh ? '筆畫粗細' : 'Stroke width'}>{[1.5, 2.5, 4].map((value, index) => button(
            (zh ? ['細筆', '中筆', '粗筆'] : ['Thin', 'Medium', 'Thick'])[index], <span style={{ height: value, width: 15, background: 'currentColor', borderRadius: 5 }} />,
            () => setWidth(value), width === value))}</div>
        </div><label className="personal-notes-shape-toggle"><input type="checkbox" checked={shapeEnabled} onChange={event => setShapeEnabled(event.target.checked)} />{zh ? '停筆修形' : 'Hold to tidy shapes'}</label></>}
        <p className="personal-notes-hint" aria-live="polite">{shape === 'holding' ? (zh ? '正在修形，先別抬筆…' : 'Tidying · keep the pen down…')
          : shape === 'unrecognized' ? (zh ? '未辨識形狀，保留原筆跡' : 'Shape not recognized · kept your drawing')
          : shape ? (zh ? `已修成${{ line: '直線', ellipse: '圓圈', rectangle: '方框', triangle: '三角形', diamond: '菱形', pentagon: '五邊形', hexagon: '六邊形', star: '五角星', arrow: '箭頭' }[shape]}` : `Tidied ${shape}`)
          : zh ? (shapeEnabled ? '畫完不抬筆，停住修形 · 手指滑動' : '用筆書寫 · 手指滑動／縮放') : (shapeEnabled ? 'Draw, then hold the pen down to tidy' : 'Use the pen to write · fingers to navigate')}</p>
      </>}
    </div>, document.body)}
  </>;
}
