import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song, SetlistSong } from '../types';
import PerformanceSetlistSheets, { type PerformanceSetlistHandle } from './PerformanceSetlistSheets';

// Isolate the reader's layout contract from the score's own pagination rules.
vi.mock('./PersonalChordSheet', () => ({ default: ({ song }: { song: Song }) => <div>
  {song.sections.map(section => <article key={section.id} data-print-page><h1>{song.title}</h1></article>)}
</div> }));

const entry = (id: string, pages: number) => ({
  item: { id, songId: id, setlistId: 'list', order: 0 } as SetlistSong,
  song: { id, title: id, originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
    sections: Array.from({ length: pages }, (_, i) => ({ id: `${id}-${i}`, title: 'Verse', bars: [{ chords: ['C'] }] })) } as Song,
});
const defaults = { viewport: { width: 1194, height: 834 }, isPhone: false, language: 'zh' as const, notesOpen: false,
  onNotesOpenChange: () => {}, lastEditedAt: () => null, renderReferences: () => null, onSongChange: vi.fn() };
const spread = () => document.querySelector<HTMLElement>('[data-performance-spread]')!;
const chart = (id: string) => document.querySelector<HTMLElement>(`[data-performance-entry="${id}"]`)!;
const sheet = (id: string) => chart(id).querySelector<HTMLElement>('.performance-sheet')!;
const track = (id: string) => sheet(id).parentElement!;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => window.setTimeout(callback, 0));
  vi.stubGlobal('cancelIdleCallback', (id: number) => clearTimeout(id));
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.hasAttribute('data-print-page')) return 0;
    const root = this.closest<HTMLElement>('.performance-sheet')!;
    const columns = Number(root.style.getPropertyValue('--performance-columns')) || 1;
    return Math.floor([...root.querySelectorAll('[data-print-page]')].indexOf(this) / columns) * 1139;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('independent prepared score layouts', () => {
  it('waits for quiet input, prepares one neighbor at a time, and bounds the retained window', async () => {
    vi.useFakeTimers();
    try {
      const ref = createRef<PerformanceSetlistHandle>();
      render(<><PerformanceSetlistSheets ref={ref} {...defaults} selectedId="song-0" entries={Array.from({ length: 7 }, (_, i) => entry(`song-${i}`, i === 0 ? 3 : 1))} />
        <button onClick={() => ref.current!.next()}>next</button></>);
      const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
      await advance(400);
      fireEvent.click(document.querySelector('button')!); // Within-song input postpones preparation too.
      await advance(400);
      expect(chart('song-1')).toBeNull();
      const writing = new Event('pointermove', { bubbles: true });
      Object.defineProperty(writing, 'buttons', { value: 1 });
      fireEvent(spread(), writing);
      await advance(400);
      expect(chart('song-1')).toBeNull();
      await advance(110);
      expect(chart('song-1')).not.toBeNull(); expect(chart('song-2')).toBeNull();
      await advance(510);
      const prepared = chart('song-2'); expect(prepared).not.toBeNull();
      fireEvent.click(document.querySelector('button')!); // First adjacent song.
      fireEvent.click(document.querySelector('button')!); // A quick second song reuses the ahead buffer.
      expect(chart('song-2')).toBe(prepared);
      expect(prepared).not.toHaveAttribute('aria-hidden');
      await advance(510); await advance(510);
      expect(document.querySelectorAll('[data-performance-entry]')).toHaveLength(5);
      fireEvent.click(document.querySelector('button')!);
      await advance(510);
      expect(chart('song-0')).toBeNull(); expect(chart('song-5')).not.toBeNull();
      expect(document.querySelectorAll('[data-performance-entry]')).toHaveLength(5);
    } finally { cleanup(); vi.useRealTimers(); }
  });
  it('keeps a single-page neighbor fitted while showing a spread and reuses both without measuring on a song turn', async () => {
    const ref = createRef<PerformanceSetlistHandle>();
    render(<><PerformanceSetlistSheets ref={ref} {...defaults} selectedId="long" entries={[entry('long', 3), entry('short', 1), entry('next', 3)]} />
      <button onClick={() => ref.current!.next()}>next</button><button onClick={() => ref.current!.previous()}>previous</button></>);
    await waitFor(() => expect(chart('short')).not.toBeNull());
    expect(sheet('long').style.getPropertyValue('--performance-columns')).toBe('2');
    expect(sheet('short').style.getPropertyValue('--performance-columns')).toBe('1');
    expect(track('long').style.width).toBe('1604px');
    expect(track('short').style.width).toBe('794px');
    const cached = track('short'), clip = cached.closest<HTMLElement>('[data-performance-clip]')!;
    const cachedWidth = clip.style.width;
    const positions = vi.mocked(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')!.get!);
    positions.mockClear();
    fireEvent.click(document.querySelector('button')!);
    expect(spread().dataset.performancePage).toBe('3');
    fireEvent.click(document.querySelector('button')!);
    expect(chart('short')).not.toHaveAttribute('aria-hidden');
    expect(track('short')).toBe(cached);
    expect(clip.style.width).toBe(cachedWidth);
    expect(sheet('long').style.getPropertyValue('--performance-columns')).toBe('2');
    expect(track('long').style.width).toBe('1604px');
    expect(positions).not.toHaveBeenCalled();
    fireEvent.click(document.querySelectorAll('button')[1]);
    expect(spread().dataset.performancePage).toBe('3');
    expect(track('long').style.transform).toContain('translateY(-1139px)');
    expect(positions).not.toHaveBeenCalled();
  });

  it('refits each cached song on rotation and clamps a live pagination change', async () => {
    const entries = [entry('long', 3), entry('short', 1)];
    const ref = createRef<PerformanceSetlistHandle>();
    const controls = <button onClick={() => ref.current!.next()}>next</button>;
    const view = render(<><PerformanceSetlistSheets ref={ref} {...defaults} selectedId="long" entries={entries} />{controls}</>);
    await waitFor(() => expect(chart('short')).not.toBeNull());
    fireEvent.click(document.querySelector('button')!);
    expect(spread().dataset.performancePage).toBe('3');
    view.rerender(<><PerformanceSetlistSheets ref={ref} {...defaults} viewport={{ width: 834, height: 1194 }} selectedId="long" entries={entries} />{controls}</>);
    expect(sheet('long').style.getPropertyValue('--performance-columns')).toBe('1');
    expect(sheet('short').style.getPropertyValue('--performance-columns')).toBe('1');
    expect(spread().dataset.performancePage).toBe('3');
    expect(track('long').style.transform).toContain('translateY(-2278px)');
    view.rerender(<><PerformanceSetlistSheets ref={ref} {...defaults} selectedId="long" entries={[entry('long', 1), entries[1]]} />{controls}</>);
    expect(spread().dataset.performancePage).toBe('1');
    expect(spread().dataset.performancePages).toBe('1');
    expect(sheet('long').style.getPropertyValue('--performance-columns')).toBe('1');
    expect(track('long').style.transform).toContain('translateY(-0px)');
  });
});
