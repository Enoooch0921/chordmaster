import React from 'react';
import { opticalChordSpacing } from '../utils/chordOpticalSpacing';

/** Keep original type height and fit each measure independently. */
export function ChordFitScope({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const scopeRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    let disposed = false;
    let frame: number | null = null;
    const grids = Array.from(scope.querySelectorAll<HTMLElement>('[data-chord-fit-grid]'));
    const measure = () => {
      if (disposed) return;
      for (const grid of grids) {
        if (!grid.hasAttribute('data-chord-even-spacing')) grid.style.removeProperty('--chord-fit-columns');
      }
      // Read every natural width before writing any scale or track geometry.
      const measurements = grids.map(grid => {
        const slots = Array.from(grid.querySelectorAll<HTMLElement>('[data-chord-fit-slot]')).map(slot => {
          const padding = slot.parentElement === grid ? undefined : getComputedStyle(slot.parentElement!);
          const content = slot.firstElementChild as HTMLElement | null;
          const rect = content?.getBoundingClientRect();
          const computed = content ? getComputedStyle(content) : undefined;
          const layoutWidth = content ? parseFloat(computed!.width) || content.offsetWidth : 0;
          const layoutHeight = content ? parseFloat(computed!.height) || content.offsetHeight : 0;
          const sx = layoutWidth && rect ? rect.width / layoutWidth : 0;
          const sy = layoutHeight && rect ? rect.height / layoutHeight : 0;
          const leaves = content ? Array.from(content.querySelectorAll<HTMLElement>('span'))
            .filter(glyph => !glyph.childElementCount && glyph.textContent?.trim()
              && !glyph.closest('[data-chord-fit-decoration]') && getComputedStyle(glyph).visibility !== 'hidden') : [];
          const boxes = rect && sx && sy ? leaves.map(glyph => {
            const box = glyph.getBoundingClientRect();
            return { left: (box.left - rect.left) / sx, right: (box.right - rect.left) / sx,
              top: (box.top - rect.bottom) / sy, bottom: (box.bottom - rect.bottom) / sy };
          }).filter(box => box.right > box.left && box.bottom > box.top) : [];
          const naturalWidth = Math.max(layoutWidth || content?.scrollWidth || 0, ...boxes.map(box => box.right));
          const ink = { width: naturalWidth, boxes };
          return {
            slot,
            width: slot.clientWidth || slot.offsetWidth,
            naturalWidth,
            ink,
            left: parseFloat(padding?.paddingLeft ?? '0') || 0,
            right: parseFloat(padding?.paddingRight ?? '0') || 0
          };
        });
        const gridStyle = getComputedStyle(grid);
        const width = Math.max(0, (grid.clientWidth || grid.offsetWidth)
          - (parseFloat(gridStyle.paddingLeft) || 0) - (parseFloat(gridStyle.paddingRight) || 0));
        const even = grid.hasAttribute('data-chord-even-spacing') && slots.length > 1;
        const available = width - (slots[0]?.left ?? 0) - (slots.at(-1)?.right ?? 0);
        const scale = even && width > 0
          ? opticalChordSpacing(slots.map(slot => slot.ink), available).scale
          : slots.reduce((smallest, slot) => slot.width > 0 && slot.naturalWidth > slot.width
            ? Math.min(smallest, Math.max(0, slot.width - 2) / slot.naturalWidth) : smallest, 1);
        return { grid, slots, width, even, available, scale };
      });
      for (const { grid, slots, width, even, available, scale: fittedScale } of measurements) {
        // One uniform horizontal scale within this measure; never borrow a
        // tighter fit from another measure. Roomy measures stay at full width.
        const scale = Math.min(1, fittedScale);
        // Store on each grid too: exported page clones retain the resolved fit.
        grid.style.setProperty('--chord-fit-scale', String(scale));
        if (even && width > 0) {
          const layout = opticalChordSpacing(slots.map(slot => slot.ink), available, scale);
          const columns = slots.map((slot, index) => (index < slots.length - 1
            ? layout.positions[index + 1] - layout.positions[index] + slot.left - slots[index + 1].left
            : slot.naturalWidth * scale + slot.left + slot.right));
          grid.style.setProperty('--chord-fit-columns', columns.map(width => `${Math.max(0, width)}px`).join(' '));
          grid.dataset.opticalGap = String(layout.gap);
          grid.dataset.opticalAdvances = JSON.stringify(layout.pairs.map(pair => pair.advance));
          grid.dataset.opticalClearances = JSON.stringify(layout.pairs.map(pair => pair.collisionAdvance));
        }
        for (const { slot, width: slotWidth, naturalWidth: chordWidth } of slots) {
          const offset = Number(slot.dataset.chordFitOffset) || 0;
          const inset = even ? 0 : Math.max(0, Math.min(slotWidth * offset, slotWidth - chordWidth * scale));
          slot.style.setProperty('--chord-fit-inset', `${inset}px`);
        }
      }
    };
    const schedule = () => {
      if (disposed || frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; measure(); });
    };
    measure();
    const observer = new ResizeObserver(schedule);
    for (const grid of grids) {
      observer.observe(grid);
      for (const slot of grid.querySelectorAll('[data-chord-fit-slot]')) {
        observer.observe(slot);
        if (slot.firstElementChild) observer.observe(slot.firstElementChild);
      }
    }
    void document.fonts?.ready.then(schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [children]);

  return <div {...props} ref={scopeRef} data-chord-fit-scope>{children}</div>;
}

export function ChordFitGrid({ children, evenSpacing = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { evenSpacing?: boolean }) {
  return <div {...props} data-chord-fit-grid data-chord-even-spacing={evenSpacing || undefined}>{children}</div>;
}

export function FittedBeatChord({ children, startOffsetFraction = 0 }: {
  children: React.ReactNode;
  startOffsetFraction?: number;
}) {
  return <div data-chord-fit-slot data-chord-fit-offset={startOffsetFraction}
    className="flex h-[24px] w-full items-end justify-start overflow-visible">
    <div className="inline-block shrink-0 whitespace-nowrap" style={{
      transform: 'translateX(var(--chord-fit-inset, 0px)) scaleX(var(--chord-fit-scale, 1))',
      transformOrigin: 'left bottom'
    }}>{children}</div>
  </div>;
}
