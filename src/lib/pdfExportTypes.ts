export interface PdfExportProgressState {
  totalPages: number;
  completedPages: number;
  currentPage: number;
  songIndex: number;
  totalSongs: number;
  songTitle: string;
  sectionIndex: number | null;
  sectionTitle: string | null;
  pageInSong: number;
  totalPagesInSong: number;
  cancelRequested: boolean;
}

export interface ExportPageDescriptor {
  element: HTMLElement;
  songIndex: number;
  totalSongs: number;
  songTitle: string;
  sectionIndex: number | null;
  sectionTitle: string | null;
  pageInSong: number;
  totalPagesInSong: number;
}

export interface PdfCanvasLimits {
  maxSide: number;
  maxArea: number;
  maxPixelRatio: number;
}

export interface PdfRenderedImage {
  data: string;
  format: 'JPEG' | 'PNG';
}

export class PdfExportCancelledError extends Error {
  constructor() {
    super('PDF export cancelled.');
    this.name = 'PdfExportCancelledError';
  }
}
