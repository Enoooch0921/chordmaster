import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
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
});
