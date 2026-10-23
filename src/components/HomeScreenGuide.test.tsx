import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeScreenGuide from './HomeScreenGuide';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});

describe('illustrated Home Screen guide', () => {
  it('switches between iPhone and iPad instructions and official help links', () => {
    render(<HomeScreenGuide language="zh" initialDevice="iphone" onClose={vi.fn()} onAdded={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '加入主畫面' });
    expect(within(dialog).getByRole('button', { name: 'iPhone' })).toHaveAttribute('aria-pressed', 'true');
    expect(dialog).toHaveTextContent('網址列旁的選單');
    expect(dialog).toHaveTextContent('打開為網頁 App');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
    expect(within(dialog).getByRole('link')).toHaveAttribute('href', expect.stringContaining('/guide/iphone/'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'iPad' }));
    expect(dialog).toHaveTextContent('點上方的分享圖示');
    expect(within(dialog).getByRole('button', { name: 'iPad' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('link')).toHaveAttribute('href', expect.stringContaining('/guide/ipad/'));
  });

  it('only suppresses future guidance when the user explicitly confirms it was added', () => {
    const close = vi.fn();
    const added = vi.fn();
    render(<HomeScreenGuide language="zh" initialDevice="ipad" onClose={close} onAdded={added} />);
    fireEvent.click(screen.getByRole('button', { name: '稍後再說' }));
    expect(close).toHaveBeenCalledOnce();
    expect(added).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '我已加入，不再顯示' }));
    expect(added).toHaveBeenCalledOnce();
  });

  it('provides English instructions and closes on Escape without marking installation', () => {
    const close = vi.fn();
    const added = vi.fn();
    render(<HomeScreenGuide language="en" initialDevice="ipad" onClose={close} onAdded={added} />);
    const dialog = screen.getByRole('dialog', { name: 'Add to Home Screen' });
    expect(dialog).toHaveTextContent('top toolbar');
    expect(dialog).toHaveTextContent('Open as Web App');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(close).toHaveBeenCalledOnce();
    expect(added).not.toHaveBeenCalled();
  });
});
