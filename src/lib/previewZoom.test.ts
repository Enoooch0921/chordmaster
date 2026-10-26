import { describe, expect, it } from 'vitest';
import { getPreviewPinchTranslation, getPreviewZoomContentRatio, resolvePreviewZoomLayout, resolvePreviewZoomScrollPosition } from './previewZoom';

describe('preview zoom geometry', () => {
  it('keeps a fitted page anchored without losing the required scroll range', () => {
    const input = { width: 800, height: 1000, scale: 0.48, viewportWidth: 400, viewportHeight: 600,
      contentRatioX: 0.5, contentRatioY: 0.5, focalX: 200, focalY: 200 };
    const layout = resolvePreviewZoomLayout(input);
    expect(layout.left + input.width * input.scale * input.contentRatioX - layout.scrollLeft).toBe(200);
    expect(layout.top + input.height * input.scale * input.contentRatioY - layout.scrollTop).toBe(200);
    expect(layout.scrollTop).toBe(40);
    expect(layout.canvasHeight - input.viewportHeight).toBe(40);
  });

  it('preserves an off-center zoom-out anchor with only the necessary leading space', () => {
    const input = { width: 800, height: 800, scale: 0.5, viewportWidth: 600, viewportHeight: 600,
      contentRatioX: 0.2, contentRatioY: 0.2, focalX: 400, focalY: 300 };
    const layout = resolvePreviewZoomLayout(input);
    expect(layout.left + 400 * 0.2 - layout.scrollLeft).toBe(400);
    expect(layout.top + 400 * 0.2 - layout.scrollTop).toBe(300);
    expect(layout.pan.left).toBe(220);
    expect(layout.pan.top).toBe(220);
    expect(resolvePreviewZoomLayout({ ...input, focalX: 300, preserveVerticalPosition: false }).scrollTop).toBe(0);
  });

  it('moves the original sheet point with the two-finger midpoint while scaling', () => {
    const t = getPreviewPinchTranslation(0.5, 1.2, 240, 700, 30, -20);
    expect(t.x + 240 * 1.2).toBeCloseTo(240 * 0.5 + 30);
    expect(t.y + 700 * 1.2).toBeCloseTo(700 * 0.5 - 20);
  });

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
