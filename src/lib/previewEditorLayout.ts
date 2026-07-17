export type PreviewEditorDeviceLayout = 'phone' | 'tablet' | 'desktop';

export interface PreviewEditorDeviceSignals {
  viewportWidth: number;
  maxTouchPoints: number;
  hasCoarsePointer: boolean;
  isPhoneDevice: boolean;
  isKnownTabletDevice: boolean;
}

/**
 * iPadOS can expose a fine pointer whenever a Magic Keyboard or mouse is
 * connected. Touch capability and the device class are therefore more stable
 * signals for the quick-editor dock than `pointer: fine` alone.
 */
export const resolvePreviewEditorDeviceLayout = ({
  viewportWidth,
  maxTouchPoints,
  hasCoarsePointer,
  isPhoneDevice,
  isKnownTabletDevice
}: PreviewEditorDeviceSignals): PreviewEditorDeviceLayout => {
  if (isPhoneDevice || viewportWidth < 640) return 'phone';
  if (isKnownTabletDevice) return 'tablet';
  if ((maxTouchPoints > 0 || hasCoarsePointer) && viewportWidth <= 1536) return 'tablet';
  return 'desktop';
};
