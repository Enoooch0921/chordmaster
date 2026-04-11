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
}

const DEFAULT_STATE: AnchoredPanelState = {
  top: 0,
  left: 0,
  placement: 'bottom',
  ready: false
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
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const triggerIsOffscreen = (
      triggerRect.bottom <= 0 ||
      triggerRect.top >= viewportHeight ||
      triggerRect.right <= 0 ||
      triggerRect.left >= viewportWidth
    );

    if (triggerIsOffscreen) {
      onRequestClose?.();
      return;
    }

    const unclampedLeft = align === 'left'
      ? triggerRect.left
      : align === 'right'
        ? triggerRect.right - panelRect.width
        : triggerRect.left + (triggerRect.width / 2) - (panelRect.width / 2);

    const maxLeft = Math.max(viewportPadding, viewportWidth - panelRect.width - viewportPadding);
    const left = Math.min(Math.max(unclampedLeft, viewportPadding), maxLeft);

    const availableBelow = viewportHeight - triggerRect.bottom - viewportPadding;
    const availableAbove = triggerRect.top - viewportPadding;
    const shouldOpenUpward = availableBelow < panelRect.height + offset && availableAbove > availableBelow;
    const placement: PanelPlacement = shouldOpenUpward ? 'top' : 'bottom';

    const rawTop = shouldOpenUpward
      ? triggerRect.top - panelRect.height - offset
      : triggerRect.bottom + offset;
    const maxTop = Math.max(viewportPadding, viewportHeight - panelRect.height - viewportPadding);
    const top = Math.min(Math.max(rawTop, viewportPadding), maxTop);

    setPanelState((current) => {
      if (
        current.ready &&
        current.placement === placement &&
        approximatelyEqual(current.left, left) &&
        approximatelyEqual(current.top, top)
      ) {
        return current;
      }

      return {
        left,
        top,
        placement,
        ready: true
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

    scheduleUpdate();

    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
    window.addEventListener('scroll', scheduleUpdate, true);

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
    visibility: panelState.ready ? 'visible' : 'hidden'
  }), [panelState.left, panelState.ready, panelState.top, zIndex]);

  return {
    panelStyle,
    placement: panelState.placement,
    isPositioned: panelState.ready
  };
}
