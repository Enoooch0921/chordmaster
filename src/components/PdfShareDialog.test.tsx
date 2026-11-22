import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PdfShareDialog from './PdfShareDialog';

const file = new File(['%PDF-1.4'], '主日歌單.pdf', { type: 'application/pdf' });
const share = vi.fn();
const close = vi.fn();
const revoke = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-pdf');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
  Object.defineProperties(navigator, {
    share: { configurable: true, value: share },
    canShare: { configurable: true, value: vi.fn().mockReturnValue(true) },
  });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

it('opens the file share sheet directly in the tap, and keeps the PDF if the user comes back', async () => {
  share.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError')).mockResolvedValueOnce(undefined);
  const { unmount } = render(<PdfShareDialog file={file} language="zh" standalone onClose={close} />);
  expect(share).not.toHaveBeenCalled();
  const button = screen.getByRole('button', { name: '分享 PDF' });
  fireEvent.click(button);
  expect(share).toHaveBeenCalledWith({ files: [file] });
  await waitFor(() => expect(screen.getByRole('link', { name: '開啟 PDF 預覽' })).toHaveAttribute('download', file.name));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  unmount();
  expect(revoke).toHaveBeenCalledWith('blob:test-pdf');
});

it('offers the same PDF for preview after Safari refuses the share', async () => {
  share.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  render(<PdfShareDialog file={file} language="zh" standalone={false} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: '分享 PDF' }));
  expect(await screen.findByText(/無法開啟分享選單/)).toBeVisible();
  const link = screen.getByRole('link', { name: '開啟 PDF 預覽' });
  expect(link).toHaveAttribute('href', 'blob:test-pdf');
  expect(link).not.toHaveAttribute('download');
  expect(URL.createObjectURL).toHaveBeenCalledWith(file);
});

it('keeps preview available when Web Share cannot send a PDF', () => {
  vi.mocked(navigator.canShare).mockReturnValue(false);
  render(<PdfShareDialog file={file} language="en" standalone={false} onClose={close} />);
  expect(screen.queryByRole('button', { name: 'Share PDF' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Open PDF preview' })).toHaveAttribute('target', '_blank');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalledOnce();
});
