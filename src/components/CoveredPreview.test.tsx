import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import CoveredPreview from './CoveredPreview';

it('keeps covered previews mounted without rendering tab changes and releases current content and handlers', () => {
  const rendered = vi.fn(), oldAction = vi.fn(), currentAction = vi.fn();
  function Preview({ title, onClick }: { title: string; onClick: () => void }) {
    rendered(title);
    return <button onClick={onClick}>{title}</button>;
  }
  const t = render(<CoveredPreview covered={false} scope="user-a:library-a:song-a"><Preview title="setlist" onClick={oldAction}/></CoveredPreview>);
  const initial = screen.getByRole('button', { name: 'setlist' });
  t.rerender(<CoveredPreview covered scope="user-a:library-a:song-a"><Preview title="songs" onClick={currentAction}/></CoveredPreview>);
  expect(t.container.querySelector('[data-covered-preview]')).toHaveAttribute('inert');
  expect(t.container.querySelector('button')).toBe(initial); expect(rendered).toHaveBeenCalledTimes(1);
  t.rerender(<CoveredPreview covered={false} scope="user-a:library-a:song-a"><Preview title="songs" onClick={currentAction}/></CoveredPreview>);
  expect(t.container.querySelector('[data-covered-preview]')).not.toHaveAttribute('inert');
  fireEvent.click(screen.getByRole('button', { name: 'songs' }));
  expect(currentAction).toHaveBeenCalledOnce(); expect(oldAction).not.toHaveBeenCalled();
  expect(rendered).toHaveBeenCalledTimes(2);
});

it.each(['user-b:library-a:song-a','user-a:library-b:song-a','user-a:library-a:song-b'])('does not retain another account, library or selected resource: %s', scope => {
  const t = render(<CoveredPreview covered scope="user-a:library-a:song-a"><p>old</p></CoveredPreview>);
  t.rerender(<CoveredPreview covered scope={scope}><p>current</p></CoveredPreview>);
  expect(screen.queryByText('old')).toBeNull(); expect(screen.getByText('current')).toBeInTheDocument();
});
