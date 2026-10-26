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

export interface PreviewZoomLayoutInput {
  width: number;
  height: number;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  contentRatioX: number;
  contentRatioY: number;
  focalX: number;
  focalY: number;
  preserveVerticalPosition?: boolean;
}

/** Allocate only the pan space needed to keep the focal point reachable. */
export function resolvePreviewZoomLayout(input: PreviewZoomLayoutInput) {
  const width = input.width * input.scale;
  const height = input.height * input.scale;
  const baseWidth = Math.max(width, input.viewportWidth);
  const baseHeight = Math.max(height, input.viewportHeight);
  const centeredLeft = (baseWidth - width) / 2;
  const desiredLeft = centeredLeft + width * input.contentRatioX - input.focalX;
  const desiredTop = input.preserveVerticalPosition === false ? 0 : height * input.contentRatioY - input.focalY;
  const leadingX = Math.max(0, -desiredLeft);
  const leadingY = Math.max(0, -desiredTop);
  const scrollLeft = Math.max(0, desiredLeft);
  const scrollTop = Math.max(0, desiredTop);
  const canvasWidth = Math.max(baseWidth + leadingX, scrollLeft + input.viewportWidth);
  const canvasHeight = Math.max(baseHeight + leadingY, scrollTop + input.viewportHeight);
  return {
    left: centeredLeft + leadingX, top: leadingY, canvasWidth, canvasHeight, scrollLeft, scrollTop,
    pan: { left: leadingX, top: leadingY, extraWidth: canvasWidth - baseWidth, extraHeight: canvasHeight - baseHeight }
  };
}

/** The sheet uses a top-left transform origin; no layout reads are needed. */
export function getPreviewPinchTranslation(startScale: number, scale: number, pointX: number, pointY: number, deltaX: number, deltaY: number) {
  return { x: deltaX + pointX * (startScale - scale), y: deltaY + pointY * (startScale - scale) };
}
