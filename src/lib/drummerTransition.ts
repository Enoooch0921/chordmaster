import { flushSync } from 'react-dom';
import { isKeyboardInteraction } from '../hooks/useUiMotion';

type Transition = { finished: Promise<void>; skipTransition(): void };
let active: Transition | undefined;
let sourceButton: HTMLElement | undefined;
let commitActive: (() => void) | undefined;
let restoreActive: (() => void) | undefined;

/** Return the left panel to its source button; never slide the chart preview. */
export function transitionDrummerWorkspace(update: () => void, instant = false, source?: HTMLElement) {
  active?.skipTransition();
  commitActive?.();
  restoreActive?.();
  active = undefined; commitActive = undefined; restoreActive = undefined;
  if (source) sourceButton = source;
  const doc = document as Document & { startViewTransition?: (update: () => void) => Transition };
  if (!doc.startViewTransition || instant || isKeyboardInteraction() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    flushSync(update); return Promise.resolve();
  }
  const root = document.documentElement;
  const previous = root.getAttribute('data-drummer-transition');
  root.setAttribute('data-drummer-transition', document.querySelector('[data-drummer-mode]') ? 'exit' : 'enter');
  const originalNames = new Map<HTMLElement, string>();
  const properties = ['--drummer-source-transform', '--drummer-origin-clip', '--drummer-full-clip'];
  const originalProperties = properties.map(name => root.style.getPropertyValue(name));
  const resolveSource = () => {
    const bounds = sourceButton?.isConnected ? sourceButton.getBoundingClientRect() : null;
    return bounds && bounds.width >= 40 && bounds.height >= 40 ? sourceButton : document.querySelector<HTMLElement>('[data-drummer-trigger]');
  };
  const anchorPanel = (panel: HTMLElement) => {
    const bounds = panel.getBoundingClientRect();
    const button = resolveSource()?.getBoundingClientRect();
    if (!button || !bounds.width || !bounds.height || !button.width || !button.height) return;
    const w = bounds.width, h = bounds.height;
    const x = Math.max(0, Math.min(w - button.width, button.left - bounds.left));
    const y = Math.max(0, Math.min(h - button.height, button.top - bounds.top));
    const top = y, bottom = Math.min(h, y + button.height);
    root.style.setProperty('--drummer-source-transform', `translate(${x}px, ${y}px) scale(${Math.min(1, button.width / w)}, ${Math.min(1, button.height / h)})`);
    root.style.setProperty('--drummer-origin-clip', `path("M 0 ${top} C ${w * .22} ${top} ${w * .65} 0 ${w} 0 L ${w} ${h} C ${w * .65} ${h} ${w * .22} ${bottom} 0 ${bottom} Z")`);
    root.style.setProperty('--drummer-full-clip', `path("M 0 0 C ${w * .22} 0 ${w * .65} 0 ${w} 0 L ${w} ${h} C ${w * .65} ${h} ${w * .22} ${h} 0 ${h} Z")`);
  };
  const restoreNames = () => {
    originalNames.forEach((name, element) => {
      if (name) element.style.setProperty('view-transition-name', name);
      else element.style.removeProperty('view-transition-name');
    });
    originalNames.clear();
  };
  const captureLeft = () => {
    const drummer = document.querySelector('[data-drummer-mode]');
    const pane = drummer?.querySelector<HTMLElement>('.drummer-left-panel');
    const regions: [HTMLElement | null | undefined, string][] = drummer
      ? (window.innerWidth < 600 && drummer.getAttribute('data-view') === 'score' ? [] : [[pane, 'drummer-left-panel']])
      : [[resolveSource(), 'drummer-origin-button']];
    regions.forEach(([element, name]) => {
      if (!element || !element.getBoundingClientRect().width) return;
      originalNames.set(element, element.style.getPropertyValue('view-transition-name'));
      element.style.setProperty('view-transition-name', name);
      if (name === 'drummer-left-panel') anchorPanel(element);
    });
  };
  let current = true;
  const restore = () => {
    current = false; restoreNames();
    properties.forEach((name, index) => {
      if (originalProperties[index]) root.style.setProperty(name, originalProperties[index]);
      else root.style.removeProperty(name);
    });
    if (previous === null) root.removeAttribute('data-drummer-transition');
    else root.setAttribute('data-drummer-transition', previous);
  };
  let updated = false;
  const commit = () => { if (!updated) { updated = true; flushSync(update); } };
  try {
    captureLeft();
    const transition = doc.startViewTransition(() => {
      if (!current) { commit(); return; }
      restoreNames(); commit(); captureLeft();
    });
    active = transition; commitActive = commit; restoreActive = restore;
    return transition.finished.catch(() => {}).finally(() => {
      if (active === transition) {
        restore(); active = undefined; commitActive = undefined; restoreActive = undefined;
      }
    });
  } catch { restore(); commit(); return Promise.resolve(); }
}
