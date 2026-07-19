export interface PreviewZoomScrollInput {
  currentScrollLeft: number;
  currentScrollTop: number;
  sheetClientLeft: number;
  sheetClientTop: number;
  scaledSheetWidth: number;
  scaledSheetHeight: number;
  contentRatioX: number;
  contentRatioY: number;
  focalClientX: number;
  focalClientY: number;
  preserveVerticalPosition?: boolean;
}

export interface PreviewZoomScrollPosition {
  scrollLeft: number;
  scrollTop: number;
}

export const getPreviewZoomContentRatio = (
  focalClientPosition: number,
  sheetClientStart: number,
  scaledSize: number,
  fallback: number
) => scaledSize > 0
  ? Math.min(1, Math.max(0, (focalClientPosition - sheetClientStart) / scaledSize))
  : fallback;

export const resolvePreviewZoomScrollPosition = ({
  currentScrollLeft,
  currentScrollTop,
  sheetClientLeft,
  sheetClientTop,
  scaledSheetWidth,
  scaledSheetHeight,
  contentRatioX,
  contentRatioY,
  focalClientX,
  focalClientY,
  preserveVerticalPosition = true
}: PreviewZoomScrollInput): PreviewZoomScrollPosition => {
  return {
    scrollLeft: Math.max(
      0,
      currentScrollLeft + sheetClientLeft + scaledSheetWidth * contentRatioX - focalClientX
    ),
    scrollTop: preserveVerticalPosition
      ? Math.max(
          0,
          currentScrollTop + sheetClientTop + scaledSheetHeight * contentRatioY - focalClientY
        )
      : 0
  };
};
