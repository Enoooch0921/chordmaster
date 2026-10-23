import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PerformanceFullscreenControl from './PerformanceFullscreenControl';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});

const props = {
  language: 'zh' as const, isFullscreen: false, isStandalone: false,
  canRequestFullscreen: false, isAppleMobile: true, visible: true,
  onRequestFullscreen: vi.fn(), showInstallGuide: true, onOpenHomeScreenGuide: vi.fn(),
};

describe('performance fullscreen control', () => {
  it('opens the shared illustrated guide on Apple mobile devices', () => {
    const open = vi.fn();
    render(<PerformanceFullscreenControl {...props} onOpenHomeScreenGuide={open} />);
    expect(screen.queryByRole('button', { name: '隱藏網址列' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '無網址列使用方式' }));
    expect(open).toHaveBeenCalledOnce();
  });

  it('does not repeat installation guidance after the user has added the app', () => {
    render(<PerformanceFullscreenControl {...props} showInstallGuide={false} />);
    expect(screen.queryByRole('button')).toBeNull();
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
