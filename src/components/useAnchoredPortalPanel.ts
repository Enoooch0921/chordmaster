import React from 'react';

export type PanelAlign = 'left' | 'center' | 'right';
type PanelPlacement = 'top' | 'bottom';

interface UseAnchoredPortalPanelOptions {
  isOpen: boolean;
  align: PanelAlign;
  triggerRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
  onRequestClose?: () => void;
  offset?: number;
  viewportPadding?: number;
  zIndex?: number;
}

interface AnchoredPanelState {
  top: number;
  left: number;
  placement: PanelPlacement;
  ready: boolean;
  originX: number;
  maxHeight: number;
  maxWidth: number;
}

const DEFAULT_STATE: AnchoredPanelState = {
  top: 0,
  left: 0,
  placement: 'bottom',
  ready: false,
  originX: 0,
  maxHeight: 0,
  maxWidth: 0
};

const approximatelyEqual = (a: number, b: number) => Math.abs(a - b) < 0.5;

export function useAnchoredPortalPanel({
  isOpen,
  align,
  triggerRef,
  panelRef,
  onRequestClose,
  offset = 8,
  viewportPadding = 12,
  zIndex = 90
}: UseAnchoredPortalPanelOptions) {
  const [panelState, setPanelState] = React.useState<AnchoredPanelState>(DEFAULT_STATE);
  const frameRef = React.useRef<number | null>(null);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;

    if (!isOpen || !trigger || !panel) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    // Wait for measurable geometry instead of treating a not-yet-laid-out trigger as dismissed.
    if (triggerRect.width === 0 && triggerRect.height === 0) return;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const maxHeight = Math.max(0, viewportHeight - viewportPadding * 2);
    const maxWidth = Math.max(0, viewportWidth - viewportPadding * 2);
    const panelHeight = Math.min(panelRect.height, maxHeight);
    const panelWidth = Math.min(panelRect.width, maxWidth);

    const triggerIsOffscreen = (
      triggerRect.bottom <= viewportTop ||
      triggerRect.top >= viewportTop + viewportHeight ||
      triggerRect.right <= viewportLeft ||
      triggerRect.left >= viewportLeft + viewportWidth
    );

    if (triggerIsOffscreen && !panel.contains(document.activeElement)) {
      onRequestClose?.();
      return;
    }

    const unclampedLeft = align === 'left'
      ? triggerRect.left
      : align === 'right'
        ? triggerRect.right - panelWidth
        : triggerRect.left + (triggerRect.width / 2) - (panelWidth / 2);

    const minLeft = viewportLeft + viewportPadding;
    const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - panelWidth - viewportPadding);
    const left = Math.min(Math.max(unclampedLeft, minLeft), maxLeft);

    const availableBelow = viewportTop + viewportHeight - triggerRect.bottom - viewportPadding;
    const availableAbove = triggerRect.top - viewportTop - viewportPadding;
    const shouldOpenUpward = availableBelow < panelHeight + offset && availableAbove > availableBelow;
    const placement: PanelPlacement = shouldOpenUpward ? 'top' : 'bottom';

    const rawTop = shouldOpenUpward
      ? triggerRect.top - panelHeight - offset
      : triggerRect.bottom + offset;
    const minTop = viewportTop + viewportPadding;
    const maxTop = Math.max(minTop, viewportTop + viewportHeight - panelHeight - viewportPadding);
    const top = Math.min(Math.max(rawTop, minTop), maxTop);

    const originX = Math.max(0, Math.min(panelRect.width, triggerRect.left + triggerRect.width / 2 - left));
    setPanelState((current) => {
      if (
        current.ready &&
        current.placement === placement &&
        approximatelyEqual(current.left, left) &&
        approximatelyEqual(current.top, top) &&
        approximatelyEqual(current.originX, originX)
        && approximatelyEqual(current.maxHeight, maxHeight)
        && approximatelyEqual(current.maxWidth, maxWidth)
      ) {
        return current;
      }

      return {
        left,
        top,
        placement,
        ready: true,
        originX,
        maxHeight,
        maxWidth
      };
    });
  }, [align, isOpen, offset, onRequestClose, panelRef, triggerRef, viewportPadding]);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      setPanelState(DEFAULT_STATE);
      return;
    }

    const scheduleUpdate = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updatePosition();
      });
    };

    // Resolve the stationary shell before the first visible frame.
    updatePosition();

    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
    window.addEventListener('scroll', scheduleUpdate, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', scheduleUpdate);
    viewport?.addEventListener('scroll', scheduleUpdate);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });

      if (triggerRef.current) {
        resizeObserver.observe(triggerRef.current);
      }
      if (panelRef.current) {
        resizeObserver.observe(panelRef.current);
      }
    }

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      viewport?.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('scroll', scheduleUpdate);
      resizeObserver?.disconnect();

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isOpen, panelRef, triggerRef, updatePosition]);

  const panelStyle = React.useMemo<React.CSSProperties>(() => ({
    position: 'fixed',
    top: panelState.top,
    left: panelState.left,
    zIndex,
    maxHeight: panelState.ready ? panelState.maxHeight : undefined,
    maxWidth: panelState.ready ? panelState.maxWidth : undefined,
    visibility: panelState.ready ? 'visible' : 'hidden'
  }), [panelState, zIndex]);

  return {
    panelStyle,
    transformOrigin: `${panelState.originX}px ${panelState.placement === 'top' ? '100%' : '0%'}`,
    placement: panelState.placement,
    isPositioned: panelState.ready
  };
}
