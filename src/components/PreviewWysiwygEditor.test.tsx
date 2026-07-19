import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import type { PreviewEditorDeviceLayout } from '../lib/previewEditorLayout';
import PreviewWysiwygEditor, { type PreviewWysiwygTarget } from './PreviewWysiwygEditor';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const song: Song = {
  title: 'Metadata test',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  tempo: 72,
  shuffle: true,
  sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'] }] }]
};

const anchorRect = {
  left: 420,
  top: 120,
  right: 500,
  bottom: 152,
  width: 80,
  height: 32
};

const makeTarget = (field: PreviewWysiwygTarget['field']): PreviewWysiwygTarget => ({
  field,
  anchorRect,
  anchorKey: `song-1|meta|${field}`,
  previewIdentity: 'song-1'
});

const StatefulEditor = ({
  deviceLayout,
  field = 'metadata'
}: {
  deviceLayout: PreviewEditorDeviceLayout;
  field?: PreviewWysiwygTarget['field'];
}) => {
  const [currentSong, setCurrentSong] = React.useState(song);
  return (
    <PreviewWysiwygEditor
      song={currentSong}
      language="zh"
      target={makeTarget(field)}
      deviceLayout={deviceLayout}
      currentKey={currentSong.currentKey}
      currentCapo={currentSong.capo ?? 0}
      originalKey={currentSong.originalKey}
      onChange={setCurrentSong}
      onKeyChange={() => undefined}
      onCapoChange={() => undefined}
      onClose={() => undefined}
    />
  );
};

describe('PreviewWysiwygEditor song information panel', () => {
  it('keeps the panel open while Shuffle is turned off and back on', () => {
    render(<StatefulEditor deviceLayout="phone" />);

    const dialog = screen.getByRole('dialog', { name: '歌曲資訊' });
    const shuffle = screen.getByRole('checkbox', { name: 'Shuffle' });
    expect(shuffle).toBeChecked();

    fireEvent.click(shuffle);
    expect(shuffle).not.toBeChecked();
    expect(dialog).toBeInTheDocument();

    fireEvent.click(shuffle);
    expect(shuffle).toBeChecked();
    expect(dialog).toBeInTheDocument();
  });

  it('uses a compact phone grid and focuses the tapped field', async () => {
    const { container } = render(<StatefulEditor deviceLayout="phone" field="title" />);
    const panel = container.querySelector<HTMLElement>('[data-song-metadata-panel]');
    const titleInput = container.querySelector<HTMLInputElement>('[data-song-metadata-field="title"] input');
    const keyField = container.querySelector<HTMLElement>('[data-song-metadata-field="key"]');
    const shuffleField = container.querySelector<HTMLElement>('[data-song-metadata-field="groove"]');

    expect(panel?.dataset.deviceLayout).toBe('phone');
    expect(panel).toHaveClass('grid', 'grid-cols-6', 'gap-y-2');
    expect(titleInput?.closest('[data-song-metadata-field]')?.parentElement).toHaveClass('col-span-6');
    expect(keyField?.parentElement).toHaveClass('col-span-3');
    expect(shuffleField?.parentElement).toHaveClass('col-span-2');
    await waitFor(() => expect(document.activeElement).toBe(titleInput));
    expect(titleInput).toHaveClass('h-11');
  });

  it('uses a two-column tablet sheet with touch-sized controls', () => {
    const { container } = render(<StatefulEditor deviceLayout="tablet" />);
    const panel = container.querySelector<HTMLElement>('[data-song-metadata-panel]');
    const keyButton = container.querySelector<HTMLButtonElement>('[data-song-metadata-field="key"] button');

    expect(panel?.dataset.deviceLayout).toBe('tablet');
    expect(panel).toHaveClass('grid', 'grid-cols-2');
    expect(keyButton).toHaveClass('!h-11');
  });

  it('anchors the complete panel at desktop width', () => {
    const { container } = render(<StatefulEditor deviceLayout="desktop" />);
    const dialog = screen.getByRole('dialog', { name: '歌曲資訊' });
    const shell = dialog.parentElement;

    expect(container.querySelector('[data-preview-metadata-backdrop]')).toBeNull();
    expect(shell).toHaveStyle({ width: '520px' });
  });

  it('closes the complete panel with Escape', () => {
    const onClose = vi.fn();
    render(
      <PreviewWysiwygEditor
        song={song}
        language="zh"
        target={makeTarget('metadata')}
        deviceLayout="desktop"
        currentKey="C"
        currentCapo={0}
        originalKey="C"
        onChange={() => undefined}
        onKeyChange={() => undefined}
        onCapoChange={() => undefined}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(screen.getByRole('dialog', { name: '歌曲資訊' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
