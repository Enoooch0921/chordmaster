import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { usePresence } from 'motion/react';
import { isKeyboardInteraction, useKeyboardMotionInterrupt, useUiMotion } from '../hooks/useUiMotion';
import { UI_EASE_OUT } from '../lib/uiMotion';

/** The parent owns focus trapping and the logical open state; exit is visual only. */
export default function DrummerSettingsSurface({ children, panelRef, titleId, className = '', source, onClose }: {
  children: ReactNode; panelRef: RefObject<HTMLElement | null>; titleId: string;
  className?: string; source?: string; onClose: () => void;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const [present, safeToRemove] = usePresence();
  const safe = useRef(safeToRemove); safe.current = safeToRemove;
  const preference = useUiMotion();
  const animations = useRef<Animation[]>([]), generation = useRef(0), entered = useRef(false);
  const cancel = () => { animations.current.forEach(animation => animation.cancel()); animations.current = []; };
  const removeAfterCommit = (token: number) => queueMicrotask(() => {
    if (generation.current === token) safe.current?.();
  });
  useKeyboardMotionInterrupt(() => {
    const token = ++generation.current;
    cancel();
    if (!present) removeAfterCommit(token);
  });
  useEffect(() => {
    if (present) panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [present, panelRef]);
  useLayoutEffect(() => {
    entered.current = false;
    return () => { generation.current++; cancel(); };
  }, []);
  useLayoutEffect(() => {
    const surface = backdrop.current, panel = panelRef.current;
    if (!surface || !panel) return;
    const token = ++generation.current;
    const first = !entered.current;
    entered.current = true;
    // Capture the in-flight position before cancelling, so rapid reopen reverses smoothly.
    const panelStyle = getComputedStyle(panel), surfaceStyle = getComputedStyle(surface);
    const from = { opacity: Number(panelStyle.opacity), transform: panelStyle.transform || 'none' };
    const backdropFrom = Number(surfaceStyle.opacity);
    cancel();
    if (isKeyboardInteraction() || typeof panel.animate !== 'function') {
      if (!present) removeAfterCommit(token);
      return;
    }
    const hidden = preference.reduced ? 'none' : 'translateX(8%)';
    const duration = preference.reduced ? 80 : present ? 250 : 160;
    const options = { duration, easing: `cubic-bezier(${UI_EASE_OUT.join(',')})`, fill: 'both' as const };
    const panelMotion = panel.animate([
      first ? { opacity: 0, transform: hidden } : { ...from, ...(preference.reduced ? { transform: 'none' } : {}) },
      { opacity: present ? 1 : 0, transform: present ? 'none' : hidden }
    ], options);
    const backdropMotion = surface.animate([{ opacity: first ? 0 : backdropFrom }, { opacity: present ? 1 : 0 }],
      { ...options, duration: Math.min(200, duration) });
    animations.current = [panelMotion, backdropMotion];
    void Promise.all(animations.current.map(animation => animation.finished)).then(() => {
      if (generation.current !== token) return;
      if (!present) safe.current?.();
      else cancel();
    }).catch(() => {});
  }, [present, preference.reduced, panelRef]);

  return <div ref={backdrop} className="drummer-midi-backdrop" data-settings-presence={present ? 'visible' : 'exiting'}
    inert={!present ? true : undefined} aria-hidden={!present ? true : undefined}
    style={!present ? { pointerEvents: 'none' } : undefined}
    onMouseDown={event => { if (present && event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} className={`drummer-midi-panel ${className}`} data-source={source}
      role="dialog" aria-modal="true" aria-labelledby={titleId}>
      {children}
    </section>
  </div>;
}
