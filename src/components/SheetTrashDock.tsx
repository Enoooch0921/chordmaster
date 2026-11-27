import { AnimatePresence, motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { useUiMotion } from '../hooks/useUiMotion';
import { floatingActionVariants } from '../lib/uiMotion';

// Dropping can unmount the source before Safari dispatches its release click.
export function guardDropRelease(sheet: HTMLElement, x: number, y: number) {
  const listeners = new AbortController();
  const options = { capture: true, signal: listeners.signal };
  sheet.setAttribute('data-chord-drop-release', '');
  const clear = () => {
    sheet.removeAttribute('data-chord-drop-release');
    listeners.abort();
    window.clearTimeout(timer);
  };
  const timer = window.setTimeout(clear, 450);
  window.addEventListener('pointerdown', clear, options);
  window.addEventListener('keydown', clear, options);
  window.addEventListener('click', event => {
    if (event.detail && Math.abs(event.clientX - x) <= 2 && Math.abs(event.clientY - y) <= 2) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, options);
}

// Row gutters, gaps between pages and floating editors over the paper are neutral.
export function outsideSheetPaper(sheet: HTMLElement, x: number, y: number, margin = 0) {
  const pages = sheet.querySelectorAll('[data-export-page-index]');
  const first = pages[0]?.getBoundingClientRect();
  const last = pages[pages.length - 1]?.getBoundingClientRect();
  return !!first && !!last && (x < first.left - margin || x >= first.right + margin
    || y < first.top - margin || y >= last.bottom + margin);
}

export function SheetTrashDock({ visible, active, label }: { visible: boolean; active: boolean; label: string }) {
  const motionSettings = useUiMotion();
  return <AnimatePresence custom={motionSettings}>
    {visible && <motion.div data-chord-trash data-active={active} className="chord-trash-dock"
      data-preview-edit-ui role="status" aria-label={label} custom={motionSettings}
      variants={floatingActionVariants} initial={motionSettings.instant ? false : 'hidden'} animate="visible" exit="exit">
      <Trash2 size={22} aria-hidden="true" />
    </motion.div>}
  </AnimatePresence>;
}
