import { useLayoutEffect, type RefObject } from 'react';

/** Keep pickup timing on the same horizontal scale as the following measures. */
export function usePickupSpacing(ref: RefObject<HTMLDivElement | null>, units: number, measureUnits: number, layoutKey: unknown) {
  useLayoutEffect(() => {
    const pickup = ref.current;
    const gutter = pickup?.closest<HTMLElement>('[data-preview-bar-gutter]');
    const row = gutter?.parentElement;
    const sheet = pickup?.closest<HTMLElement>('[data-chord-sheet]');
    const reference = row?.querySelector<HTMLElement>('.sheet-bar [data-jianpu-notation]');
    const notation = pickup?.querySelector<HTMLElement>('[data-jianpu-notation]');
    const bar = reference?.closest<HTMLElement>('.sheet-bar');
    if (!pickup || !gutter || !row || !sheet || !reference || !notation || !bar || !units || !measureUnits) return;
    const pages = [...sheet.querySelectorAll<HTMLElement>('[data-print-page], [data-score-excerpt]')];
    let frame: number | null = null;
    let disposed = false;
    const measure = () => {
      const rowWidth = parseFloat(getComputedStyle(row).width);
      const zoom = row.getBoundingClientRect().width / rowWidth;
      if (!Number.isFinite(zoom) || zoom <= 0) return;
      const width = (element: HTMLElement) => element.getBoundingClientRect().width / zoom;
      const barInset = width(bar) - width(reference);
      const pickupInset = width(pickup) - width(notation);
      const gutterStyle = getComputedStyle(gutter);
      const gutterInset = getComputedStyle(pickup).position === 'absolute' ? 0
        : parseFloat(gutterStyle.paddingLeft) + parseFloat(gutterStyle.paddingRight);
      const ratio = units / measureUnits;
      // Four full measures share the remaining row. Solve once rather than
      // repeatedly growing the gutter in response to its own resize.
      const gutterWidth = Math.max(parseFloat(gutterStyle.minWidth) || 0,
        (ratio * (rowWidth - 4 * barInset) + 4 * (pickupInset + gutterInset)) / (4 + ratio));
      const pickupWidth = ratio * ((rowWidth - gutterWidth) / 4 - barInset) + pickupInset;
      if (Math.abs(width(gutter) - gutterWidth) > 0.1) {
        sheet.style.setProperty('--pickup-gutter-width', `${gutterWidth}px`);
        pages.forEach(page => page.style.setProperty('--pickup-gutter-width', `${gutterWidth}px`));
      }
      if (Math.abs(width(pickup) - pickupWidth) > 0.1) pickup.style.width = `${pickupWidth}px`;
    };
    const schedule = () => {
      if (disposed || frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; measure(); });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    [row, reference, notation].forEach(element => observer?.observe(element));
    document.fonts?.ready.then(schedule);
    window.addEventListener('resize', schedule);
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      pages.forEach(page => page.style.removeProperty('--pickup-gutter-width'));
      sheet.style.removeProperty('--pickup-gutter-width');
      pickup.style.removeProperty('width');
    };
  }, [ref, units, measureUnits, layoutKey]);
}
