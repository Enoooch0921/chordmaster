import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PerformanceFullscreenControl from './PerformanceFullscreenControl';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});

const props = {
  language: 'zh' as const, isFullscreen: false, isStandalone: false,
  canRequestFullscreen: false, isAppleMobile: true, visible: true,
  onRequestFullscreen: vi.fn(),
};

describe('performance fullscreen control', () => {
  it('opens persistent Home Screen instructions instead of promising to hide Safari bars', () => {
    render(<div data-testid="performance-overlay"><PerformanceFullscreenControl {...props} /></div>);
    expect(screen.queryByRole('button', { name: '隱藏網址列' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '無網址列使用方式' }));
    const dialog = screen.getByRole('dialog', { name: '不顯示瀏覽器網址列' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByTestId('performance-overlay')).not.toContainElement(dialog);
    expect(dialog).toHaveTextContent('演出模式無法直接將它移除');
    expect(dialog).toHaveTextContent('以 Web App 開啟');
    expect(dialog).toHaveTextContent('點 ChordMaster 圖示開啟');
    fireEvent.click(within(dialog).getByRole('button', { name: '關閉使用說明' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('requests supported fullscreen synchronously within the button click', () => {
    const request = vi.fn();
    render(<PerformanceFullscreenControl {...props} canRequestFullscreen onRequestFullscreen={request} />);
    fireEvent.click(screen.getByRole('button', { name: '全螢幕' }));
    expect(request).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([{ isStandalone: true }, { isFullscreen: true }])('hides the redundant control when browser bars are already absent: %j', state => {
    render(<PerformanceFullscreenControl {...props} {...state} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('gives non-Apple browsers installation instructions without requiring Safari', () => {
    render(<PerformanceFullscreenControl {...props} language="en" isAppleMobile={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use without browser bars' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Install app or Add to Home Screen');
    expect(dialog).not.toHaveTextContent('Safari');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
