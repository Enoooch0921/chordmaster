import type { Dispatch, SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toPng, toCanvas, getFontEmbedCSS } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { APP_NAME } from '../constants/appMeta';
import { getAppFontEmbedCSS, waitForAppFontsReady } from './fontFaceAssets';
import { PdfExportCancelledError, type PdfExportProgressState, type ExportPageDescriptor, type PdfCanvasLimits, type PdfRenderedImage } from './pdfExportTypes';

const PDF_EXPORT_PREFERRED_PIXEL_RATIO = 5;
const PDF_EXPORT_MOBILE_MAX_PIXEL_RATIO = 3;
const PDF_EXPORT_MOBILE_MAX_CANVAS_SIDE = 4096;
const PDF_EXPORT_MOBILE_MAX_CANVAS_AREA = 12_000_000;
const PDF_EXPORT_DESKTOP_MAX_CANVAS_SIDE = 16384;
const PDF_EXPORT_DESKTOP_MAX_CANVAS_AREA = 64_000_000;

const isAppleTouchWebDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const trySharePdfFileFromWeb = async (pdf: jsPDF, safeFileName: string) => {
  if (
    typeof navigator === 'undefined'
    || typeof navigator.share !== 'function'
    || typeof File === 'undefined'
  ) {
    return false;
  }

  const pdfBlob = pdf.output('blob') as Blob;
  const pdfFile = new File([pdfBlob], safeFileName, { type: 'application/pdf' });
  // WebKit can turn a title into a separate share item. The file already has
  // its name, so share only the PDF without title, text, or URL metadata.
  const shareData = { files: [pdfFile] };

  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare(shareData)) {
      return false;
    }

    await navigator.share(shareData);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel|abort/i.test(message)) return true;
    return false;
  }
};

// On native iPad (Capacitor WKWebView), jsPDF's `.save()` relies on an
// `<a download>` click that WKWebView silently ignores, so nothing happens.
// Instead, write the PDF to the cache directory and hand it to the iOS share
// sheet (Save to Files, AirDrop, Mail, etc.).
export const savePdfDocument = async (pdf: jsPDF, fileName: string) => {
  const safeFileName = `${fileName}.pdf`;

  if (!Capacitor.isNativePlatform()) {
    if (isAppleTouchWebDevice() && await trySharePdfFileFromWeb(pdf, safeFileName)) {
      return;
    }

    pdf.save(safeFileName);
    return;
  }

  // jsPDF emits a "data:application/pdf;filename=...;base64,XXXX" URI; strip the
  // prefix so Filesystem.writeFile receives raw base64 data.
  const dataUri = pdf.output('datauristring');
  const base64Data = dataUri.slice(dataUri.indexOf(',') + 1);

  const writeResult = await Filesystem.writeFile({
    path: safeFileName,
    data: base64Data,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      files: [writeResult.uri],
    });
  } catch (error) {
    // Dismissing the iOS share sheet rejects with a "canceled" error — that is
    // not an export failure, so swallow it.
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(message)) {
      return;
    }
    throw error;
  }
};

const waitForPaint = async () => {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

const parsePositiveIntegerAttribute = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.round(numericValue);
};

const isMobileLikePdfExportDevice = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const hasCoarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (maxTouchPoints > 1 && hasCoarsePointer) ||
    window.innerWidth < 1024
  );
};

const getPdfCanvasLimits = (): PdfCanvasLimits => (
  isMobileLikePdfExportDevice()
    ? {
        maxSide: PDF_EXPORT_MOBILE_MAX_CANVAS_SIDE,
        maxArea: PDF_EXPORT_MOBILE_MAX_CANVAS_AREA,
        maxPixelRatio: PDF_EXPORT_MOBILE_MAX_PIXEL_RATIO,
      }
    : {
        maxSide: PDF_EXPORT_DESKTOP_MAX_CANVAS_SIDE,
        maxArea: PDF_EXPORT_DESKTOP_MAX_CANVAS_AREA,
        maxPixelRatio: PDF_EXPORT_PREFERRED_PIXEL_RATIO,
      }
);

// Capture the laid-out A4 page, not overflow from a long annotation. Scroll
// dimensions can be much wider and would squeeze the entire score into A4.
// offset dimensions also avoid applying preview transforms a second time.
export const getPdfPageCaptureSize = (element: HTMLElement) => ({
  width: Math.max(1, Math.ceil(element.offsetWidth || element.getBoundingClientRect().width || element.scrollWidth)),
  height: Math.max(1, Math.ceil(element.offsetHeight || element.getBoundingClientRect().height || element.scrollHeight)),
});

const getSafePdfPixelRatio = (width: number, height: number, preferredRatio = PDF_EXPORT_PREFERRED_PIXEL_RATIO) => {
  const limits = getPdfCanvasLimits();
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const sideLimitedRatio = Math.min(limits.maxSide / safeWidth, limits.maxSide / safeHeight);
  const areaLimitedRatio = Math.sqrt(limits.maxArea / (safeWidth * safeHeight));
  const ratio = Math.min(preferredRatio, limits.maxPixelRatio, sideLimitedRatio, areaLimitedRatio);

  return Math.max(1, Math.floor(ratio * 100) / 100);
};

const canvasHasVisibleContent = (canvas: HTMLCanvasElement) => {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return false;
  }

  const probeCanvas = document.createElement('canvas');
  const probeSize = 64;
  probeCanvas.width = probeSize;
  probeCanvas.height = probeSize;

  const probeContext = probeCanvas.getContext('2d', { willReadFrequently: true });
  if (!probeContext) {
    return true;
  }

  probeContext.fillStyle = '#ffffff';
  probeContext.fillRect(0, 0, probeSize, probeSize);
  probeContext.drawImage(canvas, 0, 0, probeSize, probeSize);

  try {
    const imageData = probeContext.getImageData(0, 0, probeSize, probeSize).data;
    for (let index = 0; index < imageData.length; index += 4) {
      const alpha = imageData[index + 3];
      const red = imageData[index];
      const green = imageData[index + 1];
      const blue = imageData[index + 2];

      if (alpha > 8 && (red < 245 || green < 245 || blue < 245)) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
};

const collectExportPages = (captureHost: HTMLElement): ExportPageDescriptor[] => {
    const pages = Array.from(captureHost.querySelectorAll('[data-print-page]')) as HTMLElement[];

    return pages.map((page) => {
      const songContainer = page.closest<HTMLElement>('[data-export-song-container]');
      const songIndex = parsePositiveIntegerAttribute(songContainer?.dataset.exportSongIndex ?? null) ?? 1;
      const totalSongs = parsePositiveIntegerAttribute(songContainer?.dataset.exportTotalSongs ?? null) ?? 1;
      const pageInSong = parsePositiveIntegerAttribute(page.dataset.exportPageIndex ?? null) ?? 1;
      const totalPagesInSong = parsePositiveIntegerAttribute(page.dataset.exportPageTotal ?? null) ?? 1;
      const sectionIndex = parsePositiveIntegerAttribute(page.dataset.exportSectionIndex ?? null);
      const songTitle = songContainer?.dataset.exportSongTitle?.trim() || page.dataset.exportSongTitle?.trim() || APP_NAME;
      const sectionTitle = page.dataset.exportSectionTitle?.trim() || null;

      return {
        element: page,
        songIndex,
        totalSongs,
        songTitle,
        sectionIndex,
        sectionTitle,
        pageInSong,
        totalPagesInSong
      };
    });
  };

export const exportCaptureHostToPdf = async (captureHost: HTMLElement, fileName: string, options: {
  isCancelled: () => boolean;
  onProgress: Dispatch<SetStateAction<PdfExportProgressState | null>>;
}) => {
    try {
      await waitForAppFontsReady();
    } catch {
      // Continue with a best-effort export if font readiness isn't available.
    }

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const pages = collectExportPages(captureHost);
    if (pages.length === 0) {
      throw new Error('No preview pages found for PDF export.');
    }

    const fontEmbedCSSParts: string[] = [];
    try {
      const appFontEmbedCSS = await getAppFontEmbedCSS();
      if (appFontEmbedCSS) {
        fontEmbedCSSParts.push(appFontEmbedCSS);
      }
    } catch {
      // Continue with html-to-image's stylesheet font capture.
    }
    try {
      const capturedFontEmbedCSS = await getFontEmbedCSS(captureHost);
      if (capturedFontEmbedCSS) {
        fontEmbedCSSParts.push(capturedFontEmbedCSS);
      }
    } catch {
      // Fall back to per-page font embedding if pre-fetch fails.
    }
    const fontEmbedCSS = fontEmbedCSSParts.length > 0 ? fontEmbedCSSParts.join('\n') : undefined;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const createRenderOptions = (pixelRatio: number) => ({
      backgroundColor: '#ffffff',
      cacheBust: false,
      pixelRatio,
      skipAutoScale: true,
      fontEmbedCSS,
    });

    const renderPageElement = async (pageElement: HTMLElement): Promise<PdfRenderedImage> => {
      const pageSize = getPdfPageCaptureSize(pageElement);
      const primaryPixelRatio = getSafePdfPixelRatio(pageSize.width, pageSize.height);
      const fallbackPixelRatios = Array.from(new Set([
        primaryPixelRatio,
        Math.min(primaryPixelRatio, 2),
        1,
      ])).filter((pixelRatio) => pixelRatio > 0);

      for (const pixelRatio of fallbackPixelRatios) {
        try {
          const canvas = await toCanvas(pageElement, {
            ...createRenderOptions(pixelRatio),
            width: pageSize.width,
            height: pageSize.height,
          });

          if (canvasHasVisibleContent(canvas)) {
            return {
              data: canvas.toDataURL('image/jpeg', 0.92),
              format: 'JPEG',
            };
          }
        } catch {
          // Try the next smaller, safer canvas size.
        }
      }

      return {
        data: await toPng(pageElement, {
          ...createRenderOptions(1),
          width: pageSize.width,
          height: pageSize.height,
        }),
        format: 'PNG',
      };
    };

    // Group pages by their [data-export-song-container] so we can render each
    // song's pages in a single toCanvas() call instead of one per page.
    // DOM serialisation (clone + style-inline + SVG generation) is the main
    // mobile bottleneck — doing it once per song instead of once per page gives
    // an N-fold reduction for multi-page songs.
    const songContainerGroups: { container: HTMLElement; pageIndices: number[] }[] = [];
    for (let i = 0; i < pages.length; i += 1) {
      const container =
        pages[i].element.closest<HTMLElement>('[data-export-song-container]') ??
        captureHost;
      const group = songContainerGroups.find((g) => g.container === container);
      if (group) {
        group.pageIndices.push(i);
      } else {
        songContainerGroups.push({ container, pageIndices: [i] });
      }
    }

    let globalPageCount = 0;
    for (const { pageIndices } of songContainerGroups) {
      if (options.isCancelled()) {
        throw new PdfExportCancelledError();
      }

      for (const pageIndex of pageIndices) {
        if (options.isCancelled()) {
          throw new PdfExportCancelledError();
        }

        const page = pages[pageIndex];
        flushSync(() => {
          options.onProgress({
            totalPages: pages.length,
            completedPages: globalPageCount,
            currentPage: pageIndex + 1,
            songIndex: page.songIndex,
            totalSongs: page.totalSongs,
            songTitle: page.songTitle,
            sectionIndex: page.sectionIndex,
            sectionTitle: page.sectionTitle,
            pageInSong: page.pageInSong,
            totalPagesInSong: page.totalPagesInSong,
            cancelRequested: options.isCancelled(),
          });
        });
        await waitForPaint();

        if (options.isCancelled()) {
          throw new PdfExportCancelledError();
        }

        // Render each printable page directly. The old whole-song canvas path
        // was faster, but slicing pages out of a tall off-screen canvas could
        // drift when the capture DOM used different spacing or font bounds.
        const renderedImage = await renderPageElement(page.element);

        if (options.isCancelled()) {
          throw new PdfExportCancelledError();
        }

        if (globalPageCount > 0) {
          pdf.addPage();
        }
        pdf.addImage(renderedImage.data, renderedImage.format, 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        globalPageCount += 1;

        flushSync(() => {
          options.onProgress((current) =>
            current ? { ...current, completedPages: globalPageCount } : current
          );
        });
      }
    }

    if (options.isCancelled()) {
      throw new PdfExportCancelledError();
    }

    await savePdfDocument(pdf, fileName);
  };
