import { describe, expect, it } from 'vitest';
import { getPreviewZoomContentRatio, resolvePreviewZoomScrollPosition } from './previewZoom';

describe('preview zoom geometry', () => {
  it('keeps the same content point under the gesture focal point', () => {
    const contentRatioX = getPreviewZoomContentRatio(250, -300, 1000, 0.5);
    const contentRatioY = getPreviewZoomContentRatio(350, -600, 2000, 0);
    const position = resolvePreviewZoomScrollPosition({
      currentScrollLeft: 300,
      currentScrollTop: 600,
      sheetClientLeft: 100,
      sheetClientTop: 150,
      scaledSheetWidth: 2000,
      scaledSheetHeight: 4000,
      contentRatioX,
      contentRatioY,
      focalClientX: 250,
      focalClientY: 350
    });

    expect(position.scrollLeft).toBe(1250);
    expect(position.scrollTop).toBe(2300);
    expect(100 - (position.scrollLeft - 300) + 2000 * contentRatioX).toBe(250);
    expect(150 - (position.scrollTop - 600) + 4000 * contentRatioY).toBe(350);
  });

  it('clamps a focal point outside the sheet to the nearest edge', () => {
    expect(getPreviewZoomContentRatio(-20, 100, 794, 0.5)).toBe(0);
    expect(getPreviewZoomContentRatio(1000, 100, 794, 0.5)).toBe(1);
  });

  it('can reset vertical position for fit-to-page actions', () => {
    expect(resolvePreviewZoomScrollPosition({
      currentScrollLeft: 0,
      currentScrollTop: 800,
      sheetClientLeft: 100,
      sheetClientTop: -700,
      scaledSheetWidth: 952.8,
      scaledSheetHeight: 2640,
      contentRatioX: 0.5,
      contentRatioY: 0.75,
      focalClientX: 576.4,
      focalClientY: 500,
      preserveVerticalPosition: false
    }).scrollTop).toBe(0);
  });
});
