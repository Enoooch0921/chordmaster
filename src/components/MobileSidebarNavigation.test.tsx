import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MobileSidebarNavigation from './MobileSidebarNavigation';

const mount = () => {
  const onAbout = vi.fn(), onHelp = vi.fn();
  render(<><MobileSidebarNavigation logoSrc="/logo.svg" songsLabel="歌曲" setlistsLabel="歌單" aboutLabel="關於" helpLabel="說明"
    doneLabel="完成" moreLabel="更多" active="songs" onSongs={vi.fn()} onSetlists={vi.fn()} onAbout={onAbout} onHelp={onHelp} onClose={vi.fn()} />
    <button>外部按鈕</button></>);
  const details = document.querySelector('details')!;
  details.open = true;
  return { details, onAbout, onHelp };
};

it.each(['關於', '說明'])('allows a touch-triggered null-target blur before tapping %s', label => {
  const { details, onAbout, onHelp } = mount();
  const action = screen.getByRole('button', { name: label });
  fireEvent.pointerDown(action, { pointerType: 'touch' });
  fireEvent.blur(details.querySelector('summary')!, { relatedTarget: null });
  expect(details.open).toBe(true);
  fireEvent.click(action);
  expect(label === '關於' ? onAbout : onHelp).toHaveBeenCalledOnce();
  expect(details.open).toBe(false);
});

it('closes on outside taps, keyboard focus leaving the menu and Escape', () => {
  const { details, onAbout, onHelp } = mount();
  const outside = screen.getByRole('button', { name: '外部按鈕' });
  fireEvent.pointerDown(outside, { pointerType: 'touch' }); expect(details.open).toBe(false);
  details.open = true;
  fireEvent.blur(details.querySelector('summary')!, { relatedTarget: outside }); expect(details.open).toBe(false);
  details.open = true;
  fireEvent.keyDown(screen.getByRole('button', { name: '說明' }), { key: 'Escape' });
  expect(details.open).toBe(false); expect(details.querySelector('summary')).toHaveFocus();
  expect(onAbout).not.toHaveBeenCalled(); expect(onHelp).not.toHaveBeenCalled();
});
