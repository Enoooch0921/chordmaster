export type PreviewEditorDeviceLayout = 'phone' | 'tablet' | 'desktop';

export interface PreviewEditorDeviceSignals {
  viewportWidth: number;
  maxTouchPoints: number;
  hasCoarsePointer: boolean;
  isPhoneDevice: boolean;
  isKnownTabletDevice: boolean;
}

export const getPreviewEditorBottomInset = (
  deviceLayout: PreviewEditorDeviceLayout,
  panelHeight: number,
  gap = 16
) => deviceLayout === 'desktop'
  ? 0
  : Math.max(0, Math.round(panelHeight)) + gap;

/**
 * A touch user has already brought the bar into view by tapping it. Opening the
 * dock, changing notation mode, or advancing the cursor within that same bar
 * must therefore leave the preview's vertical scroll position alone. Only
 * keyboard-driven navigation to another bar needs automatic repositioning.
 *
 * This applies to both docked touch keyboards and the floating desktop editor:
 * `scrollIntoView()` can otherwise move a fully visible lower bar by hundreds
 * of pixels before placing the floating panel above it.
 */
export const shouldAutoScrollPreviewEditTarget = (
  _deviceLayout: PreviewEditorDeviceLayout,
  previousBarKey: string | null,
  currentBarKey: string | null,
  requestedByKeyboardNavigation = false
) => (
  currentBarKey === null
  || (
    requestedByKeyboardNavigation
    && previousBarKey !== null
    && previousBarKey !== currentBarKey
  )
);

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
