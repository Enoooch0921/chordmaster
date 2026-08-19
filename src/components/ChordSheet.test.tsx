import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import { ensureSongEditingIds, reorderSection } from '../lib/songEditing';
import ChordSheet from './ChordSheet';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const song: Song = {
  title: 'Caret test',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'] }] }]
};

describe('ChordSheet preview input caret', () => {
  it('shows one caret at either an occupied or empty selected beat', () => {
    const { container, rerender } = render(
      <ChordSheet
        song={song}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        activeChordSlot={{ sectionId: 'section-1', barId: 'bar-1', slotIndex: 0 }}
      />
    );
    expect(container.querySelectorAll('[data-preview-input-caret]')).toHaveLength(1);

    rerender(
      <ChordSheet
        song={song}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        activeChordSlot={{ sectionId: 'section-1', barId: 'bar-1', slotIndex: 1 }}
      />
    );
    const caret = container.querySelector('[data-preview-input-caret]');
    expect(container.querySelectorAll('[data-preview-input-caret]')).toHaveLength(1);
    expect(caret?.closest('[data-preview-slot-index="1"]')).not.toBeNull();
  });

  it('shows only one caret after repairing ids from a legacy duplicated section', () => {
    const legacySong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [
          { id: 'shared-bar', chords: ['C'] },
          { id: 'shared-bar', chords: ['Gm'] }
        ]
      }]
    };
    const repairedSong = ensureSongEditingIds(legacySong);
    const repairedTargetId = repairedSong.sections[0].bars[1].id!;
    const { container } = render(
      <ChordSheet
        song={repairedSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        activeChordSlot={{ sectionId: 'section-1', barId: repairedTargetId, slotIndex: 0 }}
      />
    );

    expect(repairedTargetId).not.toBe('shared-bar');
    expect(container.querySelectorAll('[data-preview-input-caret]')).toHaveLength(1);
    expect(container.querySelector('[data-preview-input-caret]')?.closest('.sheet-bar')?.textContent).toContain('Gm');
  });

  it.each([
    ['%', 4],
    ['0h', 2]
  ])('renders %s across its owned beat span', (token, span) => {
    const spannedSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: [token, '', '', ''] }] }]
    };
    const { container } = render(
      <ChordSheet
        song={spannedSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        activeChordSlot={{ sectionId: 'section-1', barId: 'bar-1', slotIndex: 0 }}
      />
    );
    expect(container.querySelector(`[data-preview-token-span="${span}"]`)).not.toBeNull();
    if (token === '0h') {
      expect(container.querySelector('[data-preview-slot-index="1"]')).toBeNull();
      expect(container.querySelector('[data-preview-slot-index="2"]')).not.toBeNull();
    }
  });

  it('keeps a standalone bar label out of the notation lane', () => {
    const labeledSong: Song = {
      ...song,
      showNashvilleNumbers: true,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], label: 'Bass In' }]
      }]
    };
    const { container } = render(
      <ChordSheet
        song={labeledSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
      />
    );

    expect(screen.getByText('Bass In')).toBeInTheDocument();
    expect(container.querySelector('[data-preview-bottom-lane]')).toBeNull();
    expect(container.querySelector('.sheet-bar')).toHaveAttribute('data-preview-lower-lanes', '0');
  });

  it('renders repeat endings as prominent house brackets', () => {
    const endingSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [
          { id: 'bar-1', chords: ['C'], ending: '1' },
          { id: 'bar-2', chords: ['G'], ending: '1' }
        ]
      }]
    };
    const { container, rerender } = render(
      <ChordSheet
        song={endingSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );

    const brackets = container.querySelectorAll('[data-sheet-ending-bracket="1"]');
    expect(brackets).toHaveLength(2);
    expect(brackets[0]).toHaveClass('-top-[16px]', 'h-[12px]', '-left-[2px]', '-right-[1px]', 'border-l-[2px]');
    expect(brackets[1]).toHaveClass('-left-[1px]', '-right-[1px]', 'border-r-[2px]');
    expect(container.querySelector('[data-sheet-ending-number="1"]')).toHaveClass('left-[2px]', '-top-[1px]', 'text-[13px]', 'font-semibold', 'text-gray-950');
    expect(screen.getByText('1.')).toBeInTheDocument();

    rerender(
      <ChordSheet
        song={{ ...endingSong, barRowCount: 3 }}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );
    expect(container.querySelectorAll('[data-sheet-ending-bracket="1"]')[0]).toHaveClass('-top-[16px]');
  });

  it('shrinks multi-number repeat ending labels and offsets first-beat push markers', () => {
    const endingPushSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C<', 'G<'], ending: '1,2' }]
      }]
    };
    const { container } = render(
      <ChordSheet
        song={endingPushSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );

    const markers = container.querySelectorAll('[data-chord-marker="push"]');
    const endingNumber = container.querySelector('[data-sheet-ending-number="1,2"]');
    expect(endingNumber).toHaveAttribute('data-sheet-ending-multiple', 'true');
    expect(endingNumber).toHaveClass('text-[11px]', 'tracking-[-0.02em]');
    expect(screen.getByText('1., 2.')).toBeInTheDocument();
    expect(markers[0]).toHaveAttribute('data-ending-collision-offset', 'true');
    expect(markers[0]).toHaveClass('left-[60%]', '-top-[12px]');
    expect(markers[1]).not.toHaveAttribute('data-ending-collision-offset');
  });

  it('keeps top labels closer to the bar and text-only navigation marks inside the measure', () => {
    const navigationLabelSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{
          id: 'bar-1',
          chords: ['C'],
          leftText: 'Vamp',
          annotation: 'Cue',
          rightMarker: 'fine'
        }]
      }]
    };
    render(
      <ChordSheet
        song={navigationLabelSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );

    expect(screen.getByText('Vamp').parentElement).toHaveClass('-top-[12px]');
    expect(screen.getByText('Cue')).toHaveClass('-top-[10px]');
    expect(screen.getByText('Fine').parentElement).toHaveClass('-bottom-[16px]', 'right-1');
  });

  it('keeps text-only navigation marks away from rhythm and jianpu lanes', () => {
    const navigationWithNotationSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{
          id: 'bar-1',
          chords: ['C'],
          rhythm: 'q q q q',
          rightMarker: 'fine'
        }]
      }]
    };
    const { container } = render(
      <ChordSheet
        song={navigationWithNotationSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );

    const bottomLane = container.querySelector('[data-preview-bottom-lane]');
    expect(bottomLane).not.toHaveClass('pr-[96px]');
    expect(bottomLane).toHaveStyle({ bottom: '4px' });
    expect(screen.getByText('Fine').parentElement).toHaveClass('-bottom-[16px]', 'right-1');
    expect(screen.getByText('Fine').parentElement).not.toHaveClass('top-[2px]');
  });

  it('keeps Nashville accidentals visually separated from numeric degrees', () => {
    const nashvilleSong: Song = {
      ...song,
      showNashvilleNumbers: true,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['Eb', 'G#'] }]
      }]
    };
    const { container } = render(
      <ChordSheet
        song={nashvilleSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );

    const accidentalDegrees = container.querySelectorAll('.sheet-bar span[style*="padding-left"]');
    expect(accidentalDegrees.length).toBeGreaterThan(0);
    accidentalDegrees.forEach((degree) => {
      expect(degree).toHaveStyle({ paddingLeft: '0.35em' });
    });
  });

  it('gives rows with chords, rhythm, and jianpu extra vertical space', () => {
    const threeRowSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['Gaug', 'A7'], rhythm: 'e e q q', riff: '5 6 7 1' }]
      }]
    };
    const { container, rerender } = render(
      <ChordSheet
        song={threeRowSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );

    const row = container.querySelector('[data-preview-row-three-notation-rows="true"]');
    const bar = container.querySelector('[data-preview-three-notation-rows="true"]');
    const lanes = container.querySelectorAll('[data-preview-edit-anchor$="|rhythm|all"], [data-preview-edit-anchor$="|jianpu|all"]');
    const chordGrid = container.querySelector('[data-preview-slot-hit]')?.parentElement;

    expect(row).toHaveClass('min-h-[94px]', 'flex-[1.45]');
    expect(row).toHaveAttribute('data-preview-layout-weight', '1.45');
    expect(bar).toHaveStyle({ paddingBottom: '58px' });
    expect(chordGrid).toHaveClass('pt-[3px]');
    expect(lanes[0]).toHaveClass('h-[18px]');
    expect(lanes[1]).toHaveClass('h-[18px]');

    rerender(
      <ChordSheet
        song={{ ...threeRowSong, barRowCount: 3 }}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );
    expect(container.querySelector('[data-preview-slot-hit]')?.parentElement).toHaveClass('pt-[3px]');
  });

  it('uses the three-line bar height for preview and printable page pagination', () => {
    const bars = Array.from({ length: 36 }, (_, index) => ({
      id: `bar-${index + 1}`,
      chords: ['C']
    }));
    const twoLineSong: Song = {
      ...song,
      barRowCount: 2,
      sections: [{ ...song.sections[0], bars }]
    };
    const { container, rerender } = render(
      <ChordSheet song={twoLineSong} language="zh" currentKey="C" previewIdentity="song-1" />
    );

    expect(container.querySelectorAll('[data-print-page]')).toHaveLength(1);
    expect(container.querySelector('[data-print-page]')).toHaveAttribute('data-sheet-bar-row-count', '2');
    expect(container.querySelector('[data-sheet-content-area]')).toHaveClass('gap-y-6', 'sm:gap-y-8');

    rerender(
      <ChordSheet song={{ ...twoLineSong, barRowCount: 3 }} language="zh" currentKey="C" previewIdentity="song-1" />
    );

    const pages = container.querySelectorAll('[data-print-page]');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveAttribute('data-sheet-bar-row-count', '3');
    expect(container.querySelector('[data-sheet-content-area]')).toHaveClass('gap-y-6', 'sm:gap-y-8');
    expect(pages[0].querySelectorAll('[data-rhythm-measure-row]')).toHaveLength(8);
    expect(pages[1].querySelectorAll('[data-rhythm-measure-row]')).toHaveLength(1);
  });

  it('caps two-line printable pages at ten rows with maximum row spacing', () => {
    const bars = Array.from({ length: 44 }, (_, index) => ({
      id: `bar-${index + 1}`,
      chords: ['C']
    }));
    const twoLineSong: Song = {
      ...song,
      barRowCount: 2,
      sections: [{ ...song.sections[0], bars }]
    };
    const { container } = render(
      <ChordSheet song={twoLineSong} language="zh" currentKey="C" previewIdentity="song-1" />
    );

    const pages = container.querySelectorAll('[data-print-page]');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveAttribute('data-sheet-bar-row-count', '2');
    expect(container.querySelector('[data-sheet-content-area]')).toHaveClass('gap-y-6', 'sm:gap-y-8');
    expect(pages[0].querySelectorAll('[data-rhythm-measure-row]')).toHaveLength(10);
    expect(pages[1].querySelectorAll('[data-rhythm-measure-row]')).toHaveLength(1);
  });

  it('moves a continuing section start off the last row of a page', () => {
    const leadInBars = Array.from({ length: 36 }, (_, index) => ({
      id: `lead-${index + 1}`,
      chords: ['C']
    }));
    const continuingSectionBars = Array.from({ length: 8 }, (_, index) => ({
      id: `bridge-${index + 1}`,
      chords: ['F']
    }));
    const sectionBreakSong: Song = {
      ...song,
      barRowCount: 2,
      sections: [
        { id: 'section-1', title: 'Verse', bars: leadInBars },
        { id: 'section-2', title: 'Bridge', bars: continuingSectionBars }
      ]
    };
    const { container } = render(
      <ChordSheet song={sectionBreakSong} language="zh" currentKey="C" previewIdentity="song-1" />
    );

    const pages = container.querySelectorAll('[data-print-page]');
    expect(pages).toHaveLength(2);
    expect(pages[0].querySelectorAll('[data-preview-section-id="section-1"] [data-rhythm-measure-row]')).toHaveLength(9);
    expect(pages[0].querySelectorAll('[data-preview-closed-page-row]')).toHaveLength(1);
    expect(pages[0].querySelectorAll('[data-preview-closed-measure]')).toHaveLength(4);
    expect(pages[0].querySelector('[data-preview-section-id="section-2"]')).toBeNull();
    expect(pages[1].querySelectorAll('[data-preview-section-id="section-2"] [data-rhythm-measure-row]')).toHaveLength(2);
  });

  it('uses one-line bar height for chord-only rows without reserving an empty lower lane', () => {
    const bars = Array.from({ length: 76 }, (_, index) => ({
      id: `bar-${index + 1}`,
      chords: ['C']
    }));
    const oneLineSong: Song = {
      ...song,
      barRowCount: 1,
      sections: [{ ...song.sections[0], bars }]
    };
    const { container } = render(
      <ChordSheet
        song={oneLineSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
      />
    );

    const pages = container.querySelectorAll('[data-print-page]');
    const row = container.querySelector('[data-preview-layout-weight="1"]');
    const bar = container.querySelector('.sheet-bar');

    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveAttribute('data-sheet-bar-row-count', '1');
    expect(row).toHaveClass('min-h-[34px]', 'flex-1');
    expect(row).not.toHaveAttribute('data-preview-row-lower-notation-rows');
    expect(bar).toHaveStyle({ paddingBottom: '6px' });
    expect(container.querySelector('[data-preview-lower-hit]')).toBeNull();
  });

  it('expands the visible rhythm lane hit target while chord editing is active', () => {
    const rhythmSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], rhythm: 'q q q q' }]
      }]
    };
    const { container } = render(
      <ChordSheet
        song={rhythmSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        activePreviewNotationTarget={{
          sectionId: 'section-1',
          barId: 'bar-1',
          notationMode: 'chords',
          cursor: { kind: 'chord', slotIndex: 0, rawChordIndex: 0 }
        }}
        onElementClick={vi.fn()}
      />
    );
    const rhythmAnchor = container.querySelector<HTMLElement>('[data-preview-edit-anchor$="|rhythm|all"]');
    const row = container.querySelector('[data-preview-row-lower-notation-rows="true"]');

    expect(rhythmAnchor).not.toBeNull();
    expect(row).toHaveClass('min-h-[68px]', 'flex-[1.18]');
    expect(rhythmAnchor?.className).toContain('before:-top-2');
    expect(rhythmAnchor?.className).toContain('z-[30]');
  });

  it('exposes continuation-row whitespace as a split target only while editable', () => {
    const longSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: Array.from({ length: 5 }, (_, index) => ({ id: `bar-${index + 1}`, chords: ['C'] }))
      }]
    };
    const onElementClick = vi.fn();
    const { container, rerender } = render(
      <ChordSheet song={longSong} language="zh" currentKey="C" previewIdentity="song-1" onElementClick={onElementClick} />
    );
    const splitButton = screen.getByRole('button', { name: '從本行分段並命名' });
    expect(splitButton).toHaveTextContent('＋ 分段');
    expect(splitButton).toHaveAttribute('data-preview-only-control', 'true');
    expect(splitButton.closest('.sheet-bar')).toBeNull();
    fireEvent.click(splitButton);
    expect(onElementClick).toHaveBeenCalledWith(0, 4, 'sectionName', expect.objectContaining({ barId: 'bar-5' }));

    const printableClone = container.cloneNode(true) as HTMLElement;
    printableClone.querySelectorAll('[data-preview-only-control]').forEach((node) => node.remove());
    expect(printableClone.querySelector('[data-preview-section-split]')).not.toBeInTheDocument();
    expect(printableClone.querySelector('[data-preview-section-title="section-1"]')).toHaveTextContent('Verse');

    rerender(<ChordSheet song={longSong} language="zh" currentKey="C" previewIdentity="song-1" />);
    expect(screen.queryByRole('button', { name: '從本行分段並命名' })).not.toBeInTheDocument();
  });

  it('offers a new-section row after the final section even when the last row is not full', () => {
    const finalPartialSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [
          { id: 'bar-1', chords: ['C'] },
          { id: 'bar-2', chords: ['G'] },
          { id: 'bar-3', chords: ['Am'] },
          { id: 'bar-4', chords: ['F'] },
          { id: 'bar-5', chords: ['C'] }
        ]
      }]
    };
    const onAddBarClick = vi.fn();
    const onAddSectionAfterClick = vi.fn();
    const { container } = render(
      <ChordSheet
        song={finalPartialSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        onAddBarClick={onAddBarClick}
        onAddSectionAfterClick={onAddSectionAfterClick}
      />
    );

    const inlineAddBarButton = screen.getByRole('button', { name: '新增小節' });
    expect(inlineAddBarButton.closest('[data-preview-add-choice-row]')).toBeNull();
    expect(inlineAddBarButton?.closest('.sheet-bar')?.parentElement?.children[1]).toBe(inlineAddBarButton?.closest('.sheet-bar'));

    fireEvent.click(inlineAddBarButton);
    expect(onAddBarClick).toHaveBeenCalledWith(0);

    const addSectionButton = screen.getByRole('button', { name: '新增段落' });
    expect(addSectionButton).toHaveAttribute('data-preview-add-section-after', 'section-1');
    expect(addSectionButton.closest('.sheet-bar')).toBeNull();
    fireEvent.click(addSectionButton);
    expect(onAddSectionAfterClick).toHaveBeenCalledWith(0);

    const addSectionRow = addSectionButton.closest('[data-preview-add-choice-row]');
    expect(addSectionRow?.querySelector('.bg-gray-400')).not.toBeInTheDocument();

    const printableClone = container.cloneNode(true) as HTMLElement;
    printableClone.querySelectorAll('[data-preview-only-control]').forEach((node) => node.remove());
    expect(printableClone.querySelector('[aria-label="新增段落"]')).not.toBeInTheDocument();
    expect(printableClone.querySelector('[data-preview-add-choice-row]')).not.toBeInTheDocument();
  });

  it('keeps intentionally blank trailing bars visible before the next section', () => {
    const songWithTrailingEmptyBars: Song = {
      ...song,
      sections: [
        {
          id: 'section-1',
          title: 'Refrain',
          bars: [
            { id: 'r1', chords: ['6m'] },
            { id: 'r2', chords: ['4'] },
            { id: 'r3', chords: ['1'] },
            { id: 'r4', chords: ['1'] },
            { id: 'r5', chords: ['6m'] },
            { id: 'r6', chords: ['4'] },
            { id: 'r7', chords: ['1'] },
            { id: 'r8', chords: ['1'] },
            { id: 'empty-tail', chords: [] }
          ]
        },
        {
          id: 'section-2',
          title: 'Intro',
          bars: [{ id: 'i1', chords: ['6m'] }]
        }
      ]
    };
    const { container } = render(
      <ChordSheet
        song={songWithTrailingEmptyBars}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
      />
    );

    expect(container.querySelector('[data-preview-section-split="empty-tail"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-preview-section-id="section-1"] [data-rhythm-measure-row]')).toHaveLength(3);
  });

  it('omits stale unnamed empty sections without hiding the active section being named', () => {
    const songWithOrphanedEmptySections: Song = {
      ...song,
      sections: [
        { id: 'empty-zero', title: '', bars: [] },
        { id: 'empty-bar', title: '   ', bars: [{ id: 'empty-1', chords: [] }] },
        { id: 'refrain', title: 'Refrain', bars: [{ id: 'r1', chords: ['6m'] }] },
        { id: 'empty-tail', title: '', bars: [{ id: 'empty-2', chords: [''] }] },
        { id: 'intro', title: 'Intro', bars: [{ id: 'i1', chords: ['1'] }] }
      ]
    };
    const { container, rerender } = render(
      <ChordSheet
        song={songWithOrphanedEmptySections}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
      />
    );

    expect(container.querySelector('[data-preview-section-id="empty-zero"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-preview-section-id="empty-bar"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-preview-section-id="empty-tail"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-preview-section-id="refrain"]')).toBeInTheDocument();
    expect(container.querySelector('[data-preview-section-id="intro"]')).toBeInTheDocument();

    rerender(
      <ChordSheet
        song={songWithOrphanedEmptySections}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        activeSectionId="empty-tail"
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
      />
    );

    expect(container.querySelector('[data-preview-section-id="empty-tail"]')).toBeInTheDocument();
  });

  it('keeps the active trailing empty bar visible after adding a new bar', () => {
    const songWithActiveEmptyBar: Song = {
      ...song,
      sections: [
        {
          id: 'section-1',
          title: 'Verse',
          bars: [
            { id: 'v1', chords: ['1'] },
            { id: 'v2', chords: ['1'] },
            { id: 'v3', chords: ['2'] },
            { id: 'v4', chords: ['2'] },
            { id: 'active-empty', chords: [] }
          ]
        }
      ]
    };
    const { container } = render(
      <ChordSheet
        song={songWithActiveEmptyBar}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        activeBar={{ sIdx: 0, bIdx: 4 }}
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
      />
    );

    expect(container.querySelectorAll('[data-preview-section-id="section-1"] [data-rhythm-measure-row]')).toHaveLength(2);
    expect(container.querySelector('.sheet-bar[style*="background-color"]')).toBeInTheDocument();
  });

  it('keeps a short section-title press as edit and turns mouse movement into reorder', () => {
    const dragSong: Song = {
      ...song,
      sections: [
        song.sections[0],
        { id: 'section-2', title: 'Chorus', bars: [{ id: 'bar-2', chords: ['G'] }] }
      ]
    };
    const onElementClick = vi.fn();
    const onSectionReorder = vi.fn();
    const { container } = render(
      <ChordSheet
        song={dragSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
        onSectionReorder={onSectionReorder}
      />
    );
    const verseButton = screen.getByRole('button', { name: /開啟段落操作 Verse/ });
    fireEvent.click(verseButton);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).toHaveBeenLastCalledWith(0, -1, 'sectionName', expect.objectContaining({
      sectionTitleIntent: 'actions'
    }));
    fireEvent.click(verseButton);
    expect(onElementClick).toHaveBeenLastCalledWith(0, -1, 'sectionName', expect.objectContaining({
      sectionTitleIntent: 'rename'
    }));
    fireEvent.dblClick(verseButton);
    expect(onElementClick).toHaveBeenLastCalledWith(0, -1, 'sectionName', expect.objectContaining({
      sectionTitleIntent: 'rename'
    }));

    const chorusTarget = container.querySelector<HTMLElement>('[data-preview-section-drop-target="section-2"]')!;
    chorusTarget.getBoundingClientRect = () => ({ left: 0, top: 100, right: 400, bottom: 200, width: 400, height: 100, x: 0, y: 100, toJSON: () => ({}) });
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [chorusTarget])
    });
    fireEvent.pointerDown(verseButton, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(verseButton, { pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: 175 });
    fireEvent.pointerUp(verseButton, { pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: 175 });
    expect(onSectionReorder).toHaveBeenCalledWith('section-1', 'section-2', 'after');
  });

  it('captures a touch long-press on a section title and reorders without native page panning', () => {
    vi.useFakeTimers();
    try {
      const dragSong: Song = {
        ...song,
        sections: [
          song.sections[0],
          { id: 'section-2', title: 'Chorus', bars: [{ id: 'bar-2', chords: ['G'] }] }
        ]
      };
      const onSectionReorder = vi.fn();
      const { container } = render(
        <ChordSheet
          song={dragSong}
          language="zh"
          currentKey="C"
          previewIdentity="song-1"
          onElementClick={vi.fn()}
          onSectionReorder={onSectionReorder}
        />
      );
      const verseButton = screen.getByRole('button', { name: /開啟段落操作 Verse/ });
      expect(verseButton).toHaveStyle({ touchAction: 'none' });

      const chorusTarget = container.querySelector<HTMLElement>('[data-preview-section-drop-target="section-2"]')!;
      chorusTarget.getBoundingClientRect = () => ({ left: 0, top: 100, right: 400, bottom: 200, width: 400, height: 100, x: 0, y: 100, toJSON: () => ({}) });
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: vi.fn(() => [chorusTarget])
      });

      fireEvent.pointerDown(verseButton, { pointerId: 2, pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
      act(() => vi.advanceTimersByTime(350));
      expect(document.querySelector('[data-preview-section-drag-ghost]')).toHaveTextContent('Verse');
      fireEvent.pointerMove(verseButton, { pointerId: 2, pointerType: 'touch', clientX: 20, clientY: 175 });
      fireEvent.pointerUp(verseButton, { pointerId: 2, pointerType: 'touch', clientX: 20, clientY: 175 });
      expect(onSectionReorder).toHaveBeenCalledWith('section-1', 'section-2', 'after');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rerenders a dragged multi-row section exactly once at its new position', () => {
    const dragSong: Song = {
      ...song,
      sections: [
        {
          id: 'section-1',
          title: 'Verse',
          bars: Array.from({ length: 5 }, (_, index) => ({
            id: `verse-${index + 1}`,
            chords: index === 4 ? [] : ['1']
          }))
        },
        {
          id: 'section-2',
          title: 'Chorus',
          bars: Array.from({ length: 4 }, (_, index) => ({
            id: `chorus-${index + 1}`,
            chords: ['4']
          }))
        }
      ]
    };
    let reorderedSong = dragSong;
    const onSectionReorder = vi.fn((
      sourceSectionId: string,
      targetSectionId: string,
      placement: 'before' | 'after'
    ) => {
      reorderedSong = reorderSection(reorderedSong, sourceSectionId, targetSectionId, placement);
    });
    const { container, rerender } = render(
      <ChordSheet
        song={dragSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
        onSectionReorder={onSectionReorder}
      />
    );

    const verseButton = screen.getByRole('button', { name: /開啟段落操作 Verse/ });
    const chorusTarget = container.querySelector<HTMLElement>('[data-preview-section-drop-target="section-2"]')!;
    chorusTarget.getBoundingClientRect = () => ({ left: 0, top: 100, right: 400, bottom: 200, width: 400, height: 100, x: 0, y: 100, toJSON: () => ({}) });
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [chorusTarget])
    });

    fireEvent.pointerDown(verseButton, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(verseButton, { pointerId: 7, pointerType: 'mouse', clientX: 20, clientY: 175 });
    fireEvent.pointerUp(verseButton, { pointerId: 7, pointerType: 'mouse', clientX: 20, clientY: 175 });
    rerender(
      <ChordSheet
        song={reorderedSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
        onSectionReorder={onSectionReorder}
      />
    );

    expect(
      Array.from(container.querySelectorAll('[data-preview-section-title]'))
        .map((element) => element.getAttribute('data-preview-section-title'))
    ).toEqual(['section-2', 'section-1']);
    expect(container.querySelectorAll('[data-preview-section-id="section-1"] [data-rhythm-measure-row]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-preview-section-id="section-2"] [data-rhythm-measure-row]')).toHaveLength(1);
  });

  it('keeps one neutral add choice row after reordering a full final section', () => {
    const makeFullSection = (id: string, title: string, chord: string): Song['sections'][number] => ({
      id,
      title,
      bars: Array.from({ length: 4 }, (_, index) => ({
        id: `${id}-bar-${index + 1}`,
        chords: [chord]
      }))
    });
    const orderedSong: Song = {
      ...song,
      sections: [
        makeFullSection('section-a', 'Verse', '1'),
        makeFullSection('section-b', 'Chorus', '4')
      ]
    };
    const { container, rerender } = render(
      <ChordSheet
        song={orderedSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
        onAddSectionAfterClick={vi.fn()}
        onSectionReorder={vi.fn()}
      />
    );

    expect(screen.getAllByRole('button', { name: '新增小節' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '新增段落' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '新增小節' }).closest('.sheet-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增段落' }).closest('.sheet-bar')).toBeNull();
    expect(container.querySelectorAll('[data-preview-add-choice-row]')).toHaveLength(1);

    const reorderedSong = reorderSection(orderedSong, 'section-b', 'section-a', 'before');
    rerender(
      <ChordSheet
        song={reorderedSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
        onAddSectionAfterClick={vi.fn()}
        onSectionReorder={vi.fn()}
      />
    );

    expect(screen.getAllByRole('button', { name: '新增小節' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '新增段落' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '新增小節' }).closest('.sheet-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增段落' }).closest('.sheet-bar')).toBeNull();
    expect(container.querySelectorAll('[data-preview-add-choice-row]')).toHaveLength(1);
  });

  it('places add-bar in the first measure cell and add-section in the row gutter', () => {
    const fullFinalSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: Array.from({ length: 8 }, (_, index) => ({
          id: `bar-${index + 1}`,
          chords: ['1']
        }))
      }]
    };
    const { container } = render(
      <ChordSheet
        song={fullFinalSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        onAddBarClick={vi.fn()}
        onAddSectionAfterClick={vi.fn()}
      />
    );

    const addBarButton = screen.getByRole('button', { name: '新增小節' });
    const addBarCell = addBarButton.closest('.sheet-bar');
    expect(addBarCell).toBeInTheDocument();
    expect(addBarCell?.parentElement?.children[0]).toBe(addBarCell);
    expect(screen.getByRole('button', { name: '新增段落' }).closest('.sheet-bar')).toBeNull();
    expect(addBarButton.closest('[data-preview-add-choice-row]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-rhythm-measure-row]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-preview-add-choice-row]')).toHaveLength(1);
  });

  it('keeps a persistent song-information entry when optional metadata is hidden', () => {
    const onMetaClick = vi.fn();
    const songWithoutOptionalMetadata: Song = {
      ...song,
      tempo: undefined,
      capo: 0,
      shuffle: false,
      lyricist: undefined,
      composer: undefined,
      translator: undefined
    };
    const { rerender } = render(
      <ChordSheet
        song={songWithoutOptionalMetadata}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onMetaClick={onMetaClick}
      />
    );

    const songInfoButton = screen.getByRole('button', { name: '編輯歌曲資訊' });
    expect(songInfoButton).toHaveAttribute('data-preview-only-control');
    fireEvent.click(songInfoButton);
    expect(onMetaClick).toHaveBeenCalledWith('metadata', expect.objectContaining({
      anchorKey: 'song-1|meta|metadata'
    }));
    expect(screen.queryByRole('img', { name: 'Shuffle' })).toBeNull();

    rerender(
      <ChordSheet
        song={songWithoutOptionalMetadata}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );
    expect(screen.queryByRole('button', { name: '編輯歌曲資訊' })).toBeNull();
  });
});

describe('ChordSheet preview notation interactions', () => {
  it('routes rhythm displayed in the main lane as rhythm with a semantic cursor', () => {
    const rhythmOnlySong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: [], rhythm: 'q e e' }]
      }]
    };
    const onElementClick = vi.fn();
    const { container } = render(
      <ChordSheet
        song={rhythmOnlySong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
      />
    );

    const mainRhythmLane = container.querySelector<HTMLElement>(
      '[data-preview-edit-anchor="song-1|section-1|bar-1|rhythm|all"]'
    );
    expect(mainRhythmLane).not.toBeNull();
    fireEvent.click(mainRhythmLane!);

    expect(onElementClick).toHaveBeenCalledWith(0, 0, 'rhythm', expect.objectContaining({
      field: 'rhythm',
      notationMode: 'rhythm',
      slotIndex: null,
      rawChordIndex: null,
      cursor: { kind: 'rhythm', cursorUnit: 0 }
    }));
    expect(onElementClick).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'chords',
      expect.anything()
    );
  });

  it('emits the exact semantic cursor when an existing lower rhythm event is clicked', () => {
    const chordAndRhythmSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], rhythm: 'q e e' }]
      }]
    };
    const onElementClick = vi.fn();
    render(
      <ChordSheet
        song={chordAndRhythmSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select rhythm note 2' }));
    expect(onElementClick).toHaveBeenCalledWith(0, 0, 'rhythm', expect.objectContaining({
      field: 'rhythm',
      notationMode: 'rhythm',
      cursor: { kind: 'rhythm', cursorUnit: 4 }
    }));
  });

  it('exposes semantic rhythm insertion points inside a hidden gap', () => {
    const rhythmGapSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], rhythm: 'q qx q' }]
      }]
    };
    const onElementClick = vi.fn();
    render(
      <ChordSheet
        song={rhythmGapSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Insert rhythm note at position 2' }));
    expect(onElementClick).toHaveBeenCalledWith(0, 0, 'rhythm', expect.objectContaining({
      cursor: { kind: 'rhythm', cursorUnit: 4 }
    }));
  });

  it('emits a jianpu semantic note cursor when an existing note is clicked', () => {
    const jianpuSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], riff: '1 2 3 4' }]
      }]
    };
    const onElementClick = vi.fn();
    render(
      <ChordSheet
        song={jianpuSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select jianpu note 1 in beat 2' }));
    expect(onElementClick).toHaveBeenCalledWith(0, 0, 'riff', expect.objectContaining({
      field: 'riff',
      notationMode: 'jianpu',
      cursor: {
        kind: 'jianpu',
        beatIndex: 1,
        unitIndex: 0,
        noteIndex: 0
      }
    }));
  });

  it('uses the grouped beat width when selecting a 6/8 jianpu insertion unit', () => {
    const sixEightSong: Song = {
      ...song,
      timeSignature: '6/8',
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], riff: 'ssssss' }]
      }]
    };
    const onElementClick = vi.fn();
    render(
      <ChordSheet
        song={sixEightSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
      />
    );

    const beatHitArea = screen.getByRole('button', { name: 'Select jianpu beat 1' });
    Object.defineProperty(beatHitArea, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, right: 60, top: 0, bottom: 20, width: 60, height: 20 })
    });
    fireEvent.click(beatHitArea, { clientX: 59 });

    expect(onElementClick).toHaveBeenCalledWith(0, 0, 'riff', expect.objectContaining({
      cursor: { kind: 'jianpu', beatIndex: 0, unitIndex: 5, noteIndex: null }
    }));
  });

  it('exposes the editor-only empty lower target only while preview editing is enabled', () => {
    const emptySong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: [] }]
      }]
    };
    const onElementClick = vi.fn();
    const { rerender } = render(
      <ChordSheet
        song={emptySong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
      />
    );

    const lowerTarget = screen.getByRole('button', { name: '在下方輸入節奏或簡譜' });
    expect(lowerTarget).toHaveAttribute('data-preview-edit-ui');
    vi.spyOn(lowerTarget, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 18,
      width: 400,
      height: 18,
      toJSON: () => ({})
    });
    fireEvent.click(lowerTarget, { clientX: 250 });
    expect(onElementClick).toHaveBeenCalledWith(0, 0, 'lower', expect.objectContaining({
      field: 'lower',
      slotIndex: 2,
      notationMode: null,
      cursor: null,
      anchorKey: 'song-1|section-1|bar-1|lower|all'
    }));

    rerender(
      <ChordSheet
        song={emptySong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
        activePreviewNotationTarget={{
          sectionId: 'section-1',
          barId: 'bar-1',
          notationMode: 'rhythm',
          cursor: { kind: 'rhythm', cursorUnit: 8 }
        }}
      />
    );
    expect(document.querySelector('[data-preview-notation-cursor-beat]')).toBeInTheDocument();
    expect(document.querySelector('[data-preview-notation-cursor-caret]')).toBeInTheDocument();

    rerender(
      <ChordSheet
        song={emptySong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
      />
    );
    expect(screen.queryByRole('button', { name: '在下方輸入節奏或簡譜' })).not.toBeInTheDocument();
  });

  it('does not reserve an extra lower target below existing notation content', () => {
    const rhythmOnlySong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], rhythm: 'q' }]
      }]
    };
    const onElementClick = vi.fn();
    render(
      <ChordSheet
        song={rhythmOnlySong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
      />
    );

    expect(screen.queryByRole('button', { name: '在下方輸入節奏或簡譜' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select rhythm note 1' }));
    expect(onElementClick).toHaveBeenCalledWith(0, 0, 'rhythm', expect.objectContaining({
      field: 'rhythm'
    }));
  });

  it('marks active rhythm and jianpu selection UI as preview-only editing chrome', () => {
    const notationSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], rhythm: 'q e e', riff: '1 2 3 4' }]
      }]
    };
    const onElementClick = vi.fn();
    const { container, rerender } = render(
      <ChordSheet
        song={notationSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
        activePreviewNotationTarget={{
          sectionId: 'section-1',
          barId: 'bar-1',
          notationMode: 'rhythm',
          cursor: { kind: 'rhythm', cursorUnit: 4 }
        }}
      />
    );

    const selectedRhythmEvent = screen.getByRole('button', { name: 'Select rhythm note 2' });
    expect(selectedRhythmEvent).toHaveAttribute('data-preview-edit-ui');
    expect(container.querySelector('[data-rhythm-notation] [data-preview-edit-ui].pointer-events-none')).toBeInTheDocument();
    expect(container.querySelector('[data-preview-notation-cursor-beat]')).toBeInTheDocument();
    expect(container.querySelector('[data-preview-notation-cursor-caret]')).toBeInTheDocument();

    rerender(
      <ChordSheet
        song={notationSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={onElementClick}
        activePreviewNotationTarget={{
          sectionId: 'section-1',
          barId: 'bar-1',
          notationMode: 'jianpu',
          cursor: { kind: 'jianpu', beatIndex: 1, unitIndex: 0, noteIndex: 0 }
        }}
      />
    );

    const selectedJianpuNote = screen.getByRole('button', { name: 'Select jianpu note 1 in beat 2' });
    expect(selectedJianpuNote).toHaveAttribute('data-preview-edit-ui');
    expect(selectedJianpuNote.previousElementSibling).toHaveAttribute('data-preview-edit-ui');
    expect(container.querySelector('[data-preview-notation-cursor-beat]')).toBeInTheDocument();
    expect(container.querySelector('[data-preview-notation-cursor-caret]')).toBeInTheDocument();
    expect(Array.from(container.querySelectorAll('[data-preview-edit-ui]')).some((node) => (
      node.getAttribute('class')?.includes('bg-indigo-200/45')
    ))).toBe(true);

    const printableClone = container.cloneNode(true) as HTMLElement;
    printableClone.querySelectorAll('[data-preview-edit-ui]').forEach((node) => node.remove());
    expect(Array.from(printableClone.querySelectorAll('[class]')).some((node) => (
      node.getAttribute('class')?.includes('bg-indigo-200/45')
      || node.getAttribute('class')?.includes('bg-indigo-200/60')
    ))).toBe(false);
  });

  it('keeps centered percent selection styling inside removable preview chrome', () => {
    const percentSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['%'] }] }]
    };
    const { container } = render(
      <ChordSheet
        song={percentSong}
        language="zh"
        currentKey="C"
        previewIdentity="song-1"
        onElementClick={vi.fn()}
        activePreviewNotationTarget={{
          sectionId: 'section-1',
          barId: 'bar-1',
          notationMode: 'chords',
          cursor: { kind: 'chord', slotIndex: 0, rawChordIndex: 0 }
        }}
      />
    );

    const selectedOverlay = container.querySelector('[data-preview-owner-slot="0"] > [data-preview-edit-ui]');
    expect(selectedOverlay).toBeInTheDocument();
    expect(selectedOverlay?.getAttribute('class')).toContain('bg-indigo-100/65');
  });
});
