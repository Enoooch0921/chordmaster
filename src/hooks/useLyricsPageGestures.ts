import { useLayoutEffect, useRef, type RefObject } from 'react';
import { usePerformanceSwipe } from './usePerformanceSwipe';

const noop = () => {};
const CONTROL = 'button, a, input, textarea, select, [role="button"], [contenteditable], [data-personal-notes-layer]';

/** Share the performance swipe recognizer; keep normal text selection and scrolling. */
export function useLyricsPageGestures(options: {
  canvas: RefObject<HTMLElement | null>;
  enabled: boolean;
  scope: string;
  writing?: boolean;
  onNext: () => unknown;
  onPrevious: () => unknown;
}) {
  const latest = useRef(options);
  latest.current = options;
  usePerformanceSwipe({
    enabled: options.enabled, scope: options.scope, overlay: options.canvas,
    onNext: options.onNext, onPrevious: options.onPrevious,
    onInteract: noop, onLearned: noop, ignoreTextSelection: true, lyricHandwriting: options.writing,
  });
  useLayoutEffect(() => {
    const canvas = options.canvas.current;
    if (!options.enabled || !canvas) return;
    let started = 0;
    let selectedAtStart = false;
    const start = () => {
      started = performance.now();
      selectedAtStart = window.getSelection()?.isCollapsed === false;
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.detail === 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if ((event.target as Element).closest(CONTROL) || selectedAtStart || window.getSelection()?.isCollapsed === false) return;
      if (started && performance.now() - started > 500) return;
      const bounds = canvas.getBoundingClientRect();
      event.preventDefault();
      event.stopPropagation();
      if (event.clientX < bounds.left + bounds.width / 2) latest.current.onPrevious();
      else latest.current.onNext();
    };
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('click', click);
    return () => {
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('click', click);
    };
  }, [options.enabled, options.scope, options.canvas]);
}
