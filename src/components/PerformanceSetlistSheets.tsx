import { forwardRef, startTransition, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppLanguage, SetlistSong, Song } from '../types';
import { getPerformanceLayout, getPerformanceSpreadStart, PERFORMANCE_PAGE_GAP, PERFORMANCE_PAGE_WIDTH } from '../utils/performanceLayout';
import { getPerformanceCacheIds } from '../utils/performanceCache';
import PersonalChordSheet from './PersonalChordSheet';
import RecoveryBoundary from './RecoveryBoundary';

export interface PerformanceSetlistHandle {
  next: () => void;
  previous: () => void;
  selectedId: () => string;
}

interface Props {
  entries: readonly { item: SetlistSong; song: Song }[];
  selectedId: string;
  viewport: { width: number; height: number };
  isPhone: boolean;
  language: AppLanguage;
  noteOwner?: string;
  notesOpen: boolean;
  onNotesOpenChange: (open: boolean) => void;
  lastEditedAt: (songId: string, setlistId: string, entryId: string) => number | null;
  renderReferences: (song: Song, entryId: string) => ReactNode;
  onSongChange: (entryId: string) => void;
}

/** Own stage navigation so a song turn does not render the workspace behind it. */
const PerformanceSetlistSheets = forwardRef<PerformanceSetlistHandle, Props>(function PerformanceSetlistSheets({
  entries, selectedId, viewport, isPhone, language, noteOwner, notesOpen, onNotesOpenChange,
  lastEditedAt, renderReferences, onSongChange,
}, ref) {
  const [currentId, setCurrentId] = useState(selectedId);
  const current = useRef(currentId);
  const page = useRef(0);
  const sheets = useRef(new Map<string, HTMLDivElement>());
  const offsets = useRef(new Map<string, number[]>());
  const deferPreparation = useRef(() => {});
  const writingContacts = useRef(new Set<number>());
  const spread = useRef<HTMLDivElement>(null);
  const [pageCounts, setPageCounts] = useState<Readonly<Record<string, number>>>({});
  const total = pageCounts[currentId] ?? 1;
  const layout = getPerformanceLayout(viewport.width, viewport.height, total, isPhone);
  const index = entries.findIndex(entry => entry.item.id === currentId);
  const wanted = useMemo(() => getPerformanceCacheIds(entries, currentId), [entries, currentId]);
  const [prepared, setPrepared] = useState<readonly string[]>([]);
  const mountedIds = JSON.stringify(entries
    .filter(entry => entry.item.id === currentId || prepared.includes(entry.item.id))
    .map(entry => entry.item.id));

  const showPage = (requested: number) => {
    const positions = offsets.current.get(current.current) ?? [0];
    const fitted = getPerformanceLayout(viewport.width, viewport.height, positions.length, isPhone);
    const start = getPerformanceSpreadStart(requested, positions.length, fitted.columns);
    page.current = start;
    const translator = sheets.current.get(current.current);
    const transform = `scale(${fitted.scale}) translateY(-${positions[start]}px)`;
    if (translator && translator.style.transform !== transform) translator.style.transform = transform;
    if (spread.current) {
      spread.current.dataset.performancePage = String(start + 1);
      spread.current.dataset.performancePages = String(positions.length);
    }
  };

  const turn = (direction: number) => {
    deferPreparation.current();
    const positions = offsets.current.get(current.current) ?? [0];
    const columns = getPerformanceLayout(viewport.width, viewport.height, positions.length, isPhone).columns;
    const target = page.current + direction * columns;
    if (target >= 0 && target < positions.length) { showPage(target); return; }
    const entryIndex = entries.findIndex(entry => entry.item.id === current.current);
    const entry = entries[entryIndex + direction];
    if (!entry) return;
    const from = current.current;
    current.current = entry.item.id;
    const targetPages = offsets.current.get(entry.item.id);
    const targetColumns = getPerformanceLayout(viewport.width, viewport.height, targetPages?.length ?? 1, isPhone).columns;
    page.current = direction > 0 ? 0 : targetPages ? getPerformanceSpreadStart(Infinity, targetPages.length, targetColumns) : Infinity;
    // A cold/rapid turn must not discard the chart we just displayed. Retain it
    // for the return trip, using the same bounded cache policy as idle fills.
    setPrepared(old => old.includes(from) && old.includes(entry.item.id) ? old
      : getPerformanceCacheIds(entries, entry.item.id).filter(id => id === from || id === entry.item.id || old.includes(id)));
    setCurrentId(entry.item.id);
    onSongChange(entry.item.id);
  };

  useImperativeHandle(ref, () => ({
    next: () => turn(1),
    previous: () => turn(-1),
    selectedId: () => entries.some(entry => entry.item.id === current.current) ? current.current : '',
  }));

  useLayoutEffect(() => {
    // A reference action can synchronize the workspace without resetting this page.
    if (selectedId === current.current) return;
    current.current = selectedId;
    page.current = 0;
    setCurrentId(selectedId);
  }, [selectedId]);

  useLayoutEffect(() => {
    if (index >= 0) return;
    const fallback = entries.find(entry => entry.item.id === selectedId) ?? entries[0];
    if (fallback) { current.current = fallback.item.id; page.current = 0; setCurrentId(fallback.item.id); }
  }, [entries, index, selectedId]);

  useEffect(() => {
    if (wanted.length <= 1) return;
    let timer = 0, idle = 0, frame = 0;
    if (prepared.length === wanted.length && wanted.every(id => prepared.includes(id))) return;
    const prepare = () => startTransition(() => {
      setPrepared(old => {
        if (current.current !== currentId) return old;
        const missing = wanted.find(id => id !== currentId && !old.includes(id));
        return wanted.filter(id => id === currentId || id === missing || old.includes(id));
      });
    });
    const cancel = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      if (idle) window.cancelIdleCallback(idle);
      idle = 0;
      frame = 0;
    };
    const afterPaint = () => {
      if (document.hidden || writingContacts.current.size) return;
      // Let the active score reach a rendering opportunity first. Then keep
      // filling one chart per idle pass, without a fresh 500ms debounce for
      // every chart or page turn that can starve preparation during fast taps.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (document.hidden || writingContacts.current.size) return;
          if (typeof window.requestIdleCallback === 'function') {
            idle = window.requestIdleCallback(() => { idle = 0; prepare(); });
          } else timer = window.setTimeout(prepare, 0);
        });
      });
    };
    const schedule = () => { cancel(); afterPaint(); };
    deferPreparation.current = schedule;
    const source = spread.current;
    const press = (event: PointerEvent) => { writingContacts.current.add(event.pointerId); cancel(); };
    const writing = (event: PointerEvent) => {
      if (event.buttons) { cancel(); timer = window.setTimeout(afterPaint, 500); }
    };
    const release = (event: PointerEvent) => {
      writingContacts.current.delete(event.pointerId);
      cancel(); timer = window.setTimeout(afterPaint, 500);
    };
    const visibility = () => {
      if (document.hidden) writingContacts.current.clear();
      schedule();
    };
    source?.addEventListener('pointerdown', press, true);
    source?.addEventListener('pointermove', writing, true);
    source?.addEventListener('pointerup', release, true);
    source?.addEventListener('pointercancel', release, true);
    document.addEventListener('visibilitychange', visibility);
    schedule();
    return () => {
      cancel(); deferPreparation.current = () => {};
      source?.removeEventListener('pointerdown', press, true);
      source?.removeEventListener('pointermove', writing, true);
      source?.removeEventListener('pointerup', release, true);
      source?.removeEventListener('pointercancel', release, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [currentId, wanted, notesOpen, prepared]);

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const counts: Record<string, number> = {};
      for (const [id, sheet] of sheets.current) {
        const pages = [...sheet.querySelectorAll<HTMLElement>('[data-print-page]')];
        offsets.current.set(id, pages.length ? pages.map(node => node.offsetTop) : [0]);
        counts[id] = pages.length || 1;
      }
      for (const id of offsets.current.keys()) {
        if (!sheets.current.has(id)) offsets.current.delete(id);
      }
      setPageCounts(old => Object.keys(old).length === Object.keys(counts).length
        && Object.keys(counts).every(id => old[id] === counts[id]) ? old : counts);
      const activeIndex = entries.findIndex(entry => entry.item.id === current.current);
      for (const [id, positions] of offsets.current) {
        if (id === current.current) continue;
        const entryIndex = entries.findIndex(entry => entry.item.id === id);
        const fitted = getPerformanceLayout(viewport.width, viewport.height, positions.length, isPhone);
        const start = entryIndex < activeIndex ? getPerformanceSpreadStart(Infinity, positions.length, fitted.columns) : 0;
        const translator = sheets.current.get(id);
        const transform = `scale(${fitted.scale}) translateY(-${positions[start]}px)`;
        if (translator && translator.style.transform !== transform) translator.style.transform = transform;
      }
      showPage(page.current);
    };
    measure();
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(records => {
      if (records.some(record => !(record.target as Element).closest?.('[data-personal-notes-layer]'))) schedule();
    });
    for (const sheet of sheets.current.values()) {
      resize.observe(sheet);
      mutations.observe(sheet, { childList: true, subtree: true });
    }
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); };
  }, [entries, mountedIds, viewport.width, viewport.height, isPhone, pageCounts]);

  // Reapply the live page after unrelated parent updates without resetting it.
  useLayoutEffect(() => { showPage(page.current); });

  if (index < 0) return null;
  const activeSong = entries[index].song;
  return <>
    <div ref={spread} data-performance-spread={layout.columns} data-performance-page={page.current + 1} data-performance-pages={total}
      style={{ width: viewport.width, height: viewport.height, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      {entries.map((entry, entryIndex) => {
        const active = entry.item.id === currentId;
        if (!active && !prepared.includes(entry.item.id)) return null;
        const { item, song } = entry;
        // Fit each prepared song independently. A single/double-page song turn
        // must not change inherited grid styles or resize any cached score.
        const fitted = getPerformanceLayout(viewport.width, viewport.height, pageCounts[item.id] ?? 1, isPhone);
        return <div key={item.id} data-performance-entry={item.id} aria-hidden={active ? undefined : true}>
          <div data-performance-clip style={{ width: fitted.width, height: fitted.height, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
            <div ref={node => {
              if (node) sheets.current.set(item.id, node);
              else sheets.current.delete(item.id);
            }} style={{ transformOrigin: 'top left', width: fitted.columns * PERFORMANCE_PAGE_WIDTH + (fitted.columns - 1) * PERFORMANCE_PAGE_GAP, position: 'relative' }}>
              <div data-print-preview className="performance-sheet" style={{ colorScheme: 'light', '--performance-columns': fitted.columns } as React.CSSProperties}>
                <RecoveryBoundary label="譜面預覽"><PersonalChordSheet song={song} currentKey={song.currentKey} language={language}
                  lastEditedAt={lastEditedAt(item.songId, item.setlistId, item.id)} setlistSongNumber={entryIndex + 1} previewIdentity={item.id}
                  noteOwner={noteOwner} noteSongId={item.songId} notesPerformance notesActive={active}
                  notesOpen={notesOpen} onNotesOpenChange={onNotesOpenChange} /></RecoveryBoundary>
              </div>
            </div>
          </div>
        </div>;
      })}
    </div>
    <div data-performance-chrome-item className="absolute left-4 top-4 z-10 flex items-center gap-2">
      {renderReferences(activeSong, currentId)}
    </div>
    <div data-performance-chrome-item className="absolute left-1/2 -translate-x-1/2 pointer-events-none rounded-2xl bg-stone-900/70 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur-sm"
      style={{ bottom: 'max(20px, env(safe-area-inset-bottom, 0px))' }}>
      <div className="max-w-[80vw] truncate text-center text-xs font-semibold text-stone-300">{language === 'zh' ? '歌曲' : 'Song'} {index + 1} / {entries.length} · {activeSong.title}</div>
    </div>
  </>;
});

export default PerformanceSetlistSheets;
