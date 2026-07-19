import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import { ensureSongEditingIds } from '../lib/songEditing';
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

  it('exposes continuation-row whitespace as a split target only while editable', () => {
    const longSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: Array.from({ length: 5 }, (_, index) => ({ id: `bar-${index + 1}`, chords: ['C'] }))
      }]
    };
    const onElementClick = vi.fn();
    const { rerender } = render(
      <ChordSheet song={longSong} language="zh" currentKey="C" previewIdentity="song-1" onElementClick={onElementClick} />
    );
    const splitButton = screen.getByRole('button', { name: '從本行分段並命名' });
    expect(splitButton).toHaveTextContent('＋ 分段');
    fireEvent.click(splitButton);
    expect(onElementClick).toHaveBeenCalledWith(0, 4, 'sectionName', expect.objectContaining({ barId: 'bar-5' }));

    rerender(<ChordSheet song={longSong} language="zh" currentKey="C" previewIdentity="song-1" />);
    expect(screen.queryByRole('button', { name: '從本行分段並命名' })).not.toBeInTheDocument();
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
