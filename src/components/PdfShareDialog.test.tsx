import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import PdfShareDialog from './PdfShareDialog';

const file = new File(['%PDF-1.4'], '主日歌單.pdf', { type: 'application/pdf' });

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-download');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

it.each([true, false])('offers only the named PDF download (standalone: %s)', async standalone => {
  const close = vi.fn();
  render(<PdfShareDialog file={file} language="zh" standalone={standalone} onClose={close} />);
  const link = screen.getByRole('link', { name: '開啟或下載 PDF' });
  expect(screen.getAllByRole('link')).toEqual([link]);
  expect(link).toHaveAttribute('download', file.name);
  expect(link).toHaveAttribute('href', 'blob:test-download');
  expect(link).not.toHaveAttribute('target');
  const attachment = vi.mocked(URL.createObjectURL).mock.calls[0][0] as File;
  expect(attachment.name).toBe(file.name);
  expect(attachment.type).toBe('application/octet-stream');
  expect(await attachment.arrayBuffer()).toEqual(await file.arrayBuffer());

  link.addEventListener('click', event => event.preventDefault(), { once: true });
  fireEvent.click(link);
  expect(screen.getAllByRole('link')).toEqual([link]);
  const closeButton = screen.getByRole('button', { name: '關閉' });
  expect(screen.getAllByRole('button')).toEqual([closeButton]);
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(closeButton);
  expect(close).toHaveBeenCalledOnce();
});

it('releases each URL when its file is replaced or the dialog unmounts', () => {
  vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
  const props = { language: 'en' as const, standalone: true, onClose: vi.fn() };
  const { rerender, unmount } = render(<PdfShareDialog file={file} {...props} />);
  const nextFile = new File(['%PDF-second'], 'setlist.pdf', { type: 'application/pdf' });
  rerender(<PdfShareDialog file={nextFile} {...props} />);
  const link = screen.getByRole('link', { name: 'Open or download PDF' });
  expect(link).toHaveAttribute('download', nextFile.name);
  expect(link).toHaveAttribute('href', 'blob:second');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:second');
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
});
