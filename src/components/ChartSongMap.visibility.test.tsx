import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import ChordSheet from './ChordSheet';
import SongMetadataPanel from './SongMetadataPanel';
import type { Song } from '../types';
import { normalizeSongBars } from '../lib/workspace';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const source: Song = { title: 'Joy (What The World Calls Foolish)', originalKey: 'C', currentKey: 'C',
  timeSignature: '4/4', songMap: [{ label: 'Bridge', repeats: 4 }], lyricist: 'Martin Smith', composer: 'Version',
  sections: [{ id: 'verse', title: 'Verse', bars: Array.from({ length: 44 }, (_, i) => ({ id: 'bar' + i, chords: ['C'] })) }] };

it.each(['default', 'preview-header'] as const)('saves visibility through the %s song-info entry and restores the arrangement', variant => {
  function Test() {
    const [song, setSong] = useState(source);
    return <><SongMetadataPanel song={song} language="zh" onChange={s => setSong(normalizeSongBars(s))}
      presentation="popover" variant={variant} />
      <ChordSheet song={song} currentKey="C" language="zh" /></>;
  }
  const { container } = render(<Test />);
  const toggle = screen.getByRole('button', { name: '顯示曲序' });
  expect(toggle.closest('.song-info-map-visibility')).toBeTruthy();
  expect(container.querySelector('.song-info-form')?.firstElementChild).toContainElement(toggle);
  const measureIds = () => Array.from(container.querySelectorAll('[data-preview-clipboard-bar]')).map(el => el.getAttribute('data-preview-clipboard-bar'));
  const originalIds = measureIds();
  expect(container.querySelectorAll('[data-chart-song-map]')).toHaveLength(2);
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(container.querySelector('[data-chart-song-map]')).toBeNull();
  expect(container.querySelector('.score-heading')).toBeNull();
  expect(measureIds()).toEqual(originalIds);
  fireEvent.click(toggle);
  expect(container.querySelectorAll('[data-chart-song-map]')).toHaveLength(2);
  expect(within(container.querySelector('[data-chart-song-map]') as HTMLElement).getByRole('img', {name:'Bridge，共 4 遍'})).toBeInTheDocument();
  expect(measureIds()).toEqual(originalIds);
});
