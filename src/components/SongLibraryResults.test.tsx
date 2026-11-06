import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import SongLibraryResults from './SongLibraryResults';

it('bounds render work, reaches every result and resets a changed query without resurrecting old pages', () => {
  const items = Array.from({ length: 1000 }, (_, index) => ({ id: String(index) }));
  const renderRow = (item: { id: string }) => <button key={item.id}>Song {item.id}</button>;
  const props = { items, renderRow, language: 'en' as const };
  const view = render(<SongLibraryResults {...props} queryKey="all" />);
  expect(screen.getAllByRole('button', { name: /^Song / })).toHaveLength(60);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('61–120 / 1000')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Song 60' })).toBeInTheDocument();
  for (let index = 1; index < 16; index++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Song 999' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  view.rerender(<SongLibraryResults {...props} items={[items[999]]} queryKey="999" />);
  expect(screen.queryByRole('navigation')).toBeNull();
  view.rerender(<SongLibraryResults {...props} queryKey="all" />);
  expect(screen.getByText('1–60 / 1000')).toBeInTheDocument();
});

it('clamps a page when rows are removed and keeps the empty state reachable', () => {
  const items = Array.from({ length: 61 }, (_, id) => ({ id: String(id) }));
  const props = { queryKey: 'all', language: 'en' as const, renderRow: (item: {id: string}) => <span key={item.id}>{item.id}</span> };
  const view = render(<SongLibraryResults {...props} items={items} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  view.rerender(<SongLibraryResults {...props} items={items.slice(0, 1)} />);
  expect(screen.getByText('0')).toBeInTheDocument();
  view.rerender(<SongLibraryResults {...props} items={[]}>Empty</SongLibraryResults>);
  expect(screen.getByText('Empty')).toBeInTheDocument();
});
