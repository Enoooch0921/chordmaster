import { useLayoutEffect, useRef, useState } from 'react';

/** Fit action labels against the actual toolbar, including optional controls. */
export function useToolbarActionLabels(enabled: boolean, layout: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [showLabels, setShowLabels] = useState(false);
  useLayoutEffect(() => {
    const viewport = ref.current;
    const content = viewport?.querySelector<HTMLElement>('[data-toolbar-label-content]');
    if (!enabled || !viewport || !content) return;
    const measure = () => {
      if (!viewport.clientWidth) return;
      const labels = [...content.querySelectorAll<HTMLElement>('[data-toolbar-action-label]')];
      const hiddenLabelWidth = labels.reduce((total, label) => {
        if (getComputedStyle(label).position !== 'absolute') return total;
        const button = label.parentElement!;
        return total + label.getBoundingClientRect().width + (parseFloat(getComputedStyle(button).columnGap) || 0);
      }, 0);
      const required = content.getBoundingClientRect().width + hiddenLabelWidth;
      setShowLabels(required <= viewport.clientWidth - 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    content.querySelectorAll('[data-toolbar-action-label]').forEach(label => observer.observe(label));
    return () => observer.disconnect();
  }, [enabled, layout]);
  return { ref, showLabels };
}
