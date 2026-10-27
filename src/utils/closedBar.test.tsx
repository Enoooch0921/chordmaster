import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Bar, Song, StoredSong } from '../types';
import ChordSheet from '../components/ChordSheet';
import { cloneBarForInsert } from '../lib/songEditing';
import { copyPreviewContent, pastePreviewContent } from '../lib/previewClipboard';
import { loadLocalWorkspaceSnapshot, normalizeSongBars, persistLocalWorkspaceSnapshot } from '../lib/workspace';
import { canCloseBar, isClosedBar } from './closedBar';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const fixture = (): Song => ({
  title: 'Closed cell fixture', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', barNumberMode: 'all',
  sections: [{ id: 'section', title: 'Verse', bars: [
    { id: 'first', chords: [], closed: true },
    { id: 'second', chords: ['C'] },
    { id: 'third', chords: ['F'] },
    { id: 'fourth', chords: ['G'] }
  ] }]
});

describe('closed layout cells', () => {
  it('keeps the gray line in the first cell and the following three bars in their original columns', () => {
    const song = fixture();
    const before = structuredClone(song);
    const onElementClick = vi.fn();
    const { container, rerender } = render(<ChordSheet song={song} currentKey="C" language="zh" onElementClick={onElementClick} />);
    const bars = [...container.querySelectorAll<HTMLElement>('[data-preview-clipboard-bar]')];
    expect(bars.map(bar => bar.dataset.previewClipboardBar)).toEqual(['first', 'second', 'third', 'fourth']);
    expect(bars.map(bar => bar.style.gridColumn)).toEqual(['1 / span 1', '2 / span 1', '3 / span 1', '4 / span 1']);
    expect(bars[0].querySelector('[data-preview-unused-line] > div')).toHaveClass('h-[2px]', 'w-full', 'bg-gray-400');
    expect(bars[0].querySelector('[data-preview-measure-number]')).toBeNull();
    expect(bars.slice(1).map(bar => bar.querySelector('[data-preview-owner-slot]')?.textContent)).toEqual(['C', 'F', 'G']);
    expect([...container.querySelectorAll('[data-preview-measure-number]')].map(node => node.textContent)).toEqual(['1', '2', '3']);
    fireEvent.click(screen.getByRole('button', { name: '已關閉的小節，開啟編輯' }));
    expect(onElementClick.mock.calls.at(-1)?.slice(0, 3)).toEqual([0, 0, 'chords']);
    expect(song).toEqual(before);

    rerender(<ChordSheet song={{ ...song, barNumberMode: 'line-start' }} currentKey="C" language="zh" />);
    expect(container.querySelector('[data-preview-clipboard-bar="second"] [data-preview-measure-number]')).toHaveTextContent('1');
    expect(container.querySelector('[data-preview-closed-cell] [data-preview-unused-line]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '已關閉的小節，開啟編輯' })).toBeNull();
  });

  it('does not absorb a closed cell into a preceding multi-measure rest', () => {
    const song = fixture();
    song.sections[0].bars = [
      { id: 'rest', chords: ['|4|'] }, { id: 'closed', chords: [], closed: true },
      { id: 'next', chords: ['C'] }, { id: 'last', chords: ['G'] }
    ];
    const { container } = render(<ChordSheet song={song} currentKey="C" language="zh" />);
    expect(container.querySelector<HTMLElement>('[data-preview-clipboard-bar="rest"]')?.style.gridColumn).toBe('1 / span 1');
    expect(container.querySelector('[data-preview-clipboard-bar="closed"] [data-preview-unused-line]')).toBeInTheDocument();
  });

  it.each<Partial<Bar>>([
    { chords: ['0'] }, { chords: ['/'] }, { chords: ['C'] }, { rhythm: 'q' }, { riff: '1' },
    { annotation: 'Softly' }, { tempo: 80 }, { resetTempo: true }, { keyChangeTo: 'G' }, { partialMeasure: true },
    { timeSignature: '3/4' }, { label: 'Pno' }, { labelLane: 'rhythm' }, { repeatStart: true },
    { rhythmVoices: [{ id: 'voice', label: 'Clap', rhythm: 'q' }] }, { chordMarks: { 0: { beatOffset: 0.5 } } }
  ])('refuses to close or conceal a cell carrying %j', content => {
    const bar = { id: 'bar', chords: [], closed: true, ...content };
    expect(canCloseBar(bar)).toBe(false);
    expect(isClosedBar(bar)).toBe(false);
  });

  it('never conceals content imported with a stale closed flag', () => {
    const song = fixture();
    song.sections[0].bars[0].chords = ['Am'];
    const { container } = render(<ChordSheet song={song} currentKey="C" language="zh" />);
    expect(container.querySelector('[data-preview-closed-cell]')).toBeNull();
    expect(container.querySelector('[data-preview-clipboard-bar="first"] [data-preview-owner-slot]')).toHaveTextContent('Am');
    expect([...container.querySelectorAll('[data-preview-measure-number]')].map(node => node.textContent)).toEqual(['1', '2', '3', '4']);
  });

  it('retains the closed slot through JSON, workspace reload, duplication and whole-bar clipboard', () => {
    const source = { ...fixture(), id: 'closed-cell-song', updatedAt: 1 } as StoredSong;
    source.sections[0].title = '';
    source.sections.unshift({ id: 'blank-section', title: '', bars: [{ id: 'blank', chords: [], closed: true }] });
    const normalized = normalizeSongBars(JSON.parse(JSON.stringify(source)));
    expect(normalized.sections).toHaveLength(2);
    expect(isClosedBar(normalized.sections[0].bars[0])).toBe(true);
    persistLocalWorkspaceSnapshot([source], [], []);
    const restored = loadLocalWorkspaceSnapshot().songs[0];
    expect(restored.sections[1].bars.map(bar => bar.id)).toEqual(['first', 'second', 'third', 'fourth']);
    expect(isClosedBar(restored.sections[1].bars[0])).toBe(true);
    const cloned = cloneBarForInsert(restored.sections[1].bars[0]);
    expect(cloned.id).not.toBe('first');
    expect(isClosedBar(cloned)).toBe(true);
    const clipboard = copyPreviewContent(restored, [{ sectionId: 'section', barId: 'first' }], 'bars')!;
    const pasted = pastePreviewContent(restored, [{ sectionId: 'section', barId: 'second' }], clipboard);
    expect(pasted.error).toBeUndefined();
    expect(pasted.song.sections[1].bars[1]).toMatchObject({ id: 'second', closed: true, chords: [] });
  });
});
