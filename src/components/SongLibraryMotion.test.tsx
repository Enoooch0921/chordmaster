import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import SongLibraryFilters from './SongLibraryFilters';
import LibrarySelectionSummary from './LibrarySelectionSummary';
import { EMPTY_LIBRARY_FILTERS, type LibraryScope } from '../lib/songLibraryFilters';
import type { StoredSong } from '../types';

function Filters() {
  const [scope, setScope] = useState<LibraryScope>('all');
  const [filters, setFilters] = useState(EMPTY_LIBRARY_FILTERS);
  return <SongLibraryFilters language="zh" scope={scope} onScopeChange={setScope} filters={filters} onChange={setFilters} keys={['C', 'D']} meters={['4/4']} />;
}
const click = (button: HTMLElement) => { fireEvent.pointerDown(button); fireEvent.click(button); };

it('retains filter values and the same form when reversing a close, and disables the exiting form', async () => {
  render(<Filters />);
  const toggle = screen.getByRole('button', { name: '篩選' });
  click(toggle);
  const region = screen.getByRole('region', { name: '歌曲篩選' });
  const input = screen.getByRole('spinbutton', { name: '最低 BPM' });
  fireEvent.change(input, { target: { value: '100' } });
  click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(region.closest('[data-ui-disclosure]')).toHaveAttribute('inert');
  expect(screen.queryByRole('region', { name: '歌曲篩選' })).toBeNull();
  click(toggle);
  expect(screen.getByRole('spinbutton', { name: '最低 BPM' })).toBe(input);
  expect(input).toHaveValue(100);
  expect(region.closest('[data-ui-disclosure]')).not.toHaveAttribute('inert');
  click(screen.getByRole('button', { name: '收藏' }));
  expect(screen.getByRole('button', { name: '收藏' })).toHaveAttribute('aria-pressed', 'true');
  expect(input).toHaveValue(100);
  click(toggle);
  await waitFor(() => expect(region).not.toBeInTheDocument());
});

it('allows bulk actions immediately while the selected-song disclosure is fading', () => {
  const song: StoredSong = { id: 'selected', title: '測試歌曲', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [], updatedAt: 1 };
  const remove = vi.fn(), clear = vi.fn();
  render(<LibrarySelectionSummary songs={[song]} language="zh" onRemove={remove} onClear={clear} />);
  const toggle = screen.getByRole('button', { name: '已選 1 首' });
  click(toggle);
  click(screen.getByRole('button', { name: '取消選取：測試歌曲' }));
  expect(remove).toHaveBeenCalledWith(song.id);
  const region = screen.getByRole('region', { name: '已選歌曲' });
  click(toggle);
  expect(region.closest('[data-ui-disclosure]')).toHaveAttribute('inert');
  click(screen.getByRole('button', { name: '清除全部選取' }));
  expect(clear).toHaveBeenCalledOnce();
});
