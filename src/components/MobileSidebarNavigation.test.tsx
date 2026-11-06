import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MobileSidebarNavigation from './MobileSidebarNavigation';
vi.mock('./useAnchoredPortalPanel', () => ({ useAnchoredPortalPanel: () => ({ panelStyle: { position: 'fixed', top: 0, left: 0 }, isPositioned: true, transformOrigin: 'top right' }) }));

const mount = () => {
  const onAbout = vi.fn(), onHelp = vi.fn();
  render(<><MobileSidebarNavigation logoSrc="/logo.svg" songsLabel="歌曲" setlistsLabel="歌單" aboutLabel="關於" helpLabel="說明"
    doneLabel="完成" moreLabel="更多" active="songs" onSongs={vi.fn()} onSetlists={vi.fn()} onAbout={onAbout} onHelp={onHelp} onClose={vi.fn()} />
    <button>外部按鈕</button></>);
  const trigger = screen.getByRole('button', { name: '更多' });
  fireEvent.click(trigger);
  return { trigger, onAbout, onHelp };
};

it.each(['關於', '說明'])('allows a touch-triggered null-target blur before tapping %s', label => {
  const { trigger, onAbout, onHelp } = mount();
  const action = screen.getByRole('button', { name: label });
  fireEvent.pointerDown(action, { pointerType: 'touch' });
  fireEvent.blur(trigger, { relatedTarget: null });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(action);
  expect(label === '關於' ? onAbout : onHelp).toHaveBeenCalledOnce();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

it('closes on outside taps, keyboard focus leaving the menu and Escape', () => {
  const { trigger, onAbout, onHelp } = mount();
  const outside = screen.getByRole('button', { name: '外部按鈕' });
  fireEvent.pointerDown(outside, { pointerType: 'touch' }); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  fireEvent.blur(trigger, { relatedTarget: outside }); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('button', { name: '說明' }), { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false'); expect(trigger).toHaveFocus();
  expect(onAbout).not.toHaveBeenCalled(); expect(onHelp).not.toHaveBeenCalled();
});

it('moves one decorative selection between songs and setlists without changing click behavior', () => {
  const onSongs = vi.fn(), onSetlists = vi.fn();
  const props = { logoSrc:'/logo.svg',songsLabel:'歌曲',setlistsLabel:'歌單',aboutLabel:'關於',helpLabel:'說明',doneLabel:'完成',moreLabel:'更多',onSongs,onSetlists,onAbout:vi.fn(),onHelp:vi.fn(),onClose:vi.fn() };
  const t=render(<MobileSidebarNavigation {...props} active="songs"/>);
  const marker=t.container.querySelector<HTMLElement>('.ui-sliding-selection')!;
  expect(marker).toHaveAttribute('aria-hidden','true'); expect(marker.style.transform).toContain('0%');
  fireEvent.click(screen.getByRole('button',{name:'歌單'})); expect(onSetlists).toHaveBeenCalledOnce();
  t.rerender(<MobileSidebarNavigation {...props} active="setlists"/>);
  expect(marker.style.transform).toContain('100%'); expect(marker.style.transform).toContain('0.25rem');
  expect(screen.getByRole('button',{name:'歌單'})).toHaveAttribute('aria-pressed','true');
  t.rerender(<MobileSidebarNavigation {...props} active={null}/>); expect(marker.style.opacity).toBe('0');
});

it('handles Escape even when a WebKit pointer click left focus outside the menu', () => {
  const { trigger } = mount();
  const outerEscape = vi.fn(); document.addEventListener('keydown', outerEscape);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false'); expect(trigger).toHaveFocus();
  expect(outerEscape).not.toHaveBeenCalled(); document.removeEventListener('keydown', outerEscape);
});
