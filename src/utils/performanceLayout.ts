export const PERFORMANCE_PAGE_WIDTH = 794;
export const PERFORMANCE_PAGE_HEIGHT = 1123;
export const PERFORMANCE_PAGE_GAP = 16;

export function getPerformanceLayout(width: number, height: number, totalPages: number, isPhone = false) {
  // Landscape tablets can fit a spread too. Phones keep the larger single page.
  const columns = !isPhone && totalPages > 1 && width >= 1000 && width / height >= 1.25 ? 2 : 1;
  const sheetWidth = columns * PERFORMANCE_PAGE_WIDTH + (columns - 1) * PERFORMANCE_PAGE_GAP;
  const scale = Math.max(0, Math.min(width / sheetWidth, height / PERFORMANCE_PAGE_HEIGHT));
  return { columns, scale, width: sheetWidth * scale, height: PERFORMANCE_PAGE_HEIGHT * scale };
}

export function getPerformanceSpreadStart(index: number, totalPages: number, columns: number) {
  const lastPage = Math.max(0, totalPages - 1);
  const page = Math.max(0, Math.min(index, lastPage));
  return Math.floor(page / columns) * columns;
}

export function getPerformancePageRange(index: number, totalPages: number, columns: number) {
  const start = getPerformanceSpreadStart(index, totalPages, columns);
  const end = Math.min(start + columns, totalPages);
  return end > start + 1 ? `${start + 1}–${end}` : `${start + 1}`;
}
