import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { jsPDF } from 'jspdf';

const mocks = vi.hoisted(() => ({ native: vi.fn(), write: vi.fn(), share: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.native } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: mocks.write }, Directory: { Cache: 'CACHE' } }));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));
import { getPdfPageCaptureSize, savePdfDocument } from './pdfExport';

describe('PDF page capture', () => {
  it('keeps the A4 page dimensions when a long source annotation overflows', () => {
    const page = document.createElement('div');
    Object.defineProperties(page, {
      offsetWidth: { value: 794 }, offsetHeight: { value: 1123 },
      scrollWidth: { value: 1425 }, scrollHeight: { value: 1160 }
    });
    expect(getPdfPageCaptureSize(page)).toEqual({ width: 794, height: 1123 });
  });

  it('does not capture an additional preview zoom as the page size', () => {
    const page = document.createElement('div');
    Object.defineProperties(page, { offsetWidth: { value: 794 }, offsetHeight: { value: 1123 } });
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({ width: 397, height: 561.5 } as DOMRect);
    expect(getPdfPageCaptureSize(page)).toEqual({ width: 794, height: 1123 });
  });
});

describe('PDF delivery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.native.mockReturnValue(false);
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn().mockReturnValue(true) });
  });
  const document = () => ({ output: vi.fn((kind) => kind === 'blob'
    ? new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }) : 'data:application/pdf;filename=x.pdf;base64,cGRm'), save: vi.fn() });

  it('shares one named PDF on iPhone without title, text or URL', async () => {
    const pdf = document();
    await savePdfDocument(pdf as unknown as jsPDF, '主日歌單');
    const [payload] = vi.mocked(navigator.share).mock.calls[0];
    expect(Object.keys(payload)).toEqual(['files']);
    expect(payload.files).toHaveLength(1);
    expect(payload.files![0]).toMatchObject({ name: '主日歌單.pdf', type: 'application/pdf', size: 9 });
    expect(pdf.save).not.toHaveBeenCalled();
  });

  it('recognizes an iPad using the desktop user agent', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Macintosh Safari' });
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    await savePdfDocument(document() as unknown as jsPDF, 'iPad');
    expect(navigator.share).toHaveBeenCalledOnce();
  });

  it('sends only the cached file to the native share sheet', async () => {
    mocks.native.mockReturnValue(true);
    mocks.write.mockResolvedValue({ uri: 'file:///cache/song.pdf' });
    await savePdfDocument(document() as unknown as jsPDF, 'song');
    expect(mocks.write).toHaveBeenCalledWith({ path: 'song.pdf', data: 'cGRm', directory: 'CACHE' });
    expect(mocks.share).toHaveBeenCalledWith({ files: ['file:///cache/song.pdf'] });
    expect(navigator.share).not.toHaveBeenCalled();
  });

  it('does not download a second copy when the share sheet is cancelled', async () => {
    vi.mocked(navigator.share).mockRejectedValue(new DOMException('Share aborted', 'AbortError'));
    const pdf = document();
    await savePdfDocument(pdf as unknown as jsPDF, 'song');
    expect(pdf.save).not.toHaveBeenCalled();
  });

  it('falls back to downloading the PDF when file sharing is unsupported', async () => {
    vi.mocked(navigator.canShare).mockReturnValue(false);
    const pdf = document();
    await savePdfDocument(pdf as unknown as jsPDF, 'song');
    expect(pdf.save).toHaveBeenCalledWith('song.pdf');
    expect(navigator.share).not.toHaveBeenCalled();
  });
});
